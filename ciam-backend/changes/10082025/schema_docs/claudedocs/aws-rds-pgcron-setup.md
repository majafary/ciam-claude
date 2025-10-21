# AWS RDS PostgreSQL pg_cron Setup Guide

Complete guide for setting up pg_cron on AWS RDS PostgreSQL for the CIAM database automation.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Setup Overview](#setup-overview)
- [Step-by-Step Configuration](#step-by-step-configuration)
- [Database-Level Setup](#database-level-setup)
- [Verification](#verification)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

---

## Prerequisites

### RDS Version Requirements
- **PostgreSQL Version**: 12.5 or higher (pg_cron pre-installed)
- **RDS Instance Type**: Any (works on all instance sizes)
- **Required**: Your database must be in a **custom parameter group** (not default)

### IAM Permissions Required
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds:ModifyDBParameterGroup",
        "rds:RebootDBInstance",
        "rds:DescribeDBParameters",
        "rds:DescribeDBInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Setup Overview

**Timeline**: ~15-20 minutes total
- Parameter group modification: 2 minutes
- RDS instance reboot: 5-10 minutes (downtime)
- Extension creation + job scheduling: 2-5 minutes

**Important**: RDS instance **reboot is required** - plan for downtime window.

---

## Step-by-Step Configuration

### Step 1: Create Custom Parameter Group (If Not Exists)

**AWS Console**:
1. Navigate to **RDS → Parameter groups**
2. Click **Create parameter group**
3. Select:
   - **Parameter group family**: `postgres14` (or your version)
   - **Type**: DB Parameter Group
   - **Group name**: `ciam-postgres-params`
   - **Description**: "Custom parameters for CIAM database"
4. Click **Create**

**AWS CLI**:
```bash
aws rds create-db-parameter-group \
  --db-parameter-group-name ciam-postgres-params \
  --db-parameter-group-family postgres14 \
  --description "Custom parameters for CIAM database"
```

### Step 2: Modify Parameter Group for pg_cron

**AWS Console**:
1. Go to **RDS → Parameter groups**
2. Select your custom parameter group (`ciam-postgres-params`)
3. Click **Edit parameters**
4. Search for `shared_preload_libraries`
5. Change value to: `pg_cron` (or add to existing, comma-separated)
6. Search for `cron.database_name`
7. Set value to: **your database name** (e.g., `ciam_db`)
8. Click **Save changes**

**AWS CLI**:
```bash
# Get your database name first
DB_NAME="ciam_db"  # Replace with your actual database name

# Modify parameter group
aws rds modify-db-parameter-group \
  --db-parameter-group-name ciam-postgres-params \
  --parameters \
    "ParameterName=shared_preload_libraries,ParameterValue=pg_cron,ApplyMethod=pending-reboot" \
    "ParameterName=cron.database_name,ParameterValue=${DB_NAME},ApplyMethod=pending-reboot"
```

**Important**: If you already have other extensions in `shared_preload_libraries` (e.g., `pg_stat_statements`), use comma-separated values:
```
shared_preload_libraries = 'pg_stat_statements,pg_cron'
```

### Step 3: Attach Parameter Group to RDS Instance

**Skip if your instance already uses this parameter group**

**AWS Console**:
1. Go to **RDS → Databases**
2. Select your database instance
3. Click **Modify**
4. Under **Database options**, change **DB parameter group** to `ciam-postgres-params`
5. Click **Continue**
6. Choose **Apply immediately** (or during maintenance window)
7. Click **Modify DB Instance**

**AWS CLI**:
```bash
aws rds modify-db-instance \
  --db-instance-identifier your-rds-instance-name \
  --db-parameter-group-name ciam-postgres-params \
  --apply-immediately
```

### Step 4: Reboot RDS Instance

**Required**: Changes to `shared_preload_libraries` require a reboot.

**AWS Console**:
1. Go to **RDS → Databases**
2. Select your database instance
3. Click **Actions → Reboot**
4. Click **Reboot** to confirm

**AWS CLI**:
```bash
aws rds reboot-db-instance \
  --db-instance-identifier your-rds-instance-name
```

**Wait Time**: 5-10 minutes for instance to become available.

### Step 5: Verify Parameter Changes

**After reboot completes**, connect to your database and verify:

```sql
-- Connect to your database
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d ciam_db

-- Check shared_preload_libraries
SHOW shared_preload_libraries;
-- Expected: pg_cron (or pg_stat_statements,pg_cron)

-- Check cron database configuration
SELECT name, setting
FROM pg_settings
WHERE name LIKE 'cron%';
```

Expected output:
```
         name          |  setting
-----------------------+-----------
 cron.database_name    | ciam_db
 cron.host             | /var/run/postgresql
 cron.log_run          | on
 cron.log_statement    | on
 cron.max_running_jobs | 32
```

---

## Database-Level Setup

### Step 6: Run Schema Setup Script

Now that pg_cron is configured at the RDS level, run your schema script:

```bash
psql -h your-rds-endpoint.rds.amazonaws.com \
     -U postgres \
     -d ciam_db \
     -f ciam-backend/changes/10082025/schema_docs/claudedocs/schema-setup-v3.sql
```

This will:
- ✅ Create the `pg_cron` extension
- ✅ Create all tables, indexes, partitions
- ✅ Create purge and partition management functions
- ✅ Schedule all 11 cron jobs
- ✅ Run verification queries

### Step 7: Verify Job Scheduling

Check that all 11 jobs were scheduled:

```sql
-- List all scheduled jobs
SELECT
    jobid,
    jobname,
    schedule,
    active,
    database
FROM cron.job
ORDER BY jobname;
```

Expected: **11 jobs** should be listed:
1. `cleanup-expired-contexts`
2. `cleanup-expired-transactions`
3. `create-partitions-hourly`
4. `drop-old-partitions-hourly`
5. `expire-old-sessions`
6. `purge-auth-contexts`
7. `purge-auth-transactions`
8. `purge-expired-tokens`
9. `purge-sessions`
10. `vacuum-analyze-partitioned`
11. `vacuum-analyze-transactional`

---

## Verification

### Complete Verification Checklist

Run these queries to ensure everything is working:

```sql
-- 1. Extension verification
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'pg_cron';

-- 2. Job count verification
SELECT COUNT(*) as scheduled_jobs
FROM cron.job;
-- Expected: 11

-- 3. Job schedule verification
SELECT
    jobname,
    schedule,
    CASE
        WHEN schedule = '*/10 * * * *' THEN 'Every 10 min'
        WHEN schedule = '*/5 * * * *' THEN 'Every 5 min'
        WHEN schedule = '*/15 * * * *' THEN 'Every 15 min'
        WHEN schedule = '0 * * * *' THEN 'Hourly'
        WHEN schedule = '30 * * * *' THEN 'Hourly at :30'
        WHEN schedule = '35 * * * *' THEN 'Hourly at :35'
        WHEN schedule = '5 * * * *' THEN 'Hourly at :05'
        WHEN schedule = '0 3 * * *' THEN 'Daily at 3 AM'
        WHEN schedule = '0 4 * * 0' THEN 'Sunday at 4 AM'
        ELSE 'Custom'
    END as frequency
FROM cron.job
ORDER BY jobname;

-- 4. Recent job executions (wait 10-15 min after setup)
SELECT
    j.jobname,
    jr.status,
    jr.start_time,
    jr.end_time,
    (jr.end_time - jr.start_time) as duration,
    jr.return_message
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE jr.start_time > NOW() - INTERVAL '1 hour'
ORDER BY jr.start_time DESC
LIMIT 20;

-- 5. Failed jobs check
SELECT
    j.jobname,
    jr.status,
    jr.start_time,
    jr.return_message
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE jr.status = 'failed'
ORDER BY jr.start_time DESC
LIMIT 10;
```

---

## Monitoring

### Daily Health Check Queries

**Job Execution Summary** (last 24 hours):
```sql
SELECT
    j.jobname,
    COUNT(*) as executions,
    COUNT(*) FILTER (WHERE jr.status = 'succeeded') as succeeded,
    COUNT(*) FILTER (WHERE jr.status = 'failed') as failed,
    ROUND(AVG(EXTRACT(EPOCH FROM (jr.end_time - jr.start_time)))) as avg_duration_sec
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE jr.start_time > NOW() - INTERVAL '24 hours'
GROUP BY j.jobname
ORDER BY j.jobname;
```

**Purge Performance** (from custom metrics):
```sql
-- View last 24 hours of purge operations
SELECT * FROM v_purge_performance;

-- Check purge effectiveness
SELECT
    table_name,
    SUM(rows_deleted) as total_purged_24h,
    COUNT(*) as purge_runs,
    MAX(duration_ms) as max_duration_ms
FROM purge_metrics
WHERE run_at > NOW() - INTERVAL '24 hours'
GROUP BY table_name
ORDER BY total_purged_24h DESC;
```

**Partition Status**:
```sql
-- Check partition counts
SELECT * FROM v_partition_status;

-- Verify partition creation/cleanup
SELECT
    tablename,
    COUNT(*) as partition_count
FROM pg_tables
WHERE tablename LIKE 'tokens_inactive_%'
   OR tablename LIKE 'drs_evaluations_%'
   OR tablename LIKE 'audit_logs_%'
GROUP BY
    CASE
        WHEN tablename LIKE 'tokens_inactive_%' THEN 'tokens_inactive'
        WHEN tablename LIKE 'drs_evaluations_%' THEN 'drs_evaluations'
        WHEN tablename LIKE 'audit_logs_%' THEN 'audit_logs'
    END;
```

### CloudWatch Metrics Integration

Set up CloudWatch alarms for job failures:

```bash
# AWS CLI - Create SNS topic for alerts
aws sns create-topic --name ciam-pgcron-alerts

# Subscribe email to topic
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:YOUR_ACCOUNT:ciam-pgcron-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com
```

Create custom RDS metric:
```sql
-- Query to expose as custom metric
SELECT COUNT(*) as failed_jobs_last_hour
FROM cron.job_run_details
WHERE status = 'failed'
  AND start_time > NOW() - INTERVAL '1 hour';
```

---

## Troubleshooting

### Issue 1: Extension Creation Fails

**Error**: `ERROR: could not open extension control file`

**Cause**: pg_cron not in `shared_preload_libraries`

**Solution**:
1. Verify parameter group settings (Step 2)
2. Ensure RDS instance was rebooted (Step 4)
3. Check parameter is active: `SHOW shared_preload_libraries;`

---

### Issue 2: Jobs Not Executing

**Error**: Jobs scheduled but no executions in `cron.job_run_details`

**Cause 1**: Wrong database specified in `cron.database_name`

**Solution**:
```sql
-- Check current database
SELECT current_database();

-- Check cron database setting
SHOW cron.database_name;

-- If mismatch, update parameter group and reboot
```

**Cause 2**: pg_cron service not running

**Solution**:
```sql
-- Check if pg_cron background worker is running
SELECT pid, backend_type
FROM pg_stat_activity
WHERE backend_type = 'pg_cron launcher';

-- Should return 1 row
```

---

### Issue 3: Jobs Failing with Permission Errors

**Error**: `ERROR: permission denied for function xyz`

**Cause**: Job runs as different user than extension creator

**Solution**:
```sql
-- Grant execute permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- Or specific functions
GRANT EXECUTE ON FUNCTION purge_auth_contexts() TO postgres;
```

---

### Issue 4: Partition Creation/Drop Not Working

**Error**: `ERROR: relation "partition_name" already exists`

**Cause**: Race condition or previous failed run

**Solution**:
```sql
-- Manual partition cleanup
SELECT drop_old_partitions();

-- Check for orphaned partitions
SELECT tablename
FROM pg_tables
WHERE tablename LIKE 'tokens_inactive_%'
  AND tablename < 'tokens_inactive_' || TO_CHAR(NOW() - INTERVAL '26 hours', 'YYYY_MM_DD_HH24');

-- Manual drop if needed
DROP TABLE IF EXISTS tokens_inactive_2025_01_15_10 CASCADE;
```

---

### Issue 5: High Replication Lag During Purges

**Symptom**: Read replicas lag behind primary during purge operations

**Solution**: Tune batch sizes in purge functions:
```sql
-- Reduce batch size for sessions (has cascades)
CREATE OR REPLACE FUNCTION purge_sessions()
RETURNS TABLE(deleted BIGINT, duration NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM batch_purge_table(
        'sessions',
        'created_at < NOW() - INTERVAL ''25 hours''
         AND status IN (''EXPIRED'', ''LOGGED_OUT'', ''REVOKED'')',
        2000,  -- Reduced from 5000
        0.5    -- Increased sleep from 0.2
    );
END;
$$ LANGUAGE plpgsql;
```

---

## Security Considerations

### Principle of Least Privilege

**Create dedicated pg_cron user** (recommended):
```sql
-- Create pg_cron execution user
CREATE USER pgcron_runner WITH PASSWORD 'secure_password_here';

-- Grant only required permissions
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA public TO pgcron_runner;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pgcron_runner;
GRANT USAGE ON SCHEMA cron TO pgcron_runner;

-- Update job ownership (if needed)
-- Note: Job ownership change requires recreating jobs
```

### Secrets Management

**For RDS Master Password**:
- Use AWS Secrets Manager for master password rotation
- Enable automatic rotation policy
- Update connection strings to retrieve from Secrets Manager

```bash
# Store master password in Secrets Manager
aws secretsmanager create-secret \
  --name ciam-db-master-password \
  --secret-string '{"username":"postgres","password":"your_password"}'

# Enable rotation (30 days)
aws secretsmanager rotate-secret \
  --secret-id ciam-db-master-password \
  --rotation-lambda-arn arn:aws:lambda:region:account:function:RDSRotationLambda \
  --rotation-rules AutomaticallyAfterDays=30
```

### Audit Logging

Enable PostgreSQL audit logging for pg_cron:
```sql
-- Track pg_cron job executions in audit_logs table
-- (Already handled in schema via audit_logs table)

-- Additional RDS Parameter Group settings
ALTER SYSTEM SET log_statement = 'mod';  -- Log all DDL/DML
ALTER SYSTEM SET log_min_duration_statement = 5000;  -- Log slow queries
```

---

## Performance Tuning

### Optimal pg_cron Settings

Add these to your parameter group if needed:
```
cron.max_running_jobs = 32        # Default, increase if jobs queue
cron.log_run = on                 # Keep job execution logs
cron.log_statement = on           # Log SQL statements
cron.use_background_workers = on  # Use BGW for reliability
```

### Connection Pool Impact

pg_cron jobs consume database connections. Ensure adequate connections:

**Check current usage**:
```sql
SELECT
    max_conn,
    used,
    res_for_super,
    max_conn - used - res_for_super AS free_conn
FROM (
    SELECT COUNT(*) AS used FROM pg_stat_activity
) t1,
(
    SELECT setting::int AS max_conn FROM pg_settings WHERE name = 'max_connections'
) t2,
(
    SELECT setting::int AS res_for_super FROM pg_settings WHERE name = 'superuser_reserved_connections'
) t3;
```

**Recommended**: Add 20-30 extra connections for pg_cron jobs
```
max_connections = 200  # Adjust based on your application needs + 20-30 for pg_cron
```

---

## Maintenance

### Cleaning Up Old Job Run History

pg_cron stores job execution history in `cron.job_run_details`. Clean periodically:

```sql
-- Create cleanup job (run monthly)
SELECT cron.schedule(
    'cleanup-pgcron-history',
    '0 2 1 * *',  -- 2 AM on 1st of month
    $$DELETE FROM cron.job_run_details
      WHERE end_time < NOW() - INTERVAL '30 days'$$
);

-- Manual cleanup
DELETE FROM cron.job_run_details
WHERE end_time < NOW() - INTERVAL '30 days';
```

### Backup Considerations

**pg_cron jobs are NOT backed up in RDS snapshots**

To preserve job schedules:
```bash
# Export job definitions
psql -h your-rds-endpoint.rds.amazonaws.com -d ciam_db -c \
  "SELECT jobname, schedule, command FROM cron.job" \
  -o pgcron_jobs_backup.txt

# Or dump as SQL
psql -h your-rds-endpoint.rds.amazonaws.com -d ciam_db -c \
  "SELECT 'SELECT cron.schedule(' ||
   quote_literal(jobname) || ', ' ||
   quote_literal(schedule) || ', ' ||
   quote_literal(command) || ');'
   FROM cron.job" \
  -t -o restore_pgcron_jobs.sql
```

**After RDS restore from snapshot**:
1. Re-run parameter group configuration (Steps 2-4)
2. Re-run schema-setup-v3.sql to recreate jobs

---

## Additional Resources

**AWS Documentation**:
- [Working with PostgreSQL Read Replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PostgreSQL.Replication.ReadReplicas.html)
- [RDS Parameter Groups](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithParamGroups.html)

**pg_cron Documentation**:
- [Official GitHub Repository](https://github.com/citusdata/pg_cron)
- [pg_cron Reference](https://www.postgresql.org/docs/current/pgcron.html)

**CIAM Schema Documentation**:
- See `ciam-database-optimization-analysis.md` for complete architecture details
- See `schema-setup-v3.sql` for implementation

---

## Quick Reference

### Essential Commands

```bash
# Connect to database
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d ciam_db

# List all jobs
SELECT jobname, schedule FROM cron.job ORDER BY jobname;

# Check job status
SELECT j.jobname, jr.status, jr.start_time
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE jr.start_time > NOW() - INTERVAL '1 hour';

# Manual job execution (testing)
SELECT purge_auth_contexts();

# Disable a job temporarily
UPDATE cron.job SET active = false WHERE jobname = 'purge-sessions';

# Re-enable a job
UPDATE cron.job SET active = true WHERE jobname = 'purge-sessions';

# Unschedule a job
SELECT cron.unschedule('job-name');
```

---

## Support Contacts

**AWS Support**:
- Open support case for RDS issues
- Include RDS instance ID and parameter group details

**Database Team**:
- Escalate purge performance issues
- Report unexpected job failures

**Monitoring Alerts**:
- CloudWatch: AWS Console → CloudWatch → Alarms
- Job failure threshold: 3 consecutive failures = page on-call

---

**Document Version**: 1.0
**Last Updated**: October 2025
**Maintained By**: CIAM Infrastructure Team
