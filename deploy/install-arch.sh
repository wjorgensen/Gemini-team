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
    run_command "sudo npm install -g @google/gemini-cli" "Installing @google/gemini-cli package globally"
    print_success "Gemini CLI installed successfully"
else
    echo "Gemini CLI already installed"
    # Check if it's the right package
    if ! npm list -g @google/gemini-cli &> /dev/null; then
        print_warning "Found 'gemini' command but not the correct package. Installing @google/gemini-cli..."
        print_separator "Updating Gemini CLI"
        run_command "sudo npm install -g @google/gemini-cli" "Installing correct @google/gemini-cli package"
        print_success "Correct Gemini package installed"
    fi
fi

print_step "Configuring Gemini CLI..."

# Store the repository directory (current directory) early for CLI setup
REPO_DIR="$(pwd)"

# Ensure we have the project files in the repository
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Make sure you're running this from the cloned repository."
    exit 1
fi

print_separator "Setting Up Gemini CLI Authentication"
echo -e "  ${YELLOW}🔑${NC} Setting up Gemini CLI for first-time use..."
echo
echo -e "  ${BLUE}This process will:${NC}"
echo -e "    1. Create a .env file with your API key"
echo -e "    2. Run the interactive CLI setup for theme selection"
echo -e "    3. Continue with service installation"
echo
echo -e "  ${GREEN}Get your API key from: ${BLUE}https://aistudio.google.com/app/apikey${NC}"
echo
echo -e "  ${YELLOW}⚠️  You'll need your API key to continue!${NC}"
echo

# Get API key from user
echo -e "${BLUE}Please enter your Gemini API key:${NC}"
echo "(Get one from: https://aistudio.google.com/app/apikey)"
read -r -s api_key

if [ -z "$api_key" ]; then
    print_error "No API key provided. Cannot continue installation."
    echo "Get your API key from: https://aistudio.google.com/app/apikey"
    echo "Then re-run the installation script."
    exit 1
fi

echo
print_step "Creating .env file with API key..."

# Create .env file in the repository directory
ENV_FILE_LOCAL="$REPO_DIR/.env"
echo "GEMINI_API_KEY=$api_key" > "$ENV_FILE_LOCAL"
echo -e "  ${GREEN}✓${NC} Created .env file with API key"

# Store for later use in service environment file
TEMP_API_KEY="$api_key"

echo
print_step "Running interactive CLI setup..."

echo -e "  ${BLUE}📝 Interactive Setup Instructions:${NC}"
echo -e "    1. The Gemini CLI will start with theme and authentication options"
echo -e "    2. Choose your preferred theme (dark/light)"
echo -e "    3. Select 'Gemini API Key (AI Studio)' (should be pre-selected)"
echo -e "    4. The API key should be automatically detected from .env"
echo -e "    5. ${YELLOW}When setup is complete, press Ctrl+C twice to exit${NC}"
echo -e "    6. Installation will continue automatically"
echo
echo -e "  ${YELLOW}⚠️  IMPORTANT: Press Ctrl+C twice when you see the Gemini prompt to continue installation${NC}"
echo
echo -e "${BLUE}Press Enter to start the interactive CLI setup...${NC}"
read -r

# Change to repo directory so CLI can find .env file
cd "$REPO_DIR"

# Run interactive CLI setup
echo -e "  ${YELLOW}▶${NC} Starting Gemini CLI interactive setup..."
echo -e "  ${BLUE}Remember: Press Ctrl+C twice when setup is complete!${NC}"
echo

# Give user a moment to read instructions
sleep 3

# Run gemini CLI - user will interact with it
if ! gemini; then
    # This is expected when user presses Ctrl+C
    echo
    echo -e "  ${GREEN}✓${NC} CLI setup completed (exited by user)"
else
    # Unlikely to reach here but handle gracefully
    echo -e "  ${GREEN}✓${NC} CLI setup completed"
fi

echo
print_step "Verifying CLI configuration..."

# Test the CLI works
cd "$REPO_DIR"
if gemini --version >/dev/null 2>&1; then
    print_success "✅ Gemini CLI is working correctly!"
else
    print_warning "⚠️  CLI test failed, but continuing with installation"
    echo "You can reconfigure later if needed"
fi

# Return to app directory for rest of installation
cd "$APP_DIR"

echo

print_step "Installing project dependencies..."

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

# Install system dependencies manually for Arch Linux
# Playwright's --with-deps only works on Debian/Ubuntu, so we handle Arch packages manually
echo -e "  ${YELLOW}▶${NC} Installing system dependencies for Playwright browsers..."
# Complete list of Arch packages needed for Chromium, Firefox, and WebKit browsers
# Based on community testing and Microsoft's Playwright requirements for Linux
PLAYWRIGHT_DEPS=("nss" "nspr" "at-spi2-core" "libcups" "libdrm" "dbus" "libx11" "libxcomposite" "libxdamage" "libxext" "libxfixes" "libxrandr" "libxcb" "libxkbcommon" "mesa" "pango" "cairo" "alsa-lib" "fontconfig" "freetype2" "libxss" "libevent" "xorg-server-xvfb")
MISSING_DEPS=()

for dep in "${PLAYWRIGHT_DEPS[@]}"; do
    if ! pacman -Qi "$dep" &> /dev/null; then
        MISSING_DEPS+=("$dep")
    fi
done

if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    echo -e "  ${BLUE}📦${NC} Installing missing Playwright dependencies: ${MISSING_DEPS[*]}"
    run_command "sudo pacman -S --needed --noconfirm ${MISSING_DEPS[*]}" "Installing Playwright system dependencies"
else
    echo -e "  ${GREEN}✓${NC} All Playwright system dependencies already installed"
fi

# Install browsers without system dependencies (since we handled them above)
# Note: We do NOT use --with-deps because that tries to use apt-get on Arch Linux
run_command "npx playwright install" "Installing Playwright browsers (Chromium, Firefox, WebKit)"

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
    
    # Use the API key if provided during setup, otherwise use placeholder
    API_KEY_VALUE="${TEMP_API_KEY:-your_gemini_api_key_here}"
    
    sudo tee "$ENV_FILE" > /dev/null << EOL
# Gemini Coding Factory Environment Configuration
# Edit this file with your actual values

# Required: Gemini API Key from Google AI Studio or Vertex AI
GEMINI_API_KEY=$API_KEY_VALUE

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
    
    if [ -n "${TEMP_API_KEY:-}" ]; then
        print_success "✅ Gemini API key has been added to the service configuration"
    else
        echo
        print_warning "⚠️  IMPORTANT: Edit $ENV_FILE with your actual API keys!"
    fi
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

# Check if Gemini CLI was configured
if [ -n "${TEMP_API_KEY:-}" ]; then
    echo -e "✅ Gemini CLI configured during installation"
else
    echo -e "⚠️  ${YELLOW}Gemini CLI setup incomplete${NC}"
    echo "   Run the installation script again to complete CLI setup"
    echo
fi

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
echo "• Gemini CLI should be configured during installation"
echo "• Add webhook URLs to your GitHub repositories"
echo "• Ensure port 3000 is accessible from GitHub"
echo "• Monitor logs for any issues"
echo "• Log out and back in if Docker group was added"
echo
echo -e "${GREEN}🎉 Your Gemini Coding Factory is ready!${NC}"
echo -e "${BLUE}💡 Usage: Comment '@gemini [your request]' on any GitHub PR${NC}" 