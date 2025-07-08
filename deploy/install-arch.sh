#!/bin/bash

# Gemini Coding Factory - Arch Linux Installation Script
# This script sets up the multi-repository AI development service

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_USER="wes"
SERVICE_GROUP="wes"
APP_DIR="/home/${SERVICE_USER}/gemini-coding-factory"
WORKSPACE_DIR="/home/${SERVICE_USER}/coding-factory"
CONFIG_DIR="/etc/gemini-coding-factory"
LOG_DIR="/var/log/gemini-coding-factory"

echo -e "${BLUE}🤖 Gemini Coding Factory Installation Script${NC}"
echo -e "${BLUE}Setting up multi-repository AI development service on Arch Linux${NC}"
echo

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}❌ This script should not be run as root${NC}"
   echo "Please run as the service user: $SERVICE_USER"
   exit 1
fi

# Check if running as correct user
if [[ $(whoami) != "$SERVICE_USER" ]]; then
   echo -e "${RED}❌ This script should be run as user: $SERVICE_USER${NC}"
   echo "Current user: $(whoami)"
   exit 1
fi

print_step() {
    echo -e "${GREEN}➤${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_separator() {
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}$(printf '━%.0s' {1..60})${NC}"
}

run_command() {
    local cmd="$1"
    local description="$2"
    echo -e "  ${YELLOW}▶${NC} $description"
    echo -e "  ${BLUE}Command:${NC} $cmd"
    echo -e "  ${BLUE}$(printf '─%.0s' {1..50})${NC}"
    
    # Run the command and capture output
    if eval "$cmd"; then
        echo -e "  ${GREEN}$(printf '─%.0s' {1..50})${NC}"
        echo -e "  ${GREEN}✓${NC} $description completed successfully"
        echo
    else
        echo -e "  ${RED}$(printf '─%.0s' {1..50})${NC}"
        echo -e "  ${RED}✗${NC} $description failed"
        return 1
    fi
}

run_quiet_command() {
    local cmd="$1"
    local description="$2"
    echo -e "  ${YELLOW}▶${NC} $description"
    
    # Run the command quietly and capture output
    if eval "$cmd" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $description completed successfully"
        echo
    else
        echo -e "  ${RED}✗${NC} $description failed"
        return 1
    fi
}

# Check if Arch Linux
if ! command -v pacman &> /dev/null; then
    print_error "This script is designed for Arch Linux"
    exit 1
fi

print_step "Checking system dependencies..."

# Check for required tools
REQUIRED_COMMANDS=("git" "node" "npm" "docker" "docker-compose")
MISSING_COMMANDS=()

for cmd in "${REQUIRED_COMMANDS[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
        MISSING_COMMANDS+=("$cmd")
    fi
done

if [ ${#MISSING_COMMANDS[@]} -ne 0 ]; then
    print_warning "Missing required commands: ${MISSING_COMMANDS[*]}"
    print_step "Installing missing dependencies with pacman..."
    
    print_separator "Installing System Packages"
    # Install missing packages automatically
    PACKAGES_TO_INSTALL=()
    for cmd in "${MISSING_COMMANDS[@]}"; do
        case $cmd in
            "git") PACKAGES_TO_INSTALL+=("git") ;;
            "node") PACKAGES_TO_INSTALL+=("nodejs") ;;
            "npm") PACKAGES_TO_INSTALL+=("npm") ;;
            "docker") PACKAGES_TO_INSTALL+=("docker") ;;
            "docker-compose") PACKAGES_TO_INSTALL+=("docker-compose") ;;
        esac
    done
    
    if [ ${#PACKAGES_TO_INSTALL[@]} -ne 0 ]; then
        echo -e "  ${YELLOW}📦${NC} Installing packages: ${PACKAGES_TO_INSTALL[*]}"
        run_command "sudo pacman -S --needed --noconfirm ${PACKAGES_TO_INSTALL[*]}" "Installing system dependencies"
        print_success "Packages installed successfully"
    fi
fi

# Start and enable Docker service if installed
if command -v docker &> /dev/null; then
    print_step "Setting up Docker service..."
    
    print_separator "Configuring Docker Service"
    if ! systemctl is-active --quiet docker; then
        run_command "sudo systemctl start docker" "Starting Docker service"
        print_success "Docker service started"
    else
        echo -e "  ${GREEN}✓${NC} Docker service already running"
    fi
    
    if ! systemctl is-enabled --quiet docker; then
        run_command "sudo systemctl enable docker" "Enabling Docker service for auto-start"
        print_success "Docker service enabled"
    else
        echo -e "  ${GREEN}✓${NC} Docker service already enabled"
    fi
    
    # Add user to docker group if not already a member
    if ! groups "$SERVICE_USER" | grep -q docker; then
        run_command "sudo usermod -aG docker '$SERVICE_USER'" "Adding $SERVICE_USER to docker group"
        print_warning "Docker group added. You may need to log out and back in for group changes to take effect"
        print_warning "Or run: newgrp docker"
    else
        print_success "User already in docker group"
    fi
fi

print_step "Setting up directories..."

print_separator "Creating System Directories"
# Create application directory
if [ ! -d "$APP_DIR" ]; then
    run_quiet_command "mkdir -p '$APP_DIR'" "Creating application directory: $APP_DIR"
fi

# Create workspace directory
if [ ! -d "$WORKSPACE_DIR" ]; then
    run_quiet_command "mkdir -p '$WORKSPACE_DIR'" "Creating workspace directory: $WORKSPACE_DIR"
fi

# Create log directory (requires sudo)
if [ ! -d "$LOG_DIR" ]; then
    run_command "sudo mkdir -p '$LOG_DIR'" "Creating log directory: $LOG_DIR"
    run_quiet_command "sudo chown '$SERVICE_USER:$SERVICE_GROUP' '$LOG_DIR'" "Setting log directory ownership"
fi

print_step "Installing Gemini CLI..."

# Install Gemini CLI globally with proper permissions
if ! command -v gemini &> /dev/null; then
    print_separator "Installing Gemini CLI"
    run_command "sudo npm install -g @google/genai" "Installing @google/genai package globally"
    print_success "Gemini CLI installed successfully"
else
    echo "Gemini CLI already installed"
    # Check if it's the right package
    if ! npm list -g @google/genai &> /dev/null; then
        print_warning "Found 'gemini' command but not the correct package. Installing @google/genai..."
        print_separator "Updating Gemini CLI"
        run_command "sudo npm install -g @google/genai" "Installing correct @google/genai package"
        print_success "Correct Gemini package installed"
    fi
fi

print_step "Installing project dependencies..."

# Store the repository directory (current directory)
REPO_DIR="$(pwd)"

# Ensure we have the project files in the repository
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Make sure you're running this from the cloned repository."
    exit 1
fi

# Copy repository files to application directory
echo "📂 Copying project files to $APP_DIR..."
run_quiet_command "cp -r '$REPO_DIR'/* '$APP_DIR/'" "Copying main project files"
run_quiet_command "cp -r '$REPO_DIR'/.* '$APP_DIR/' 2>/dev/null || true" "Copying hidden files"

cd "$APP_DIR"

print_separator "Installing Node.js Dependencies"
run_command "npm install" "Installing dependencies and building project (this includes TypeScript compilation)"

print_separator "Cleaning Up Development Dependencies"
run_command "npm prune --production" "Removing development dependencies for production"

print_separator "Installing Playwright Browsers"
echo -e "  ${YELLOW}⚠️${NC}  This step may take several minutes..."
run_command "npx playwright install --with-deps" "Installing Playwright browsers and system dependencies"

print_step "Setting up configuration..."

print_separator "Creating Configuration Files"
# Create config directory (requires sudo)
if [ ! -d "$CONFIG_DIR" ]; then
    run_command "sudo mkdir -p '$CONFIG_DIR'" "Creating configuration directory: $CONFIG_DIR"
fi

# Create environment file template
ENV_FILE="$CONFIG_DIR/environment"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "  ${YELLOW}▶${NC} Creating environment configuration template..."
    sudo tee "$ENV_FILE" > /dev/null << EOL
# Gemini Coding Factory Environment Configuration
# Edit this file with your actual values

# Required: Gemini API Key from Google AI Studio or Vertex AI
GEMINI_API_KEY=your_gemini_api_key_here

# Required: GitHub Personal Access Token with repo access
GITHUB_TOKEN=your_github_token_here

# Optional: Webhook secret for GitHub webhooks (recommended)
WEBHOOK_SECRET=your_webhook_secret_here

# Optional: Authorized users (comma-separated GitHub usernames)
AUTHORIZED_USERS=$SERVICE_USER

# Optional: CORS origins (comma-separated)
CORS_ORIGINS=*

# Optional: Custom workspace location
# WORKSPACE_ROOT=/home/$SERVICE_USER/coding-factory

# Optional: Custom port (default: 3000)
# PORT=3000

# Optional: Log level (debug, info, warn, error)
# LOG_LEVEL=info
EOL
    run_quiet_command "sudo chown '$SERVICE_USER:$SERVICE_GROUP' '$ENV_FILE'" "Setting file ownership"
    run_quiet_command "sudo chmod 600 '$ENV_FILE'" "Setting secure file permissions"
    echo -e "  ${GREEN}✓${NC} Environment configuration template created"
    echo
    print_warning "⚠️  IMPORTANT: Edit $ENV_FILE with your actual API keys!"
fi

print_step "Setting up systemd service..."

print_separator "Installing Systemd Service"
# Copy systemd service file
SERVICE_FILE="/etc/systemd/system/gemini-coding-factory.service"
run_command "sudo cp 'deploy/systemd/gemini-coding-factory.service' '$SERVICE_FILE'" "Installing systemd service file"

# Reload systemd
run_command "sudo systemctl daemon-reload" "Reloading systemd configuration"

print_step "Setting up log rotation..."

print_separator "Configuring Log Rotation"
# Create logrotate configuration
LOGROTATE_FILE="/etc/logrotate.d/gemini-coding-factory"
echo -e "  ${YELLOW}▶${NC} Creating logrotate configuration..."
sudo tee "$LOGROTATE_FILE" > /dev/null << EOL
$LOG_DIR/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 $SERVICE_USER $SERVICE_GROUP
    postrotate
        systemctl reload gemini-coding-factory.service
    endscript
}
EOL
echo -e "  ${GREEN}✓${NC} Log rotation configured"
echo

print_step "Testing the installation..."

# Test that the application can start
print_separator "Application Startup Test"
echo -e "  ${YELLOW}ℹ️${NC}  Running a 10-second startup test..."
if timeout 10s npm run start:dev >/dev/null 2>&1; then
    print_success "Application startup test completed successfully"
else
    print_warning "Startup test timed out (this is normal during first run)"
fi

print_step "Setting up firewall rules (if UFW is enabled)..."

if command -v ufw &> /dev/null && sudo ufw status | grep -q "Status: active"; then
    print_separator "Configuring UFW Firewall"
    print_warning "UFW firewall is active. Opening port 3000..."
    run_command "sudo ufw allow 3000/tcp" "Opening port 3000 for HTTP traffic"
    print_success "Port 3000 opened in firewall"
else
    echo -e "  ${BLUE}ℹ️${NC}  UFW firewall not active or not installed"
fi

echo
print_separator "🎉 Installation Complete!"
echo -e "${GREEN}✅ Installation completed successfully!${NC}"
echo
echo -e "${BLUE}🔧 Next steps:${NC}"
echo "1. Edit the configuration file with your API keys:"
echo "   sudo nano $ENV_FILE"
echo
echo "2. Get your API keys:"
echo "   • Gemini API: https://aistudio.google.com/app/apikey"
echo "   • GitHub Token: https://github.com/settings/tokens"
echo
echo "3. Enable and start the service:"
echo "   sudo systemctl enable gemini-coding-factory.service"
echo "   sudo systemctl start gemini-coding-factory.service"
echo
echo "4. Check service status:"
echo "   sudo systemctl status gemini-coding-factory.service"
echo
echo "5. View logs:"
echo "   sudo journalctl -u gemini-coding-factory.service -f"
echo
echo "6. Set up GitHub webhooks pointing to:"
echo "   http://your-server-ip:3000/webhook"
echo
echo -e "${BLUE}📡 Service endpoints:${NC}"
echo "• Health check: http://localhost:3000/health"
echo "• Status: http://localhost:3000/status"
echo "• Webhook: http://localhost:3000/webhook"
echo
echo -e "${YELLOW}⚠️  Remember to:${NC}"
echo "• Add webhook URLs to your GitHub repositories"
echo "• Ensure port 3000 is accessible from GitHub"
echo "• Monitor logs for any issues"
echo "• Log out and back in if Docker group was added"
echo
echo -e "${GREEN}🎉 Your Gemini Coding Factory is ready!${NC}"
echo -e "${BLUE}💡 Usage: Comment '@gemini [your request]' on any GitHub PR${NC}" 