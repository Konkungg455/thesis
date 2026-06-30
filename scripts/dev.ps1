# npm run dev — start Ollama + n8n (if needed) then Nuxt
# ข้าม AI: $env:SKIP_AI='1'; npm run dev   หรือใช้ npm run dev:nuxt
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

if ($env:SKIP_AI -eq '1') {
    Write-Host "SKIP_AI=1 — starting Nuxt only (no Ollama/n8n wait)" -ForegroundColor Yellow
} else {
    Write-Host "Starting AI services (Ollama + n8n)..." -ForegroundColor Cyan
    $status = & (Join-Path $PSScriptRoot "ensure-ai-local.ps1") -Quiet
    if (-not $status.Ollama) {
        Write-Host "WARN: Ollama not running — install from https://ollama.com/download/windows" -ForegroundColor Yellow
    }
    if (-not $status.N8n) {
        Write-Host "WARN: n8n still starting — use npm run dev:nuxt for faster web-only dev" -ForegroundColor Yellow
    }
}

Set-Location $ProjectRoot
npm exec nuxt dev
