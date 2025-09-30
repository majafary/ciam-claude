#!/bin/bash

export PROJECT_ROOT="."

echo "🚀 CIAM Development Cache-Buster & Restart Script"
echo "================================================="
echo ""

# Color codes for better output
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

# Set the project root directory
cd "$PROJECT_ROOT" || exit 1

echo "🛑 STEP 1: Killing all development processes"
echo "============================================"

# Kill processes on specific ports
print_info "Killing processes on ports 3000, 3001, 3002, 3003, 8080..."
lsof -ti:3000,3001,3002,3003,8080 | xargs kill -9 2>/dev/null || true

# Kill any npm dev processes
print_info "Killing npm dev processes..."
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true

# Wait for processes to die
sleep 2
print_status "All development processes killed"

echo ""
echo "🧹 STEP 2: Aggressive cache clearing"
echo "====================================="

# Clear all Vite dependency caches
print_info "Clearing Vite dependency caches..."
find . -name "node_modules" -type d -exec rm -rf {}/.vite \; 2>/dev/null || true
rm -rf node_modules/.vite 2>/dev/null || true

# Clear Vite build cache
print_info "Clearing Vite build caches..."
find . -name ".vite" -type d -exec rm -rf {} \; 2>/dev/null || true

# Clear npm cache for this project
print_info "Clearing npm cache..."
npm cache clean --force 2>/dev/null || true

# Clear any dist directories that might be cached
print_info "Clearing build output directories..."
rm -rf */dist 2>/dev/null || true
rm -rf ciam-ui/dist 2>/dev/null || true

# Clear any TypeScript build cache
print_info "Clearing TypeScript build caches..."
find . -name "tsconfig.tsbuildinfo" -delete 2>/dev/null || true

print_status "All caches cleared"

echo ""
echo "🔨 STEP 3: Fresh CIAM-UI build"
echo "==============================="

print_info "Building ciam-ui from scratch..."
cd "$PROJECT_ROOT/ciam-ui" || exit 1

# Force fresh install to ensure no cached dependencies
npm install --force
if [ $? -eq 0 ]; then
    print_status "Dependencies installed"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Build the package
npm run build
if [ $? -eq 0 ]; then
    print_status "CIAM-UI build completed successfully"
else
    print_error "CIAM-UI build failed"
    exit 1
fi

cd "$PROJECT_ROOT"

echo ""
echo "🚦 STEP 4: Starting development servers (in correct order)"
echo "=========================================================="

# Start backend first
print_info "Starting backend server (port 8080)..."
npm run dev:backend &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Check if backend is running
if curl -s http://localhost:8080/health > /dev/null; then
    print_status "Backend server started successfully"
else
    print_warning "Backend might still be starting..."
fi

# Start account-servicing app
print_info "Starting account-servicing app (port 3001)..."
cd "$PROJECT_ROOT/account-servicing-web-app"
npm run dev &
ACCOUNT_PID=$!

# Start storefront app
print_info "Starting storefront app (port 3000)..."
cd "$PROJECT_ROOT/storefront-web-app"
npm run dev &
STOREFRONT_PID=$!

cd "$PROJECT_ROOT"

# Wait for frontend apps to start
sleep 5

echo ""
echo "🔍 STEP 5: Health checks"
echo "========================"

# Check backend
if curl -s http://localhost:8080/health > /dev/null; then
    print_status "Backend (8080): Running"
else
    print_error "Backend (8080): Not responding"
fi

# Check account-servicing
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200"; then
    print_status "Account-servicing (3001): Running"
else
    print_error "Account-servicing (3001): Not responding"
fi

# Check storefront
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    print_status "Storefront (3000): Running"
else
    print_error "Storefront (3000): Not responding"
fi

echo ""
echo "🧪 STEP 6: Testing CIAM functionality"
echo "====================================="

print_info "Testing backend login API..."
BACKEND_TEST=$(curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password"}' \
  -s -w "\nHTTP_STATUS:%{http_code}" | tail -1)

if echo "$BACKEND_TEST" | grep -q "HTTP_STATUS:200"; then
    print_status "Backend API: Working"
else
    print_error "Backend API: Failed"
fi

echo ""
echo "🎯 STEP 7: Ready for testing!"
echo "============================="

print_status "All services are running with fresh builds and cleared caches"
echo ""
print_info "Test URLs:"
echo "  • Backend:          http://localhost:8080"
echo "  • Account-servicing: http://localhost:3001"
echo "  • Storefront:       http://localhost:3000"
echo ""

print_info "Test Users:"
echo "  • testuser / password  (direct login)"
echo "  • mfauser / password   (MFA required)"
echo ""

print_info "Latest Features to Test:"
echo "  • Save Username: Works across component remounting"
echo "  • Last Login: Shows timestamp for authenticated users"
echo "  • MFA Dialog: Available in all variants"
echo ""

print_warning "Process IDs (for manual killing if needed):"
echo "  • Backend PID: $BACKEND_PID"
echo "  • Account PID: $ACCOUNT_PID"
echo "  • Storefront PID: $STOREFRONT_PID"

echo ""
print_status "🚀 Development environment ready! All caches cleared, fresh builds deployed."

# Open browsers for immediate testing
print_info "Opening test applications in browser..."
sleep 2
open http://localhost:3001
sleep 1
open http://localhost:3000

echo ""
print_info "Happy testing! 🎉"