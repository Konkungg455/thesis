# npm run dev — start Ollama + n8n (if needed) then Nuxt
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Starting AI services (Ollama + n8n)..." -ForegroundColor Cyan
$status = & (Join-Path $PSScriptRoot "ensure-ai-local.ps1") -Quiet

if (-not $status.Ollama) {
    Write-Host "WARN: Ollama not running — install from https://ollama.com/download/windows" -ForegroundColor Yellow
}
if (-not $status.N8n) {
    Write-Host "WARN: n8n still starting — AI chat may fail for ~1 min on first run" -ForegroundColor Yellow
}

Set-Location $ProjectRoot
npm exec nuxt dev
