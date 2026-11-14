package metrics

import (
	"context"
	"math"
	"math/rand"
	"sync"
	"time"

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

// HistoryStore keeps a 24h high-resolution ring (10s) and a 180d hourly ring.
type HistoryStore struct {
	mu           sync.RWMutex
	points       []Point // up to 24h at 10s interval
	maxItems     int
	hourlyPoints []Point // up to 180d at 1h interval
	maxHourly    int
	lastHourlyAt time.Time
}

func NewHistoryStore(isMock bool) *HistoryStore {
	h := &HistoryStore{
		maxItems:  8640, // 24h * 360/h
		maxHourly: 4320, // 180d * 24h
	}
	if isMock {
		h.seedMockHistory()
	}
	return h
}

func (h *HistoryStore) seedMockHistory() {
	now := time.Now()
	rng := rand.New(rand.NewSource(now.UnixNano()))

	// 1. Seed 180 days at 1-hour intervals (4320 points)
	const totalHours = 180 * 24
	h.hourlyPoints = make([]Point, 0, totalHours)
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

		h.hourlyPoints = append(h.hourlyPoints, Point{
			Timestamp:    ts,
			CPU:          math.Round(cpu*10) / 10,
			Load1:        math.Round((cpu/100*4.2+0.15)*100) / 100,
			MemPercent:   math.Round(memPct*10) / 10,
			MemUsedGB:    memGB,
			SwapPercent:  6.2,
			DiskReadMBs:  math.Round(readMB*10) / 10,
			DiskWriteMBs: math.Round(writeMB*10) / 10,
			NetRxKBs:     math.Round(rxKB),
			NetTxKBs:     math.Round(txKB),
		})
	}
	h.lastHourlyAt = now

	// 2. Seed last 24h at 1-minute intervals (1440 points)
	const totalMins = 1440
	h.points = make([]Point, 0, totalMins)
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

		h.points = append(h.points, Point{
			Timestamp:    ts,
			CPU:          math.Round(cpu*10) / 10,
			Load1:        math.Round((cpu/100*4.2+0.15)*100) / 100,
			MemPercent:   math.Round(memPct*10) / 10,
			MemUsedGB:    memGB,
			SwapPercent:  6.2,
			DiskReadMBs:  math.Round(readMB*10) / 10,
			DiskWriteMBs: math.Round(writeMB*10) / 10,
			NetRxKBs:     math.Round(rxKB),
			NetTxKBs:     math.Round(txKB),
		})
	}
}

// StartSampler periodically collects snapshots into the history buffer until ctx is cancelled.
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
		DiskReadMBs:  math.Round(snap.DiskIO.ReadBytesPerSec/(1024*1024)*10) / 10,
		DiskWriteMBs: math.Round(snap.DiskIO.WriteBytesPerSec/(1024*1024)*10) / 10,
		NetRxKBs:     math.Round(netRx),
		NetTxKBs:     math.Round(netTx),
	}

	h.mu.Lock()
	defer h.mu.Unlock()
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
}

func (h *HistoryStore) Query(from, to time.Time, maxPoints int) []Point {
	if maxPoints <= 0 {
		maxPoints = 120
	}
	h.mu.RLock()
	defer h.mu.RUnlock()

	// Use hourly archive when querying spans > 24h
	source := h.points
	if !from.IsZero() && to.Sub(from) > 25*time.Hour && len(h.hourlyPoints) > 0 {
		source = h.hourlyPoints
	}

	var matched []Point
	for _, p := range source {
		if !from.IsZero() && p.Timestamp.Before(from) {
			continue
		}
		if !to.IsZero() && p.Timestamp.After(to) {
			continue
		}
		matched = append(matched, p)
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
