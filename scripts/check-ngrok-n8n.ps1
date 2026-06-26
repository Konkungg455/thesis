# Check ngrok forwards to n8n port 5678 (not Nuxt 3001)
$ErrorActionPreference = 'Stop'

try {
    $tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 3
} catch {
    Write-Host 'ngrok not running. Run: ngrok http 5678' -ForegroundColor Red
    exit 1
}

$https = $tunnels.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1
if (-not $https) {
    Write-Host 'No ngrok HTTPS tunnel found' -ForegroundColor Red
    exit 1
}

$addr = [string]$https.config.addr
$url = [string]$https.public_url
Write-Host "ngrok URL: $url"
Write-Host "forward -> $addr"

$okPort = ($addr -match ':5678') -or ($addr -match '5678')
if (-not $okPort) {
    Write-Host 'WRONG PORT - run: ngrok http 5678' -ForegroundColor Red
    Write-Host 'Current tunnel points to Nuxt 3001, Vercel AI will 404' -ForegroundColor Yellow
    exit 1
}

try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5678' -UseBasicParsing -TimeoutSec 5
    Write-Host "n8n local: OK ($($r.StatusCode))"
} catch {
    Write-Host 'n8n not responding on 127.0.0.1:5678 - run npm run dev' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host "Set Vercel NUXT_N8N_INTERNAL_URL=$url" -ForegroundColor Green
Write-Host 'OK - ngrok + n8n ready for Vercel AI'
