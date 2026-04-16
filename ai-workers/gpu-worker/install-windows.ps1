# D&D 5e AI Worker - Windows GPU Installer (RTX / CUDA)
# Inference runs on this PC (Ollama). The server only proxies — default model follows VRAM
# (14B Qwen on ~12GB cards like 3080 Ti). Syncs exact tag from /api/tags.
#
# Run in PowerShell as Administrator:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\install-windows.ps1
# Re-register only: .\install-windows.ps1 -SyncOnly

[CmdletBinding()]
param([switch]$SyncOnly)

$ErrorActionPreference = "Stop"
if (-not $env:SERVER_IP)   { $env:SERVER_IP   = "192.168.5.7" }
if (-not $env:SERVER_PORT) { $env:SERVER_PORT = "56791" }
$SERVER_IP   = $env:SERVER_IP
$SERVER_PORT = $env:SERVER_PORT

# PSScriptRoot = .../gpu-worker → ../lib
$LibDir = Join-Path (Split-Path -Parent $PSScriptRoot) "lib"
$PickPy = Join-Path $LibDir "pick_ollama_model.py"

function Get-RecommendedGpuModel {
  try {
    $mibStr = (& nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
    $mib = 0
    [void][int]::TryParse(($mibStr -replace '\D',''), [ref]$mib)
    if ($mib -ge 24000) { return "qwen2.5:32b" }
    if ($mib -ge 11000) { return "qwen2.5:14b" }
    if ($mib -ge 8000)  { return "llama3.1:8b" }
    return "llama3.2:3b"
  } catch {
    return "llama3.1:8b"
  }
}

function Get-PythonForPick {
  $py = Get-Command python -ErrorAction SilentlyContinue
  if ($py) { return @{ Cmd = $py.Source; Args = @() } }
  $py3 = Get-Command python3 -ErrorAction SilentlyContinue
  if ($py3) { return @{ Cmd = $py3.Source; Args = @() } }
  $pyl = Get-Command py -ErrorAction SilentlyContinue
  if ($pyl) { return @{ Cmd = $pyl.Source; Args = @("-3") } }
  return $null
}

function Get-ResolvedRegistrationModel {
  param([string]$Preferred)
  $pyInfo = Get-PythonForPick
  if (-not $pyInfo) {
    return @{ Ok = $false; Code = 1; Model = $null }
  }
  $tagsPath = Join-Path $env:TEMP "dnd-ollama-tags.json"
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -OutFile $tagsPath -UseBasicParsing -TimeoutSec 8
  } catch {
    return @{ Ok = $false; Code = 1; Model = $null }
  }
  $json = Get-Content $tagsPath -Raw -Encoding UTF8
  $allArgs = $pyInfo.Args + @($PickPy, $Preferred)
  $model = $json | & $pyInfo.Cmd @allArgs 2>$null
  $ec = $LASTEXITCODE
  if ($ec -eq 0 -and $model) {
    return @{ Ok = $true; Code = 0; Model = $model.Trim() }
  }
  return @{ Ok = $false; Code = $ec; Model = $null }
}

function Write-Step { Write-Host "" ; Write-Host "> $args" -ForegroundColor Cyan }
function Write-Ok   { Write-Host "  [OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "  [!]  $args" -ForegroundColor Yellow }
function Write-Fail { Write-Host "  [X]  $args" -ForegroundColor Red ; exit 1 }

Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "  D&D AI Worker - Windows GPU Setup" -ForegroundColor Yellow
Write-Host "  Registering with: ${SERVER_IP}:${SERVER_PORT} (model synced from Ollama)" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow

# -- Detect LAN IP (skip virtual adapters) -------------------------
Write-Step "Detecting this machine's LAN IP"

# Get all physical/real adapters - exclude VMware, VirtualBox, Hyper-V, loopback, etc.
$MY_IP = (
  Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*"      -and   # loopback
    $_.IPAddress -notlike "169.254.*"  -and   # APIPA
    $_.IPAddress -notlike "192.168.80.*" -and  # VMware NAT
    $_.IPAddress -notlike "192.168.56.*" -and  # VirtualBox host-only
    $_.IPAddress -notlike "192.168.137.*"      # Windows ICS
  } |
  ForEach-Object {
    $ip = $_
    # Also filter by adapter description to skip virtual NICs
    $adapter = Get-NetAdapter -InterfaceIndex $ip.InterfaceIndex -ErrorAction SilentlyContinue
    if ($adapter -and
        $adapter.Status -eq "Up" -and
        $adapter.InterfaceDescription -notmatch "VMware|VirtualBox|Hyper-V|Virtual|Loopback|Miniport|TAP|WAN") {
      $ip
    }
  } |
  Sort-Object -Property PrefixLength -Descending |
  Select-Object -First 1
).IPAddress

if (-not $MY_IP) {
  # Fallback: just exclude the known VMware range and loopback
  Write-Warn "Could not find a physical adapter - falling back to basic filter"
  $MY_IP = (
    Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.IPAddress -notlike "192.168.80.*"
    } |
    Sort-Object -Property PrefixLength -Descending |
    Select-Object -First 1
  ).IPAddress
}

if (-not $MY_IP) { Write-Fail "Could not detect LAN IP" }
Write-Ok "This machine's IP: $MY_IP"

# Confirm with user
Write-Host ""
Write-Host "  Is $MY_IP correct? (this should be your local network IP, e.g. 192.168.5.xx)" -ForegroundColor Yellow
Write-Host "  Press Enter to confirm, or type the correct IP: " -ForegroundColor Yellow -NoNewline
$userInput = Read-Host
if ($userInput -ne "") { $MY_IP = $userInput }
Write-Ok "Using IP: $MY_IP"

# -- GPU check -----------------------------------------------------
Write-Step "Checking NVIDIA GPU"
try {
  $gpuInfo = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null
  if ($gpuInfo) { Write-Ok "GPU: $gpuInfo" }
  else { Write-Warn "nvidia-smi found but returned no output" }
} catch {
  Write-Warn "nvidia-smi not found - make sure NVIDIA drivers are installed"
}

$recommended = Get-RecommendedGpuModel
Write-Ok "VRAM-based default model: $recommended"

if (-not (Test-Path -LiteralPath $PickPy)) {
  Write-Fail "Missing pick script: $PickPy (clone full repo; run script from ai-workers/gpu-worker)"
}

if (-not $SyncOnly) {
# -- Check / Install Ollama ----------------------------------------
Write-Step "Checking Ollama"
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaCmd) {
  Write-Host "  Downloading Ollama installer..."
  $installer = Join-Path $env:TEMP "OllamaSetup.exe"
  Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" `
    -OutFile $installer -UseBasicParsing
  Write-Host "  Running installer (follow the prompts)..."
  Start-Process -FilePath $installer -Wait

  $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", [System.EnvironmentVariableTarget]::Machine)
  $userPath    = [System.Environment]::GetEnvironmentVariable("PATH", [System.EnvironmentVariableTarget]::User)
  $env:PATH    = $machinePath + ";" + $userPath

  $ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
  if (-not $ollamaCmd) {
    Write-Fail "Install failed. Install manually from https://ollama.com then rerun."
  }
  Write-Ok "Ollama installed"
} else {
  Write-Ok "Ollama already installed: $($ollamaCmd.Source)"
}

# -- Set OLLAMA_HOST=0.0.0.0 so server can reach this machine ------
Write-Step "Setting OLLAMA_HOST=0.0.0.0"
[System.Environment]::SetEnvironmentVariable(
  "OLLAMA_HOST", "0.0.0.0", [System.EnvironmentVariableTarget]::Machine
)
$env:OLLAMA_HOST = "0.0.0.0"
Write-Ok "OLLAMA_HOST=0.0.0.0 set in system environment"

# -- Start Ollama --------------------------------------------------
Write-Step "Starting Ollama"
$running = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if ($running) {
  Write-Warn "Ollama already running - restarting to apply OLLAMA_HOST change"
  Stop-Process -Name "ollama" -Force
  Start-Sleep -Seconds 2
}
Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
Start-Sleep -Seconds 5

$ready = $false
for ($i = 0; $i -lt 10; $i++) {
  try {
    Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 3 | Out-Null
    $ready = $true ; break
  } catch { Start-Sleep -Seconds 3 }
}
if (-not $ready) { Write-Fail "Ollama did not start. Try running 'ollama serve' manually." }
Write-Ok "Ollama is running"
} else {
  Write-Step "Sync-only: verifying Ollama"
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Fail "Ollama not found. Run full install without -SyncOnly."
  }
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 5 | Out-Null
  } catch {
    Write-Fail "Ollama not responding on :11434. Start Ollama then retry -SyncOnly."
  }
  Write-Ok "Ollama is running"
}

# -- Resolve model from Ollama (sync exact name → LiteLLM) ----------
Write-Step "Syncing model name with server (from Ollama on this PC)"
$r = Get-ResolvedRegistrationModel $recommended
$MODEL = $null
if ($r.Ok) {
  $MODEL = $r.Model
  Write-Ok "Will register: $MODEL (GPU default was $recommended)"
} elseif ($r.Code -eq 3) {
  Write-Step "Pulling $recommended (no models installed yet)"
  & ollama pull $recommended
  $r2 = Get-ResolvedRegistrationModel $recommended
  if (-not $r2.Ok) { Write-Fail "Could not resolve model after pull. Install Python 3 for auto-sync." }
  $MODEL = $r2.Model
  Write-Ok "Model ready: $MODEL"
} else {
  Write-Fail "Could not read Ollama /api/tags or run pick_ollama_model.py. Install Python 3 from python.org."
}

# -- Test model ----------------------------------------------------
Write-Step "Testing model"
try {
  $response = & ollama run $MODEL "Reply in exactly 5 words: this GPU worker is ready" 2>$null
  Write-Ok "Test: $response"
} catch { Write-Warn "Model test skipped" }

# -- Register with server over HTTP --------------------------------
Write-Step "Registering with D&D server at http://${SERVER_IP}:${SERVER_PORT}"

$registerUrl = "http://${SERVER_IP}:${SERVER_PORT}/api/workers/register"
$hostName    = $env:COMPUTERNAME
$body        = "{`"ip`":`"$MY_IP`",`"model`":`"$MODEL`",`"hostname`":`"$hostName`"}"

try {
  $response = Invoke-WebRequest -Uri $registerUrl `
    -Method Post `
    -ContentType "application/json" `
    -Body $body `
    -UseBasicParsing `
    -TimeoutSec 10
  Write-Ok "Registered successfully! LiteLLM config updated on server."
  Write-Host "  $($response.Content)" -ForegroundColor Gray
} catch {
  Write-Warn "Could not reach server. If the backend is now running, register manually:"
  Write-Host ""
  Write-Host "  Invoke-WebRequest -Uri '$registerUrl' -Method Post -ContentType 'application/json' -Body '$body'" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Or from the server itself:" -ForegroundColor Yellow
  Write-Host "  curl -X POST http://localhost:56791/api/workers/register -H 'Content-Type: application/json' -d '$body'" -ForegroundColor Cyan
}

if (-not $SyncOnly) {
# -- Windows Firewall rule for Ollama port -------------------------
Write-Step "Adding Windows Firewall rule for port 11434"
$ruleName = "Ollama DnD AI Port"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
  New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound -Protocol TCP -LocalPort 11434 `
    -Action Allow -Profile Any | Out-Null
  Write-Ok "Firewall rule added: TCP 11434 inbound allowed"
} else {
  Write-Ok "Firewall rule already exists"
}

# -- Auto-start on boot --------------------------------------------
Write-Step "Setting up auto-start on login"
$taskName = "Ollama DnD AI Worker"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-WindowStyle Hidden -Command `"`$env:OLLAMA_HOST='0.0.0.0'; ollama serve`""

$trigger   = New-ScheduledTaskTrigger -AtLogOn
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest

Register-ScheduledTask -TaskName $taskName `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Force | Out-Null
Write-Ok "Scheduled task created: Ollama starts on login"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  GPU Worker setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  This machine : $MY_IP"
Write-Host "  Model        : $MODEL (synced from Ollama → LiteLLM)"
Write-Host "  Ollama port  : 11434 (firewall rule added)"
Write-Host "  Auto-start   : yes (scheduled task on login)"
Write-Host ""
Write-Host "  Once the D&D server backend is healthy, register with:"
Write-Host "  Invoke-WebRequest -Uri 'http://${SERVER_IP}:${SERVER_PORT}/api/workers/register' -Method Post -ContentType 'application/json' -Body '$body'" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Green
