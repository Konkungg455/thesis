# Start Thesis demo: XAMPP + Nuxt + ngrok
# Usage: npm run demo

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "=== Thesis Demo Startup ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] XAMPP Apache..." -NoNewline
try {
    $xampp = Invoke-WebRequest -Uri "http://127.0.0.1/4/" -UseBasicParsing -TimeoutSec 5
    Write-Host " OK ($($xampp.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "  -> Start Apache + MySQL in XAMPP Control Panel" -ForegroundColor Yellow
    Start-Process "C:\xampp\xampp-control.exe" -ErrorAction SilentlyContinue
    exit 1
}

$port = 3001
if (Test-Path "$ProjectRoot\.env") {
    $envLine = Get-Content "$ProjectRoot\.env" | Where-Object { $_ -match '^NUXT_PORT=' } | Select-Object -First 1
    if ($envLine -match 'NUXT_PORT=(\d+)') { $port = [int]$Matches[1] }
}

Write-Host "[2/4] Nuxt (port $port)..." -NoNewline
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

Write-Host "[3/4] n8n (port 5678)..." -NoNewline
try {
    Invoke-WebRequest -Uri "http://127.0.0.1:5678/" -UseBasicParsing -TimeoutSec 3 | Out-Null
    Write-Host " OK" -ForegroundColor Green
} catch {
    Write-Host " off (AI chat may not work)" -ForegroundColor Yellow
}

Write-Host "[4/4] ngrok tunnel..." -NoNewline
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
API (local):       http://127.0.0.1/4
"@
Set-Content -Path $urlFile -Value $content -Encoding UTF8

$qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=$([uri]::EscapeDataString($publicUrl))"
Start-Process $qrUrl

Write-Host ""
Write-Host "QR Code opened in browser. Download PNG for your slides." -ForegroundColor Green
Write-Host "URL saved to: deploy\demo-url.txt" -ForegroundColor Gray
Write-Host ""
