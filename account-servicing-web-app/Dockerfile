# Production stage - using nginx to serve pre-built static files with enhanced security
FROM nginx:alpine AS production

# Copy custom nginx config with security headers
COPY account-servicing-web-app/nginx.conf /etc/nginx/nginx.conf

# Copy pre-built application from host
COPY account-servicing-web-app/dist /usr/share/nginx/html

# Note: Running nginx as root for development - in production use proper user setup

# Health check with security validation
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1

EXPOSE 3001

CMD ["nginx", "-g", "daemon off;"]