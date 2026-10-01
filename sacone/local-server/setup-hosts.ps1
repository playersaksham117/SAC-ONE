# Points the SACONE local domain at this PC (run once, as Administrator).
#   powershell -ExecutionPolicy Bypass -File local-server\setup-hosts.ps1
#   powershell -ExecutionPolicy Bypass -File local-server\setup-hosts.ps1 -Remove
# Other PCs on the LAN: run it there with -ServerIp <this PC's IPv4>.
param(
  [string]$Domain = "sacone.local",
  [string]$ServerIp = "127.0.0.1",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Run this from an Administrator PowerShell (it edits the hosts file)." -ForegroundColor Yellow
  exit 1
}

$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
$begin = "# >>> SACONE local domain"
$end = "# <<< SACONE local domain"

$lines = Get-Content $hostsFile
$kept = @()
$inBlock = $false
foreach ($line in $lines) {
  if ($line -eq $begin) { $inBlock = $true; continue }
  if ($line -eq $end) { $inBlock = $false; continue }
  if (-not $inBlock) { $kept += $line }
}

if (-not $Remove) {
  $kept += $begin
  $kept += "$ServerIp`t$Domain erp.$Domain owner.$Domain api.$Domain"
  $kept += $end
}

Copy-Item $hostsFile "$hostsFile.sacone.bak" -Force
Set-Content -Path $hostsFile -Value $kept -Encoding ASCII
ipconfig /flushdns | Out-Null

if ($Remove) {
  Write-Host "Removed the SACONE entries from $hostsFile"
} else {
  Write-Host "Added: $ServerIp -> $Domain, erp.$Domain, owner.$Domain, api.$Domain"
  Write-Host "Backup: $hostsFile.sacone.bak"
}
