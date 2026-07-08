# Import + Activate n8n workflow (fixes webhook 404)
# Usage: called from ensure-ai-local.ps1

param([switch]$Quiet)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$N8nData = Join-Path $ProjectRoot ".tools\n8n-data"
$WorkflowFile = Join-Path $ProjectRoot "n8n_workflow_telebot_chat.json"
$CredsFile = Join-Path $ProjectRoot "n8n_credentials_ollama.json"
$WebhookId = "1f5ea30f-2ff0-4d32-b211-eccb342ee0df"
$N8nVersion = "1.91.2"

function Write-SetupLog([string]$Text, [string]$Color = "Gray") {
    if (-not $Quiet) { Write-Host $Text -ForegroundColor $Color }
}

function Invoke-N8nCli([string[]]$Args) {
    $nodeTools = & (Join-Path $PSScriptRoot "ensure-node22-for-n8n.ps1")
    if ($nodeTools.NodeDir) {
        $env:PATH = "$($nodeTools.NodeDir);$env:PATH"
    }
    $env:N8N_USER_FOLDER = $N8nData
    $env:N8N_RUNNERS_ENABLED = "true"
    $npx = if ($nodeTools.NpxCmd -match '[\\/]') { $nodeTools.NpxCmd } else { "npx" }
    & $npx --yes "n8n@$N8nVersion" @Args 2>&1 | Out-Null
    return $LASTEXITCODE
}

function Test-WebhookReady {
    try {
        $body = '{"chatInput":"ping","sessionId":"setup","userName":"test"}'
        Invoke-RestMethod -Uri "http://127.0.0.1:5678/webhook/$WebhookId/chat" `
            -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Get-ActiveWorkflowCount {
    $nodeTools = & (Join-Path $PSScriptRoot "ensure-node22-for-n8n.ps1")
    if ($nodeTools.NodeDir) { $env:PATH = "$($nodeTools.NodeDir);$env:PATH" }
    $env:N8N_USER_FOLDER = $N8nData
    $env:N8N_RUNNERS_ENABLED = "true"
    $npx = if ($nodeTools.NpxCmd -match '[\\/]') { $nodeTools.NpxCmd } else { "npx" }
    $ids = & $npx --yes "n8n@$N8nVersion" list:workflow --active=true --onlyId 2>$null
    if (-not $ids) { return 0 }
    return @($ids | Where-Object { $_.Trim() -ne "" }).Count
}

New-Item -ItemType Directory -Force -Path $N8nData | Out-Null

if (Test-WebhookReady) {
    Write-SetupLog "      n8n webhook OK" "Green"
    return $true
}

Write-SetupLog "      Setting up n8n workflow (import + activate)..." "Yellow"

if (Test-Path $CredsFile) {
    Invoke-N8nCli @("import:credentials", "-i=$CredsFile") | Out-Null
}

if (Test-Path $WorkflowFile) {
    Invoke-N8nCli @("import:workflow", "-i=$WorkflowFile") | Out-Null
}

Invoke-N8nCli @("update:workflow", "--all", "--active=true") | Out-Null

$activeCount = Get-ActiveWorkflowCount
Write-SetupLog "      Active workflows: $activeCount" "Gray"

if (Test-WebhookReady) {
    Write-SetupLog "      n8n webhook OK after setup" "Green"
    return $true
}

# n8n may still be running with old data folder — restart once with project folder
Write-SetupLog "      Restarting n8n to register webhook..." "Yellow"
try {
    $conn = Get-NetTCPConnection -LocalPort 5678 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
} catch { }

$nodeTools = & (Join-Path $PSScriptRoot "ensure-node22-for-n8n.ps1")
if ($nodeTools.NodeDir) { $env:PATH = "$($nodeTools.NodeDir);$env:PATH" }
$env:N8N_USER_FOLDER = $N8nData
$npx = if ($nodeTools.NpxCmd -match '[\\/]') { $nodeTools.NpxCmd } else { "npx" }
$n8nStart = @("Set-Location '$ProjectRoot'")
if ($nodeTools.NodeDir) {
    $n8nStart += "`$env:PATH='$($nodeTools.NodeDir);' + `$env:PATH"
}
$n8nStart += @(
    "`$env:N8N_USER_FOLDER='$N8nData'"
    "`$env:N8N_HOST='0.0.0.0'"
    "`$env:N8N_PORT='5678'"
    "`$env:N8N_SECURE_COOKIE='false'"
    "`$env:N8N_RUNNERS_ENABLED='true'"
    "& '$npx' --yes n8n@$N8nVersion start"
)
Start-Process powershell -ArgumentList @(
    "-NoExit", "-WindowStyle", "Minimized", "-Command",
    ($n8nStart -join "; ")
) | Out-Null

$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-WebhookReady) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
}

if (Test-WebhookReady) {
    Write-SetupLog "      n8n webhook OK after restart" "Green"
    return $true
}

Write-SetupLog "      WARN: open http://127.0.0.1:5678 and Activate workflow manually" "Yellow"
return $false
