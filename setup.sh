#!/bin/bash

# 🚀 Temp Mail Service Setup Script
# This script helps you set up the Real-Time Temporary Email Service

set -e

echo "🚀 Starting Temp Mail Service Setup..."
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if we're in the correct directory
if [ ! -f "backend/package.json" ]; then
    print_error "Please run this script from the /app directory"
    exit 1
fi

print_status "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16 or higher."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js version 16 or higher is required. Current version: $(node --version)"
    exit 1
fi

print_status "Node.js version: $(node --version)"

# Check if dependencies are installed
cd backend
if [ ! -d "node_modules" ]; then
    print_info "Installing Node.js dependencies..."
    npm install
    print_status "Dependencies installed"
fi

# Check for credentials.json
if [ ! -f "credentials.json" ]; then
    print_warning "credentials.json not found!"
    echo ""
    echo "📋 You need to:"
    echo "1. Go to Google Cloud Console"
    echo "2. Create OAuth2 credentials"
    echo "3. Download the JSON file"
    echo "4. Save it as 'credentials.json' in the backend directory"
    echo ""
    print_info "See README.md for detailed instructions"
    echo ""
    read -p "Press Enter when you have added credentials.json..."
fi

# Check .env file
if [ ! -f ".env" ]; then
    print_warning ".env file not found! Creating template..."
    cp .env .env.example
    print_info "Please edit .env and add your Google Cloud Project ID"
    exit 1
fi

# Check if PROJECT_ID is set
if grep -q "your-gcp-project-id-here" .env; then
    print_warning "Please update GCP_PROJECT_ID in .env file with your actual Project ID"
    print_info "Edit backend/.env and replace 'your-gcp-project-id-here' with your Google Cloud Project ID"
    exit 1
fi

print_status "Configuration files are ready"

# Check if tokens.json exists (authorization)
if [ ! -f "tokens.json" ]; then
    print_info "Gmail authorization required..."
    echo ""
    echo "📧 This will open a browser for Gmail authorization"
    echo "You'll need to:"
    echo "1. Sign in to your Gmail account"
    echo "2. Grant permissions to read emails"
    echo "3. Complete the OAuth flow"
    echo ""
    read -p "Press Enter to start authorization..."
    
    node authorize.js
    
    if [ ! -f "tokens.json" ]; then
        print_error "Authorization failed. Please check your credentials.json and try again."
        exit 1
    fi
    
    print_status "Gmail authorization complete"
else
    print_status "Gmail authorization already complete"
fi

print_status "Setup completed successfully!"

echo ""
echo "🎉 Your Temp Mail Service is ready!"
echo "=================================="
echo ""
echo "📋 Next steps:"
echo "1. 🌐 Install ngrok: https://ngrok.com/download"
echo "2. 🔗 Start ngrok tunnel: ngrok http 8001"
echo "3. ⚙️  Set up Pub/Sub subscription in Google Cloud Console"
echo "4. 👀 Run: node start-watch.js"
echo "5. 🧪 Test your service!"
echo ""
echo "📖 See README.md for detailed instructions"
echo ""
print_status "Happy temporary emailing! 📧"