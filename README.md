# Account Servicing & CIAM Integration

This repository contains the complete Account Servicing & CIAM (Customer Identity and Access Management) integration suite, consisting of 4 self-contained applications that work together to provide secure authentication, MFA, and account servicing capabilities.

## 🏗️ Architecture Overview

```
┌─────────────────────┐    ┌─────────────────────┐
│   Storefront Web    │    │Account Servicing    │
│     (Port 3000)     │    │   Web (Port 3001)   │
└─────────┬───────────┘    └─────────┬───────────┘
          │                          │
          │    ┌─────────────────┐   │
          └────│   CIAM UI SDK   │───┘
               │  (npm package)  │
               └─────────┬───────┘
                         │
                ┌────────▼─────────┐
                │   CIAM Backend   │
                │   (Port 8080)    │
                └──────────────────┘
```

## 📦 Project Structure

```
/
├── ciam-backend/                 # Express.js API server (Port 8080)
├── ciam-ui/                      # React SDK library (npm package)
├── storefront-web-app/           # Public storefront (Port 3000)
├── account-servicing-web-app/    # Secure account view (Port 3001)
├── docker-compose.yml            # Full stack local development
└── README.md                     # This file
```

## 🚀 Quick Start

### Prerequisites
- **Node.js 22+** with npm
- **Docker & Docker Compose** (optional but recommended)

### Option 1: Docker Compose (Recommended)
```bash
# Clone and start all services
docker-compose up --build

# Access applications:
# - Storefront: http://localhost:3000
# - Account Servicing: http://localhost:3001
# - CIAM Backend API: http://localhost:8080
```

### Option 2: Manual Setup
```bash
# Install dependencies for all projects
npm run install:all

# Start all services in development mode
npm run dev:all

# Or start services individually:
npm run dev:backend     # CIAM Backend (Port 8080)
npm run dev:storefront  # Storefront (Port 3000)
npm run dev:account     # Account Servicing (Port 3001)
```

## 🧪 Test Credentials & Scenarios

### Authentication Test Matrix

| Username | Password | Expected Behavior |
|----------|----------|------------------|
| `testuser` | `password` | ✅ Login → MFA Required → OTP: `1234` → Success |
| `userlockeduser` | `password` | ❌ Account Locked Error |
| `mfalockeduser` | `password` | ✅ Login → ❌ MFA Locked Error |
| `wronguser` | `password` | ❌ Invalid Credentials |
| `testuser` | `wrongpass` | ❌ Invalid Credentials |

### MFA Test Scenarios
- **OTP**: Enter `1234` for success, any other value for failure
- **Push**: Auto-approves after 3-5 seconds of polling for demo

## 📋 Testing All Use Cases

### 1. **Storefront Login Flow**
```bash
# Visit: http://localhost:3000
1. Click login in navigation
2. Enter: testuser / password
3. Complete MFA with OTP: 1234
4. See user info in nav + "View My Account" link
5. Click "View My Account" → Navigate to Account Servicing
```

### 2. **Direct Account Servicing Access**
```bash
# Visit: http://localhost:3001 (not logged in)
1. Should redirect to CIAM login page
2. Login with testuser / password
3. Complete MFA → Redirect back to Account Servicing
4. See account balances and user info
```

### 3. **Account Locked Scenario**
```bash
# Test account security
1. Try login with: userlockeduser / password
2. Should see "Account locked" error message
3. Contact support link should be visible
```

### 4. **MFA Locked Scenario**
```bash
# Test MFA security
1. Login with: mfalockeduser / password
2. Should reach MFA step
3. Enter any OTP → Should see "MFA locked" error
```

### 5. **Session Management**
```bash
# Test multi-session features
1. Login successfully in one browser/tab
2. Visit Account Servicing → "Active Sessions" section
3. Login from different browser/device simulation
4. Use "Sign out other devices" functionality
```

### 6. **Token Refresh Testing**
```bash
# Test automatic token refresh
1. Login successfully
2. Wait 15 minutes (or modify token expiry)
3. Make API call → Should auto-refresh tokens
4. Check Network tab for /token/refresh calls
```

## 🔧 Development Commands

```bash
# Install all dependencies
npm run install:all

# Development mode (all services)
npm run dev:all

# Individual services
npm run dev:backend
npm run dev:storefront
npm run dev:account
# CIAM UI SDK does not run as a service - it's imported as a dependency

# Testing
npm run test:all            # All test suites
npm run test:unit          # Unit tests only
npm run test:coverage      # Coverage reports

# Production builds
npm run build:all
npm run build:backend
npm run build:storefront
npm run build:account
npm run build:ciam-ui

# Linting & formatting
npm run lint:all
npm run format:all
```

## 🔍 API Documentation

### CIAM Backend Endpoints
- **Base URL**: `http://localhost:8080`
- **OpenAPI Spec**: Available at `/api-docs` when running
- **Health Check**: `GET /health`

#### Key Endpoints:
```
POST /login                    # User authentication
POST /logout                   # User logout
POST /mfa/challenge           # Initiate MFA
POST /mfa/verify              # Verify MFA
POST /token/refresh           # Refresh tokens
GET  /session/verify          # Verify session
GET  /userinfo                # User information
GET  /sessions                # List user sessions
DELETE /sessions/{id}         # Revoke session
```

## 🛡️ Security Features

### Implemented Security Measures:
- ✅ **JWT Access Tokens**: Short-lived (15 min), in-memory storage
- ✅ **HttpOnly Refresh Tokens**: Secure cookies with rotation
- ✅ **Rate Limiting**: Login attempts, MFA attempts
- ✅ **CORS Protection**: Configured for local + production
- ✅ **Input Validation**: Comprehensive request validation
- ✅ **Error Handling**: Secure error responses
- ✅ **Session Management**: Multi-device session tracking
- ✅ **MFA Support**: OTP and Push notification flows

### What's Visible in Browser Network Tab:
- ✅ **Expected & Secure**: Access tokens, session IDs, user info
- 🔒 **Hidden & Secure**: Refresh tokens (HttpOnly cookies), JWT signing keys

## 📊 Testing & Quality

### Test Coverage
- **Unit Tests**: Jest + React Testing Library
- **Coverage Target**: >90% for all critical paths
- **Test Files**: `*.test.ts`, `*.test.tsx`

### Code Quality
- **TypeScript**: Strict mode across all projects
- **ESLint**: Configured for React + Node.js
- **Prettier**: Code formatting
- **Husky**: Pre-commit hooks

## 🚢 Production Deployment

### Before Production:
1. **Publish CIAM UI SDK to Nexus**:
   ```bash
   cd ciam-ui
   npm version patch
   npm publish --registry=https://your-nexus-registry
   ```

2. **Update Import Statements**:
   ```json
   // In storefront-web-app & account-servicing-web-app
   {
     "dependencies": {
       "ciam-ui": "^1.0.0"  // Instead of "file:../ciam-ui"
     }
   }
   ```

3. **Environment Configuration**:
   - Update `.env` files for production URLs
   - Configure HTTPS certificates
   - Set production JWT signing keys
   - Configure production CORS domains

### GitLab CI/CD
Each repository includes `.gitlab-ci.yml` for:
- Automated testing
- Security scanning
- Build optimization
- Deployment automation

## 🆘 Troubleshooting

### Common Issues:

**Port conflicts:**
```bash
# Check what's using ports
lsof -i :3000 -i :3001 -i :8080
# Kill processes if needed
kill -9 <PID>
```

**CORS errors:**
- Ensure all services are running
- Check `.env` files have correct URLs
- Verify browser isn't caching old requests

**Token issues:**
- Clear browser cookies and localStorage
- Check browser Network tab for 401 errors
- Verify CIAM backend is responding on port 8080

**Docker issues:**
```bash
# Reset Docker state
docker-compose down -v
docker-compose up --build --force-recreate
```

## 📚 Additional Resources

- [CIAM Backend README](./ciam-backend/README.md) - API implementation details
- [CIAM UI SDK README](./ciam-ui/README.md) - SDK integration guide
- [Storefront README](./storefront-web-app/README.md) - Storefront app details
- [Account Servicing README](./account-servicing-web-app/README.md) - Account app details

## 🤝 Team Ownership

| Repository | Team | Purpose |
|------------|------|---------|
| `ciam-backend` | CIAM Backend Team | Authentication API & business logic |
| `ciam-ui` | CIAM UI Team | Reusable authentication components |
| `storefront-web-app` | Storefront Team | Public-facing storefront application |
| `account-servicing-web-app` | Account Servicing Team | Secure account management |

---

**🚀 Ready to build secure, production-grade authentication experiences!**