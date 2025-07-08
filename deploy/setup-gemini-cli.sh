#!/bin/bash

# Gemini CLI Setup Helper Script
# Use this script to configure the Gemini CLI for the Coding Factory

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔑 Gemini CLI Configuration Helper${NC}"
echo -e "${BLUE}Setting up authentication for Gemini CLI${NC}"
echo

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

# Check if Gemini CLI is installed
if ! command -v gemini &> /dev/null; then
    print_error "Gemini CLI is not installed"
    echo "Please run the main installation script first:"
    echo "  ./deploy/install-arch.sh"
    exit 1
fi

print_step "Checking current Gemini CLI configuration..."

echo "Detected Gemini CLI version: $(gemini --version 2>/dev/null || echo 'Unable to get version')"
echo

# Check if already configured via environment variable
if [ -n "${GEMINI_API_KEY:-}" ]; then
    print_success "GEMINI_API_KEY environment variable is set!"
    echo
    echo "Testing API key..."
    if gemini --version >/dev/null 2>&1; then
        print_success "API key test passed!"
    else
        print_warning "API key test failed - the key may be invalid"
    fi
    echo
    echo -e "${BLUE}Would you like to update the API key? (y/n)${NC}"
    read -r update_key
    if [[ ! $update_key =~ ^[Yy]$ ]]; then
        echo "Keeping existing API key. Exiting."
        exit 0
    fi
fi

echo
print_step "Setting up Gemini CLI authentication..."

echo -e "${BLUE}📋 This version of Gemini CLI ($(gemini --version)) uses environment variables for authentication.${NC}"
echo
echo -e "${GREEN}Authentication Method: Environment Variable${NC}"
echo "• Set GEMINI_API_KEY environment variable"
echo "• Get your key: https://aistudio.google.com/app/apikey"
echo "• No interactive configuration needed"
echo

echo -e "${BLUE}📝 Setup Instructions:${NC}"
echo "1. Visit: https://aistudio.google.com/app/apikey"
echo "2. Create a new API key"
echo "3. Copy the API key"
echo "4. Set it as an environment variable"
echo

echo -e "${YELLOW}⚠️  Important Notes:${NC}"
echo "• Keep your API key secure"
echo "• Don't share or commit API keys to repositories"
echo "• The key needs to be available to the service environment"
echo

echo -e "${BLUE}Ready to set up your API key? Press Enter to continue or Ctrl+C to cancel...${NC}"
read -r

# Get API key from user
echo
echo -e "${BLUE}Please enter your Gemini API key:${NC}"
echo "(Get one from: https://aistudio.google.com/app/apikey)"
read -r -s api_key

if [ -z "$api_key" ]; then
    print_error "No API key provided. Exiting."
    exit 1
fi

echo
print_step "Testing the API key..."

# Test the API key
export GEMINI_API_KEY="$api_key"
if gemini --version >/dev/null 2>&1; then
    print_success "API key test passed!"
else
    print_error "API key test failed!"
    echo "The API key may be invalid or there may be a network issue."
    echo "Please verify your key at: https://aistudio.google.com/app/apikey"
    exit 1
fi

echo
print_step "Setting up environment for service..."

# Check if we need to set up environment variables for the service
ENV_FILE="/etc/gemini-coding-factory/environment"
if [ -f "$ENV_FILE" ]; then
    echo "Service environment file found: $ENV_FILE"
    echo
    
    # Check if API key is already in environment file
    if sudo grep -q "GEMINI_API_KEY=" "$ENV_FILE" 2>/dev/null; then
        echo -e "${BLUE}Updating existing GEMINI_API_KEY in service environment...${NC}"
        # Update existing key
        sudo sed -i "s/^GEMINI_API_KEY=.*/GEMINI_API_KEY=$api_key/" "$ENV_FILE"
    else
        echo -e "${BLUE}Adding GEMINI_API_KEY to service environment...${NC}"
        # Add new key
        echo "GEMINI_API_KEY=$api_key" | sudo tee -a "$ENV_FILE" >/dev/null
    fi
    
    print_success "Service environment updated!"
    echo
    echo -e "${BLUE}📝 Next Steps:${NC}"
    echo "1. Restart the service to pick up the new API key:"
    echo "   sudo systemctl restart gemini-coding-factory.service"
    echo
    echo "2. Check service status:"
    echo "   sudo systemctl status gemini-coding-factory.service"
    echo
    echo "3. View service logs:"
    echo "   sudo journalctl -u gemini-coding-factory.service -f"
else
    echo "Service environment file not found."
    echo "Run the main installation script if you haven't already."
    echo
    echo -e "${BLUE}To set the API key for your current session:${NC}"
    echo "export GEMINI_API_KEY=\"$api_key\""
fi

echo
print_step "Setting up persistent environment (optional)..."

echo -e "${BLUE}Would you like to add the API key to your shell profile for persistent access? (y/n)${NC}"
read -r setup_profile

if [[ $setup_profile =~ ^[Yy]$ ]]; then
    # Determine shell profile file
    if [ -f "$HOME/.bashrc" ]; then
        PROFILE_FILE="$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
        PROFILE_FILE="$HOME/.zshrc"
    elif [ -f "$HOME/.profile" ]; then
        PROFILE_FILE="$HOME/.profile"
    else
        PROFILE_FILE="$HOME/.bashrc"
    fi
    
    echo "Adding to $PROFILE_FILE..."
    
    # Check if already exists
    if grep -q "GEMINI_API_KEY=" "$PROFILE_FILE" 2>/dev/null; then
        echo "Updating existing entry..."
        sed -i "s/^export GEMINI_API_KEY=.*/export GEMINI_API_KEY=\"$api_key\"/" "$PROFILE_FILE"
    else
        echo "Adding new entry..."
        echo "export GEMINI_API_KEY=\"$api_key\"" >> "$PROFILE_FILE"
    fi
    
    print_success "Added to $PROFILE_FILE"
    echo "Reload your shell or run: source $PROFILE_FILE"
fi

echo
print_success "🎉 Gemini CLI setup complete!"
echo
echo -e "${BLUE}💡 Usage Tips:${NC}"
echo "• Test locally: GEMINI_API_KEY=\"your_key\" gemini --version"
echo "• Use in projects: Comment '@gemini [request]' on GitHub PRs"
echo "• The service will use the key from /etc/gemini-coding-factory/environment"
echo
echo -e "${BLUE}🔧 Verification:${NC}"
echo "• Current session: GEMINI_API_KEY is $([ -n "${GEMINI_API_KEY:-}" ] && echo 'SET' || echo 'NOT SET')"
echo "• Service config: $([ -f "$ENV_FILE" ] && echo 'EXISTS' || echo 'NOT FOUND')"
echo "• CLI test: $(gemini --version 2>/dev/null && echo 'PASSED' || echo 'FAILED')" 