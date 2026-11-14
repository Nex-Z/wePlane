$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root

try {
    Write-Host "[1/4] Building frontend..." -ForegroundColor Cyan
    Push-Location "$Root\web"
    pnpm build
    Pop-Location

    Write-Host "[2/4] Syncing web/dist -> internal/webembed/dist..." -ForegroundColor Cyan
    $EmbedDist = "$Root\internal\webembed\dist"
    if (Test-Path $EmbedDist) {
        Remove-Item -Recurse -Force $EmbedDist
    }
    Copy-Item -Recurse -Force "$Root\web\dist" $EmbedDist

    New-Item -ItemType Directory -Force "$Root\dist" | Out-Null

    Write-Host "[3/4] Cross-compiling linux/amd64..." -ForegroundColor Cyan
    $env:CGO_ENABLED = "0"
    $env:GOOS = "linux"
    $env:GOARCH = "amd64"
    go build -tags embed_web -ldflags="-s -w" -o "$Root\dist\weplane-linux-amd64" ./cmd/weplane

    Write-Host "[4/4] Cross-compiling linux/arm64..." -ForegroundColor Cyan
    $env:GOARCH = "arm64"
    go build -tags embed_web -ldflags="-s -w" -o "$Root\dist\weplane-linux-arm64" ./cmd/weplane

    Write-Host "Done! Artifacts in $Root\dist:" -ForegroundColor Green
    Get-ChildItem "$Root\dist" | Select-Object Name, Length
} finally {
    Remove-Item Env:GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
    Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue
    Pop-Location
}
