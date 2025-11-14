# Dockerfile for Structurizr Lite on ECS Fargate
# Extends official Structurizr Lite image with baked-in DSL files

FROM structurizr/lite:latest

# Set workspace filename (without .dsl extension - Structurizr appends it)
ENV STRUCTURIZR_WORKSPACE_FILENAME=ciam

# Copy architecture documentation files into the container
# This includes: ciam.dsl, structurizr.properties, and any supporting files
COPY docs/architecture/ /usr/local/structurizr/

# Expose port 8080 for the web interface
# In ECS, map this to your ALB target group port
EXPOSE 8080

# Health check for ECS Fargate
# Checks if Structurizr web server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

# The base image already defines the entrypoint to run Structurizr Lite
# No need to override CMD or ENTRYPOINT
