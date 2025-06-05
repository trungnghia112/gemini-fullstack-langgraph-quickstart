#!/bin/bash

# Full test script for Node.js backend
# This script builds, starts the server, runs tests, and cleans up

set -e  # Exit on any error

echo "🚀 Starting Full Backend Test..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up..."
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
        print_status "Server stopped"
    fi
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Step 1: Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the backend-node directory."
    exit 1
fi

# Step 2: Install dependencies
print_status "Installing dependencies..."
npm install

# Step 3: Build the project
print_status "Building the project..."
npm run build

# Step 4: Check if .env exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from .env.example..."
    cp .env.example .env
    print_warning "Please update .env with your actual API keys for full functionality"
fi

# Step 5: Start the server in background
print_status "Starting server..."
npm start &
SERVER_PID=$!

# Wait for server to start
print_status "Waiting for server to start..."
sleep 3

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    print_error "Server failed to start"
    exit 1
fi

print_success "Server started with PID $SERVER_PID"

# Step 6: Run API tests
print_status "Running API tests..."
node test-api.js

# Step 7: Test linting
print_status "Running linting..."
npm run lint

print_success "All tests completed successfully! ✅"

echo ""
echo "🎉 Backend conversion completed successfully!"
echo ""
echo "📋 What was accomplished:"
echo "   ✅ Converted Python backend to Node.js/TypeScript"
echo "   ✅ All modules successfully transpiled"
echo "   ✅ Express server working with REST API"
echo "   ✅ Health check endpoint functional"
echo "   ✅ Error handling implemented"
echo "   ✅ TypeScript compilation successful"
echo "   ✅ Linting passes"
echo "   ✅ Basic API tests pass"
echo ""
echo "🔧 Next steps:"
echo "   1. Add your real GEMINI_API_KEY to .env file"
echo "   2. Test with real API calls: curl -X POST http://localhost:8001/research -H 'Content-Type: application/json' -d '{\"message\":\"test\"}'"
echo "   3. Integrate with frontend"
echo "   4. Add more comprehensive tests"
echo ""
echo "🌐 Server endpoints:"
echo "   - Health: http://localhost:8001/health"
echo "   - Research: POST http://localhost:8001/research"
echo "   - Stream: POST http://localhost:8001/research/stream"
echo "   - Frontend: http://localhost:8001/app"
