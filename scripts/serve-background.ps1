#Requires -Version 5.1
<#
  Start the Research RAG API in the background on Windows.

  Usage (from the repo root):
      powershell -ExecutionPolicy Bypass -File scripts\serve-background.ps1 [-Port 8000]

  The server keeps running after this script exits. Logs go to
  data\logs\serve.out.log / serve.err.log. Stop it with:
      Get-NetTCPConnection -LocalPort 8000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

  Why this exists: `researchrag serve` is a server — run in a foreground
  terminal it intentionally blocks that terminal ("gets stuck"). This
  wrapper detaches it and then health-checks it for you.
#>
param([int]$Port = 8000)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) { $venvPython = "python" }

$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($busy) {
  Write-Output "Port $Port is already in use (PID $($busy.OwningProcess)). Reusing it - is the API already running?"
} else {
  $logDir = Join-Path $root "data\logs"
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $env:PYTHONIOENCODING = "utf-8"
  $env:PYTHONUTF8 = "1"
  $proc = Start-Process -FilePath $venvPython `
    -ArgumentList "-m", "researchrag.cli", "serve", "--host", "127.0.0.1", "--port", "$Port" `
    -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "serve.out.log") `
    -RedirectStandardError (Join-Path $logDir "serve.err.log") -PassThru
  Write-Output "Started backend PID $($proc.Id). Waiting for health..."
}

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
    if ($h.status -eq "ok") { $ok = $true; break }
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $ok) { throw "Backend did not become healthy on :$Port within 40s. See data\logs\serve.err.log" }

Write-Output ""
Write-Output "Research RAG is up:"
Write-Output "  UI (prod build):  http://127.0.0.1:$Port/"
Write-Output "  API docs:         http://127.0.0.1:$Port/docs"
Write-Output "  Health:           http://127.0.0.1:$Port/api/health"
Write-Output "  Dev UI (needs 'npm run dev' in frontend\): http://127.0.0.1:5173/"
Write-Output ""
Write-Output "Note: only ONE process may hold data\qdrant at a time - server OR CLI, not both."
