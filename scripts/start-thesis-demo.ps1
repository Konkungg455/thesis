# Start Thesis demo: Nuxt + Supabase BFF + ngrok
# Usage: npm run demo

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "=== Thesis Demo Startup ===" -ForegroundColor Cyan
Write-Host ""

$port = 3001
if (Test-Path "$ProjectRoot\.env") {
    $envLine = Get-Content "$ProjectRoot\.env" | Where-Object { $_ -match '^NUXT_PORT=' } | Select-Object -First 1
    if ($envLine -match 'NUXT_PORT=(\d+)') { $port = [int]$Matches[1] }
}

Write-Host "[1/3] Nuxt (port $port)..." -NoNewline
try {
    $nuxt = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 5
    Write-Host " OK ($($nuxt.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host " not running" -ForegroundColor Yellow
    Write-Host "  -> Opening new terminal: npm run dev" -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; npm run dev"
    Write-Host "  -> Waiting 15 seconds..." -ForegroundColor Gray
    Start-Sleep -Seconds 15
}

Write-Host "[2/3] Supabase BFF..." -NoNewline
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/deploy/health" -TimeoutSec 8
    if ($health.database_url -eq 'configured') {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " WARN (ตั้ง DATABASE_URL ใน .env)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "  -> ตรวจ .env: DATABASE_URL + NUXT_PUBLIC_SUPABASE_URL" -ForegroundColor Yellow
}

Write-Host "[3/3] ngrok tunnel..." -NoNewline
$ngrokRunning = $false
$publicUrl = $null
try {
    $tunnels = (Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3).tunnels
    $publicUrl = ($tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1).public_url
    if ($publicUrl) { $ngrokRunning = $true }
} catch { }

if (-not $ngrokRunning) {
    Write-Host " starting..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http $port"
    Start-Sleep -Seconds 5
    try {
        $tunnels = (Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels").tunnels
        $publicUrl = ($tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1).public_url
    } catch {
        Write-Host " Could not read ngrok URL. Wait for ngrok to start, then run again." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host " OK (already running)" -ForegroundColor Green
}

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -match '^192\.168\.' -and $_.PrefixOrigin -ne 'WellKnown'
} | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Public URL (for QR Code):" -ForegroundColor White
Write-Host "  $publicUrl" -ForegroundColor Green
Write-Host ""
if ($lanIp) {
    Write-Host "  LAN URL (same WiFi):" -ForegroundColor White
    Write-Host "  http://${lanIp}:$port" -ForegroundColor Green
}
Write-Host "========================================" -ForegroundColor Cyan

$urlFile = Join-Path $ProjectRoot "deploy\demo-url.txt"
New-Item -ItemType Directory -Force -Path (Split-Path $urlFile) | Out-Null
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
$content = @"
Thesis Demo URLs - $timestamp

Public (QR Code):  $publicUrl
LAN:               http://${lanIp}:$port
API (BFF):         http://127.0.0.1:$port/api/bff
"@
Set-Content -Path $urlFile -Value $content -Encoding UTF8

$qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=$([uri]::EscapeDataString($publicUrl))"
Start-Process $qrUrl

Write-Host ""
Write-Host "QR Code opened in browser. Download PNG for your slides." -ForegroundColor Green
Write-Host "URL saved to: deploy\demo-url.txt" -ForegroundColor Gray
Write-Host ""
