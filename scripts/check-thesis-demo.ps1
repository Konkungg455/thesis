# Thesis demo health check
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

$port = 3001
if (Test-Path "$ProjectRoot\.env") {
    $envLine = Get-Content "$ProjectRoot\.env" | Where-Object { $_ -match '^NUXT_PORT=' } | Select-Object -First 1
    if ($envLine -match 'NUXT_PORT=(\d+)') { $port = [int]$Matches[1] }
}

$checks = @(
    @{ Name = "XAMPP Apache (/4)"; Url = "http://127.0.0.1/4/" },
    @{ Name = "MySQL via PHP API"; Url = "http://127.0.0.1/4/get-user-session.php"; ExpectJson = $true },
    @{ Name = "Nuxt frontend"; Url = "http://127.0.0.1:$port/" },
    @{ Name = "n8n AI chat"; Url = "http://127.0.0.1:5678/"; Optional = $true }
)

$allOk = $true
Write-Host ""
Write-Host "=== Thesis Demo Health Check ===" -ForegroundColor Cyan
Write-Host ""

foreach ($c in $checks) {
    Write-Host ("{0,-28}" -f $c.Name) -NoNewline
    try {
        $r = Invoke-WebRequest -Uri $c.Url -UseBasicParsing -TimeoutSec 5
        if ($c.ExpectJson -and $r.Content -notmatch '^\s*[\{\[]') {
            Write-Host " WARN (not JSON)" -ForegroundColor Yellow
        } else {
            Write-Host " OK ($($r.StatusCode))" -ForegroundColor Green
        }
    } catch {
        if ($c.Optional) {
            Write-Host " SKIP (optional)" -ForegroundColor Yellow
        } else {
            Write-Host " FAIL" -ForegroundColor Red
            $allOk = $false
        }
    }
}

Write-Host ""
try {
    $tunnels = (Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels").tunnels
    $publicUrl = ($tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1).public_url
    Write-Host ("{0,-28}" -f "ngrok tunnel") -NoNewline
    if ($publicUrl) {
        Write-Host " OK" -ForegroundColor Green
        Write-Host "  -> $publicUrl" -ForegroundColor Gray

        $h = @{ 'ngrok-skip-browser-warning' = '1' }
        try {
            Invoke-WebRequest -Uri "$publicUrl/4/get-user-session.php" -Headers $h -UseBasicParsing -TimeoutSec 10 | Out-Null
            Write-Host ("{0,-28}" -f "ngrok API proxy (/4)") -NoNewline
            Write-Host " OK" -ForegroundColor Green
        } catch {
            Write-Host ("{0,-28}" -f "ngrok API proxy (/4)") -NoNewline
            Write-Host " FAIL" -ForegroundColor Red
            $allOk = $false
        }
    }
} catch {
    Write-Host ("{0,-28}" -f "ngrok tunnel") -NoNewline
    Write-Host " FAIL (not running)" -ForegroundColor Red
    $allOk = $false
}

Write-Host ""
if ($allOk) {
    Write-Host "Ready for demo!" -ForegroundColor Green
} else {
    Write-Host "Not ready yet. Run: npm run demo" -ForegroundColor Red
}
Write-Host ""
