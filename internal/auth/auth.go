package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"weplane/internal/db"

	"golang.org/x/crypto/argon2"
)

const SessionCookieName = "weplane_session"

type User struct {
	Username     string    `json:"username"`
	PasswordHash string    `json:"passwordHash"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Session struct {
	Token     string
	Username  string
	ExpiresAt time.Time
}

type Store struct {
	mu   sync.RWMutex
	conn *sql.DB
}

func NewStore(dataDir string) (*Store, error) {
	conn, err := db.Open(dataDir)
	if err != nil {
		return nil, fmt.Errorf("open auth db: %w", err)
	}
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			username TEXT PRIMARY KEY,
			password_hash TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS sessions (
			token TEXT PRIMARY KEY,
			username TEXT NOT NULL,
			expires_at INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);`,
	}
	for _, stmt := range stmts {
		if _, err := conn.Exec(stmt); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("init auth schema: %w", err)
		}
	}

	s := &Store{conn: conn}
	s.migrateLegacyUsers(filepath.Join(dataDir, "users.json"))
	_, _ = s.conn.Exec(`DELETE FROM sessions WHERE expires_at <= ?`, time.Now().Unix())
	return s, nil
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil {
		err := s.conn.Close()
		s.conn = nil
		return err
	}
	return nil
}

func (s *Store) migrateLegacyUsers(legacyFile string) {
	if s.HasUsers() {
		return
	}
	b, err := os.ReadFile(legacyFile)
	if err != nil {
		return
	}
	var list []User
	if err := json.Unmarshal(b, &list); err != nil || len(list) == 0 {
		return
	}
	for _, u := range list {
		created := u.CreatedAt.Unix()
		if created <= 0 {
			created = time.Now().Unix()
		}
		_, _ = s.conn.Exec(
			`INSERT OR IGNORE INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
			u.Username, u.PasswordHash, created,
		)
	}
}

func (s *Store) HasUsers() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.conn == nil {
		return false
	}
	var count int
	if err := s.conn.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return false
	}
	return count > 0
}

func (s *Store) CreateOrUpdateUser(username, password string) error {
	username = strings.TrimSpace(username)
	if username == "" || len(password) < 6 {
		return errors.New("username required and password must be at least 6 characters")
	}
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err = s.conn.Exec(
		`INSERT OR REPLACE INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
		username, hash, time.Now().Unix(),
	)
	return err
}

// ChangePassword verifies oldPassword and updates the user's password hash in SQLite.
func (s *Store) ChangePassword(username, oldPassword, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("新密码长度不能少于 6 位")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	var currentHash string
	err := s.conn.QueryRow(`SELECT password_hash FROM users WHERE username = ?`, username).Scan(&currentHash)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("用户不存在")
	}
	if err != nil {
		return err
	}
	if !verifyPassword(oldPassword, currentHash) {
		return errors.New("原密码不正确")
	}
	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}
	_, err = s.conn.Exec(`UPDATE users SET password_hash = ? WHERE username = ?`, hash, username)
	return err
}

// EnsureMockAdmin seeds a default admin/weplane account in mock mode if no users exist.
func (s *Store) EnsureMockAdmin() error {
	if s.HasUsers() {
		return nil
	}
	return s.CreateOrUpdateUser("admin", "weplane")
}

func (s *Store) Authenticate(username, password string) (Session, error) {
	s.mu.RLock()
	var hash string
	err := s.conn.QueryRow(`SELECT password_hash FROM users WHERE username = ?`, username).Scan(&hash)
	s.mu.RUnlock()
	if err != nil || !verifyPassword(password, hash) {
		return Session{}, errors.New("invalid username or password")
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return Session{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	expires := time.Now().Add(24 * time.Hour)
	sess := Session{
		Token:     token,
		Username:  username,
		ExpiresAt: expires,
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	_, err = s.conn.Exec(
		`INSERT OR REPLACE INTO sessions (token, username, expires_at) VALUES (?, ?, ?)`,
		sess.Token, sess.Username, sess.ExpiresAt.Unix(),
	)
	if err != nil {
		return Session{}, err
	}
	return sess, nil
}

func (s *Store) GetSession(token string) (Session, bool) {
	if token == "" {
		return Session{}, false
	}
	s.mu.RLock()
	var username string
	var expiresUnix int64
	err := s.conn.QueryRow(`SELECT username, expires_at FROM sessions WHERE token = ?`, token).Scan(&username, &expiresUnix)
	s.mu.RUnlock()
	if err != nil {
		return Session{}, false
	}
	expiresAt := time.Unix(expiresUnix, 0)
	if time.Now().After(expiresAt) {
		s.DeleteSession(token)
		return Session{}, false
	}
	return Session{
		Token:     token,
		Username:  username,
		ExpiresAt: expiresAt,
	}, true
}

func (s *Store) DeleteSession(token string) {
	if token == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil {
		_, _ = s.conn.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	}
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, 2, 64*1024, 2, 32)
	return fmt.Sprintf("argon2id$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 3 || parts[0] != "argon2id" {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, 2, 64*1024, 2, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}
