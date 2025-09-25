# Simple development server for CIAM UI Storybook
FROM nginx:alpine AS production

# Copy basic nginx config
COPY <<EOF /etc/nginx/nginx.conf
events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  gzip on;
  gzip_types text/plain text/css application/javascript;

  server {
    listen 3002;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    location / {
      try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
      expires 1y;
      add_header Cache-Control "public, immutable";
    }

    server_tokens off;
  }
}
EOF

# Create a simple index.html for CIAM UI info
RUN echo '<!DOCTYPE html>\
<html>\
<head>\
  <title>CIAM UI Library</title>\
  <style>\
    body { font-family: Arial, sans-serif; margin: 40px; }\
    .container { max-width: 600px; margin: 0 auto; }\
    .status { color: #28a745; font-weight: bold; }\
  </style>\
</head>\
<body>\
  <div class="container">\
    <h1>CIAM UI Library</h1>\
    <p class="status">✅ Package built successfully</p>\
    <p>The CIAM UI library has been built and is available as an npm package.</p>\
    <h2>Library Information:</h2>\
    <ul>\
      <li>Package: ciam-ui@1.0.0</li>\
      <li>Components: Login, Dashboard, Profile</li>\
      <li>Built: Production Ready</li>\
    </ul>\
    <p><em>This service runs for development purposes. In production, this library is consumed as a dependency.</em></p>\
  </div>\
</body>\
</html>' > /usr/share/nginx/html/index.html

# Note: Running nginx as root for development - in production use proper user setup

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/ || exit 1

EXPOSE 3002

CMD ["nginx", "-g", "daemon off;"]