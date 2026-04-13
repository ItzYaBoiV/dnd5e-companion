# D&D AI Worker - System Tray App
# Shows Ollama status, lets you start/stop and register with the server.
# Run at startup: powershell -WindowStyle Hidden -File tray-worker.ps1
# Or just double-click tray-worker.vbs

param(
  [string]$ServerIP   = "192.168.5.7",
  [string]$ServerPort = "56791",
  [string]$Model      = "llama3.1:8b"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# -- Detect real LAN IP (skip virtual adapters) ---------------------
$MY_IP = (
  Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*"       -and
    $_.IPAddress -notlike "169.254.*"   -and
    $_.IPAddress -notlike "192.168.80.*" -and
    $_.IPAddress -notlike "192.168.56.*" -and
    $_.IPAddress -notlike "192.168.137.*"
  } |
  ForEach-Object {
    $ip = $_
    $adapter = Get-NetAdapter -InterfaceIndex $ip.InterfaceIndex -ErrorAction SilentlyContinue
    if ($adapter -and $adapter.Status -eq "Up" -and
        $adapter.InterfaceDescription -notmatch "VMware|VirtualBox|Hyper-V|Virtual|Loopback|Miniport|TAP|WAN") {
      $ip
    }
  } |
  Sort-Object -Property PrefixLength -Descending |
  Select-Object -First 1
).IPAddress

if (-not $MY_IP) {
  $MY_IP = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } |
    Select-Object -First 1).IPAddress
}

# -- Helper functions -----------------------------------------------
function Test-Ollama {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 2
    return $r.StatusCode -eq 200
  } catch { return $false }
}

function Test-ServerReach {
  try {
    $r = Invoke-WebRequest -Uri "http://${ServerIP}:${ServerPort}/api/workers" -UseBasicParsing -TimeoutSec 3
    return $r.StatusCode -eq 200
  } catch { return $false }
}

function Start-Ollama {
  $running = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
  if (-not $running) {
    [System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0", "Process")
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
  }
}

function Stop-Ollama {
  Get-Process -Name "ollama" -ErrorAction SilentlyContinue | Stop-Process -Force
}

function Register-WithServer {
  try {
    $body = "{`"ip`":`"$MY_IP`",`"model`":`"$Model`",`"hostname`":`"$env:COMPUTERNAME`"}"
    $r = Invoke-WebRequest -Uri "http://${ServerIP}:${ServerPort}/api/workers/register" `
      -Method Post -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 5
    return $r.StatusCode -eq 200
  } catch { return $false }
}

# -- Build icon bitmaps (green = online, red = offline, yellow = connecting)
function New-Icon([string]$color) {
  $bmp = New-Object System.Drawing.Bitmap 16, 16
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)

  $bg  = switch ($color) {
    "green"  { [System.Drawing.Color]::FromArgb(40, 167, 69) }
    "red"    { [System.Drawing.Color]::FromArgb(220, 53, 69) }
    "yellow" { [System.Drawing.Color]::FromArgb(255, 193, 7) }
    default  { [System.Drawing.Color]::Gray }
  }

  $brush = New-Object System.Drawing.SolidBrush $bg
  $g.FillEllipse($brush, 1, 1, 13, 13)

  # D20 dot in the center
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillEllipse($white, 5, 5, 5, 5)

  $brush.Dispose(); $white.Dispose(); $g.Dispose()
  return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

# -- Build tray icon and context menu --------------------------------
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Visible = $true
$tray.Text    = "D&D AI Worker - Starting..."
$tray.Icon    = New-Icon "yellow"

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$statusItem  = $menu.Items.Add("Status: Checking...")
$statusItem.Enabled = $false

$menu.Items.Add("-") | Out-Null

$startItem    = $menu.Items.Add("Start Ollama")
$stopItem     = $menu.Items.Add("Stop Ollama")
$registerItem = $menu.Items.Add("Register with Server")

$menu.Items.Add("-") | Out-Null

$ipItem = $menu.Items.Add("This PC: $MY_IP")
$ipItem.Enabled = $false

$serverItem = $menu.Items.Add("Server: ${ServerIP}:${ServerPort}")
$serverItem.Enabled = $false

$menu.Items.Add("-") | Out-Null
$exitItem = $menu.Items.Add("Exit Worker")

$tray.ContextMenuStrip = $menu

# -- Event handlers -------------------------------------------------
$startItem.Add_Click({
  $tray.ShowBalloonTip(2000, "D&D AI Worker", "Starting Ollama...", [System.Windows.Forms.ToolTipIcon]::Info)
  Start-Ollama
})

$stopItem.Add_Click({
  Stop-Ollama
  $tray.ShowBalloonTip(2000, "D&D AI Worker", "Ollama stopped.", [System.Windows.Forms.ToolTipIcon]::Warning)
})

$registerItem.Add_Click({
  $tray.ShowBalloonTip(2000, "D&D AI Worker", "Registering with server...", [System.Windows.Forms.ToolTipIcon]::Info)
  if (Register-WithServer) {
    $tray.ShowBalloonTip(3000, "D&D AI Worker", "Registered with $ServerIP!", [System.Windows.Forms.ToolTipIcon]::Info)
  } else {
    $tray.ShowBalloonTip(3000, "D&D AI Worker", "Could not reach server at $ServerIP", [System.Windows.Forms.ToolTipIcon]::Error)
  }
})

$exitItem.Add_Click({
  $timer.Stop()
  $tray.Visible = $false
  $tray.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

$tray.Add_DoubleClick({
  # Double-click = register with server
  if (Register-WithServer) {
    $tray.ShowBalloonTip(3000, "D&D AI Worker", "Registered with $ServerIP!", [System.Windows.Forms.ToolTipIcon]::Info)
  } else {
    $tray.ShowBalloonTip(3000, "D&D AI Worker", "Could not reach $ServerIP - is the app running?", [System.Windows.Forms.ToolTipIcon]::Warning)
  }
})

# -- Status polling timer (every 15 seconds) ------------------------
$timer          = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000

$timer.Add_Tick({
  $ollamaOk = Test-Ollama
  $serverOk = Test-ServerReach

  if ($ollamaOk -and $serverOk) {
    $tray.Icon = New-Icon "green"
    $tray.Text = "D&D AI Worker - Online | $MY_IP"
    $statusItem.Text = "Online - Ollama OK, Server reachable"
  } elseif ($ollamaOk -and -not $serverOk) {
    $tray.Icon = New-Icon "yellow"
    $tray.Text = "D&D AI Worker - Ollama OK, Server unreachable"
    $statusItem.Text = "Ollama running, server offline"
  } else {
    $tray.Icon = New-Icon "red"
    $tray.Text = "D&D AI Worker - Offline"
    $statusItem.Text = "Offline - Ollama not running"
  }
})

$timer.Start()

# Run initial check immediately
& $timer.Tag  # no-op, just start the loop
$timer.Interval = 1000  # first tick fast
$timer.Add_Tick.Invoke($null, $null) | Out-Null
$timer.Interval = 15000  # back to 15s

# -- Start Ollama automatically on launch ---------------------------
Start-Ollama
Start-Sleep -Seconds 2

# Auto-register on startup
if (Test-Ollama) {
  Register-WithServer | Out-Null
  $tray.ShowBalloonTip(3000, "D&D AI Worker", "Worker started and registered with $ServerIP", [System.Windows.Forms.ToolTipIcon]::Info)
}

# -- Run the message loop -------------------------------------------
[System.Windows.Forms.Application]::Run()
