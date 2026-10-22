#Requires -Version 5.1
<# Start the tested CPU profile without global installs or cloud credentials. #>
param(
    [ValidateRange(1,65535)][int]$Port = 8010,
    [ValidateRange(1,65535)][int]$ModelPort = 11434,
    [ValidateRange(1,64)][int]$Threads = 4,
    [string]$DataDir
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$python = Join-Path $projectRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Create the project .venv and install requirements-dev.lock first. See README.md.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'frontend/dist/index.html'))) { throw 'Build the frontend first: cd frontend; npm ci; npm run build' }
if (-not $DataDir) { $DataDir = Join-Path $projectRoot 'data/local' }
$DataDir = [System.IO.Path]::GetFullPath($DataDir)
$env:PYTHONUTF8 = '1'
$env:FASTEMBED_CACHE_PATH = Join-Path $projectRoot 'data/models/fastembed'
$env:RESEARCHRAG_DATA_DIR = $DataDir
$env:RESEARCHRAG_EMBEDDING_MODEL = 'BAAI/bge-small-en-v1.5'
$env:RESEARCHRAG_EMBEDDING_BATCH_SIZE = '16'
$env:RESEARCHRAG_RERANKER = 'local'
$env:RESEARCHRAG_LLM_PROVIDER = 'openai_compatible'
$env:RESEARCHRAG_LLM_MODEL = 'researchrag-local'
$env:RESEARCHRAG_LLM_BASE_URL = "http://127.0.0.1:$ModelPort/v1"
$env:RESEARCHRAG_LLM_API_KEY = ''
$env:RESEARCHRAG_LLM_TEMPERATURE = '1.0'
$env:RESEARCHRAG_LLM_MAX_TOKENS = '240'
$env:RESEARCHRAG_EVIDENCE_MAX_TOKENS = '1600'
$env:RESEARCHRAG_USE_PARENT_CONTEXT = 'false'
$env:RESEARCHRAG_FINAL_TOP_K = '4'
$env:RESEARCHRAG_RERANKER_TOP_M = '30'
Push-Location $projectRoot
try {
    $apiListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($apiListener) {
        $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
        if ([System.IO.Path]::GetFullPath($health.settings.data_dir) -ne $DataDir) { throw "Port $Port serves a different workspace. Choose another -Port." }
    }
    & $python scripts/local_model.py download
    if ($LASTEXITCODE -ne 0) { throw 'Model verification/download failed.' }
    $modelListener = Get-NetTCPConnection -LocalPort $ModelPort -State Listen -ErrorAction SilentlyContinue
    if ($modelListener) {
        $models = Invoke-RestMethod "http://127.0.0.1:$ModelPort/v1/models" -TimeoutSec 5
        if ('researchrag-local' -notin $models.data.id) { throw "Port $ModelPort serves another model. Choose another -ModelPort." }
    } else {
        $logDir = Join-Path $projectRoot 'data/logs'
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        Start-Process -FilePath $python -ArgumentList @('scripts/local_model.py','serve','--port',"$ModelPort",'--threads',"$Threads") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'model.out.log') -RedirectStandardError (Join-Path $logDir 'model.err.log') | Out-Null
        $ready = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            try { $modelHealth = Invoke-RestMethod "http://127.0.0.1:$ModelPort/health" -TimeoutSec 2; if ($modelHealth.status -eq 'ok') { $ready = $true; break } } catch { }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) { throw 'Model startup failed. See data/logs/model.err.log.' }
    }
    if (-not $apiListener) {
        Write-Output 'Preparing semantic search and reranking models (cached after the first run)...'
        & $python -c "from researchrag.embeddings.fastembed_embedder import FastEmbedder; from researchrag.retrieval.rerank import LocalCrossEncoderReranker; FastEmbedder('BAAI/bge-small-en-v1.5'); LocalCrossEncoderReranker()"
        if ($LASTEXITCODE -ne 0) { throw 'Search model setup failed. Check the connection and retry.' }
    }
    & (Join-Path $projectRoot 'scripts/serve-background.ps1') -Port $Port
} finally { Pop-Location }
