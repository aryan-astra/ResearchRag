#Requires -Version 5.1
<#
  Start the Research RAG frontend (Vite dev server) in the background.

  Double-click start-frontend.cmd, or run from the repo root:
      powershell -ExecutionPolicy Bypass -File scripts\serve-frontend.ps1 [-Port 5173]

  The dev UI proxies /api to the backend, so start the backend first
  (scripts\serve-background.ps1). This window stays free: the server keeps
  running after this script exits. Logs go to frontend.dev.out.log.
#>
param([int]$Port = 5173)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$frontend = Join-Path $root "frontend"

$busy = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($busy) {
  Write-Output "Port $Port is already in use (PID $($busy.OwningProcess)). Reusing it - is the dev server already running?"
} else {
  if (-not (Test-Path -LiteralPath (Join-Path $frontend "node_modules"))) {
    Write-Output "First run: installing frontend dependencies (one-time, ~1 min)..."
    Push-Location $frontend
    try { & cmd.exe /c "npm install" } finally { Pop-Location }
  }
  $logOut = Join-Path $root "frontend.dev.out.log"
  $null = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev -- --host 127.0.0.1 --port $Port > `"$logOut`" 2>&1" `
    -WorkingDirectory $frontend -WindowStyle Hidden -PassThru
  Write-Output "Started Vite dev server. Waiting for it to respond..."
}

$ok = $false
for ($i = 0; $i -lt 45; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -TimeoutSec 3 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $ok) { throw "Dev server did not respond on :$Port within 45s. See frontend.dev.out.log" }

try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 3
  $api = "backend OK (embedder $($h.embedding_model))"
} catch { $api = "backend NOT reachable on :8000 - start scripts\serve-background.ps1 first" }

Write-Output ""
Write-Output "Research RAG frontend is up:"
Write-Output "  Dev UI:  http://127.0.0.1:$Port/"
Write-Output "  Chat:    http://127.0.0.1:$Port/chat"
Write-Output "  System:  http://127.0.0.1:$Port/health"
Write-Output "  API:     $api"
