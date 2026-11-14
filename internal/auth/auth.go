package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

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
	mu        sync.RWMutex
	usersFile string
	users     map[string]User
	sessions  map[string]Session
}

func NewStore(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	s := &Store{
		usersFile: filepath.Join(dataDir, "users.json"),
		users:     make(map[string]User),
		sessions:  make(map[string]Session),
	}
	if err := s.loadUsers(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) loadUsers() error {
	b, err := os.ReadFile(s.usersFile)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var list []User
	if err := json.Unmarshal(b, &list); err != nil {
		return err
	}
	for _, u := range list {
		s.users[u.Username] = u
	}
	return nil
}

func (s *Store) saveUsersLocked() error {
	list := make([]User, 0, len(s.users))
	for _, u := range s.users {
		list = append(list, u)
	}
	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.usersFile, b, 0o600)
}

func (s *Store) HasUsers() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.users) > 0
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
	s.users[username] = User{
		Username:     username,
		PasswordHash: hash,
		CreatedAt:    time.Now(),
	}
	return s.saveUsersLocked()
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
	u, ok := s.users[username]
	s.mu.RUnlock()
	if !ok || !verifyPassword(password, u.PasswordHash) {
		return Session{}, errors.New("invalid username or password")
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return Session{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	sess := Session{
		Token:     token,
		Username:  u.Username,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}

	s.mu.Lock()
	s.sessions[token] = sess
	s.mu.Unlock()
	return sess, nil
}

func (s *Store) GetSession(token string) (Session, bool) {
	if token == "" {
		return Session{}, false
	}
	s.mu.RLock()
	sess, ok := s.sessions[token]
	s.mu.RUnlock()
	if !ok || time.Now().After(sess.ExpiresAt) {
		if ok {
			s.DeleteSession(token)
		}
		return Session{}, false
	}
	return sess, true
}

func (s *Store) DeleteSession(token string) {
	if token == "" {
		return
	}
	s.mu.Lock()
	delete(s.sessions, token)
	s.mu.Unlock()
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
