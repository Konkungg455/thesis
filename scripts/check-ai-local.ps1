# Check Ollama + n8n health
# Usage: npm run ai:check

$ErrorActionPreference = "Continue"
$WebhookId = "1f5ea30f-2ff0-4d32-b211-eccb342ee0df"

function Test-Port([int]$Port) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect("127.0.0.1", $Port)
        $c.Close()
        return $true
    } catch { return $false }
}

Write-Host ""
Write-Host "=== AI Stack Health ===" -ForegroundColor Cyan

$ollama = Test-Port 11434
$n8n = Test-Port 5678

Write-Host ("Ollama :11434 -> " + $(if ($ollama) { "OK" } else { "OFF" })) -ForegroundColor $(if ($ollama) { "Green" } else { "Red" })
Write-Host ("n8n    :5678  -> " + $(if ($n8n) { "OK" } else { "OFF" })) -ForegroundColor $(if ($n8n) { "Green" } else { "Red" })

if ($ollama) {
    try {
        $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
        $models = ($tags.models | ForEach-Object { $_.name }) -join ", "
        Write-Host "Models : $models" -ForegroundColor Gray
    } catch { }
}

if ($n8n) {
    try {
        $body = '{"chatInput":"ping","sessionId":"health","userName":"test"}'
        $uri = "http://127.0.0.1:5678/webhook/$WebhookId/chat"
        Invoke-RestMethod -Uri $uri -Method POST -Body $body -ContentType "application/json" -TimeoutSec 90 | Out-Null
        Write-Host "Webhook: OK (AI responded)" -ForegroundColor Green
    } catch {
        Write-Host "Webhook: FAIL - import n8n_workflow_telebot_chat.json, Activate, set Ollama credential" -ForegroundColor Yellow
    }
}

Write-Host ""
