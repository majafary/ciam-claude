# Production stage - using nginx to serve pre-built static files
FROM nginx:alpine AS production

# Copy custom nginx config
COPY storefront-web-app/nginx.conf /etc/nginx/nginx.conf

# Copy pre-built application from host
COPY storefront-web-app/dist /usr/share/nginx/html

# Note: Running nginx as root for development - in production use proper user setup

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]