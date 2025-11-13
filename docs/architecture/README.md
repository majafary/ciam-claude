# CIAM Architecture Documentation

Interactive C4 model architecture diagrams for the CIAM Integration Suite.

## 🎯 What's Here

This directory contains **living architecture documentation** using the C4 model:

- **workspace.dsl**: C4 diagrams as code (System Context, Container, Component levels)
- **TEMPLATE.dsl**: Template for other teams to copy
- **TEAM_ONBOARDING.md**: Guide for teams adopting this approach

## 📊 Architecture Diagrams

### Level 1: System Context
**Who uses this**: Everyone (executives, product managers, developers)

Shows the big picture:
- Users: Customers and Support Agents
- CIAM Suite (our system)
- External systems: LDAP, Transmit DRS, PostgreSQL

### Level 2: Container Diagram
**Who uses this**: Technical teams, architects, DevOps

Shows applications and databases:
- **CIAM Backend**: Node.js Express API (Port 8080)
- **CIAM UI SDK**: React component library
- **Storefront Web App**: Public e-commerce site (Port 3000)
- **Account Servicing App**: Secure account management (Port 3001)
- **PostgreSQL Database**: User data, sessions, audit logs

### Level 3: Component Diagrams
**Who uses this**: Developers working on specific services

**CIAM Backend Components:**
- **Controllers**: Auth, MFA, Device, Session, User, OIDC
- **Services**: Token, MFA, Device, Session, ESign, User
- **Repositories**: Data access layer for all tables
- **Middleware**: Authentication, rate limiting

**CIAM UI Components:**
- **Context**: CiamProvider for authentication state
- **Components**: Login, MFA dialogs, Device binding, eSign, Protected routes
- **Hooks**: useAuth, useMfa for state management
- **Services**: AuthService HTTP client

## 🚀 View Diagrams

### Option 1: Local Viewing with Docker (Recommended)

**Start the interactive diagram viewer:**
```bash
# From project root
docker-compose -f docker-compose.structurizr.yml up
```

**Open your browser:**
```
http://localhost:8081
```

**Navigate the diagrams:**
1. **System Context**: Click on "CIAM Integration Suite" box
2. **Containers**: Click on any container (e.g., "CIAM Backend")
3. **Components**: See internal structure of services

**Stop the server:**
```bash
docker-compose -f docker-compose.structurizr.yml down
```

---

### Option 2: Edit and Preview

**Edit diagrams:**
```bash
# Open in your editor
code docs/architecture/workspace.dsl
```

**Preview changes:**
```bash
# Start Structurizr (watches for file changes)
docker-compose -f docker-compose.structurizr.yml up

# Make changes to workspace.dsl
# Refresh browser to see updates
```

---

## 📝 Making Changes

### When to Update Diagrams

**Update workspace.dsl when you:**
- ✅ Add a new service/container
- ✅ Change technology stack (e.g., switch database)
- ✅ Add external system integration
- ✅ Add major components (new controller, service)
- ✅ Remove deprecated services

**Don't update for:**
- ❌ Small bug fixes
- ❌ Individual function changes
- ❌ UI styling tweaks

### How to Update

1. **Edit workspace.dsl**
   ```bash
   code docs/architecture/workspace.dsl
   ```

2. **Test locally**
   ```bash
   docker-compose -f docker-compose.structurizr.yml up
   open http://localhost:8081
   ```

3. **Commit changes**
   ```bash
   git add docs/architecture/workspace.dsl
   git commit -m "docs: update architecture diagram - add device fingerprinting service"
   git push
   ```

4. **GitHub Actions validates automatically**
   - Workflow runs on push
   - Validates DSL syntax
   - Generates preview diagrams

---

## 🏗️ Architecture Overview

### System Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌────────────┐
│  Customer   │────────▶│  Storefront App  │────────▶│            │
└─────────────┘         │  (Port 3000)     │         │            │
                        └──────────────────┘         │            │
┌─────────────┐         ┌──────────────────┐         │   CIAM     │         ┌──────────┐
│   Support   │────────▶│   Account App    │────────▶│  Backend   │────────▶│PostgreSQL│
│   Agent     │         │  (Port 3001)     │         │ (Port 8080)│         │ Database │
└─────────────┘         └──────────────────┘         │            │         └──────────┘
                                 │                    │            │              │
                                 │                    └────────────┘              │
                                 │                          │                     │
                                 ▼                          │                     │
                        ┌──────────────────┐               │                     │
                        │   CIAM UI SDK    │───────────────┘                     │
                        │  (npm package)   │                                     │
                        └──────────────────┘                                     │
                                                               ┌──────────────────┴─────┐
                                                               │                        │
                                                               ▼                        ▼
                                                         ┌──────────┐            ┌──────────┐
                                                         │   LDAP   │            │Transmit  │
                                                         │Directory │            │   DRS    │
                                                         └──────────┘            └──────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18.2, TypeScript 5.2, Material-UI 5.14 | Web UIs and SDK |
| Backend | Node.js 22+, Express 4.18, TypeScript | REST API |
| Database | PostgreSQL 14+ | Data persistence |
| Build | Vite 4.5, npm workspaces | Development & bundling |
| Deployment | Docker, Docker Compose | Containerization |
| Testing | Jest, React Testing Library | Unit & integration tests |

---

## 🔐 Security Architecture

### Authentication Flow

1. **User login** → Storefront/Account App
2. **UI SDK** → Sends credentials to CIAM Backend
3. **Backend** → Validates via LDAP
4. **Backend** → Generates JWT tokens (access, refresh, ID)
5. **Backend** → Creates session record
6. **Backend** → Returns tokens to UI
7. **UI SDK** → Stores tokens, updates auth state

### Multi-Factor Authentication

1. **MFA required** → Backend triggers MFA flow
2. **User selects method** → OTP (email/SMS) or Push notification
3. **Backend** → Generates OTP or sends push challenge
4. **User verifies** → Enters OTP or approves push
5. **Backend** → Validates MFA, upgrades token
6. **Session marked as MFA-verified**

### Device Trust

1. **Device fingerprint** → Collected by frontend
2. **Backend** → Sends to Transmit DRS for risk scoring
3. **DRS returns risk score** (0-100)
4. **Backend** → Evaluates risk policy
5. **High trust** → Offer device binding (skip future MFA)
6. **Low trust** → Require MFA always

---

## 📊 Data Architecture

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `auth_contexts` | Authentication journey container | context_id, user_id, status |
| `auth_transactions` | Event log for each auth step | transaction_id, context_id, event_type |
| `sessions` | Active user sessions | session_id, user_id, mfa_verified |
| `tokens` | JWT tokens with rotation | token_id, session_id, token_type, parent_token_id |
| `trusted_devices` | Device binding records | device_id, user_id, fingerprint |
| `drs_evaluations` | Device risk assessments | eval_id, device_fingerprint, risk_score |
| `audit_logs` | Partitioned by month | event_id, event_type, user_id, timestamp |

### Database Views

- `v_active_sessions`: Active sessions with token counts
- `v_pending_transactions`: Currently active auth flows
- `v_high_risk_logins`: DRS risk score >= 70
- `v_token_rotation_chains`: Token rotation history

---

## 🧪 Development Workflow

### Running Architecture Viewer During Development

**Terminal 1 - Application:**
```bash
npm run dev:all  # Runs all services
```

**Terminal 2 - Architecture Viewer:**
```bash
docker-compose -f docker-compose.structurizr.yml up
```

**Browser:**
- Application: http://localhost:3000 (Storefront)
- Architecture: http://localhost:8081 (Diagrams)

---

## 🎓 Learning Resources

### C4 Model Resources
- **C4 Model Website**: https://c4model.com/
- **Structurizr DSL**: https://docs.structurizr.com/dsl
- **Examples**: https://structurizr.com/help/examples

### Internal Resources
- **TEMPLATE.dsl**: Generic template for new projects
- **TEAM_ONBOARDING.md**: Complete guide for other teams

---

## 🤝 Contributing to Architecture Docs

### Review Checklist

When reviewing PRs that change architecture:

- [ ] workspace.dsl syntax is valid (GitHub Actions checks this)
- [ ] Diagrams accurately reflect code changes
- [ ] New containers/components have descriptions
- [ ] Relationships are documented
- [ ] Technology stack labels are current
- [ ] Diagrams render correctly locally

### Style Guide

**Naming conventions:**
- **Containers**: Use proper names (e.g., "CIAM Backend", not "backend-api")
- **Components**: Use clear, descriptive names (e.g., "AuthController", not "ctrl1")
- **Relationships**: Use active voice (e.g., "Makes API calls", not "communicates")

**Descriptions:**
- **Containers**: Technology + purpose (e.g., "Node.js API providing authentication")
- **Components**: Action + responsibility (e.g., "Handles login and logout operations")

**Tags:**
- Use semantic tags: `Backend`, `Frontend`, `Database`, `External`
- Add domain tags: `Controller`, `Service`, `Repository`, `Component`

---

## 🛠️ Troubleshooting

### Diagrams won't load

**Check 1: Is Docker running?**
```bash
docker ps | grep structurizr
# Should show ciam-structurizr container
```

**Check 2: Syntax errors?**
```bash
docker logs ciam-structurizr
# Look for DSL parsing errors
```

**Check 3: Port conflict?**
```bash
lsof -i :8081
# If port is taken, change in docker-compose.structurizr.yml
```

### Can't make changes

**Check 1: File permissions**
```bash
ls -la docs/architecture/workspace.dsl
# Should be writable
```

**Check 2: Container not watching file?**
```bash
# Restart container to pick up changes
docker-compose -f docker-compose.structurizr.yml restart
```

---

## 📞 Support

**Questions about diagrams?**
- Check TEAM_ONBOARDING.md
- Ask in #architecture-guild
- Review CIAM workspace.dsl examples

**Questions about C4 model?**
- Visit https://c4model.com/
- Read Structurizr docs

**Issues with tooling?**
- Check Structurizr GitHub issues
- Docker troubleshooting guides

---

## 🎉 Success Metrics

After implementing C4 diagrams, we've seen:

- ✅ **Faster onboarding**: New developers understand architecture in 1 hour vs 1 week
- ✅ **Better design discussions**: Visual diagrams improve architecture reviews
- ✅ **Living documentation**: Diagrams stay current with code (in version control)
- ✅ **Cross-team clarity**: Other teams understand CIAM integration easily
- ✅ **Decision records**: Architecture changes tracked in Git history

**Your feedback helps!** Let us know if these diagrams help your work.
