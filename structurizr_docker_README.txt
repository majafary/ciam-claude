docker run -d \
    --name ciam-structurizr \
    -p 8081:8080 \
    -v /Users/mjafary/Documents/dev-ai/claude-poc-9-24-2025/ciam-claude/docs/architecture:/usr/local/structurizr \
    -e STRUCTURIZR_WORKSPACE_FILENAME=ciam.dsl \
    structurizr/lite:latest

docker stop ciam-structurizr && docker rm ciam-structurizr



  If you want to run without Docker at all, you can download the Structurizr Lite JAR file:

  # Download Structurizr Lite
  curl -L https://github.com/structurizr/lite/releases/latest/download/structurizr-lite.war -o structurizr-lite.war

  # Run with Java (requires Java 17+)
  java -jar structurizr-lite.war \
    -Dstructurizr.workspace=/Users/mjafary/Documents/dev-ai/claude-poc-9-24-2025/ciam-claude/docs/architecture \
    -Dstructurizr.autoSaveInterval=5000 \
    -Dstructurizr.autoRefreshInterval=2000

  This would run on http://localhost:8080 (not 8081).