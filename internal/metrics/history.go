package metrics

import (
	"context"
	"database/sql"
	"math"
	"math/rand"
	"sync"
	"time"

	"weplane/internal/db"
	"weplane/internal/platform"
)

// Point is a compact time-series sample used for overview trend charts.
type Point struct {
	Timestamp    time.Time `json:"timestamp"`
	CPU          float64   `json:"cpu"`
	Load1        float64   `json:"load1"`
	MemPercent   float64   `json:"memPercent"`
	MemUsedGB    float64   `json:"memUsedGB"`
	SwapPercent  float64   `json:"swapPercent"`
	DiskReadMBs  float64   `json:"diskReadMBs"`
	DiskWriteMBs float64   `json:"diskWriteMBs"`
	NetRxKBs     float64   `json:"netRxKBs"`
	NetTxKBs     float64   `json:"netTxKBs"`
}

// HistoryStore persists 24h high-resolution (10s) and 180d hourly metrics in SQLite
// (falling back to in-memory slices if no dataDir is provided).
type HistoryStore struct {
	mu           sync.RWMutex
	db           *sql.DB
	points       []Point
	maxItems     int
	hourlyPoints []Point
	maxHourly    int
	lastHourlyAt time.Time
	insertCount  int
}

func NewHistoryStore(isMock bool, dataDir ...string) *HistoryStore {
	h := &HistoryStore{
		maxItems:  8640, // 24h * 360/h
		maxHourly: 4320, // 180d * 24h
	}
	if len(dataDir) > 0 && dataDir[0] != "" {
		if db, err := openMetricsDB(dataDir[0]); err == nil {
			h.db = db
			h.loadLastHourlyAt()
		}
	}
	if isMock {
		h.seedMockHistoryIfEmpty()
	}
	return h
}

func openMetricsDB(dataDir string) (*sql.DB, error) {
	conn, err := db.Open(dataDir)
	if err != nil {
		return nil, err
	}
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS metrics_raw (
			ts INTEGER PRIMARY KEY,
			cpu REAL NOT NULL,
			load1 REAL NOT NULL,
			mem_percent REAL NOT NULL,
			mem_used_gb REAL NOT NULL,
			swap_percent REAL NOT NULL,
			disk_read_mbs REAL NOT NULL,
			disk_write_mbs REAL NOT NULL,
			net_rx_kbs REAL NOT NULL,
			net_tx_kbs REAL NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS metrics_hourly (
			ts INTEGER PRIMARY KEY,
			cpu REAL NOT NULL,
			load1 REAL NOT NULL,
			mem_percent REAL NOT NULL,
			mem_used_gb REAL NOT NULL,
			swap_percent REAL NOT NULL,
			disk_read_mbs REAL NOT NULL,
			disk_write_mbs REAL NOT NULL,
			net_rx_kbs REAL NOT NULL,
			net_tx_kbs REAL NOT NULL
		);`,
	}
	for _, s := range stmts {
		if _, err := conn.Exec(s); err != nil {
			_ = conn.Close()
			return nil, err
		}
	}
	return conn, nil
}

func (h *HistoryStore) Close() error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.db != nil {
		err := h.db.Close()
		h.db = nil
		return err
	}
	return nil
}

func (h *HistoryStore) loadLastHourlyAt() {
	if h.db == nil {
		return
	}
	var ts sql.NullInt64
	if err := h.db.QueryRow(`SELECT MAX(ts) FROM metrics_hourly`).Scan(&ts); err == nil && ts.Valid {
		h.lastHourlyAt = time.Unix(ts.Int64, 0)
	}
}

func (h *HistoryStore) seedMockHistoryIfEmpty() {
	if h.db != nil {
		var count int
		if err := h.db.QueryRow(`SELECT COUNT(*) FROM metrics_hourly`).Scan(&count); err == nil && count > 0 {
			return
		}
	}

	now := time.Now()
	rng := rand.New(rand.NewSource(now.UnixNano()))

	const totalHours = 180 * 24
	hourly := make([]Point, 0, totalHours)
	for i := totalHours; i >= 1; i-- {
		ts := now.Add(-time.Duration(i) * time.Hour)
		dayWave := math.Sin(float64(ts.Hour())/24.0*2*math.Pi - 1.2)
		weekWave := math.Sin(float64(ts.YearDay()) / 7.0 * 2 * math.Pi)
		cpu := math.Max(6, math.Min(88, 25+dayWave*12+weekWave*5+(rng.Float64()-0.5)*10))
		memPct := math.Max(32, math.Min(82, 45+dayWave*5+weekWave*3+(rng.Float64()-0.5)*4))
		memGB := math.Round(32.0*(memPct/100.0)*10) / 10
		readMB := math.Max(0.2, 4.2+dayWave*2.5+rng.Float64()*5.5)
		writeMB := math.Max(0.1, 2.0+dayWave*1.2+rng.Float64()*3.2)
		rxKB := math.Max(40, 310+dayWave*160+rng.Float64()*420)
		txKB := math.Max(15, 105+dayWave*55+rng.Float64()*160)

		hourly = append(hourly, Point{
			Timestamp:    ts,
			CPU:          math.Round(cpu*10) / 10,
			Load1:        math.Round((cpu/100*4.2+0.15)*100) / 100,
			MemPercent:   math.Round(memPct*10) / 10,
			MemUsedGB:    memGB,
			SwapPercent:  6.2,
			DiskReadMBs:  math.Round(readMB*100) / 100,
			DiskWriteMBs: math.Round(writeMB*100) / 100,
			NetRxKBs:     math.Round(rxKB),
			NetTxKBs:     math.Round(txKB),
		})
	}

	const totalMins = 1440
	raw := make([]Point, 0, totalMins)
	for i := totalMins; i >= 1; i-- {
		ts := now.Add(-time.Duration(i) * time.Minute)
		hourWave := math.Sin(float64(ts.Hour())/24.0*2*math.Pi - 1.2)
		cpu := math.Max(6, math.Min(88, 26+hourWave*14+(rng.Float64()-0.5)*10))
		memPct := math.Max(32, math.Min(78, 44+hourWave*6+(rng.Float64()-0.5)*3))
		memGB := math.Round(32.0*(memPct/100.0)*10) / 10
		readMB := math.Max(0.2, 4.5+hourWave*2.5+rng.Float64()*6.0)
		writeMB := math.Max(0.1, 2.2+hourWave*1.2+rng.Float64()*3.5)
		rxKB := math.Max(40, 320+hourWave*180+rng.Float64()*450)
		txKB := math.Max(15, 110+hourWave*60+rng.Float64()*180)

		raw = append(raw, Point{
			Timestamp:    ts,
			CPU:          math.Round(cpu*10) / 10,
			Load1:        math.Round((cpu/100*4.2+0.15)*100) / 100,
			MemPercent:   math.Round(memPct*10) / 10,
			MemUsedGB:    memGB,
			SwapPercent:  6.2,
			DiskReadMBs:  math.Round(readMB*100) / 100,
			DiskWriteMBs: math.Round(writeMB*100) / 100,
			NetRxKBs:     math.Round(rxKB),
			NetTxKBs:     math.Round(txKB),
		})
	}

	h.lastHourlyAt = now
	if h.db == nil {
		h.hourlyPoints = hourly
		h.points = raw
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		return
	}
	insertBatch := func(table string, list []Point) error {
		stmt, err := tx.Prepare(`INSERT OR REPLACE INTO ` + table + ` (ts, cpu, load1, mem_percent, mem_used_gb, swap_percent, disk_read_mbs, disk_write_mbs, net_rx_kbs, net_tx_kbs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return err
		}
		defer stmt.Close()
		for _, p := range list {
			if _, err := stmt.Exec(p.Timestamp.Unix(), p.CPU, p.Load1, p.MemPercent, p.MemUsedGB, p.SwapPercent, p.DiskReadMBs, p.DiskWriteMBs, p.NetRxKBs, p.NetTxKBs); err != nil {
				return err
			}
		}
		return nil
	}
	if err := insertBatch("metrics_hourly", hourly); err != nil {
		_ = tx.Rollback()
		return
	}
	if err := insertBatch("metrics_raw", raw); err != nil {
		_ = tx.Rollback()
		return
	}
	_ = tx.Commit()
}

// StartSampler periodically collects snapshots into the history store until ctx is cancelled.
func (h *HistoryStore) StartSampler(ctx context.Context, sys platform.SystemProvider, interval time.Duration) {
	if interval <= 0 {
		interval = 10 * time.Second
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				snap, err := sys.GetSnapshot(ctx)
				if err == nil && snap != nil {
					h.AddSnapshot(snap)
				}
			}
		}
	}()
}

func (h *HistoryStore) AddSnapshot(snap *platform.MetricsSnapshot) {
	var netRx, netTx float64
	if len(snap.Networks) > 0 {
		netRx = snap.Networks[0].RxBytesPerSec / 1024.0
		netTx = snap.Networks[0].TxBytesPerSec / 1024.0
	}
	p := Point{
		Timestamp:    snap.Timestamp,
		CPU:          snap.CPUUsagePercent,
		Load1:        snap.Load1,
		MemPercent:   snap.Memory.UsedPercent,
		MemUsedGB:    math.Round(float64(snap.Memory.UsedBytes)/(1024*1024*1024)*10) / 10,
		SwapPercent:  snap.Swap.UsedPercent,
		DiskReadMBs:  math.Round(snap.DiskIO.ReadBytesPerSec/(1024*1024)*1000) / 1000,
		DiskWriteMBs: math.Round(snap.DiskIO.WriteBytesPerSec/(1024*1024)*1000) / 1000,
		NetRxKBs:     math.Round(netRx*10) / 10,
		NetTxKBs:     math.Round(netTx*10) / 10,
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if h.db == nil {
		h.points = append(h.points, p)
		if len(h.points) > h.maxItems {
			h.points = h.points[len(h.points)-h.maxItems:]
		}
		if h.lastHourlyAt.IsZero() || p.Timestamp.Sub(h.lastHourlyAt) >= time.Hour {
			h.hourlyPoints = append(h.hourlyPoints, p)
			if len(h.hourlyPoints) > h.maxHourly {
				h.hourlyPoints = h.hourlyPoints[len(h.hourlyPoints)-h.maxHourly:]
			}
			h.lastHourlyAt = p.Timestamp
		}
		return
	}

	const insertSQL = `INSERT OR REPLACE INTO %s (ts, cpu, load1, mem_percent, mem_used_gb, swap_percent, disk_read_mbs, disk_write_mbs, net_rx_kbs, net_tx_kbs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, _ = h.db.Exec(
		`INSERT OR REPLACE INTO metrics_raw (ts, cpu, load1, mem_percent, mem_used_gb, swap_percent, disk_read_mbs, disk_write_mbs, net_rx_kbs, net_tx_kbs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.Timestamp.Unix(), p.CPU, p.Load1, p.MemPercent, p.MemUsedGB, p.SwapPercent, p.DiskReadMBs, p.DiskWriteMBs, p.NetRxKBs, p.NetTxKBs,
	)

	if h.lastHourlyAt.IsZero() || p.Timestamp.Sub(h.lastHourlyAt) >= time.Hour {
		_, _ = h.db.Exec(
			`INSERT OR REPLACE INTO metrics_hourly (ts, cpu, load1, mem_percent, mem_used_gb, swap_percent, disk_read_mbs, disk_write_mbs, net_rx_kbs, net_tx_kbs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			p.Timestamp.Unix(), p.CPU, p.Load1, p.MemPercent, p.MemUsedGB, p.SwapPercent, p.DiskReadMBs, p.DiskWriteMBs, p.NetRxKBs, p.NetTxKBs,
		)
		h.lastHourlyAt = p.Timestamp
	}

	h.insertCount++
	if h.insertCount%60 == 0 {
		rawCutoff := time.Now().Add(-25 * time.Hour).Unix()
		hourlyCutoff := time.Now().Add(-181 * 24 * time.Hour).Unix()
		_, _ = h.db.Exec(`DELETE FROM metrics_raw WHERE ts < ?`, rawCutoff)
		_, _ = h.db.Exec(`DELETE FROM metrics_hourly WHERE ts < ?`, hourlyCutoff)
	}
}

func (h *HistoryStore) Query(from, to time.Time, maxPoints int) []Point {
	if maxPoints <= 0 {
		maxPoints = 120
	}
	h.mu.RLock()
	defer h.mu.RUnlock()

	useHourly := !from.IsZero() && to.Sub(from) > 25*time.Hour

	var matched []Point
	if h.db == nil {
		source := h.points
		if useHourly && len(h.hourlyPoints) > 0 {
			source = h.hourlyPoints
		}
		for _, p := range source {
			if !from.IsZero() && p.Timestamp.Before(from) {
				continue
			}
			if !to.IsZero() && p.Timestamp.After(to) {
				continue
			}
			matched = append(matched, p)
		}
	} else {
		table := "metrics_raw"
		if useHourly {
			table = "metrics_hourly"
		}
		fromUnix := int64(0)
		if !from.IsZero() {
			fromUnix = from.Unix()
		}
		toUnix := time.Now().Add(time.Hour).Unix()
		if !to.IsZero() {
			toUnix = to.Unix()
		}
		rows, err := h.db.Query(
			`SELECT ts, cpu, load1, mem_percent, mem_used_gb, swap_percent, disk_read_mbs, disk_write_mbs, net_rx_kbs, net_tx_kbs FROM `+table+` WHERE ts >= ? AND ts <= ? ORDER BY ts ASC`,
			fromUnix, toUnix,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var ts int64
				var p Point
				if err := rows.Scan(&ts, &p.CPU, &p.Load1, &p.MemPercent, &p.MemUsedGB, &p.SwapPercent, &p.DiskReadMBs, &p.DiskWriteMBs, &p.NetRxKBs, &p.NetTxKBs); err == nil {
					p.Timestamp = time.Unix(ts, 0)
					matched = append(matched, p)
				}
			}
		}
	}

	if len(matched) <= maxPoints {
		return matched
	}
	step := float64(len(matched)) / float64(maxPoints)
	out := make([]Point, 0, maxPoints)
	for i := 0; i < maxPoints; i++ {
		idx := int(float64(i) * step)
		if idx >= len(matched) {
			idx = len(matched) - 1
		}
		out = append(out, matched[idx])
	}
	return out
}
