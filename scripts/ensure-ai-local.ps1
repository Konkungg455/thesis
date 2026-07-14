# Ensure Ollama + n8n are running (NO Docker, NO n8n Cloud)
# Usage: dot-sourced from dev.ps1 / start-ai-local.ps1

param(
    [switch]$Quiet,
    [switch]$SkipModelPull
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$N8nData = Join-Path $ProjectRoot ".tools\n8n-data"
$OllamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\Ollama.exe"
$Model = "gemma4:latest"
$N8nVersion = "1.91.2"

function Write-AiLog([string]$Text, [string]$Color = "Gray") {
    if (-not $Quiet) { Write-Host $Text -ForegroundColor $Color }
}

function Test-PortOpen([int]$Port) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect("127.0.0.1", $Port)
        $c.Close()
        return $true
    } catch {
        return $false
    }
}

function Test-OllamaModel([string]$Name) {
    try {
        $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
        foreach ($m in $tags.models) {
            if ($m.name -eq $Name -or $m.name -eq "$Name`:latest") { return $true }
        }
    } catch { }
    return $false
}

function Start-N8nBackground {
    param([hashtable]$NodeTools)
    $n8nNpx = $NodeTools.NpxCmd
    $n8nLines = @("Set-Location '$ProjectRoot'")
    if ($NodeTools.NodeDir) {
        $n8nLines += "`$env:PATH='$($NodeTools.NodeDir);' + `$env:PATH"
    }
    $n8nLines += @(
        "`$env:N8N_USER_FOLDER='$N8nData'"
        "`$env:N8N_HOST='0.0.0.0'"
        "`$env:N8N_PORT='5678'"
        "`$env:N8N_SECURE_COOKIE='false'"
        "`$env:N8N_DIAGNOSTICS_ENABLED='false'"
        "`$env:N8N_PERSONALIZATION_ENABLED='false'"
        "`$env:N8N_RUNNERS_ENABLED='true'"
        "`$env:N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE='true'"
        "Write-Host 'n8n -> http://127.0.0.1:5678' -ForegroundColor Cyan"
        "& '$n8nNpx' --yes n8n@$N8nVersion start"
    )
    $n8nCmd = $n8nLines -join "; "
    Start-Process powershell -ArgumentList @("-NoExit", "-WindowStyle", "Minimized", "-Command", $n8nCmd) | Out-Null
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "=== Telebot AI Stack (Ollama + n8n local) ===" -ForegroundColor Cyan
    Write-Host ""
}

# --- Ollama ---
if (-not $Quiet) { Write-Host "[1/2] Ollama (port 11434)..." -NoNewline }
if (-not (Test-PortOpen 11434)) {
    if (Test-Path $OllamaExe) {
        Write-AiLog " starting Ollama..." "Yellow"
        Start-Process $OllamaExe | Out-Null
        $deadline = (Get-Date).AddSeconds(30)
        while (-not (Test-PortOpen 11434) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 2
        }
    } elseif (-not $Quiet) {
        Write-Host " NOT INSTALLED" -ForegroundColor Red
        Write-Host "  -> Download: https://ollama.com/download/windows" -ForegroundColor Yellow
        exit 1
    }
}

if (Test-PortOpen 11434) {
    if (-not $Quiet) { Write-Host " OK" -ForegroundColor Green }
} elseif (-not $Quiet) {
    Write-Host " FAIL" -ForegroundColor Red
    exit 1
}

if (-not $SkipModelPull -and (Test-PortOpen 11434)) {
    if (-not (Test-OllamaModel $Model)) {
        Write-AiLog "      Pulling model $Model (first time)..." "Yellow"
        & ollama pull $Model 2>&1 | Out-Null
    }
}

# --- n8n workflow (import + activate before server start) ---
& (Join-Path $PSScriptRoot "setup-n8n-workflow.ps1") -Quiet:$Quiet | Out-Null

# --- n8n ---
if (-not $Quiet) { Write-Host "[2/2] n8n (port 5678)..." -NoNewline }
if (Test-PortOpen 5678) {
    if (-not $Quiet) { Write-Host " OK (already running)" -ForegroundColor Green }
} else {
    if (-not $Quiet) { Write-Host " starting..." -ForegroundColor Yellow }
    $nodeTools = & (Join-Path $PSScriptRoot "ensure-node22-for-n8n.ps1")
    Start-N8nBackground -NodeTools $nodeTools
    $waitSec = if ($Quiet) { 12 } else { 45 }
    $deadline = (Get-Date).AddSeconds($waitSec)
    while (-not (Test-PortOpen 5678) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
    }
    if (Test-PortOpen 5678) {
        if (-not $Quiet) { Write-Host " OK" -ForegroundColor Green }
    } elseif (-not $Quiet) {
        Write-Host " starting (wait for n8n window)..." -ForegroundColor Yellow
    }
}

# Verify webhook after n8n is up
if (Test-PortOpen 5678) {
    & (Join-Path $PSScriptRoot "setup-n8n-workflow.ps1") -Quiet:$Quiet | Out-Null
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "  Ollama: http://127.0.0.1:11434" -ForegroundColor Gray
    Write-Host "  n8n:    http://127.0.0.1:5678" -ForegroundColor Gray
    Write-Host ""
}

return @{
    Ollama = (Test-PortOpen 11434)
    N8n    = (Test-PortOpen 5678)
}
