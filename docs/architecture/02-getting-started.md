# Getting Started

## For Developers

### Local Development Setup

Start all services:
```bash
npm run dev:all
```

Individual services:
```bash
npm run dev:backend    # Port 8080
npm run dev:storefront # Port 3000
npm run dev:account    # Port 3001
```

### Service Endpoints

- **Backend API**: http://localhost:8080
- **Storefront**: http://localhost:3000
- **Account App**: http://localhost:3001
- **Architecture Diagrams**: http://localhost:8081

## Authentication Flow

1. User submits credentials via CIAM UI SDK
2. SDK sends POST request to `/api/auth/login`
3. Backend validates credentials against LDAP
4. Backend generates JWT tokens (access, refresh, ID)
5. Backend evaluates device trust via Transmit DRS
6. If MFA required, backend initiates MFA flow
7. Tokens returned to SDK and stored in session
8. SDK updates authentication context for React app

## Database Schema

### Core Tables

- `auth_contexts` - Authentication journey containers
- `auth_transactions` - Event log for each auth step
- `sessions` - Active user sessions
- `tokens` - JWT tokens with rotation tracking
- `trusted_devices` - Device binding records
- `drs_evaluations` - Device risk assessments
- `audit_logs` - Partitioned audit trail (monthly)

## Running Tests

```bash
# All tests
npm test

# Specific workspace
npm test --workspace=packages/ciam-backend
npm test --workspace=packages/ciam-ui

# With coverage
npm test -- --coverage
```
