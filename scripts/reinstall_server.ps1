# Server Configuration
$SERVER_IP = "149.28.135.147"
$REMOTE_USER = "root"
$REPO_URL = "https://github.com/mamam1281/ch25.git"
$BRANCH = "fix/admin-vault-programs-prefix"
$APP_DIR = "/root/ch25"

# DB Password (Unified to 2026)
$DB_ROOT_PW = "2026"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " STARTING FULL SERVER REINSTALLATION (PW: 2026)" -ForegroundColor Cyan
Write-Host " Target: $SERVER_IP ($BRANCH)" -ForegroundColor Cyan
Write-Host "========================================="

# 1. SSH & Docker Install Check
Write-Host "`n[1/5] Checking System Prerequisites..." -ForegroundColor Yellow
# Using single line with semicolons to avoid CRLF issues over SSH
$INSTALL_CMD = "apt-get update -qq; apt-get install -y git curl >/dev/null; if ! command -v docker >/dev/null; then echo 'Installing Docker...'; curl -fsSL https://get.docker.com | sh >/dev/null; fi; if ! command -v docker-compose >/dev/null; then if ! docker compose version >/dev/null 2>&1; then echo 'Installing Docker Compose...'; apt-get install -y docker-compose-plugin >/dev/null; fi; fi"
ssh $REMOTE_USER@$SERVER_IP $INSTALL_CMD
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to check/install prerequisites."; exit 1 }


# 2. Setup Project Directory
Write-Host "`n[2/5] Setting up Project Directory..." -ForegroundColor Yellow
$SETUP_CMD = "if [ -d ""$APP_DIR"" ]; then echo 'Removing existing directory...'; rm -rf $APP_DIR; fi; echo 'Cloning repository...'; git clone -b $BRANCH $REPO_URL $APP_DIR"
ssh $REMOTE_USER@$SERVER_IP $SETUP_CMD
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to clone repository."; exit 1 }


# 3. Configure Environment (.env)
Write-Host "`n[3/5] Configuring Environment (.env)..." -ForegroundColor Yellow
# We create a simple .env file on the server.
$ENV_CONTENT = "MYSQL_ROOT_PASSWORD=2026`nMYSQL_DATABASE=xmas_event`nMYSQL_USER=xmasuser`nMYSQL_PASSWORD=2026`nDOMAIN=xmas-event.com`nENVIRONMENT=production`nSECRET_KEY=2026_secret_key`nADMIN_PASSWORD=2026"
# Use Base64 to transfer content safely (Encode in PowerShell, Decode in Linux)
$ENV_BYTES = [System.Text.Encoding]::UTF8.GetBytes($ENV_CONTENT)
$ENV_B64 = [Convert]::ToBase64String($ENV_BYTES)

$ENV_CMD = "echo '$ENV_B64' | base64 -d > $APP_DIR/.env; echo '.env created with password 2026.'"
ssh $REMOTE_USER@$SERVER_IP $ENV_CMD


# 4. Build and Start Docker Containers
Write-Host "`n[4/5] Building and Starting Docker Containers..." -ForegroundColor Yellow
$START_CMD = "cd $APP_DIR; echo 'Building images...'; docker compose up -d --build --force-recreate"
ssh $REMOTE_USER@$SERVER_IP $START_CMD
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to start Docker containers."; exit 1 }


# 5. Final Status Check
Write-Host "`n[5/5] Checking Server Status..." -ForegroundColor Yellow
$CHECK_CMD = "cd $APP_DIR; docker compose ps"
ssh $REMOTE_USER@$SERVER_IP $CHECK_CMD

Write-Host "`n=========================================" -ForegroundColor Green
Write-Host " SERVER REINSTALLATION COMPLETED!" -ForegroundColor Green
Write-Host "========================================="
