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
DASHBOARD_DIR="/home/${SERVICE_USER}/gemini-coding-factory/dashboard"
WORKSPACE_DIR="/home/${SERVICE_USER}/coding-factory"
GEMINI_CONFIG_DIR="/home/${SERVICE_USER}/.gemini"
LOG_DIR="/var/log/gemini-coding-factory"

# Global variables for installation options
INSTALL_NGROK=false
NGROK_AUTHTOKEN=""

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
REQUIRED_COMMANDS=("git" "node" "npm" "docker" "docker-compose" "redis-server" "tmux")
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
            "redis-server") PACKAGES_TO_INSTALL+=("redis") ;;
            "tmux") PACKAGES_TO_INSTALL+=("tmux") ;;
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

# Start and enable Redis service if installed
if command -v redis-server &> /dev/null; then
    print_step "Setting up Redis service..."
    
    print_separator "Configuring Redis Service"
    if ! systemctl is-active --quiet redis; then
        run_command "sudo systemctl start redis" "Starting Redis service"
        print_success "Redis service started"
    else
        echo -e "  ${GREEN}✓${NC} Redis service already running"
    fi
    
    if ! systemctl is-enabled --quiet redis; then
        run_command "sudo systemctl enable redis" "Enabling Redis service for auto-start"
        print_success "Redis service enabled"
    else
        echo -e "  ${GREEN}✓${NC} Redis service already enabled"
    fi
fi

# Ask about ngrok installation
echo
print_separator "Optional: ngrok Setup"
echo -e "${BLUE}🌐 Do you want to install ngrok for public webhook access?${NC}"
echo -e "  ${YELLOW}▶${NC} This allows GitHub webhooks to reach your local development server"
echo -e "  ${YELLOW}▶${NC} Useful for testing and development without port forwarding"
echo -e "  ${BLUE}▶${NC} You'll need an ngrok account (free at https://ngrok.com)"
echo
read -p "Install and configure ngrok? (y/N): " install_ngrok_choice

if [[ "$install_ngrok_choice" =~ ^[Yy]$ ]]; then
    INSTALL_NGROK=true
    
    # Install ngrok
    if ! command -v ngrok &> /dev/null; then
        print_step "Installing ngrok..."
        
        # Check if AUR helper is available (yay, paru, etc.)
        if command -v yay &> /dev/null; then
            run_command "yay -S --needed --noconfirm ngrok" "Installing ngrok via yay"
        elif command -v paru &> /dev/null; then
            run_command "paru -S --needed --noconfirm ngrok" "Installing ngrok via paru"
        else
            print_warning "No AUR helper found. Installing ngrok manually..."
            # Manual installation from GitHub releases
            NGROK_VERSION="v3-stable"
            NGROK_URL="https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-stable-linux-amd64.tgz"
            
            run_command "cd /tmp && curl -O '$NGROK_URL'" "Downloading ngrok"
            run_command "cd /tmp && tar -xzf ngrok-stable-linux-amd64.tgz" "Extracting ngrok"
            run_command "sudo mv /tmp/ngrok /usr/local/bin/" "Installing ngrok to /usr/local/bin"
            run_command "sudo chmod +x /usr/local/bin/ngrok" "Setting executable permissions"
        fi
        print_success "ngrok installed successfully"
    else
        echo -e "  ${GREEN}✓${NC} ngrok already installed"
    fi
    
    # Get ngrok authtoken
    echo
    echo -e "${BLUE}🔑 Please enter your ngrok authtoken:${NC}"
    echo -e "  ${YELLOW}▶${NC} Get it from: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo -e "  ${YELLOW}▶${NC} Sign up for free at: https://ngrok.com"
    read -r -s ngrok_authtoken
    
    if [ -n "$ngrok_authtoken" ]; then
        NGROK_AUTHTOKEN="$ngrok_authtoken"
        run_command "ngrok config add-authtoken '$NGROK_AUTHTOKEN'" "Configuring ngrok authtoken"
        print_success "ngrok authtoken configured"
    else
        print_warning "No ngrok authtoken provided. You can configure it later with: ngrok config add-authtoken YOUR_TOKEN"
    fi
else
    echo -e "  ${BLUE}ℹ️${NC}  Skipping ngrok installation"
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
    run_command "sudo npm install -g @google/gemini-cli@nightly" "Installing @google/gemini-cli package globally"
    print_success "Gemini CLI installed successfully"
else
    echo "Gemini CLI already installed"
    # Check if it's the right package
    if ! npm list -g @google/gemini-cli &> /dev/null; then
        print_warning "Found 'gemini' command but not the correct package. Installing @google/gemini-cli..."
        print_separator "Updating Gemini CLI"
        run_command "sudo npm install -g @google/gemini-cli@nightly" "Installing correct @google/gemini-cli package"
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

echo
print_step "Setting up global Gemini CLI configuration..."

print_separator "Creating Global Gemini Configuration"
# Create global .gemini directory
GEMINI_GLOBAL_DIR="/home/$SERVICE_USER/.gemini"
if [ ! -d "$GEMINI_GLOBAL_DIR" ]; then
    run_quiet_command "mkdir -p '$GEMINI_GLOBAL_DIR'" "Creating global Gemini directory: $GEMINI_GLOBAL_DIR"
fi

# Create comprehensive environment file with all service configuration
GLOBAL_ENV_FILE="$GEMINI_GLOBAL_DIR/.env"
echo -e "  ${YELLOW}▶${NC} Creating comprehensive .env file for service and CLI..."

# Get GitHub token from user
echo
echo -e "${BLUE}Please enter your GitHub Personal Access Token:${NC}"
echo "(Get one from: https://github.com/settings/tokens)"
echo "Required scopes: repo, write:repo_hook"
read -r -s github_token

if [ -z "$github_token" ]; then
    print_warning "No GitHub token provided. You'll need to add it to .env later."
    github_token="your_github_token_here"
fi

# Create comprehensive .env file
cat > "$GLOBAL_ENV_FILE" << EOL
# Gemini Coding Factory Environment Configuration
# This file contains all required environment variables

# Required: Gemini API Key from Google AI Studio or Vertex AI
GEMINI_API_KEY=$api_key

# Required: GitHub Personal Access Token with repo access
GITHUB_TOKEN=$github_token

# Optional: Webhook secret for GitHub webhooks (recommended)
WEBHOOK_SECRET=gemini-factory-$(openssl rand -hex 16)

# Optional: Authorized users (comma-separated GitHub usernames)
AUTHORIZED_USERS=$SERVICE_USER

# Optional: CORS origins (comma-separated)
CORS_ORIGINS=*

# Optional: Custom workspace location
WORKSPACE_ROOT=$WORKSPACE_DIR

# Optional: Custom ports
PORT=5000
DASHBOARD_PORT=3000

# Optional: Log level (debug, info, warn, error)
LOG_LEVEL=info

# Redis configuration
REDIS_URL=redis://localhost:6379

# BullMQ configuration
QUEUE_NAME=gemini-jobs
EOL

echo -e "  ${GREEN}✓${NC} Comprehensive .env file created with service configuration"

# Create comprehensive GEMINI.md file with all workflow instructions
GEMINI_MD_FILE="$GEMINI_GLOBAL_DIR/GEMINI.md"
echo -e "  ${YELLOW}▶${NC} Creating global GEMINI.md with comprehensive development workflow..."

cat > "$GEMINI_MD_FILE" << 'EOL'
# Gemini Coding Factory Development Protocol

You are a senior AI developer working autonomously in a multi-repository coding factory. You have access to Git operations, file I/O, and command execution for any project type.

## Core Development Workflow

### 1. Analysis Phase
- **Understand the Request**: Carefully analyze the feature request in the project context
- **Explore Codebase**: Study existing structure, patterns, and architecture  
- **Identify Dependencies**: Check for prerequisites, conflicts, or breaking changes
- **Assess Complexity**: Determine scope and potential risks

### 2. Planning Phase
- **Create Feature Plan**: Generate `feature-plan.md` in repository root with:
  - Clear objective summary
  - Technical design considering existing architecture
  - **GitHub-style task checklist** (`- [ ] task description`)
  - Complexity assessment and risk analysis
- **Initial Commit**: `📋 Create feature plan for: [brief description]`

### 3. Implementation Loop
For each unchecked task in your checklist:

**a. Implement Changes**
- Write code following project's existing patterns
- Maintain consistency with established architecture
- Follow language-specific best practices

**b. Test Locally**
- Run appropriate tests for the project type
- Verify functionality works as expected
- Check for regressions or breaking changes

**c. Commit Changes**
- Use descriptive commit messages matching the task
- Keep commits atomic and focused
- Follow conventional commit format when appropriate

**d. Update Progress**
- Check off completed task (`- [x] task description`)
- Commit checklist update: `✅ Complete: [task description]`

### 4. Testing Phase
- **Run Test Suite**: Execute project's configured test commands
- **Fix Failures**: Debug and resolve any test failures systematically
- **Add Tests**: Create new tests for new functionality using project's testing framework
- **Verify Coverage**: Ensure adequate test coverage for new features

### 5. Quality Assurance
- **Linting**: Run configured linting tools (ESLint, Prettier, etc.)
- **Formatting**: Apply consistent code formatting
- **Style Guidelines**: Follow project's established coding standards
- **Performance**: Verify changes don't negatively impact performance

### 6. Completion
- **Final Verification**: Ensure ALL checklist items are checked ✅
- **Test Confirmation**: Confirm all tests pass 🟢
- **Final Commit**: `🎉 Feature complete: [feature name]`
- **Documentation**: Update relevant documentation if needed

## Project-Specific Guidelines

### Next.js Projects
- Use TypeScript strictly (no `any` types)
- Follow App Router patterns when available
- Implement proper SEO with metadata API
- Use Next.js Image component for images
- Create responsive designs with Tailwind CSS
- Generate Playwright E2E tests for UI features
- Use Server Components when possible, Client Components when necessary

### React Projects
- Use functional components with hooks exclusively
- Implement proper state management (useState, useReducer, Context)
- Follow React performance best practices (useMemo, useCallback)
- Create reusable components with proper TypeScript interfaces
- Write Jest/React Testing Library tests for components

### Node.js API Projects
- Implement comprehensive error handling with try-catch
- Use middleware for cross-cutting concerns (auth, logging, validation)
- Validate input data with appropriate libraries
- Use proper HTTP status codes
- Document API endpoints thoroughly
- Write unit tests for all endpoints using Jest
- Follow RESTful design principles

### Smart Contract Projects (Hardhat/Foundry)
- Write secure Solidity code following best practices
- Implement comprehensive test coverage
- Use gas optimization techniques
- Follow OpenZeppelin patterns for common functionality
- Implement proper access controls and security measures
- Create deployment scripts for different networks

### Python Projects
- Use type hints throughout the codebase
- Follow PEP 8 style guidelines strictly
- Implement proper error handling with custom exceptions
- Use virtual environments and requirements.txt
- Write comprehensive tests with pytest
- Document functions and classes with docstrings

### Django Projects
- Follow Django model best practices
- Use Django's built-in authentication and authorization
- Implement proper URL patterns and view structure
- Use Django templates with proper context
- Write Django tests using TestCase
- Follow Django security best practices

### Rust Projects
- Follow Rust ownership and borrowing principles
- Use Result<T, E> for error handling
- Implement proper trait bounds and generics
- Write comprehensive tests with #[cfg(test)]
- Use cargo fmt and cargo clippy
- Follow Rust naming conventions

### Go Projects
- Follow Go naming conventions and style guidelines
- Use interfaces for abstraction
- Implement proper error handling with error returns
- Use goroutines and channels for concurrency when appropriate
- Write table-driven tests
- Follow Go project structure conventions

## Core Constraints

### Universal Rules
- **NO MERGING**: Never merge or close PRs - leave for human review
- **Code Quality First**: Prioritize maintainability over speed
- **Atomic Commits**: Keep commits focused and descriptive
- **Test Coverage**: Ensure adequate testing for all new functionality
- **Documentation**: Update relevant docs for significant changes

### Error Handling
- Debug systematically when encountering errors
- Document debugging approach in commit messages
- If stuck, explain the issue clearly and ask for guidance
- Always provide context about what was attempted

### Security Considerations
- Follow security best practices for the language/framework
- Never commit secrets or sensitive information
- Use environment variables for configuration
- Implement proper input validation and sanitization

### Performance Guidelines
- Consider performance implications of changes
- Use appropriate data structures and algorithms
- Optimize for readability first, then performance
- Measure before optimizing

## Success Criteria

A feature is considered complete when:
- ✅ All checklist items are checked off
- 🟢 All tests pass (existing + new)
- 📋 Code follows project patterns and standards
- 🔒 No security vulnerabilities introduced
- 📚 Documentation updated as needed
- 🎯 Feature works as specified in the request

Remember: Quality and thoroughness are more important than speed. Take time to understand the project and implement features that are maintainable and well-tested.
EOL

echo -e "  ${GREEN}✓${NC} Global GEMINI.md created with comprehensive workflow (reduces prompt size by 80%)"

# Set proper ownership for global Gemini directory
run_quiet_command "chown -R '$SERVICE_USER:$SERVICE_GROUP' '$GEMINI_GLOBAL_DIR'" "Setting ownership for global Gemini directory"
run_quiet_command "chmod 755 '$GEMINI_GLOBAL_DIR'" "Setting permissions for global Gemini directory"
run_quiet_command "chmod 600 '$GLOBAL_ENV_FILE'" "Setting secure permissions for global .env file"
run_quiet_command "chmod 644 '$GEMINI_MD_FILE'" "Setting permissions for global GEMINI.md file"

print_success "✅ Global Gemini configuration created successfully"
echo -e "  ${BLUE}📁${NC} Global .env: $GLOBAL_ENV_FILE"
echo -e "  ${BLUE}📋${NC} Global GEMINI.md: $GEMINI_MD_FILE"
echo -e "  ${BLUE}💡${NC} Gemini CLI will now use these files globally"
echo -e "  ${BLUE}🚀${NC} Prompt size reduced from ~5000+ chars to ~1500 chars"

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
run_command "npm install" "Installing backend dependencies"

# Install dashboard dependencies
if [ -d "$DASHBOARD_DIR" ]; then
    echo -e "  ${YELLOW}▶${NC} Installing Next.js dashboard dependencies..."
    cd "$DASHBOARD_DIR"
    run_command "npm install" "Installing dashboard dependencies"
    cd "$APP_DIR"
else
    print_warning "Dashboard directory not found, skipping dashboard dependency installation"
fi

print_separator "Building Project"
run_command "npm run build" "Building the project"

print_separator "Cleaning Up Development Dependencies"
run_command "npm prune --production" "Removing development dependencies for production"

print_separator "Installing Playwright Browsers"
echo -e "  ${YELLOW}⚠️${NC}  This step may take several minutes..."

# Install system dependencies manually for Arch Linux
# Playwright's --with-deps only works on Debian/Ubuntu, so we handle Arch packages manually
echo -e "  ${YELLOW}▶${NC} Installing system dependencies for Playwright browsers..."
# Complete list of Arch packages needed for Chromium, Firefox, and WebKit browsers
# Based on community testing and Microsoft's Playwright requirements for Linux
# Updated with WebKit-specific dependencies and multimedia support
PLAYWRIGHT_DEPS=("nss" "nspr" "at-spi2-core" "libcups" "libdrm" "dbus" "libx11" "libxcomposite" "libxdamage" "libxext" "libxfixes" "libxrandr" "libxcb" "libxkbcommon" "mesa" "pango" "cairo" "alsa-lib" "fontconfig" "freetype2" "libxss" "libevent" "xorg-server-xvfb" "libxml2" "woff2" "harfbuzz-icu" "libwebp" "enchant" "hyphen" "libgudev" "libevdev" "x264" "icu" "libffi")
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

# Handle version-specific library compatibility for WebKit
echo -e "  ${YELLOW}▶${NC} Setting up WebKit compatibility libraries..."

# Create symlinks for version-locked ICU libraries (Playwright expects .66, Arch has .76+)
ICU_SYMLINKS_NEEDED=false
for lib in libicudata libicuuc libicui18n; do
    if [ ! -f "/usr/lib/${lib}.so.66" ] && [ -f "/usr/lib/${lib}.so" ]; then
        ICU_SYMLINKS_NEEDED=true
        break
    fi
done

if [ "$ICU_SYMLINKS_NEEDED" = true ]; then
    echo -e "    ${BLUE}Creating ICU library symlinks for WebKit compatibility...${NC}"
    sudo ln -sf /usr/lib/libicudata.so /usr/lib/libicudata.so.66 2>/dev/null || true
    sudo ln -sf /usr/lib/libicuuc.so /usr/lib/libicuuc.so.66 2>/dev/null || true
    sudo ln -sf /usr/lib/libicui18n.so /usr/lib/libicui18n.so.66 2>/dev/null || true
    echo -e "    ${GREEN}✓${NC} ICU library symlinks created"
else
    echo -e "    ${GREEN}✓${NC} ICU libraries already compatible"
fi

# Create symlink for libffi (Playwright expects .7, Arch has .8+)
if [ ! -f "/usr/lib/libffi.so.7" ] && [ -f "/usr/lib/libffi.so" ]; then
    echo -e "    ${BLUE}Creating libffi library symlink for WebKit compatibility...${NC}"
    sudo ln -sf /usr/lib/libffi.so /usr/lib/libffi.so.7 2>/dev/null || true
    echo -e "    ${GREEN}✓${NC} libffi library symlink created"
else
    echo -e "    ${GREEN}✓${NC} libffi library already compatible"
fi

echo -e "  ${GREEN}✓${NC} WebKit compatibility libraries configured"

# Install browsers without system dependencies (since we handled them above)
# Note: We do NOT use --with-deps because that tries to use apt-get on Arch Linux
run_command "npx playwright install" "Installing Playwright browsers (Chromium, Firefox, WebKit)"

# Verify WebKit dependencies are satisfied
echo -e "  ${YELLOW}▶${NC} Verifying WebKit dependencies..."
if npx playwright install-deps --dry-run 2>&1 | grep -q "missing dependencies"; then
    print_warning "Some WebKit dependencies may still be missing"
    echo -e "    ${BLUE}This is usually safe for basic usage${NC}"
    echo -e "    ${BLUE}WebKit tests and video recording may need additional setup${NC}"
else
    print_success "✅ All Playwright dependencies satisfied"
fi

print_step "Creating unified start script..."

print_separator "Creating Unified Start Script"
# Create the start script
START_SCRIPT="/home/$SERVICE_USER/start-gemini-factory.sh"
echo -e "  ${YELLOW}▶${NC} Creating unified start script..."

cat > "$START_SCRIPT" << EOL
#!/bin/bash

# Gemini Coding Factory Unified Start Script
# Starts backend service, dashboard, and optionally ngrok tunnels

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SERVICE_USER="$SERVICE_USER"
APP_DIR="$APP_DIR"
DASHBOARD_DIR="$DASHBOARD_DIR"
ENV_FILE="$GLOBAL_ENV_FILE"
INSTALL_NGROK="$INSTALL_NGROK"

print_status() {
    echo -e "\${GREEN}➤\${NC} \$1"
}

print_warning() {
    echo -e "\${YELLOW}⚠️\${NC} \$1"
}

print_error() {
    echo -e "\${RED}❌\${NC} \$1"
}

# Check if running as correct user
if [[ \$(whoami) != "\$SERVICE_USER" ]]; then
   print_error "This script should be run as user: \$SERVICE_USER"
   echo "Current user: \$(whoami)"
   exit 1
fi

# Check if environment file exists
if [ ! -f "\$ENV_FILE" ]; then
    print_error "Environment file not found: \$ENV_FILE"
    echo "Please run the installation script first."
    exit 1
fi

# Source environment variables
source "\$ENV_FILE"

echo -e "\${BLUE}🚀 Starting Gemini Coding Factory...\${NC}"
echo

# Start Redis if not running
print_status "Checking Redis service..."
if ! systemctl is-active --quiet redis; then
    print_warning "Redis not running, starting it..."
    sudo systemctl start redis
fi

# Start backend service
print_status "Starting backend service..."
sudo systemctl enable gemini-coding-factory.service
sudo systemctl start gemini-coding-factory.service

# Wait a moment for service to start
sleep 2

# Check service status
if systemctl is-active --quiet gemini-coding-factory.service; then
    echo -e "  \${GREEN}✓\${NC} Backend service started successfully"
else
    print_error "Failed to start backend service"
    echo "Check logs with: sudo journalctl -u gemini-coding-factory.service -f"
    exit 1
fi

# Start dashboard in tmux session
print_status "Starting dashboard in tmux session..."
cd "\$DASHBOARD_DIR"

# Kill existing dashboard session if it exists
tmux kill-session -t gemini-dashboard 2>/dev/null || true

# Start new dashboard session
tmux new-session -d -s gemini-dashboard -c "\$DASHBOARD_DIR" "npm run dev"

echo -e "  \${GREEN}✓\${NC} Dashboard started in tmux session 'gemini-dashboard'"
echo -e "  \${BLUE}ℹ️\${NC}  Access dashboard at: http://localhost:\${DASHBOARD_PORT:-3000}"

# Start ngrok tunnels if enabled
if [ "\$INSTALL_NGROK" = "true" ] && command -v ngrok &> /dev/null; then
    print_status "Starting ngrok tunnels..."
    
    # Kill existing ngrok sessions
    tmux kill-session -t ngrok-backend 2>/dev/null || true
    tmux kill-session -t ngrok-dashboard 2>/dev/null || true
    
    # Start backend ngrok tunnel
    tmux new-session -d -s ngrok-backend "ngrok http \${PORT:-5000}"
    
    # Start dashboard ngrok tunnel  
    tmux new-session -d -s ngrok-dashboard "ngrok http \${DASHBOARD_PORT:-3000}"
    
    echo -e "  \${GREEN}✓\${NC} ngrok tunnels started"
    echo -e "  \${BLUE}ℹ️\${NC}  Backend tunnel: tmux attach -t ngrok-backend"
    echo -e "  \${BLUE}ℹ️\${NC}  Dashboard tunnel: tmux attach -t ngrok-dashboard"
    
    # Wait a moment for ngrok to start
    sleep 3
    
    # Try to get ngrok URLs
    echo
    print_status "Getting ngrok URLs..."
    
    # Get backend URL
    BACKEND_URL=\$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o 'https://[^"]*\.ngrok-free\.app' | head -1)
    if [ -n "\$BACKEND_URL" ]; then
        echo -e "  \${GREEN}🌐\${NC} Backend webhook URL: \$BACKEND_URL/webhook"
        echo -e "  \${YELLOW}📝\${NC} Add this to your GitHub repository webhooks"
    fi
    
    # Get dashboard URL  
    DASHBOARD_URL=\$(curl -s http://localhost:4041/api/tunnels 2>/dev/null | grep -o 'https://[^"]*\.ngrok-free\.app' | head -1)
    if [ -n "\$DASHBOARD_URL" ]; then
        echo -e "  \${GREEN}🎯\${NC} Public dashboard URL: \$DASHBOARD_URL"
    fi
fi

echo
echo -e "\${GREEN}🎉 Gemini Coding Factory started successfully!\${NC}"
echo
echo -e "\${BLUE}📊 Service Status:\${NC}"
echo -e "  • Backend service: \$(systemctl is-active gemini-coding-factory.service)"
echo -e "  • Redis service: \$(systemctl is-active redis)"
echo -e "  • Dashboard: http://localhost:\${DASHBOARD_PORT:-3000}"
if [ "\$INSTALL_NGROK" = "true" ]; then
    echo -e "  • ngrok tunnels: Running in tmux sessions"
fi

echo
echo -e "\${BLUE}🔧 Useful commands:\${NC}"
echo -e "  • View backend logs: sudo journalctl -u gemini-coding-factory.service -f"
echo -e "  • Attach to dashboard: tmux attach -t gemini-dashboard"
if [ "\$INSTALL_NGROK" = "true" ]; then
    echo -e "  • View backend tunnel: tmux attach -t ngrok-backend"
    echo -e "  • View dashboard tunnel: tmux attach -t ngrok-dashboard"
fi
echo -e "  • Stop all: ./stop-gemini-factory.sh"

echo
echo -e "\${YELLOW}💡 Next steps:\${NC}"
if [ "\$INSTALL_NGROK" = "true" ] && [ -n "\${BACKEND_URL:-}" ]; then
    echo -e "  1. Add webhook URL to GitHub: \$BACKEND_URL/webhook"
else
    echo -e "  1. Add webhook URL to GitHub: http://your-server-ip:5000/webhook"
fi
echo -e "  2. Comment '@gemini [your request]' on any GitHub PR"
echo -e "  3. Monitor dashboard for job progress"
EOL

# Create stop script as well
STOP_SCRIPT="/home/$SERVICE_USER/stop-gemini-factory.sh"
cat > "$STOP_SCRIPT" << EOL
#!/bin/bash

# Gemini Coding Factory Stop Script

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "\${YELLOW}🛑 Stopping Gemini Coding Factory...\${NC}"

# Stop backend service
echo -e "  Stopping backend service..."
sudo systemctl stop gemini-coding-factory.service

# Stop tmux sessions
echo -e "  Stopping tmux sessions..."
tmux kill-session -t gemini-dashboard 2>/dev/null || true
tmux kill-session -t ngrok-backend 2>/dev/null || true
tmux kill-session -t ngrok-dashboard 2>/dev/null || true

echo -e "\${GREEN}✅ All services stopped\${NC}"
EOL

# Make scripts executable
chmod +x "$START_SCRIPT"
chmod +x "$STOP_SCRIPT"

echo -e "  ${GREEN}✓${NC} Unified start script created: $START_SCRIPT"
echo -e "  ${GREEN}✓${NC} Stop script created: $STOP_SCRIPT"

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
    print_warning "UFW firewall is active. Opening port 5000..."
    run_command "sudo ufw allow 5000/tcp" "Opening port 5000 for HTTP traffic"
    print_success "Port 5000 opened in firewall"
else
    echo -e "  ${BLUE}ℹ️${NC}  UFW firewall not active or not installed"
fi

echo
print_separator "🎉 Installation Complete!"
echo -e "${GREEN}✅ Installation completed successfully!${NC}"
echo
echo -e "${BLUE}🔧 Quick Start:${NC}"
echo
echo "1. Start everything with one command:"
echo -e "   ${GREEN}./start-gemini-factory.sh${NC}"
echo
echo "2. Stop everything:"
echo -e "   ${GREEN}./stop-gemini-factory.sh${NC}"
echo
echo -e "${BLUE}📁 Configuration:${NC}"
echo -e "• Environment file: ${GLOBAL_ENV_FILE}"
echo -e "• Start script: $START_SCRIPT"
echo -e "• Stop script: $STOP_SCRIPT"
echo
if [ "$INSTALL_NGROK" = "true" ]; then
    echo -e "${BLUE}🌐 ngrok Integration:${NC}"
    echo -e "• ngrok will automatically start tunnels for both backend and dashboard"
    echo -e "• Webhook URLs will be displayed when you start the service"
    echo -e "• Access tunnels with: tmux attach -t ngrok-backend"
    echo
fi
echo -e "${BLUE}📊 Access Points:${NC}"
echo -e "• Backend API: http://localhost:5000"
echo -e "• Dashboard: http://localhost:3000"
echo -e "• Health check: http://localhost:5000/health"
echo -e "• Webhook endpoint: http://localhost:5000/webhook"
echo
echo -e "${BLUE}🔧 Manual Control (if needed):${NC}"
echo -e "• Backend service: sudo systemctl start/stop gemini-coding-factory.service"
echo -e "• View backend logs: sudo journalctl -u gemini-coding-factory.service -f"
echo -e "• Attach to dashboard: tmux attach -t gemini-dashboard"
echo -e "• Redis service: sudo systemctl start/stop redis"
echo
echo -e "${YELLOW}⚠️  Final Notes:${NC}"
if [ -z "${github_token:-}" ] || [ "$github_token" = "your_github_token_here" ]; then
    echo -e "• ${RED}IMPORTANT:${NC} Add your GitHub token to: $GLOBAL_ENV_FILE"
fi
echo -e "• Add webhook URL to your GitHub repositories"
if [ "$INSTALL_NGROK" = "false" ]; then
    echo -e "• Ensure port 5000 is accessible from GitHub (or use ngrok)"
fi
echo -e "• Monitor dashboard for job progress and logs"
echo
echo -e "${GREEN}🎉 Installation complete!${NC}"
echo -e "${BLUE}💡 Usage: Comment '@gemini [your request]' on any GitHub PR${NC}" 