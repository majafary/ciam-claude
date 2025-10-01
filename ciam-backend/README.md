# CIAM Backend

CIAM (Customer Identity and Access Management) Backend API implementation providing secure authentication, MFA, session management, and OIDC-compliant endpoints.

## 🏗️ Architecture

This Express.js backend serves as a proxy and orchestration layer for the CIAM REST API, implementing:

- **Authentication**: Login/logout with comprehensive credential validation
- **Multi-Factor Authentication**: OTP and Push notification flows
- **Session Management**: Token refresh, session verification, multi-device support
- **OIDC Compliance**: Discovery endpoints, JWKS, token introspection
- **Security**: Rate limiting, CORS, refresh token rotation, input validation

## 🚀 Quick Start

### Prerequisites
- Node.js 22+
- npm 10+

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Server starts on `http://localhost:8080`

### Production
```bash
npm run build
npm start
```

## 🔧 Configuration

### Environment Variables (.env)
```bash
NODE_ENV=development
PORT=8080
JWT_SECRET=your-super-secret-jwt-key-for-development
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=14d
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000
```

## 📋 API Endpoints

### OpenAPI Specification

📘 **[View Full API Documentation (OpenAPI 3.0)](./openapi.yaml)**

Complete API specification available in OpenAPI 3.0 format:
- View in [Swagger Editor](https://editor.swagger.io/)
- Import into [Postman](https://www.postman.com/) or [Insomnia](https://insomnia.rest/)
- Generate client SDKs with [OpenAPI Generator](https://openapi-generator.tech/)

### Authentication
```
POST /login                    # User authentication
POST /logout                   # User logout
POST /revoke                   # Token revocation
POST /introspect              # Token introspection
```

### MFA (Multi-Factor Authentication)
```
POST /mfa/challenge           # Initiate MFA challenge
POST /mfa/verify              # Verify MFA response
GET  /mfa/transaction/{id}    # Get MFA transaction status
GET  /mfa/transaction/{id}/otp # Get OTP for testing
```

### Session Management
```
POST /token/refresh           # Refresh access tokens
GET  /session/verify          # Verify session validity
GET  /sessions                # List user sessions
DELETE /sessions/{id}         # Revoke specific session
```

### User Information
```
GET /userinfo                 # OIDC user information endpoint
```

### OIDC Discovery
```
GET /.well-known/openid-configuration  # OIDC discovery document
GET /jwks.json                         # JSON Web Key Set
```

### Health & Documentation
```
GET /health                   # Health check endpoint
GET /api-docs                 # Swagger API documentation
```

## 🧪 Test Scenarios

### Authentication Test Matrix

All test users use password: **`password`**

| Username | Expected Behavior |
|----------|------------------|
| `mfauser` | ✅ Login → MFA Required → Success |
| `trusteduser` | ✅ Instant login (device pre-trusted, skips MFA) |
| `lockeduser` | ❌ 423 Account Locked |
| `mfalockeduser` | ❌ 423 MFA Locked |
| `wronguser` | ❌ 401 Invalid Credentials |

### MFA Test Scenarios
- **OTP Success**: Login with `mfauser`, select "Text Message (OTP)", enter `1234`
- **OTP Failure**: Enter any code other than `1234`
- **Push Success**: Login with `mfauser`, select "Push Notification", auto-approves after 3 seconds
- **Push Failure**: Login with `pushfail`, select "Push Notification", auto-rejects after 7 seconds
- **Push Timeout**: Login with `pushexpired`, select "Push Notification", times out after 10 seconds

### API Testing with curl

#### 1. Login Flow
```bash
# Login
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"mfauser","password":"password"}' \
  -c cookies.txt

# MFA Initiate
curl -X POST http://localhost:8080/auth/mfa/initiate \
  -H "Content-Type: application/json" \
  -d '{"username":"mfauser","method":"otp","transactionId":"tx-123"}'

# MFA Verify
curl -X POST http://localhost:8080/auth/mfa/verify \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"tx-123","otp":"1234"}' \
  -c cookies.txt
```

#### 2. Token Usage
```bash
# Get user info (requires access token from login response)
curl -X GET http://localhost:8080/userinfo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Refresh tokens
curl -X POST http://localhost:8080/auth/refresh \
  -b cookies.txt \
  -c cookies.txt
```

#### 3. eSign Flow
```bash
# Get eSign document
curl -X GET http://localhost:8080/esign/document/terms-v1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Accept eSign
curl -X POST http://localhost:8080/esign/accept \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"tx-123","documentId":"terms-v1"}'
```

## 🔒 Security Features

### Implemented Security Measures
- ✅ **JWT Access Tokens**: RSA-signed, 15-minute expiry
- ✅ **Refresh Token Rotation**: HttpOnly cookies with automatic rotation
- ✅ **Rate Limiting**: Configurable limits on sensitive endpoints
- ✅ **CORS Protection**: Whitelist-based origin validation
- ✅ **Input Validation**: Comprehensive request validation with express-validator
- ✅ **Helmet Security Headers**: XSS protection, HSTS, CSP
- ✅ **Session Revocation**: Individual and bulk session management
- ✅ **Account Lockout**: Configurable lockout scenarios

### Security Headers Applied
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

### Token Security Model
- **Access Tokens**: Stored in memory by clients, short-lived
- **Refresh Tokens**: HttpOnly cookies, automatically rotated
- **Session IDs**: Public identifiers, safe for client-side storage
- **JWT Keys**: Server-side only, RSA key pair for signing/verification

## 🧪 Testing

### Running Tests
```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:coverage      # Coverage report
npm run test:watch         # Watch mode
```

### Test Coverage
- **Controllers**: Authentication, MFA, Session, User endpoints
- **Services**: Token service, session service, MFA service
- **Middleware**: Authentication, rate limiting, validation
- **Utilities**: JWT handling, password validation, error formatting

### Test Files Structure
```
src/__tests__/
├── unit/
│   ├── controllers/        # Endpoint logic tests
│   ├── services/          # Business logic tests
│   ├── middleware/        # Middleware tests
│   └── utils/             # Utility function tests
└── integration/           # Full flow tests
```

## 📊 Logging & Monitoring

### Winston Logger Configuration
- **Development**: Console output with colors
- **Production**: JSON format for log aggregation
- **Log Levels**: error, warn, info, debug
- **Request Logging**: All HTTP requests with timing

### Health Check
`GET /health` returns:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-24T10:30:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "1.0.0"
}
```

## 🔧 Development

### Code Quality
```bash
npm run lint              # ESLint checking
npm run lint:fix         # Auto-fix linting issues
npm run format           # Prettier formatting
npm run format:check     # Check formatting
npm run type-check       # TypeScript type checking
```

### Pre-commit Hooks
- ESLint validation
- Prettier formatting
- TypeScript compilation
- Test execution

### Project Structure
```
src/
├── controllers/          # Route handlers
├── middleware/          # Express middleware
├── services/           # Business logic
├── types/              # TypeScript definitions
├── utils/              # Helper functions
├── __tests__/          # Test suites
└── index.ts            # Application entry point
```

## 🚢 Production Deployment

### Build Process
```bash
npm run build           # TypeScript compilation
npm start               # Start production server
```

### Environment Setup
1. **JWT Keys**: Generate RSA key pair for production
2. **Database**: Configure production data storage
3. **CORS**: Update origins for production domains
4. **Rate Limiting**: Adjust limits for production traffic
5. **Logging**: Configure log aggregation service

### Docker Support
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 8080
CMD ["npm", "start"]
```

## 🆘 Troubleshooting

### Common Issues

**JWT Token Issues**:
- Verify JWT_SECRET is set correctly
- Check token expiry times
- Validate token format in Authorization header

**CORS Problems**:
- Ensure client origins are in CORS_ORIGINS
- Check preflight OPTIONS requests
- Verify credentials: 'include' in client requests

**Rate Limit Exceeded**:
- Check RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS
- Clear rate limit state in development
- Verify client isn't making excessive requests

**Cookie Issues**:
- Ensure SameSite settings match deployment
- Check Secure flag for HTTPS environments
- Verify Domain setting for subdomain usage

### Debug Mode
```bash
DEBUG=ciam:* npm run dev
```

## 📚 API Documentation

### Swagger UI
Available at `http://localhost:8080/api-docs` when running

### OpenAPI Specification
Full OpenAPI 3.0.3 specification with:
- Complete endpoint documentation
- Request/response schemas
- Authentication flows
- Error response formats
- Example requests and responses

---

**🔐 Built for production security with development-friendly features!**