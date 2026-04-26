$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $repoRoot "frontend"
$frontendOut = Join-Path $repoRoot ".dev-frontend.out.log"
$frontendErr = Join-Path $repoRoot ".dev-frontend.err.log"
$frontendListening = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue

if (-not $frontendListening) {
  Start-Process `
    -WindowStyle Hidden `
    -FilePath "cmd.exe" `
    -ArgumentList @("/d", "/s", "/c", "npm run vite:dev -- --host 127.0.0.1 --port 5173 --strictPort") `
    -WorkingDirectory $frontendDir `
    -RedirectStandardOutput $frontendOut `
    -RedirectStandardError $frontendErr
}

& (Join-Path $PSScriptRoot "dev-backend.ps1")
