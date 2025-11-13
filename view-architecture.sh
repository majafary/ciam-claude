#!/bin/bash
# Quick script to view C4 architecture diagrams

echo "🏗️  Starting Structurizr Architecture Viewer..."
echo ""
echo "📊 Interactive C4 Diagrams will be available at:"
echo "   http://localhost:8081"
echo ""
echo "🔍 Navigate through:"
echo "   • System Context → High-level view"
echo "   • Containers → Applications & databases"
echo "   • Components → Internal structure"
echo ""
echo "🛑 Press Ctrl+C to stop the viewer"
echo ""

# Start Structurizr Lite
docker-compose -f docker-compose.structurizr.yml up
# docker run -d \
#     --name ciam-structurizr \
#     -p 8081:8080 \
#     -v /Users/mjafary/Documents/dev-ai/claude-poc-9-24-2025/ciam-claude/docs/architecture:/usr/local/structurizr \
#     -e STRUCTURIZR_WORKSPACE_FILENAME=ciam \
#     structurizr/lite:latest
