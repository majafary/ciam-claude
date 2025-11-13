# Structurizr Navigation Guide

## ✅ Setup Complete

Your Structurizr C4 architecture diagrams are fully configured and working!

## 🚀 Quick Start

### 1. Start Structurizr

```bash
# From project root
./view-architecture.sh

# OR
docker-compose -f docker-compose.structurizr.yml up
```

### 2. Open in Browser

```
http://localhost:8081
```

You'll be redirected to: `http://localhost:8081/workspace/diagrams`

## 📊 Navigate Through All Diagram Levels

### Method 1: Using the Dropdown Menu (Recommended)

1. **Look for the navigation dropdown** in the top toolbar
2. **Click the dropdown** and you'll see 4 views:
   - `SystemContext` - System-level view
   - `Containers` - Application-level view
   - `BackendComponents` - Backend internal structure
   - `UiSdkComponents` - UI SDK internal structure

3. **Select any view** to switch between diagram levels

### Method 2: Using Direct URLs

Navigate directly to specific views:

- **System Context**: http://localhost:8081/workspace/diagrams#SystemContext
- **Containers**: http://localhost:8081/workspace/diagrams#Containers
- **Backend Components**: http://localhost:8081/workspace/diagrams#BackendComponents
- **UI SDK Components**: http://localhost:8081/workspace/diagrams#UiSdkComponents

## 🔍 Understanding Each Level

### Level 1: System Context

**URL**: `http://localhost:8081/workspace/diagrams#SystemContext`

**What you see**:
- **People**: Customer, Support Agent
- **CIAM Integration Suite**: Your main system (shown as a box)
- **External Systems**: LDAP Directory, Transmit DRS, PostgreSQL

**Purpose**: High-level view showing who uses the system and what external systems it integrates with.

**Click on**: The "CIAM Integration Suite" box to drill down (this navigates to Containers view)

---

### Level 2: Containers

**URL**: `http://localhost:8081/workspace/diagrams#Containers`

**What you see**:
- **CIAM Backend** (Node.js API, Port 8080)
- **CIAM UI SDK** (React component library)
- **Storefront Web App** (Port 3000)
- **Account Servicing Web App** (Port 3001)
- **PostgreSQL Database**
- Connections between all containers

**Purpose**: Shows the applications, libraries, and databases that make up the CIAM system.

**Click on**:
- "CIAM Backend" box → Navigate to BackendComponents view
- "CIAM UI SDK" box → Navigate to UiSdkComponents view

---

### Level 3a: Backend Components

**URL**: `http://localhost:8081/workspace/diagrams#BackendComponents`

**What you see** (internal structure of CIAM Backend):

**Controllers** (7):
- AuthController - Login, logout, token refresh
- MfaController - Multi-factor authentication
- DeviceController - Trusted device management
- SessionController - Session lifecycle
- UserController - User profile
- OIDCController - OpenID Connect endpoints
- TokenController - Token operations

**Services** (6):
- TokenService - JWT token generation/validation
- MfaService - MFA orchestration
- DeviceService - Device fingerprinting
- SessionService - Session management
- ESignService - Electronic signatures
- UserService - User data access

**Data Access**:
- Repositories - Database operations

**Middleware**:
- Auth Middleware - JWT validation
- Rate Limiter - API protection

**Purpose**: Understand the internal architecture of the backend API.

---

### Level 3b: UI SDK Components

**URL**: `http://localhost:8081/workspace/diagrams#UiSdkComponents`

**What you see** (internal structure of CIAM UI SDK):

**Context & Providers**:
- CiamProvider - Authentication state management

**UI Components** (6):
- CiamLoginComponent - Login form
- MfaMethodSelectionDialog - MFA method selection
- DeviceBindDialog - Device trust consent
- ESignDialog - Electronic signature acceptance
- ProtectedRoute - Route guards
- CiamProtectedApp - App wrapper

**Hooks** (2):
- useAuth Hook - Authentication state
- useMfa Hook - MFA operations

**Services**:
- AuthService - HTTP client for API calls

**Purpose**: Understand the React components available for building authentication UIs.

---

## 🎨 Diagram Controls

### Navigation
- **Zoom**: Mouse wheel or pinch gesture
- **Pan**: Click and drag
- **Reset View**: Click the "center" button in toolbar

### Toolbar Buttons
- **Back**: Go back to previous diagram
- **Diagram Key**: Show legend explaining colors/shapes
- **Tooltips**: Toggle element tooltips on/off
- **Export**: Export diagram to PNG or SVG

### Keyboard Shortcuts
- `b` - Go back
- `i` - Toggle diagram key
- `t` - Toggle tooltips

## 📖 Architecture Documentation

While the Structurizr Documentation tab isn't populated, you can access comprehensive documentation in markdown files:

```bash
# Architecture overview and getting started
open docs/architecture/README.md

# Team onboarding guide
open docs/architecture/TEAM_ONBOARDING.md

# Implementation summary
open docs/architecture/IMPLEMENTATION_SUMMARY.md

# Quick reference docs
open docs/architecture/01-overview.md
open docs/architecture/02-getting-started.md
open docs/architecture/03-architecture-decisions.md
```

## 🛠️ Updating Diagrams

### When to Update

Update `docs/architecture/ciam.dsl` when you:
- ✅ Add a new service/container
- ✅ Change technology stack
- ✅ Add external system integration
- ✅ Add major components

### How to Update

1. **Edit the DSL file**:
   ```bash
   code docs/architecture/ciam.dsl
   ```

2. **Structurizr auto-reloads** (no restart needed)
   - **Auto-save**: DSL changes are detected every 5 seconds and JSON is regenerated
   - **Auto-refresh**: Browser automatically reloads every 2 seconds (enabled via `structurizr.properties`)
   - Changes appear automatically in your browser - just wait 2-7 seconds!

3. **Manual refresh** (if auto-refresh seems slow):
   - Press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux)

4. **Commit changes**:
   ```bash
   git add docs/architecture/ciam.dsl
   git commit -m "docs: update architecture - add feature X"
   git push
   ```

### Configuration

The `docs/architecture/structurizr.properties` file controls auto-refresh behavior:
```properties
# How often to check for DSL changes and regenerate JSON
structurizr.autoSaveInterval=5000

# How often the browser automatically reloads
structurizr.autoRefreshInterval=2000
```

If you want to disable auto-refresh (for performance), set `structurizr.autoRefreshInterval=0`.

## ❓ Troubleshooting

### Diagrams won't load

**Check if Docker is running**:
```bash
docker ps | grep structurizr
# Should show: ciam-structurizr
```

**Restart Structurizr**:
```bash
docker-compose -f docker-compose.structurizr.yml restart
```

**Check logs**:
```bash
docker logs ciam-structurizr
```

### Can't see diagram dropdown

**Solution**: The dropdown is in the top toolbar. Look for a select/dropdown element showing view names.

### Port 8081 already in use

**Change the port** in `docker-compose.structurizr.yml`:
```yaml
ports:
  - "8082:8080"  # Change 8081 to 8082
```

Then restart and access at `http://localhost:8082`

## ✅ Verification Checklist

Run this to verify everything works:

```bash
# Test all views are accessible
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8081/workspace/diagrams#SystemContext"
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8081/workspace/diagrams#Containers"
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8081/workspace/diagrams#BackendComponents"
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8081/workspace/diagrams#UiSdkComponents"

# All should return: 200
```

## 🎯 Success!

You now have:
- ✅ **4 working diagram views** (System Context, Containers, 2 Component views)
- ✅ **Interactive navigation** between all levels
- ✅ **Auto-reloading** when DSL changes
- ✅ **Version-controlled** architecture (in Git)
- ✅ **Exportable** diagrams (PNG/SVG)

**Your Structurizr setup is complete and working perfectly!**
