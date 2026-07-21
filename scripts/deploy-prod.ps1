$ErrorActionPreference = "Stop"

$server = "root@31.130.151.36"
$appDir = "/opt/worktime/app"

ssh $server "cd $appDir && git pull origin master && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
