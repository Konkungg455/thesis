# Start Ollama + n8n locally (NO Docker, NO n8n Cloud)
# Usage: npm run ai:start

$ErrorActionPreference = "Continue"
$WebhookId = "1f5ea30f-2ff0-4d32-b211-eccb342ee0df"

& (Join-Path $PSScriptRoot "ensure-ai-local.ps1")

Write-Host "[3/3] Webhook test..." -NoNewline
Start-Sleep -Seconds 2
try {
    $body = @{ chatInput = "hello"; sessionId = "setup-test"; userName = "test" } | ConvertTo-Json
    $uri = "http://127.0.0.1:5678/webhook/$WebhookId/chat"
    Invoke-RestMethod -Uri $uri -Method POST -Body $body -ContentType "application/json" -TimeoutSec 120 | Out-Null
    Write-Host " OK (workflow Active + Ollama connected)" -ForegroundColor Green
} catch {
    Write-Host " skip" -ForegroundColor Yellow
    Write-Host "  -> Import + Activate workflow in n8n first (see n8n_workflow_README.md)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Webhook: http://127.0.0.1:5678/webhook/$WebhookId/chat" -ForegroundColor Gray
Write-Host "  Nuxt AI: /api/ai-chat (via npm run dev)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
