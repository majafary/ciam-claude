FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Disable SSL verification for apk
RUN echo "http://dl-cdn.alpinelinux.org/alpine/v3.22/main" > /etc/apk/repositories && \
    echo "http://dl-cdn.alpinelinux.org/alpine/v3.22/community" >> /etc/apk/repositories

# Update the package index and install Python and build tools using apk
RUN apk update && apk add --no-cache python3 py3-pip build-base

# # Install Python
# RUN apt-get update && apt-get install -y python3 python3-pip

# Set Python alias
RUN ln -sf /usr/bin/python3 /usr/bin/python

# # Set Python path for node-gyp
# ENV PYTHON=/usr/bin/python3

# Disable strict SSL
RUN npm config set strict-ssl false

# Set environment variables to ignore SSL errors
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV NPM_CONFIG_STRICT_SSL=false
ENV NODE_GYP_FORCE_PYTHON=/usr/bin/python3

# Install dependencies
RUN CUSTOM_REGISTRY=http://registry.npmjs.org
RUN npm config set registry ${CUSTOM_REGISTRY}
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S ciam -u 1001

# Change ownership of app directory
RUN chown -R ciam:nodejs /app

# Switch to non-root user
USER ciam

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start the application
CMD ["npm", "start"]