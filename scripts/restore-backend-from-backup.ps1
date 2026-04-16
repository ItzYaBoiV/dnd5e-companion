# Run in PowerShell from the repo root (folder that contains `backend\`).
# Example:
#   cd C:\path\to\dnd5e-companion
#   .\scripts\restore-backend-from-backup.ps1 -BackupRoot "$env:USERPROFILE\Desktop\dnd5e-src"

param(
  [Parameter(Mandatory = $true)]
  [string] $BackupRoot
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Src = Join-Path $BackupRoot "backend\src"
$Dst = Join-Path $RepoRoot "backend\src"

if (-not (Test-Path $Src)) {
  Write-Error "Not found: $Src — is BackupRoot your repo copy (with backend\src)?"
}

Write-Host "Copying:`n  $Src`n  -> $Dst"
robocopy $Src $Dst /MIR /XD node_modules /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -ge 8) { Write-Error "robocopy failed with code $LASTEXITCODE" }

$PrismaSrc = Join-Path $BackupRoot "backend\prisma"
$PrismaDst = Join-Path $RepoRoot "backend\prisma"
if (Test-Path $PrismaSrc) {
  $yn = Read-Host "Also mirror backend\prisma from backup? (y/N)"
  if ($yn -eq "y") {
    robocopy $PrismaSrc $PrismaDst /MIR /NFL /NDL /NJH /NJS
    if ($LASTEXITCODE -ge 8) { Write-Error "robocopy prisma failed" }
    Write-Warning "If you use encounter pools by location, merge scripts\snippet-location-monster.prisma into schema.prisma"
  }
}

Push-Location (Join-Path $RepoRoot "backend")
npm run build
Pop-Location
Write-Host "Done."
