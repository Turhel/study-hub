$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $repoRoot "frontend"
$backendScript = Join-Path $PSScriptRoot "dev-backend.ps1"
$backendOut = Join-Path $repoRoot ".dev-backend.out.log"
$backendErr = Join-Path $repoRoot ".dev-backend.err.log"

$backendListening = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue

if (-not $backendListening) {
  Start-Process `
    -WindowStyle Hidden `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $backendScript) `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError $backendErr
}

Set-Location $frontendDir
npm run vite:dev -- --host 127.0.0.1 --port 5173 --strictPort
