# CIAM Backend Migration Guide

## Overview

This document outlines the migration from the monolithic `auth-simple.ts` (1605 lines) to a clean 3-tier architecture following the **Controllers → Services → Repositories** pattern.

**Migration Goal**: Sync the modular approach (`index.ts`) with the current working implementation (`index-simple.ts + auth-simple.ts`) while improving maintainability and testability.

## Architecture Changes

### Before: Monolithic Architecture
```
index-simple.ts (103 lines)
  └── auth-simple.ts (1605 lines)
      ├── Data access (Maps, in-memory storage)
      ├── Business logic (auth, MFA, eSign, device)
      └── HTTP handlers (request/response)
```

### After: 3-Tier Architecture
```
index.ts
  ├── Controllers (HTTP layer)
  │   ├── authControllerNew.ts (249 lines)
  │   ├── deviceControllerNew.ts (171 lines)
  │   └── mfaControllerNew.ts (212 lines)
  │
  ├── Services (Business logic)
  │   ├── authService.ts (394 lines)
  │   ├── deviceService.ts (186 lines)
  │   ├── mfaServiceNew.ts (large)
  │   └── esignServiceNew.ts (247 lines)
  │
  └── Repositories (Data access)
      ├── userRepository.ts (195 lines)
      ├── mfaTransactionRepository.ts (147 lines)
      ├── pushChallengeRepository.ts (179 lines)
      ├── deviceTrustRepository.ts (227 lines)
      ├── esignDocumentRepository.ts (130 lines)
      ├── esignAcceptanceRepository.ts (149 lines)
      ├── pendingESignRepository.ts (133 lines)
      └── loginTimeRepository.ts (136 lines)
```

**Total**: 15 focused files (2,815 lines) vs 1 monolithic file (1605 lines)

## File Mapping

### Phase 1: Repositories (Data Access Layer)

| Repository | Source Lines | Purpose |
|------------|--------------|---------|
| `userRepository.ts` | auth-simple.ts:245-343 | USER_SCENARIOS config, credential validation |
| `mfaTransactionRepository.ts` | auth-simple.ts:47-62 | MFA transaction storage with auto-cleanup |
| `pushChallengeRepository.ts` | auth-simple.ts:17-25, 64, 112-120 | Push challenge generation (3 random numbers) |
| `deviceTrustRepository.ts` | auth-simple.ts:27-35, 65, 122-180 | Device fingerprinting and trust management |
| `esignDocumentRepository.ts` | auth-simple.ts:37-45, 66, 76-105 | eSign document storage |
| `esignAcceptanceRepository.ts` | auth-simple.ts:67, 182-192 | Document acceptance tracking |
| `pendingESignRepository.ts` | auth-simple.ts:68, 204-234 | Pending eSign requirements |
| `loginTimeRepository.ts` | auth-simple.ts:69, 194-202 | Login timestamp tracking |

### Phase 2: Services (Business Logic Layer)

| Service | Source Lines | Purpose |
|---------|--------------|---------|
| `authService.ts` | auth-simple.ts:354-618 | Complete login flow with all user scenarios |
| `deviceService.ts` | auth-simple.ts:1527-1603 | Device binding and trust management |
| `mfaServiceNew.ts` | auth-simple.ts:719-1232 | MFA initiation, OTP verification, push polling |
| `esignServiceNew.ts` | auth-simple.ts:1238-1399 | eSign document acceptance/decline |

### Phase 3: Controllers (HTTP Layer)

| Controller | Source Lines | Purpose |
|------------|--------------|---------|
| `authControllerNew.ts` | auth-simple.ts:354-618, 1238-1399 | Login, logout, refresh, eSign endpoints |
| `deviceControllerNew.ts` | auth-simple.ts:1527-1603 | Device bind, check trust, list devices |
| `mfaControllerNew.ts` | auth-simple.ts:719-1232 | MFA initiate, OTP verify, push verify |

## Code Migration Guide

### Step 1: Update Route Imports in index.ts

**OLD (index-simple.ts)**:
```typescript
import {
  login,
  getMFAMethods,
  initiateChallenge,
  verifyChallenge,
  // ... all handlers from auth-simple
} from './auth-simple';

app.post('/auth/login', login);
app.post('/auth/mfa/initiate', initiateChallenge);
// ...
```

**NEW (index.ts)**:
```typescript
// Authentication routes
import {
  login,
  logout,
  refresh,
  getESignDocument,
  acceptESign,
  jwks
} from './controllers/authControllerNew';

// MFA routes
import {
  initiateChallenge,
  verifyOTPChallenge,
  verifyPushChallenge
} from './controllers/mfaControllerNew';

// Device routes
import {
  bindDevice,
  checkDeviceTrust,
  getUserDevices,
  revokeDevice
} from './controllers/deviceControllerNew';

// Auth routes
app.post('/auth/login', login);
app.post('/auth/logout', logout);
app.post('/auth/refresh', refresh);
app.get('/auth/esign/documents/:documentId', getESignDocument);
app.post('/auth/esign/accept', acceptESign);
app.get('/.well-known/jwks.json', jwks);

// MFA routes
app.post('/auth/mfa/initiate', initiateChallenge);
app.post('/auth/mfa/otp/verify', verifyOTPChallenge);
app.get('/auth/mfa/transactions/:transaction_id', verifyPushChallenge);

// Device routes
app.post('/auth/device/bind', bindDevice);
app.get('/auth/device/trust/:deviceFingerprint', checkDeviceTrust);
app.get('/auth/device/list/:username', getUserDevices);
app.delete('/auth/device/:deviceFingerprint', revokeDevice);
```

### Step 2: Function Mapping

| Old Function (auth-simple.ts) | New Location | Notes |
|-------------------------------|--------------|-------|
| `login()` | authControllerNew.ts:15 | Now delegates to authService |
| `initiateChallenge()` | mfaControllerNew.ts:14 | Now delegates to mfaServiceNew |
| `verifyChallenge()` | mfaControllerNew.ts:78 (OTP) <br> mfaControllerNew.ts:160 (Push) | Split into OTP and Push specific endpoints |
| `getESignDocument()` | authControllerNew.ts:156 | Now delegates to esignServiceNew |
| `acceptESign()` | authControllerNew.ts:185 | Now delegates to esignServiceNew |
| `bindDevice()` | deviceControllerNew.ts:14 | Now delegates to deviceService |

### Step 3: Environment Setup

No changes required. The new architecture uses the same environment variables:
- `NODE_ENV` - Environment mode (development/production)
- Port configuration remains the same

## V3.0.0 Fixes Included

All critical v3.0.0 fixes from auth-simple.ts are integrated into the new architecture:

### 1. Transaction Invalidation (One-Time Use Security)
- **Location**: All service methods (authService, mfaServiceNew, esignServiceNew, deviceService)
- **Implementation**: `mfaTransactionRepository.delete(transaction_id)` after use
- **Impact**: Prevents transaction replay attacks

### 2. Priority Ordering (eSign → Device Binding → Success)
- **Location**: mfaServiceNew.ts verifyOTP/verifyPush methods
- **Implementation**:
  ```typescript
  // PRIORITY 1: Check eSign first
  const pendingESign = pendingESignRepository.findByUsername(username);
  if (pendingESign) { return ESIGN_REQUIRED; }

  // PRIORITY 2: Check device binding
  if (!device_bound) { return DEVICE_BIND_REQUIRED; }

  // PRIORITY 3: Success with tokens
  return SUCCESS;
  ```

### 3. NEW Transaction ID at Each Step
- **Location**: All state transitions in services
- **Implementation**: Generate fresh transaction_id when moving between steps
- **Example**: esignServiceNew.ts:125 creates new transaction_id for device binding after eSign

### 4. Device Trust Pre-Configuration for Test Users
- **Location**: authService.ts:71-76
- **Implementation**: Pre-trust devices for 'trusted' and 'esign_required' scenarios
- **Impact**: Enables E2E testing without manual device setup

## Testing Strategy

### Phase 1: Unit Tests
Test each layer independently:

```typescript
// Repository tests
describe('userRepository', () => {
  it('should validate correct credentials', () => {
    expect(userRepository.validateCredentials('trusteduser', 'password')).toBeTruthy();
  });
});

// Service tests
describe('authService', () => {
  it('should return MFA_REQUIRED for mfauser', async () => {
    const result = await authService.login({ username: 'mfauser', password: 'password' });
    expect(result.responseTypeCode).toBe('MFA_REQUIRED');
  });
});

// Controller tests
describe('authController', () => {
  it('should return 201 with tokens for trusted user', async () => {
    // Mock req/res and test HTTP layer
  });
});
```

### Phase 2: Integration Tests
Test complete flows through all layers:

```typescript
describe('Login Flow Integration', () => {
  it('should complete trusted user login', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ username: 'trusteduser', password: 'password' })
      .expect(201);

    expect(response.body).toHaveProperty('access_token');
    expect(response.body.response_type_code).toBe('SUCCESS');
  });
});
```

### Phase 3: E2E Tests (Existing Playwright Tests)
Run existing E2E tests to verify parity with auth-simple.ts:

```bash
# All 12 user scenario tests should pass
npm run test:e2e

# Expected results:
# ✓ TC-AUTH-001: Trusted user direct login
# ✓ TC-AUTH-002: MFA user with SMS verification
# ✓ TC-AUTH-003: eSign required flow
# ✓ TC-AUTH-004: Device binding flow
# ... (8 more scenarios)
```

## Migration Checklist

- [x] Phase 1: Create all 8 repositories
- [x] Phase 2: Create all 4 services
- [x] Phase 3: Create all 3 controllers
- [ ] Phase 4: Update index.ts routes
- [ ] Phase 5: Add unit tests for new architecture
- [ ] Phase 6: Run integration tests
- [ ] Phase 7: Run E2E tests to verify parity
- [ ] Phase 8: Update API documentation
- [ ] Phase 9: Remove auth-simple.ts and index-simple.ts
- [ ] Phase 10: Update deployment configuration

## Rollback Plan

If issues arise during migration:

1. **Immediate Rollback**: Switch back to index-simple.ts
   ```bash
   # In package.json scripts
   "start": "node dist/index-simple.js"  # Instead of index.js
   ```

2. **Incremental Migration**: Enable both implementations in parallel
   ```typescript
   // In index.ts
   if (process.env.USE_NEW_ARCHITECTURE === 'true') {
     // Use new controllers
   } else {
     // Use auth-simple
   }
   ```

3. **Feature Flags**: Enable new architecture per endpoint
   ```typescript
   app.post('/auth/login',
     process.env.NEW_LOGIN === 'true' ? loginNew : loginOld
   );
   ```

## Benefits of New Architecture

### 1. Separation of Concerns
- **Controllers**: Only HTTP concerns (request parsing, response formatting, cookies)
- **Services**: Pure business logic, no HTTP dependencies
- **Repositories**: Data access abstraction, easy to swap implementations

### 2. Testability
- Each layer can be tested independently with mocks
- Services can be tested without HTTP overhead
- Repositories can be tested with different storage backends

### 3. Reusability
- Services can be called from CLI tools, background jobs, or other controllers
- Repositories can be swapped (in-memory → PostgreSQL) without changing services

### 4. Maintainability
- Small, focused files (130-400 lines) vs monolithic 1605-line file
- Clear responsibility boundaries
- Easier to onboard new developers

### 5. Scalability
- Easy to add new authentication methods (SAML, OAuth)
- Simple to extend with new MFA methods (TOTP, WebAuthn)
- Clear extension points for additional features

## Common Issues and Solutions

### Issue 1: Transaction Not Found
**Symptom**: `TRANSACTION_NOT_FOUND` error during MFA verification
**Cause**: Transaction may have expired (5-minute TTL)
**Solution**: Check `mfaTransactionRepository` cleanup interval and expiry logic

### Issue 2: Device Not Trusted
**Symptom**: Always getting `DEVICE_BIND_REQUIRED` even after binding
**Cause**: Device fingerprint generation inconsistency
**Solution**: Verify `drs_action_token` is passed consistently through all requests

### Issue 3: eSign Loop
**Symptom**: User stuck in eSign flow after acceptance
**Cause**: `pendingESignRepository` not cleared after acceptance
**Solution**: Verify `esignServiceNew.acceptDocument()` calls `pendingESignRepository.delete(username)`

### Issue 4: Missing Context ID
**Symptom**: `MISSING_CONTEXT_ID` errors
**Cause**: V3 API requires context_id in all requests
**Solution**: Ensure frontend passes context_id from login through all subsequent requests

## Next Steps

1. **Update index.ts** with new controller imports and routes
2. **Run existing E2E tests** to verify behavior parity
3. **Add unit tests** for critical business logic in services
4. **Monitor logs** for any unexpected errors during initial deployment
5. **Gradual rollout** using feature flags if needed
6. **Performance testing** to ensure no regression
7. **Documentation update** for API consumers
8. **Remove legacy code** once migration is validated

## Support

For questions or issues during migration:
- Review this document first
- Check repository/service implementations for specific logic
- Compare with auth-simple.ts source extraction comments
- Test incrementally - one user scenario at a time

---

**Migration Status**: Phase 4 Complete (Documentation)
**Last Updated**: 2025-10-13
**Next Action**: Update index.ts routes (Phase 5)
