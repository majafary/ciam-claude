# CIAM Security Best Practices

**Date**: October 9, 2025
**Status**: Active Guidelines
**Applies To**: All development and testing

---

## 🔐 Critical Security Rules

### 1. **NEVER Commit Authentication Credentials**

❌ **DO NOT commit these files:**
- `cookies.txt`, `*.cookies`, `*.cookie` - Cookie jar files
- `session.txt`, `*.session` - Session data
- `tokens.txt`, `*.tokens` - JWT or access tokens
- `*.pem`, `*.key` - Private keys (except `.key.example`)
- `.env` files (except `.env.example`)

✅ **These patterns are now in `.gitignore`**

### 2. **Testing with curl**

When testing authentication endpoints with curl, use temporary cookie storage:

```bash
# ❌ BAD - Creates tracked file
curl -c cookies.txt http://localhost:8080/auth/login

# ✅ GOOD - Use temp directory
curl -c /tmp/test-cookies.txt http://localhost:8080/auth/login

# ✅ BETTER - Use in-memory (no file)
curl -b <(echo "cookie=value") http://localhost:8080/protected
```

### 3. **JWT Token Handling**

**In Development:**
- Store JWTs only in httpOnly cookies (backend already configured ✅)
- Never log full JWT tokens
- Use short expiry times for testing

**Example - Safe Logging:**
```typescript
// ❌ BAD
console.log('Token:', token);

// ✅ GOOD
logger.info('Token generated', {
  userId: payload.sub,
  expiresIn: payload.exp
});
```

### 4. **Environment Variables**

**Always use `.env` for secrets:**

```bash
# .env (gitignored)
JWT_SECRET=your-super-secret-key-here
REFRESH_SECRET=another-secret-key

# .env.example (committed)
JWT_SECRET=your-secret-here
REFRESH_SECRET=your-refresh-secret-here
```

**In Code:**
```typescript
// ✅ GOOD
const secret = process.env.JWT_SECRET;

// ❌ BAD
const secret = "hardcoded-secret-123";
```

---

## 🚨 Incident Response - If Secrets Are Committed

If you accidentally commit sensitive data:

### Immediate Actions:

1. **Remove from current commit:**
   ```bash
   git rm --cached <filename>
   git commit -m "chore: remove sensitive file"
   ```

2. **Add to .gitignore:**
   ```bash
   echo "<filename>" >> .gitignore
   git add .gitignore
   git commit -m "chore: add sensitive patterns to gitignore"
   ```

3. **Rotate compromised secrets:**
   - Generate new JWT secrets
   - Invalidate all existing tokens
   - Update environment variables

4. **Clean git history (if needed):**
   ```bash
   # WARNING: Rewrites history, coordinate with team
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch <filename>" \
     --prune-empty --tag-name-filter cat -- --all
   ```

---

## 📋 Security Checklist for Developers

### Before Committing:

- [ ] No hardcoded credentials in code
- [ ] `.env` files are gitignored
- [ ] No JWT tokens in logs
- [ ] No cookie/session files tracked
- [ ] Private keys are gitignored
- [ ] Test data doesn't contain real credentials

### During Testing:

- [ ] Use `/tmp/` for temporary cookie files
- [ ] Test tokens expire quickly (< 15 minutes)
- [ ] Mock/test users only (no production data)
- [ ] Use `testuser`, `mfauser`, etc. (as configured)

### Code Review:

- [ ] Check for `console.log` with sensitive data
- [ ] Verify proper use of environment variables
- [ ] Ensure httpOnly cookies for tokens
- [ ] Confirm rate limiting is enabled

---

## 🛡️ Current Security Measures

### Already Implemented ✅

1. **Cookie Security:**
   - ✅ httpOnly cookies for refresh tokens
   - ✅ Secure flag for production
   - ✅ SameSite strict policy
   - ✅ Short-lived access tokens (15 min)

2. **Headers:**
   - ✅ Helmet.js security headers
   - ✅ CORS configured with whitelist
   - ✅ HSTS in production
   - ✅ X-Content-Type-Options: nosniff

3. **Rate Limiting:**
   - ✅ Login endpoint protected
   - ✅ MFA endpoint protected
   - ✅ Per-IP tracking

4. **Input Validation:**
   - ✅ Express validator middleware
   - ✅ JWT signature verification
   - ✅ Type checking with TypeScript

5. **Logging:**
   - ✅ Winston structured logging
   - ✅ Audit trail for auth events
   - ✅ Request correlation IDs

---

## 🔍 Security Audit Findings

### Resolved Issues ✅

1. **cookies.txt committed** - FIXED (Oct 9, 2025)
   - Removed from git
   - Added to .gitignore
   - Security patterns added

### Current Security Posture

**Risk Level**: 🟢 Low (Development/POC)

**Known Limitations** (acceptable for development):
- In-memory storage (data loss on restart)
- Test user credentials in code
- Mock JWT secrets (not production-grade)
- No encryption at rest

**For Production** (required before deployment):
- [ ] Migrate to Redis/PostgreSQL
- [ ] Use secure secret management (Vault, AWS Secrets Manager)
- [ ] Implement encryption at rest
- [ ] Add security monitoring/alerting
- [ ] Conduct penetration testing
- [ ] Set up WAF and DDoS protection

---

## 📚 References

### Internal Documentation
- [Code Analysis Report](./code-analysis-report.md)
- [Fixes Applied Summary](./fixes-applied-summary.md)

### Security Standards
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [NIST Authentication Guidelines](https://pages.nist.gov/800-63-3/)

### Tools
- `git-secrets` - Prevent committing secrets
- `trufflehog` - Find secrets in git history
- `gitleaks` - Detect hardcoded secrets

---

## 🚀 Quick Security Commands

```bash
# Check for accidentally committed secrets
git log -p | grep -i "secret\|password\|key" | head -20

# Find sensitive patterns in code
grep -r "password.*=.*['\"]" src/

# Check .gitignore is working
git status --ignored

# Verify no secrets in staged changes
git diff --cached | grep -i "secret\|password"
```

---

**Last Updated**: October 9, 2025
**Maintained By**: CIAM Security Team
**Review Frequency**: Monthly
