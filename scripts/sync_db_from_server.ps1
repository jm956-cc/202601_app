# Server Configuration
$SERVER_IP = "149.28.135.147"
$REMOTE_USER = "root"
$REMOTE_DB_CONTAINER = "xmas-db"

# Local Configuration
$LOCAL_DB_CONTAINER = "xmas-db"

# Temp File
$DUMP_FILE = "server_dump.sql"

# SSH options (avoid interactive host key prompts)
$SSH_OPTS = "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

# Local backup (safety)
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$LOCAL_BACKUP_FILE = "local_backup_$TIMESTAMP.sql"

function Get-LocalContainerEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Container,
        [Parameter(Mandatory = $true)][string]$Name
    )
    try {
        $val = (docker exec $Container sh -lc "printenv $Name" 2>$null)
        return ($val -join "\n").Trim()
    } catch {
        return ""
    }
}

function Get-ContainerEnvMap {
    param(
        [Parameter(Mandatory = $true)][string]$Container
    )
    $map = @{}
    try {
        $envLines = docker inspect $Container --format "{{range .Config.Env}}{{println .}}{{end}}" 2>$null
        foreach ($line in ($envLines -split "`n")) {
            $trimmed = ($line -join "").Trim()
            if (-not $trimmed) { continue }
            $idx = $trimmed.IndexOf("=")
            if ($idx -lt 1) { continue }
            $key = $trimmed.Substring(0, $idx)
            $val = $trimmed.Substring($idx + 1)
            $map[$key] = $val
        }
    } catch {
        return @{}
    }
    return $map
}

function Test-MySqlAuth {
    param(
        [Parameter(Mandatory = $true)][string]$Container,
        [Parameter(Mandatory = $true)][string]$User,
        [Parameter(Mandatory = $true)][string]$Password
    )
    # Use MYSQL_PWD to avoid exposing password in process args inside container.
    $cmd = "export MYSQL_PWD='$Password'; mysqladmin ping -u '$User' -h 127.0.0.1 --silent"
    cmd /c "docker exec $Container sh -lc \"$cmd\"" >$null 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Wait-ForMySqlReady {
    param(
        [Parameter(Mandatory = $true)][string]$Container,
        [Parameter(Mandatory = $true)][string]$DbName,
        [Parameter(Mandatory = $true)][string]$RootPassword,
        [Parameter(Mandatory = $true)][string]$User,
        [Parameter(Mandatory = $true)][string]$UserPassword,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-MySqlAuth -Container $Container -User "root" -Password $RootPassword) {
            return @{ user = "root"; password = $RootPassword }
        }
        if (Test-MySqlAuth -Container $Container -User $User -Password $UserPassword) {
            return @{ user = $User; password = $UserPassword }
        }

        Start-Sleep -Seconds 2
    }

    Write-Host "Local MySQL is not ready or credentials are wrong after $TimeoutSeconds seconds." -ForegroundColor Red
    Write-Host "Recent local DB logs:" -ForegroundColor DarkGray
    try {
        docker logs --tail 60 $Container
    } catch {
        # ignore
    }
    return $null
}

function Get-RemoteContainerEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Server,
        [Parameter(Mandatory = $true)][string]$User,
        [Parameter(Mandatory = $true)][string]$Container,
        [Parameter(Mandatory = $true)][string]$Name
    )
    try {
        $val = (ssh $SSH_OPTS "$User@$Server" "docker exec $Container sh -lc 'printenv $Name'" 2>$null)
        return ($val -join "\n").Trim()
    } catch {
        return ""
    }
}


$localEnv = Get-ContainerEnvMap -Container $LOCAL_DB_CONTAINER
$LOCAL_DB_ROOT_PASSWORD = $localEnv["MYSQL_ROOT_PASSWORD"]
$LOCAL_DB_NAME = $localEnv["MYSQL_DATABASE"]
$LOCAL_DB_USER = $localEnv["MYSQL_USER"]
$LOCAL_DB_PASSWORD = $localEnv["MYSQL_PASSWORD"]

if (-not $LOCAL_DB_ROOT_PASSWORD) { $LOCAL_DB_ROOT_PASSWORD = "rootpassword" }
if (-not $LOCAL_DB_NAME) { $LOCAL_DB_NAME = "xmas_event" }
if (-not $LOCAL_DB_USER) { $LOCAL_DB_USER = "xmasuser" }
if (-not $LOCAL_DB_PASSWORD) { $LOCAL_DB_PASSWORD = "xmaspass" }

$REMOTE_DB_ROOT_PASSWORD = Get-RemoteContainerEnvValue -Server $SERVER_IP -User $REMOTE_USER -Container $REMOTE_DB_CONTAINER -Name "MYSQL_ROOT_PASSWORD"
$REMOTE_DB_NAME = Get-RemoteContainerEnvValue -Server $SERVER_IP -User $REMOTE_USER -Container $REMOTE_DB_CONTAINER -Name "MYSQL_DATABASE"

if (-not $REMOTE_DB_ROOT_PASSWORD) { $REMOTE_DB_ROOT_PASSWORD = "rootpassword" }
if (-not $REMOTE_DB_NAME) { $REMOTE_DB_NAME = "xmas_event" }

Write-Host "Local DB: $LOCAL_DB_NAME (container: $LOCAL_DB_CONTAINER)" -ForegroundColor DarkGray
Write-Host "Remote DB: $REMOTE_DB_NAME (container: $REMOTE_DB_CONTAINER on $SERVER_IP)" -ForegroundColor DarkGray

# Choose local auth. Root password may not match if the DB volume was initialized earlier.
# Also, right after `docker compose up -d db`, MySQL may still be initializing.
$auth = Wait-ForMySqlReady -Container $LOCAL_DB_CONTAINER -DbName $LOCAL_DB_NAME -RootPassword $LOCAL_DB_ROOT_PASSWORD -User $LOCAL_DB_USER -UserPassword $LOCAL_DB_PASSWORD -TimeoutSeconds 120
if (-not $auth) {
    Write-Host "Error: Unable to authenticate to local MySQL with root or MYSQL_USER." -ForegroundColor Red
    Write-Host "Tip: If you previously initialized the MySQL volume with a different password, the env var may not match." -ForegroundColor DarkGray
    Write-Host "Try resetting the local DB volume (docker compose down -v) or pass the correct credentials." -ForegroundColor DarkGray
    exit 1
}

$localAuthUser = $auth.user
$localAuthPassword = $auth.password

if ($localAuthUser -ne "root") {
    Write-Host "Local MySQL root auth failed; falling back to MYSQL_USER." -ForegroundColor Yellow
}

Write-Host "0. Backing up local database to $LOCAL_BACKUP_FILE ..." -ForegroundColor Cyan
cmd /c "docker exec $LOCAL_DB_CONTAINER sh -lc \"export MYSQL_PWD='$localAuthPassword'; mysqldump --default-character-set=utf8mb4 -u '$localAuthUser' '$LOCAL_DB_NAME'\" > $LOCAL_BACKUP_FILE"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error backing up local database. Aborting to avoid data loss." -ForegroundColor Red
    exit 1
}

Write-Host "1. Dumping remote database..." -ForegroundColor Cyan
# Use cmd /c to avoid PowerShell encoding issues (UTF-16 default) and ensure UTF-8/Binary preservation
# Also added --default-character-set=utf8mb4 to mysqldump
cmd /c "ssh $SSH_OPTS $REMOTE_USER@$SERVER_IP ""docker exec $REMOTE_DB_CONTAINER mysqldump --default-character-set=utf8mb4 -u root -p$REMOTE_DB_ROOT_PASSWORD $REMOTE_DB_NAME"" > $DUMP_FILE"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error dumping database. Check SSH connection and credentials." -ForegroundColor Red
    exit 1
}

Write-Host "2. Importing to local database..." -ForegroundColor Cyan
# Use cmd /c for import as well to handle the file stream correctly
# Added --default-character-set=utf8mb4 to mysql import
cmd /c "type $DUMP_FILE | docker exec -i $LOCAL_DB_CONTAINER sh -lc \"export MYSQL_PWD='$localAuthPassword'; mysql --default-character-set=utf8mb4 -u '$localAuthUser' '$LOCAL_DB_NAME'\""

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error importing database." -ForegroundColor Red
    exit 1
}

Write-Host "3. Cleaning up..." -ForegroundColor Cyan
Remove-Item $DUMP_FILE

Write-Host "Database sync completed successfully!" -ForegroundColor Green
