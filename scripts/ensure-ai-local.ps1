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
$Model = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "gemma4:latest" }
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

function Set-N8nProcessEnv([hashtable]$NodeTools) {
    if ($NodeTools.NodeDir) {
        $env:PATH = "$($NodeTools.NodeDir);$env:PATH"
    }
    $env:N8N_USER_FOLDER = $N8nData
    $env:N8N_HOST = "0.0.0.0"
    $env:N8N_PORT = "5678"
    $env:N8N_SECURE_COOKIE = "false"
    $env:N8N_DIAGNOSTICS_ENABLED = "false"
    $env:N8N_PERSONALIZATION_ENABLED = "false"
    $env:N8N_RUNNERS_ENABLED = "true"
    $env:N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE = "true"
}

function Prefetch-N8nPackage([hashtable]$NodeTools) {
    $marker = Join-Path $ProjectRoot ".tools\n8n-prefetch.ok"
    if (Test-Path $marker) { return }
    Write-AiLog "      Downloading n8n@$N8nVersion (first time, ~1-3 min)..." "Yellow"
    Set-N8nProcessEnv -NodeTools $NodeTools
    $npx = if ($NodeTools.NpxCmd -match '[\\/]') { $NodeTools.NpxCmd } else { "npx" }
    & $npx --yes "n8n@$N8nVersion" --version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        New-Item -ItemType File -Path $marker -Force | Out-Null
    }
}

function Start-N8nBackground {
    param([hashtable]$NodeTools)
    Set-N8nProcessEnv -NodeTools $NodeTools
    $n8nArgs = @("--yes", "n8n@$N8nVersion", "start")
    $nodeExe = if ($NodeTools.NodeExe -and (Test-Path $NodeTools.NodeExe)) { $NodeTools.NodeExe } else { "node" }
    $npxCli = if ($NodeTools.NodeDir) {
        Join-Path $NodeTools.NodeDir "node_modules\npm\bin\npx-cli.js"
    } else { $null }
    if ($npxCli -and (Test-Path $npxCli)) {
        # Run npx-cli.js with portable node.exe (avoids system Node 23+ on Windows)
        Start-Process -FilePath $nodeExe -ArgumentList (@($npxCli) + $n8nArgs) `
            -WorkingDirectory $ProjectRoot -WindowStyle Minimized | Out-Null
    } elseif ($NodeTools.NpxCmd -match '\.cmd$') {
        $comspec = if ($env:ComSpec) { $env:ComSpec } else { "$env:SystemRoot\System32\cmd.exe" }
        Start-Process -FilePath $comspec -ArgumentList (@("/c", "`"$($NodeTools.NpxCmd)`"") + $n8nArgs) `
            -WorkingDirectory $ProjectRoot -WindowStyle Minimized | Out-Null
    } else {
        $npx = if ($NodeTools.NpxCmd) { $NodeTools.NpxCmd } else { "npx" }
        Start-Process -FilePath $npx -ArgumentList $n8nArgs `
            -WorkingDirectory $ProjectRoot -WindowStyle Minimized | Out-Null
    }
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

# --- n8n server (start before workflow import) ---
if (-not $Quiet) { Write-Host "[2/2] n8n (port 5678)..." -NoNewline }
if (Test-PortOpen 5678) {
    if (-not $Quiet) { Write-Host " OK (already running)" -ForegroundColor Green }
} else {
    if (-not $Quiet) { Write-Host " starting..." -ForegroundColor Yellow }
    $nodeTools = & (Join-Path $PSScriptRoot "ensure-node22-for-n8n.ps1")
    Prefetch-N8nPackage -NodeTools $nodeTools
    Start-N8nBackground -NodeTools $nodeTools
    $waitSec = if ($Quiet) { 180 } else { 120 }
    $deadline = (Get-Date).AddSeconds($waitSec)
    while (-not (Test-PortOpen 5678) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
    }
    if (Test-PortOpen 5678) {
        if (-not $Quiet) { Write-Host " OK" -ForegroundColor Green }
    } elseif (-not $Quiet) {
        Write-Host " starting (first run may take 2-3 min - run npm run ai:start)" -ForegroundColor Yellow
    }
}

# Import + activate workflow after n8n is listening
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
