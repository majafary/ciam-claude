#!/bin/bash

export PROJECT_ROOT="."

echo "🔄 Testing CIAM UI Changes - Development Workflow"
echo "=================================================="

# 1. Stop containers
echo "📦 Step 1: Stopping all containers..."
docker-compose down

# 2. Build projects
echo "🏪 Step 2: Building all projects"
cd $PROJECT_ROOT
npm run build:all

# 3. Deploy with Docker
echo "🐳 Step 3: Deploying with Docker..."
cd ..
docker-compose down
docker-compose up --build -d

echo "✅ Deployment complete!"
echo "🌐 Storefront: http://localhost:3000"
echo "🏛️ Account Servicing: http://localhost:3001"
echo "📊 CIAM UI Info: http://localhost:3002"
echo "⚡ Backend API: http://localhost:8080"