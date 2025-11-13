# Architecture Decisions

## Key Architectural Choices

### 1. Monorepo with npm Workspaces

**Decision**: Use npm workspaces to manage multiple packages in a single repository.

**Rationale**:
- Simplifies dependency management across packages
- Enables code sharing between backend and frontend
- Single build and test pipeline
- Easier to maintain consistency

**Structure**:
```
packages/
├── ciam-backend/      # Node.js Express API
├── ciam-ui/           # React component library
├── storefront/        # E-commerce web app
└── account-servicing/ # Account management app
```

### 2. JWT Token Rotation

**Decision**: Rotate tokens on each use with parent-child relationship tracking.

**Rationale**:
- Enhanced security - stolen tokens have limited lifetime
- Audit trail of token usage
- Ability to revoke entire token chains
- Supports zero-trust security model

**Implementation**:
- Each token refresh creates new token with reference to parent
- `tokens` table tracks `parent_token_id` for chain reconstruction
- Automatic cleanup of expired token chains

### 3. Device Trust via Transmit DRS

**Decision**: Integrate with Transmit DRS for real-time device risk scoring.

**Rationale**:
- Specialized service provides better risk assessment than in-house solution
- Real-time scoring during authentication
- Supports adaptive MFA based on device trust
- Industry-standard signals and ML models

**Integration**:
- Device fingerprint collected client-side
- Sent to DRS during authentication
- Risk score (0-100) influences MFA requirements
- Trusted devices can skip MFA for better UX

### 4. Reusable UI Component Library

**Decision**: Create CIAM UI SDK as a separate React component library.

**Rationale**:
- Consistent authentication UX across multiple applications
- Reduces duplication between Storefront and Account apps
- Easier to maintain and update authentication flows
- Can be used by future applications

**Components**:
- `CiamProvider` - Authentication context
- `CiamLoginComponent` - Login form
- `ProtectedRoute` - Route guards
- `useAuth`, `useMfa` - React hooks
- Dialogs for MFA, device binding, eSign

### 5. Time-Prefixed IDs

**Decision**: Use time-prefixed identifiers for better partitioning and readability.

**Rationale**:
- Enables efficient partitioning by time
- Sortable and chronological
- Human-readable for debugging
- Supports data retention policies

**Format**: `YYYYMMDD_<uuid>`

### 6. Unified Audit DRS Table

**Decision**: Single `drs_evaluations` table instead of separate device/user tables.

**Rationale**:
- DRS evaluations apply to authentication context, not just devices
- Simpler schema and queries
- Better performance for audit trails
- Easier to implement retention policies

### 7. Partitioned Audit Logs

**Decision**: Partition `audit_logs` table by month.

**Rationale**:
- Improved query performance for recent events
- Easier archival and retention management
- Reduced index size for active partitions
- Supports compliance requirements for log retention
