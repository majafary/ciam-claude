# CIAM Database - DBA Handoff Guide

**Database:** PostgreSQL 14+ (AWS RDS)
**Environment:** Production
**Date:** October 2025

---

## Quick Reference

### Table Overview
| Table | Purpose | Growth Rate | Retention | Partitioned |
|-------|---------|-------------|-----------|-------------|
| auth_contexts | Login journeys | ~1M/day | 90 days | No |
| auth_transactions | Step-by-step events | ~3M/day | 90 days | No |
| drs_evaluations | DRS risk scores | ~1M/day | 90 days | No |
| sessions | Active sessions | ~500K active | Until revoked | No |
| tokens | Auth tokens | ~1.5M active | Until revoked | No |
| trusted_devices | Device bindings | ~100K total | Until revoked | No |
| audit_logs | All events | ~10M/day | 2 years | Yes (monthly) |

### Critical Indexes
```sql
-- Most critical for performance
idx_auth_tx_context_pending (UNIQUE)
idx_tokens_value_hash (UNIQUE)
idx_sessions_cupid
idx_audit_cupid_time
```

### Connection String
```
postgresql://ciam_app:PASSWORD@ciam-db.aws.rds.amazonaws.com:5432/ciam?sslmode=require
```

---

## Daily Operations

### 1. Health Checks

**Run every hour via monitoring:**

```sql
-- Check active sessions count
SELECT COUNT(*) as active_sessions
FROM sessions
WHERE status = 'ACTIVE';
-- Expected: 200K-800K

-- Check pending transactions (should be low)
SELECT COUNT(*) as pending_transactions
FROM auth_transactions
WHERE transaction_status = 'PENDING'
  AND expires_at > NOW();
-- Expected: <1000

-- Check audit log partition exists for current month
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'audit_logs_%'
ORDER BY tablename DESC
LIMIT 3;
-- Should see current month + 1-2 past months

-- Check for bloated tables
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('auth_contexts', 'auth_transactions', 'sessions', 'tokens', 'audit_logs')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

### 2. Cleanup Jobs

**Schedule via pg_cron or external scheduler:**

#### Every 5 Minutes: Expire Transactions
```sql
-- Mark expired PENDING transactions
SELECT cleanup_expired_transactions();
-- Expected: 100-1000 rows updated
```

#### Every 15 Minutes: Expire Contexts
```sql
-- Mark expired incomplete auth contexts
SELECT cleanup_expired_contexts();
-- Expected: 50-500 rows updated
```

#### Every Hour: Expire Sessions
```sql
-- Mark expired sessions
SELECT expire_old_sessions();
-- Expected: 1000-5000 rows updated
```

#### Daily at 1 AM: Cleanup Old Completed Contexts/Transactions
```sql
-- Delete auth_contexts older than 90 days
DELETE FROM auth_contexts
WHERE created_at < NOW() - INTERVAL '90 days'
  AND auth_outcome IS NOT NULL;
-- Note: Cascades to auth_transactions via FK

-- Vacuum after large deletes
VACUUM ANALYZE auth_contexts;
VACUUM ANALYZE auth_transactions;
```

#### Daily at 2 AM: Cleanup Old DRS Evaluations
```sql
-- Delete DRS evaluations older than 90 days
DELETE FROM drs_evaluations
WHERE created_at < NOW() - INTERVAL '90 days';

VACUUM ANALYZE drs_evaluations;
```

#### Daily at 3 AM: Cleanup Revoked Sessions/Tokens
```sql
-- Delete revoked sessions older than 30 days
DELETE FROM sessions
WHERE status IN ('REVOKED', 'LOGGED_OUT', 'EXPIRED')
  AND COALESCE(revoked_at, created_at) < NOW() - INTERVAL '30 days';
-- Note: Cascades to tokens via FK ON DELETE CASCADE

VACUUM ANALYZE sessions;
VACUUM ANALYZE tokens;
```

#### Monthly on 1st at 4 AM: Create Next Audit Partition
```sql
-- Auto-create next month's partition
SELECT create_next_audit_partition();

-- Expected output: "Created partition audit_logs_YYYY_MM"
```

#### Quarterly: Drop Old Audit Partitions (2 year retention)
```sql
-- Check partitions older than 2 years
SELECT tablename
FROM pg_tables
WHERE tablename LIKE 'audit_logs_%'
  AND tablename < 'audit_logs_' || TO_CHAR(NOW() - INTERVAL '2 years', 'YYYY_MM')
ORDER BY tablename;

-- Drop old partitions (example)
DROP TABLE IF EXISTS audit_logs_2023_01;
DROP TABLE IF EXISTS audit_logs_2023_02;
-- etc.
```

---

### 3. Backup Strategy

**Automated RDS Snapshots:**
- Daily automated snapshots (retain 7 days)
- Weekly snapshots (retain 4 weeks)
- Monthly snapshots (retain 12 months)

**Manual Backups Before Major Changes:**
```bash
# Create manual RDS snapshot
aws rds create-db-snapshot \
  --db-instance-identifier ciam-db-prod \
  --db-snapshot-identifier ciam-db-manual-$(date +%Y%m%d-%H%M)
```

**Backup Verification (Monthly):**
```sql
-- Test restore to non-prod environment
-- Verify row counts match
SELECT
    'auth_contexts' as table_name,
    COUNT(*) as row_count
FROM auth_contexts
UNION ALL
SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL
SELECT 'tokens', COUNT(*) FROM tokens
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs;
```

---

## Performance Tuning

### 1. Index Monitoring

**Check Index Usage:**
```sql
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
LIMIT 20;
-- Look for indexes with 0 scans (candidates for removal)
```

**Find Missing Indexes:**
```sql
-- Query from pg_stat_statements (if enabled)
SELECT
    query,
    calls,
    total_time,
    mean_time,
    rows
FROM pg_stat_statements
WHERE query LIKE '%auth_transactions%'
  OR query LIKE '%tokens%'
ORDER BY mean_time DESC
LIMIT 20;
-- Look for sequential scans on large tables
```

**Check Bloated Indexes:**
```sql
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    idx_scan,
    idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND pg_relation_size(indexrelid) > 100000000 -- > 100MB
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

### 2. Query Performance

**Slow Query Monitoring:**
```sql
-- Enable slow query logging (RDS parameter group)
-- log_min_duration_statement = 1000 (log queries > 1 second)

-- Check currently running queries
SELECT
    pid,
    now() - query_start AS duration,
    state,
    query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;
```

**Top Slow Queries (pg_stat_statements):**
```sql
SELECT
    substring(query, 1, 100) as short_query,
    calls,
    mean_time,
    total_time,
    rows
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;
```

**Expected Query Times:**
| Query Type | Expected Time | Action if Slower |
|------------|---------------|------------------|
| Token lookup by hash | <1ms | Check idx_tokens_value_hash |
| Active transaction lookup | <1ms | Check idx_auth_tx_context_pending |
| Session by CUPID | <5ms | Check idx_sessions_cupid |
| Audit log by CUPID | <10ms | Check idx_audit_cupid_time, consider partition pruning |

---

### 3. Connection Pooling

**PgBouncer Configuration (Recommended):**
```ini
[databases]
ciam = host=ciam-db.aws.rds.amazonaws.com port=5432 dbname=ciam

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
reserve_pool_size = 10
reserve_pool_timeout = 5
```

**Monitor Connection Pool:**
```sql
-- Check active connections
SELECT
    COUNT(*) as total_connections,
    COUNT(*) FILTER (WHERE state = 'active') as active,
    COUNT(*) FILTER (WHERE state = 'idle') as idle,
    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname = 'ciam';

-- Alert if idle_in_transaction > 10
```

---

### 4. Vacuum Strategy

**Auto-Vacuum Settings (RDS Parameter Group):**
```
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 60s
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05
```

**Manual VACUUM Schedule:**
```sql
-- Weekly VACUUM ANALYZE on high-churn tables
VACUUM ANALYZE auth_contexts;
VACUUM ANALYZE auth_transactions;
VACUUM ANALYZE sessions;
VACUUM ANALYZE tokens;

-- Check table bloat
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    n_dead_tup,
    n_live_tup,
    ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;
-- Alert if dead_tuple_percent > 10%
```

---

## Monitoring & Alerts

### 1. Key Metrics to Monitor

**Database Level:**
- CPU Utilization: Alert if > 80% for 5 minutes
- Memory Utilization: Alert if > 85%
- Disk I/O: Alert if IOPS > 80% of provisioned
- Connection Count: Alert if > 800 (assuming max 1000)
- Replication Lag (if using read replicas): Alert if > 10 seconds

**Application Level:**
- Active Sessions: Alert if < 100K or > 1M (unusual)
- Pending Transactions: Alert if > 5000 (stuck flows)
- Failed Logins: Alert if > 1000/min (potential attack)
- Token Refresh Rate: Alert if < 100/sec (service issue)

---

### 2. CloudWatch Metrics (AWS RDS)

**Standard Metrics:**
```
CPUUtilization
FreeableMemory
FreeStorageSpace
ReadIOPS / WriteIOPS
ReadLatency / WriteLatency
DatabaseConnections
DiskQueueDepth
```

**Custom Metrics (via Lambda + CloudWatch):**
```python
# Example: Publish custom metric
import boto3

cloudwatch = boto3.client('cloudwatch')

# Query database
active_sessions = query("SELECT COUNT(*) FROM sessions WHERE status='ACTIVE'")[0][0]

# Publish metric
cloudwatch.put_metric_data(
    Namespace='CIAM/Database',
    MetricData=[
        {
            'MetricName': 'ActiveSessions',
            'Value': active_sessions,
            'Unit': 'Count'
        }
    ]
)
```

---

### 3. Alert Queries

**High Pending Transaction Count:**
```sql
SELECT COUNT(*) as pending_count
FROM auth_transactions
WHERE transaction_status = 'PENDING'
  AND expires_at > NOW();
-- Alert if > 5000
```

**Expired Transactions Not Cleaned:**
```sql
SELECT COUNT(*) as expired_not_cleaned
FROM auth_transactions
WHERE transaction_status = 'PENDING'
  AND expires_at < NOW();
-- Alert if > 1000 (cleanup job failing)
```

**Token Rotation Failures:**
```sql
SELECT COUNT(*) as rotated_tokens_1h
FROM tokens
WHERE status = 'ROTATED'
  AND revoked_at > NOW() - INTERVAL '1 hour';
-- Alert if < 1000 (should have ~5K-10K/hour)
```

**High Risk Logins:**
```sql
SELECT COUNT(*) as high_risk_1h
FROM drs_evaluations
WHERE risk_score >= 80
  AND created_at > NOW() - INTERVAL '1 hour';
-- Alert if > 100 (potential fraud spike)
```

**Session Revocation Spike:**
```sql
SELECT COUNT(*) as revoked_1h
FROM sessions
WHERE status = 'REVOKED'
  AND revoked_at > NOW() - INTERVAL '1 hour';
-- Alert if > 1000 (potential security incident)
```

---

## Troubleshooting

### Issue 1: Slow Token Validation

**Symptom:** Token validation queries taking > 5ms

**Diagnosis:**
```sql
EXPLAIN ANALYZE
SELECT t.token_id, s.cupid
FROM tokens t
JOIN sessions s ON s.session_id = t.session_id
WHERE t.token_value_hash = 'SAMPLE_HASH'
  AND t.status = 'ACTIVE';
```

**Expected Plan:**
```
Index Scan using idx_tokens_value_hash on tokens t
  -> Index Scan using sessions_pkey on sessions s
Total: <1ms
```

**Fix if Slow:**
1. Check index exists: `\d tokens`
2. Rebuild index: `REINDEX INDEX idx_tokens_value_hash;`
3. Update statistics: `ANALYZE tokens;`

---

### Issue 2: Audit Log Queries Slow

**Symptom:** Queries on audit_logs taking > 30 seconds

**Diagnosis:**
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM audit_logs
WHERE cupid = 'CUPID_TEST'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;
```

**Expected Plan:**
```
Append (partitions scanned: 1)
  -> Index Scan using idx_audit_cupid_time on audit_logs_2025_10
```

**Fix if Slow:**
1. Ensure partition pruning working (should only scan 1 partition)
2. Check constraint exclusion: `SHOW constraint_exclusion;` (should be 'partition' or 'on')
3. Rebuild partition indexes if needed

---

### Issue 3: Partition Missing for Current Month

**Symptom:** INSERT INTO audit_logs fails with "no partition of relation found"

**Diagnosis:**
```sql
SELECT tablename
FROM pg_tables
WHERE tablename LIKE 'audit_logs_%'
ORDER BY tablename DESC;
```

**Fix:**
```sql
-- Create missing partition manually
SELECT create_next_audit_partition();

-- Or create specific month
CREATE TABLE audit_logs_2025_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
```

---

### Issue 4: Deadlocks

**Symptom:** Application reports deadlock errors

**Diagnosis:**
```sql
-- Check recent deadlocks (PostgreSQL 9.2+)
SELECT * FROM pg_stat_database_conflicts
WHERE datname = 'ciam';

-- Enable deadlock logging (parameter group)
-- deadlock_timeout = 1s
-- log_lock_waits = on
```

**Common Deadlock Scenarios:**
1. **Token Rotation:** Two concurrent refreshes on same session
   - Fix: Use SELECT ... FOR UPDATE in application
2. **Session Revocation:** Concurrent updates to sessions + tokens
   - Fix: Use explicit transaction ordering

---

### Issue 5: Table Bloat

**Symptom:** Table size growing faster than data

**Diagnosis:**
```sql
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    n_dead_tup,
    n_live_tup,
    ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN ('auth_contexts', 'auth_transactions', 'sessions', 'tokens')
ORDER BY n_dead_tup DESC;
```

**Fix:**
```sql
-- If dead_pct > 20%, run VACUUM FULL (requires table lock)
VACUUM FULL auth_contexts;

-- Or on replica (no lock), then failover
```

---

## Security Best Practices

### 1. Access Control

**Principle of Least Privilege:**
```sql
-- Application user should NOT have:
-- - DROP/CREATE table permissions
-- - TRUNCATE permissions
-- - SUPERUSER access

-- Check current permissions
\dp auth_contexts
\dp sessions
\dp tokens

-- Revoke excessive permissions
REVOKE DROP ON ALL TABLES IN SCHEMA public FROM ciam_app;
```

---

### 2. Encryption

**At Rest (RDS):**
- Enable RDS encryption (KMS)
- Verify: Check RDS console for "Encrypted: Yes"

**In Transit:**
```sql
-- Enforce SSL connections
ALTER USER ciam_app SET ssl TO on;

-- Verify SSL is required
SELECT usename, ssl, client_addr
FROM pg_stat_ssl
JOIN pg_stat_activity USING (pid);
```

---

### 3. Audit Configuration

**Enable RDS Audit Logs (Parameter Group):**
```
log_statement = 'ddl'  # Log DDL changes
log_connections = on
log_disconnections = on
log_duration = on
log_min_duration_statement = 5000  # Log queries > 5s
```

**Review Audit Logs Weekly:**
```bash
# Download RDS logs
aws rds download-db-log-file-portion \
  --db-instance-identifier ciam-db-prod \
  --log-file-name error/postgresql.log.2025-10-08-10
```

---

## Disaster Recovery

### Recovery Time Objective (RTO): 1 hour
### Recovery Point Objective (RPO): 5 minutes

**Failover Procedure:**

1. **Detect Failure:**
   - Automated: CloudWatch alarm triggers
   - Manual: Unable to connect to database

2. **Assess Impact:**
   ```bash
   # Check RDS instance status
   aws rds describe-db-instances \
     --db-instance-identifier ciam-db-prod \
     --query 'DBInstances[0].DBInstanceStatus'
   ```

3. **Initiate Failover (Multi-AZ):**
   ```bash
   # RDS automatically fails over to standby (1-2 minutes)
   # Or manual failover
   aws rds reboot-db-instance \
     --db-instance-identifier ciam-db-prod \
     --force-failover
   ```

4. **Restore from Snapshot (if needed):**
   ```bash
   # List recent snapshots
   aws rds describe-db-snapshots \
     --db-instance-identifier ciam-db-prod \
     --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]' \
     --output table

   # Restore from snapshot (creates new instance)
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier ciam-db-prod-restored \
     --db-snapshot-identifier ciam-db-snapshot-2025-10-08
   ```

5. **Validate:**
   ```sql
   -- Check data integrity
   SELECT COUNT(*) FROM sessions WHERE status = 'ACTIVE';
   SELECT MAX(created_at) FROM audit_logs;

   -- Check replication lag (if using read replicas)
   SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;
   ```

6. **Update Application Connection Strings:**
   ```bash
   # Update DNS or connection pool to new endpoint
   ```

---

## Scaling Strategies

### Vertical Scaling (Instance Size)

**When to Scale Up:**
- CPU > 80% sustained
- Memory > 85% sustained
- IOPS consistently hitting limit

**RDS Instance Recommendations:**
| Sessions | Instance Type | vCPU | Memory | Storage |
|----------|--------------|------|--------|---------|
| <100K | db.r6g.xlarge | 4 | 32 GB | 500 GB |
| 100K-500K | db.r6g.2xlarge | 8 | 64 GB | 1 TB |
| 500K-1M | db.r6g.4xlarge | 16 | 128 GB | 2 TB |
| >1M | db.r6g.8xlarge | 32 | 256 GB | 4 TB |

---

### Horizontal Scaling (Read Replicas)

**Use Cases:**
- Analytics queries (fraud detection, dashboards)
- Audit log searches
- Reporting

**Setup:**
```bash
# Create read replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier ciam-db-prod-read-1 \
  --source-db-instance-identifier ciam-db-prod \
  --db-instance-class db.r6g.2xlarge
```

**Application Connection Routing:**
```python
# Write operations
write_conn = psycopg2.connect("postgresql://ciam-db-prod.aws.rds.amazonaws.com/ciam")

# Read operations (analytics)
read_conn = psycopg2.connect("postgresql://ciam-db-prod-read-1.aws.rds.amazonaws.com/ciam")
```

---

### Sharding Strategy (Future)

**If >2M active sessions:**

**Shard by CUPID:**
```python
def get_shard(cupid):
    shard_count = 4
    return hash(cupid) % shard_count

# Route to appropriate database
if get_shard(cupid) == 0:
    conn = connect_to_shard_0()
elif get_shard(cupid) == 1:
    conn = connect_to_shard_1()
# etc.
```

**Tables to Shard:**
- auth_contexts
- auth_transactions
- sessions
- tokens
- trusted_devices
- drs_evaluations

**Tables to Keep Global:**
- audit_logs (aggregate across shards)

---

## Maintenance Windows

**Recommended Schedule:**
- **Weekly:** Sunday 2-4 AM UTC (low traffic)
- **Monthly:** First Sunday 2-6 AM UTC (extended window)

**Maintenance Tasks:**
```sql
-- Weekly (2-4 AM)
VACUUM ANALYZE auth_contexts;
VACUUM ANALYZE auth_transactions;
VACUUM ANALYZE sessions;
VACUUM ANALYZE tokens;
REINDEX TABLE tokens;  -- High churn table

-- Monthly (2-6 AM)
VACUUM FULL sessions;  -- If bloat > 20%
REINDEX DATABASE ciam;  -- All indexes
ANALYZE;  -- Update all statistics
```

---

## Contact Information

**Primary DBA:** [Name] - [Email] - [Phone]
**Secondary DBA:** [Name] - [Email] - [Phone]
**Application Team Lead:** [Name] - [Email]
**AWS Support:** [Account Number] - [Support Plan]

**Escalation Path:**
1. On-call DBA (PagerDuty)
2. Database Team Lead
3. Infrastructure Manager
4. AWS Premium Support

---

**Document Version:** 1.0
**Last Updated:** October 2025
**Next Review Date:** January 2026
