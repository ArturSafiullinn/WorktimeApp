$ErrorActionPreference = "Stop"

$server = "root@31.130.151.36"
$sshDir = Join-Path $env:USERPROFILE ".ssh"
$keyPath = Join-Path $sshDir "worktime_prod_ed25519"
$publicKeyPath = "$keyPath.pub"

if (!(Test-Path $sshDir)) {
  New-Item -ItemType Directory -Path $sshDir | Out-Null
}

if (!(Test-Path $keyPath)) {
  ssh-keygen -t ed25519 -f $keyPath -N "" -C "worktime-prod"
}

Get-Content $publicKeyPath | ssh $server "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

Write-Host "SSH key installed. You can deploy with: powershell -ExecutionPolicy Bypass -File scripts\deploy-prod.ps1"
