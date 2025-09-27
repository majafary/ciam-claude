#!/bin/bash

echo "🔄 Testing CIAM UI Changes - Development Workflow"
echo "=================================================="

# 1. Stop containers
echo "📦 Step 1: Stopping all containers..."
docker-compose down

# 2. Build CIAM UI library
echo "📦 Step 2: Building CIAM UI library..."
cd /Users/mjafary/Documents/dev-ai/claude-poc-9-24-2025/claude_poc_v2/ciam-ui
npm run build

# 3. Build consuming applications
echo "🏪 Step 3: Building Storefront..."
cd ../storefront-web-app
npm run build

echo "🏦 Step 3: Building Account Servicing..."
cd ../account-servicing-web-app
npm run build

# 4. Deploy with Docker
echo "🐳 Step 4: Deploying with Docker..."
cd ..
docker-compose down
docker-compose up --build -d

echo "✅ Deployment complete!"
echo "🌐 Storefront: http://localhost:3000"
echo "🏛️ Account Servicing: http://localhost:3001"
echo "📊 CIAM UI Info: http://localhost:3002"
echo "⚡ Backend API: http://localhost:8080"