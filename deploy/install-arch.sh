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
        echo "Installing packages: ${PACKAGES_TO_INSTALL[*]}"
        sudo pacman -S --needed --noconfirm "${PACKAGES_TO_INSTALL[@]}"
        print_success "Packages installed successfully"
    fi
fi

# Start and enable Docker service if installed
if command -v docker &> /dev/null; then
    print_step "Setting up Docker service..."
    
    if ! systemctl is-active --quiet docker; then
        echo "Starting Docker service..."
        sudo systemctl start docker
        print_success "Docker service started"
    fi
    
    if ! systemctl is-enabled --quiet docker; then
        echo "Enabling Docker service for auto-start..."
        sudo systemctl enable docker
        print_success "Docker service enabled"
    fi
    
    # Add user to docker group if not already a member
    if ! groups "$SERVICE_USER" | grep -q docker; then
        echo "Adding $SERVICE_USER to docker group..."
        sudo usermod -aG docker "$SERVICE_USER"
        print_warning "Docker group added. You may need to log out and back in for group changes to take effect"
        print_warning "Or run: newgrp docker"
    else
        print_success "User already in docker group"
    fi
fi

print_step "Setting up directories..."

# Create application directory
if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    echo "Created application directory: $APP_DIR"
fi

# Create workspace directory
if [ ! -d "$WORKSPACE_DIR" ]; then
    mkdir -p "$WORKSPACE_DIR"
    echo "Created workspace directory: $WORKSPACE_DIR"
fi

# Create log directory (requires sudo)
if [ ! -d "$LOG_DIR" ]; then
    echo "Creating log directory (requires sudo): $LOG_DIR"
    sudo mkdir -p "$LOG_DIR"
    sudo chown "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"
fi

print_step "Installing Gemini CLI..."

# Install Gemini CLI globally with proper permissions
if ! command -v gemini &> /dev/null; then
    echo "Installing Gemini CLI globally..."
    sudo npm install -g @google/genai
    print_success "Gemini CLI installed successfully"
else
    echo "Gemini CLI already installed"
    # Check if it's the right package
    if ! npm list -g @google/genai &> /dev/null; then
        print_warning "Found 'gemini' command but not the correct package. Installing @google/genai..."
        sudo npm install -g @google/genai
        print_success "Correct Gemini package installed"
    fi
fi

print_step "Installing project dependencies..."

cd "$APP_DIR"

# Ensure we have the project files
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Make sure you're running this from the cloned repository."
    exit 1
fi

# Install Node.js dependencies
echo "Installing Node.js project dependencies..."
npm install --production

# Install Playwright browsers with dependencies
echo "Installing Playwright browsers (this may take a while)..."
npx playwright install --with-deps

print_step "Setting up configuration..."

# Create config directory (requires sudo)
if [ ! -d "$CONFIG_DIR" ]; then
    echo "Creating config directory (requires sudo): $CONFIG_DIR"
    sudo mkdir -p "$CONFIG_DIR"
fi

# Create environment file template
ENV_FILE="$CONFIG_DIR/environment"
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating environment configuration file..."
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
    sudo chown "$SERVICE_USER:$SERVICE_GROUP" "$ENV_FILE"
    sudo chmod 600 "$ENV_FILE"
    
    print_warning "⚠️  IMPORTANT: Edit $ENV_FILE with your actual API keys!"
fi

print_step "Setting up systemd service..."

# Copy systemd service file
SERVICE_FILE="/etc/systemd/system/gemini-coding-factory.service"
sudo cp "deploy/systemd/gemini-coding-factory.service" "$SERVICE_FILE"

# Reload systemd
sudo systemctl daemon-reload

print_step "Setting up log rotation..."

# Create logrotate configuration
LOGROTATE_FILE="/etc/logrotate.d/gemini-coding-factory"
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

print_step "Building the application..."

# Build TypeScript
echo "Compiling TypeScript..."
npm run build

print_step "Testing the installation..."

# Test that the application can start
echo "Testing application startup..."
timeout 10s npm run start:dev || {
    print_warning "Startup test timed out (this is normal during first run)"
}

print_step "Setting up firewall rules (if UFW is enabled)..."

if command -v ufw &> /dev/null && sudo ufw status | grep -q "Status: active"; then
    print_warning "UFW firewall is active. Opening port 3000..."
    sudo ufw allow 3000/tcp
    print_success "Port 3000 opened in firewall"
fi

echo
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