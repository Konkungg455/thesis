# npm run dev — เปิด Nuxt ทันที, AI (Ollama + n8n) รันเบื้องหลัง
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

if ($env:SKIP_AI -ne '1') {
    Write-Host "Starting AI services in background (Ollama + n8n)..." -ForegroundColor Cyan
    $aiScript = Join-Path $PSScriptRoot "ensure-ai-local.ps1"
    Start-Process powershell -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Minimized",
        "-File", $aiScript,
        "-Quiet"
    ) | Out-Null
} else {
    Write-Host "SKIP_AI=1 — Nuxt only" -ForegroundColor Yellow
}

Set-Location $ProjectRoot
Write-Host "Starting Nuxt..." -ForegroundColor Green
npm exec nuxt dev
