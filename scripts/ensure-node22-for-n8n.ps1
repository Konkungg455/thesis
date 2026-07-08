# Download portable Node.js 22 for n8n (system Node 25 is not supported by n8n)
# Usage: called from start-ai-local.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ToolsDir = Join-Path $ProjectRoot ".tools"
$NodeDir = Join-Path $ToolsDir "node-v22-win-x64"
$NodeExe = Join-Path $NodeDir "node.exe"
$NpxCmd = Join-Path $NodeDir "npx.cmd"
$NodeVersion = "22.14.0"
$ZipName = "node-v$NodeVersion-win-x64.zip"
$ZipUrl = "https://nodejs.org/dist/v$NodeVersion/$ZipName"
$ZipPath = Join-Path $ToolsDir $ZipName

function Get-NodeMajor([string]$Exe) {
    if (-not (Test-Path $Exe)) { return 0 }
    $v = & $Exe -v 2>$null
    if ($v -match 'v(\d+)') { return [int]$Matches[1] }
    return 0
}

# System Node 18-22 is fine
$sysMajor = Get-NodeMajor "node"
if ($sysMajor -ge 18 -and $sysMajor -le 22) {
    Write-Host "      Using system Node $sysMajor for n8n." -ForegroundColor Gray
    return @{
        NodeExe = "node"
        NpxCmd  = "npx"
        NodeDir = ""
    }
}

# Portable Node 22
if (-not (Test-Path $NodeExe)) {
    Write-Host "      Downloading Node.js $NodeVersion for n8n (one-time)..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
    Expand-Archive -Path $ZipPath -DestinationPath $ToolsDir -Force
    $extracted = Join-Path $ToolsDir "node-v$NodeVersion-win-x64"
    if (Test-Path $extracted) {
        if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
        Rename-Item $extracted $NodeDir
    }
    Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $NodeExe)) {
    Write-Host " FAIL: could not install portable Node 22" -ForegroundColor Red
    exit 1
}

Write-Host "      Using portable Node 22 for n8n (.tools/node-v22-win-x64)" -ForegroundColor Gray
return @{
    NodeExe = $NodeExe
    NpxCmd  = $NpxCmd
    NodeDir = $NodeDir
}
