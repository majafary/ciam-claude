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

### 📊 Interactive Architecture Diagrams

**View detailed C4 model diagrams interactively:**

```bash
# Start diagram viewer
docker-compose -f docker-compose.structurizr.yml up

# Open browser: http://localhost:8081
```

**Navigate through architecture levels:**
- **System Context** → High-level view (users, CIAM suite, external systems)
- **Container Diagram** → Applications and databases with technology stack
- **Component Diagrams** → Internal structure of backend and UI SDK

**Documentation:** See [docs/architecture/README.md](docs/architecture/README.md) for complete guide

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

All test users use password: **`password`** (except where noted)

#### ✅ Trusted Device Flows (2 users)

| Username           | Expected Behavior                             |
| ------------------ | --------------------------------------------- |
| `trusteduser`      | Instant login (device pre-trusted, skips MFA) |
| `trustedesignuser` | Device trusted → eSign dialog → Success       |

#### ✅ MFA Flows (5 users)

| Username      | Expected Behavior                              |
| ------------- | ---------------------------------------------- |
| `mfauser`     | MFA (OTP/Push) → Device Bind Dialog → Success  |
| `pushfail`    | MFA → Push auto-rejects after 7s               |
| `pushexpired` | MFA → Push times out after 10s (stays PENDING) |
| `otponlyuser` | MFA with **OTP only** (no Push option)         |
| `pushonlyuser`| MFA with **Push only** (no OTP option)         |

#### ✅ Compliance Flow (1 user)

| Username         | Expected Behavior                                |
| ---------------- | ------------------------------------------------ |
| `complianceuser` | Login → eSign required (updated terms) → Success |

#### ✅ MFA + eSign Flows (1 user)

| Username       | Expected Behavior                          |
| -------------- | ------------------------------------------ |
| `mfaesignuser` | MFA → eSign dialog → Device Bind → Success |

#### ✅ Device Trust Edge Cases (1 user)

| Username           | Expected Behavior                   |
| ------------------ | ----------------------------------- |
| `expiredtrustuser` | Device trust expired → MFA required |

#### ❌ Error Scenarios (3 examples)

| Username/Input  | Password    | Expected Behavior                       |
| --------------- | ----------- | --------------------------------------- |
| `lockeduser`    | `password`  | Account temporarily locked error        |
| `mfalockeduser` | `password`  | MFA locked error (call support message) |
| `wronguser`     | `password`  | Invalid credentials error               |
| `mfauser`       | `wrongpass` | Invalid credentials error               |
| (empty)         | (empty)     | Missing credentials error               |

**Total Test Users: 12** | All use password: `password`

### MFA Test Scenarios

#### **Complete MFA Flow Testing**

1. **Method Selection Dialog**: When MFA is required, users see a dialog to choose:
   - **Text Message (OTP)**: Enter code `1234` for success
   - **Push Notification**: Auto-approves after 3 seconds for demo

#### **OTP Method Testing**

- Login with `mfauser` → Select "Text Message (OTP)" → Enter `1234` → ✅ Success
- Login with `mfauser` → Select "Text Message (OTP)" → Enter wrong code → ❌ Failed

#### **Push Method Testing**

- Login with `mfauser` → Select "Push Notification" → Auto-success after 5 seconds
- Login with `pushfail` → Select "Push Notification" → Auto-reject after 7 seconds
- Login with `pushexpired` → Select "Push Notification" → Timeout after 10 seconds

#### **Single-Method MFA Testing**

Test MFA dialog when only one authentication method is available:

- **OTP Only**: Login with `otponlyuser` → No method selection dialog → **Direct to OTP entry** → Enter `1234` → Success
- **Push Only**: Login with `pushonlyuser` → No method selection dialog → **Direct to Push waiting screen** → Auto-success after 3 seconds

These users help test the UX when only one MFA method is configured for a user (e.g., user hasn't enrolled in Push, or org policy restricts to OTP only).

### Device Binding (Trust This Device) Testing

After completing MFA, users are offered the option to trust their device for 10 years:

#### **Device Binding Flow**

1. Login with `mfauser` → Complete MFA (OTP or Push)
2. **Device Bind Dialog appears**: "Trust this device?"
3. Click **"Trust This Device"**: Device fingerprint saved, future logins skip MFA
4. Click **"Not Now"**: Normal flow continues, MFA required on next login

#### **Trusted Device Flow**

1. Login with `mfauser` after trusting device
2. **Instant login** - No MFA challenge (device is trusted)
3. Or use `trusteduser` which has pre-configured trusted device

#### **Device Fingerprinting (DRS)**

- Uses browser characteristics (User-Agent, platform, language) to generate unique device IDs
- Simulates Transmit Security DRS (Device Recognition Service)
- Trust duration: **10 years** (3650 days)
- Format: `device_<random>_<hash>`

### Electronic Signature (eSign) Testing

Some users require acceptance of terms and conditions:

#### **eSign After MFA Flow**

1. Login with `mfaesignuser` / `password`
2. Complete MFA verification
3. **eSign Dialog appears** with Terms of Service
4. Click **"Accept"** → Device bind dialog → Success
5. Terms are recorded with timestamp and IP

#### **Trusted Device + eSign**

1. Login with `trustedesignuser` / `password`
2. Device is trusted (no MFA)
3. **eSign Dialog appears** directly
4. Accept terms → Success login

## 📋 Testing All Use Cases

### 1. **Storefront MFA Flow Testing**

```bash
# Visit: http://localhost:3000
1. Click login in navigation
2. Enter: mfauser / password
3. See MFA method selection dialog with OTP and Push options
4. Select "Text Message (OTP)" → Enter code 1234 → Success
5. See user info in nav + "View My Account" link
6. Click "View My Account" → Navigate to Account Servicing
```

### 2. **Push Notification Testing**

```bash
# Visit: http://localhost:3000
1. Click login in navigation
2. Enter: mfauser / password
3. See MFA method selection dialog
4. Select "Push Notification"
5. Wait 3 seconds → Auto-approved → Success login
6. See user authenticated state
```

### 3. **Direct Account Servicing Access**

```bash
# Visit: http://localhost:3001 (not logged in)
1. Should redirect to CIAM login page
2. Login with mfauser / password
3. Complete MFA method selection → Success
4. Redirect back to Account Servicing
5. See account balances and user info
```

### 4. **Account Locked Scenario**

```bash
# Test account security
1. Try login with: lockeduser / password
2. Should see "Account is temporarily locked" error message
3. Error alert should be visible in UI
```

### 5. **MFA Locked Scenario**

```bash
# Test MFA security
1. Login with: mfalockeduser / password
2. Should see "MFA locked" error immediately
3. Message includes call center instructions
```

### 6. **Session Management**

```bash
# Test multi-session features
1. Login successfully in one browser/tab
2. Visit Account Servicing → "Active Sessions" section
3. Login from different browser/device simulation
4. Use "Sign out other devices" functionality
```

### 7. **Token Refresh Testing**

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

### OpenAPI Specification

📘 **[View Full API Documentation (OpenAPI 3.0)](./ciam-backend/changes/10072025/001/openapi_v3.yaml)**

The complete API specification is available in OpenAPI 3.0 format. You can:

- View it in [Swagger Editor](https://editor.swagger.io/) - paste the YAML content
- Use tools like [Postman](https://www.postman.com/) or [Insomnia](https://insomnia.rest/) to import and test endpoints
- Generate client SDKs using [OpenAPI Generator](https://openapi-generator.tech/)

### CIAM Backend Endpoints

- **Base URL**: `http://localhost:8080`
- **API Documentation**: `GET /api-docs` (Swagger UI)
- **Health Check**: `GET /health`

#### OIDC Discovery Endpoints:

```
GET  /.well-known/openid-configuration  # OIDC Discovery document
GET  /.well-known/jwks.json            # JSON Web Key Set for token verification
```

#### Authentication Endpoints:

```
POST /auth/login                        # User authentication
POST /auth/logout                       # User logout
POST /auth/refresh                      # Refresh access token
```

#### MFA Endpoints:

```
POST /auth/mfa/initiate                            # Initiate MFA challenge (OTP or Push)
POST /auth/mfa/otp/verify                          # Verify OTP code
POST /auth/mfa/transactions/{transaction_id}       # Poll push notification status (POST-based polling)
POST /auth/mfa/transactions/{transaction_id}/approve # Approve push notification (mobile device)
```

#### Device Management:

```
POST /auth/device/bind                  # Bind/trust device
```

#### Electronic Signature:

```
GET  /auth/esign/documents/{document_id} # Get eSign document
POST /auth/esign/accept                  # Accept eSign document
```

#### Session Management:

```
GET  /auth/sessions/{session_id}/verify # Verify session validity
GET  /auth/sessions                     # List user's active sessions (requires authentication)
DELETE /auth/sessions/{session_id}      # Revoke specific session (requires authentication)
```

## 🛡️ Security Features

### Implemented Security Measures:

- ✅ **JWT Access Tokens**: Short-lived (15 min), in-memory storage
- ✅ **HttpOnly Refresh Tokens**: Secure cookies with rotation
- ✅ **Multi-Factor Authentication**: OTP and Push notification methods
- ✅ **Device Recognition (DRS)**: Browser fingerprinting for trusted devices
- ✅ **Device Binding**: 10-year trust duration for recognized devices
- ✅ **Electronic Signatures**: Terms acceptance with audit trail
- ✅ **Rate Limiting**: Login attempts, MFA attempts
- ✅ **CORS Protection**: Configured for local + production
- ✅ **Input Validation**: Comprehensive request validation
- ✅ **Error Handling**: Secure error responses
- ✅ **Session Management**: Multi-device session tracking

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
       "ciam-ui": "^1.0.0" // Instead of "file:../ciam-ui"
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

## 🚀 Recent Improvements

### Architecture Optimizations

- **✅ Eliminated Redundant API Calls**: eSign status now included directly in `/auth/mfa/verify` response (removed `/auth/post-mfa-check` call)
- **✅ Simplified Compliance Flow**: Compliance users now return `ESIGN_REQUIRED` directly instead of requiring follow-up `/auth/post-login-check` call
- **✅ Provider-Level Dialog Management**: DeviceBindDialog moved to CiamProvider for persistence across component unmounts
- **✅ Improved Response Structure**: Consistent `responseTypeCode` pattern across all authentication endpoints

### Performance Enhancements

- **Reduced Network Calls**: Authentication flow now uses 2 fewer API calls (MFA flow + compliance flow optimizations)
- **Faster User Experience**: Eliminated redundant eSign check delays
- **Better State Management**: Dialog state persists through navigation and component lifecycle changes

### Developer Experience

- **Better TypeScript Types**: Updated response interfaces for accuracy
- **Clearer API Contracts**: Deprecated endpoints clearly marked
- **Comprehensive Test Users**: Expanded test matrix with device binding and eSign scenarios

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

**Device trust not working:**

- Device fingerprints are stored in-memory (reset on backend restart)
- Clear browser cache if device binding seems stuck
- Check browser console for device fingerprint logs
- Device trust lasts 10 years but stored in-memory for demo

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

| Repository                  | Team                   | Purpose                              |
| --------------------------- | ---------------------- | ------------------------------------ |
| `ciam-backend`              | CIAM Backend Team      | Authentication API & business logic  |
| `ciam-ui`                   | CIAM UI Team           | Reusable authentication components   |
| `storefront-web-app`        | Storefront Team        | Public-facing storefront application |
| `account-servicing-web-app` | Account Servicing Team | Secure account management            |

---

**🚀 Ready to build secure, production-grade authentication experiences!**
