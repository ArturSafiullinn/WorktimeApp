$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$nodeBin = 'C:\Program Files\nodejs'
$authenticated = $false
if ($env:WORKTIME_DB_PASSWORD) {
  $password = $env:WORKTIME_DB_PASSWORD
  $env:PGPASSWORD = $password
  $exists = & "$pgBin\psql.exe" -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='worktime'"
  $authenticated = $LASTEXITCODE -eq 0
}
for ($attempt = 1; $attempt -le 3 -and -not $authenticated; $attempt++) {
  $secure = Read-Host "Введите пароль пользователя postgres (попытка $attempt из 3)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  $env:PGPASSWORD = $password
  $exists = & "$pgBin\psql.exe" -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='worktime'"
  $authenticated = $LASTEXITCODE -eq 0
  if (-not $authenticated) { Write-Host 'Пароль не подошел. Попробуйте еще раз.' -ForegroundColor Yellow }
}
if (-not $authenticated) { Read-Host 'Три попытки исчерпаны. Нажмите Enter'; exit 1 }
if ([string]$exists -ne '1') { & "$pgBin\createdb.exe" -h 127.0.0.1 -U postgres worktime }
if ($LASTEXITCODE -ne 0) { throw 'Не удалось создать базу worktime.' }
$encoded = [Uri]::EscapeDataString($password)
@"
DATABASE_URL=postgresql://postgres:$encoded@127.0.0.1:5432/worktime
PORT=3001
EMPLOYEE_XLS=C:/Users/art22/Downloads/Сотрудник_20260706091541.xls
"@ | Set-Content -LiteralPath "$project\.env" -Encoding utf8
$env:Path = "$nodeBin;$env:Path"
Push-Location $project
try { & "$nodeBin\npm.cmd" run db:init }
finally { Pop-Location; Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue; $password = $null }
if ($LASTEXITCODE -ne 0) { throw 'Импорт завершился с ошибкой.' }
Write-Host ''
Write-Host 'Готово. База worktime создана и заполнена.' -ForegroundColor Green
if (-not $env:WORKTIME_DB_PASSWORD) { Read-Host 'Нажмите Enter, чтобы закрыть окно' }
