package version

// Build metadata injected via -ldflags during release builds.
var (
	Version   = "dev"
	Commit    = "unknown"
	BuildTime = "unknown"
)
