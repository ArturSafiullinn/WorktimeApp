$ErrorActionPreference = "Stop"

$server = "root@31.130.151.36"
$appDir = "/opt/worktime/app"
$keyPath = Join-Path $env:USERPROFILE ".ssh\worktime_prod_ed25519"

if (Test-Path $keyPath) {
  ssh -i $keyPath $server "cd $appDir && git pull origin master && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
} else {
  ssh $server "cd $appDir && git pull origin master && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
}
