#!/usr/bin/env bash
set -euo pipefail

FORCE="${FORCE:-false}"
ENABLE_SEEDING="${ENABLE_SEEDING:-true}"

echo "Starting application setup..."

#
# 1. Ensure DATABASE_URL exists
#
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set. Aborting startup."
  exit 2
fi

echo "Using DATABASE_URL host (redacted): ${DATABASE_URL%%/*}********"
# echo "Using DATABASE_URL full: $DATABASE_URL"

#
# 2. Wait for DB to be ready
#
echo "Waiting for database to accept connections..."
MAX_DB_WAIT_ATTEMPTS="${MAX_DB_WAIT_ATTEMPTS:-60}"
db_attempt=0
until npx prisma db execute --url "$DATABASE_URL" --stdin <<'SQL' > /dev/null 2>&1
SELECT 1;
SQL
do
  db_attempt=$((db_attempt + 1))
  if [ "$db_attempt" -ge "$MAX_DB_WAIT_ATTEMPTS" ]; then
    echo "ERROR: Database unreachable after $db_attempt attempts (~$((db_attempt * 5))s). Check DATABASE_URL, security groups, and VPC connector."
    exit 1
  fi
  echo "DB not ready yet, waiting 5 seconds... ($db_attempt/$MAX_DB_WAIT_ATTEMPTS)"
  sleep 5
done
echo "DB connection OK"

#
# 3. Use pre-built Prisma client (skip runtime generation)
#
echo "Using pre-built Prisma client from Docker build stage..."
if [ -f "/app/node_modules/.prisma/client/index.js" ] && [ -f "/app/node_modules/.prisma/client/default.js" ]; then
  echo "Prisma client files verified from build stage"
  echo "Skipping runtime generation to avoid timeouts"
else
  echo "ERROR: Prisma client files missing from build stage"
  echo "This indicates a Docker build issue - client should be generated during build"
  exit 1
fi

#
# 4. Check if DB is empty (count all tables, including _prisma_migrations)
#
echo "Checking database table count..."
RAW_COUNT=$(timeout 15 npx prisma db execute --url "$DATABASE_URL" --stdin <<'SQL' 2>/dev/null
SELECT COUNT(*) AS c
FROM information_schema.tables
WHERE table_schema='public'
  AND table_type='BASE TABLE';
SQL
)

TABLE_COUNT=$(echo "$RAW_COUNT" | grep -Eo '[0-9]+' | tail -1 || echo "0")
if [ -z "$TABLE_COUNT" ]; then TABLE_COUNT=0; fi

echo "Table count (including migrations): $TABLE_COUNT"

# Show actual table names for verification
echo "Checking actual table names..."
TABLE_NAMES=$(timeout 15 npx prisma db execute --url "$DATABASE_URL" --stdin <<'SQL' 2>/dev/null
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema='public' 
  AND table_type='BASE TABLE'
ORDER BY table_name;
SQL
)

if [ -n "$TABLE_NAMES" ]; then
  echo "Tables found:"
  echo "$TABLE_NAMES" | grep -v "table_name" | while read -r table; do
    if [ -n "$table" ]; then
      echo "  - $table"
    fi
  done
else
  echo "No tables found or query failed"
fi

#
# 5. Bring the schema up to date on EVERY boot via `prisma migrate deploy`,
#    using the credentials this container was given (so it always targets the
#    database the app itself uses). All DDL uses DIRECT_URL — the direct,
#    non-pooled connection; the pooled DATABASE_URL cannot run DDL.
#
#    This database predates migrations (it was built with `db push`), so its
#    existing tables have no migration history and the first `migrate deploy`
#    fails with P3005. We detect that and adopt the database automatically,
#    once: a non-destructive `db push` (NO --accept-data-loss, so it ABORTS
#    rather than dropping data) repairs any additive drift — including the
#    columns prod is currently missing — then we baseline `0_init` and re-run
#    deploy. Never crashes the container: on any failure we log and start anyway.
#
echo "Applying database migrations (prisma migrate deploy)..."
if DEPLOY_OUT=$(timeout 120 npx prisma migrate deploy 2>&1); then
  echo "$DEPLOY_OUT"
  echo "Migrations applied (or already up to date)."
elif echo "$DEPLOY_OUT" | grep -q "P3005"; then
  echo "$DEPLOY_OUT"
  echo "P3005: existing un-migrated database — adopting into Prisma migrations (one-time)..."
  echo "  Repairing additive drift with 'prisma db push' (aborts if it would drop data)..."
  if timeout 120 npx prisma db push --skip-generate; then
    if timeout 60 npx prisma migrate resolve --applied 0_init; then
      echo "  Baseline recorded; applying any remaining migrations..."
      if timeout 120 npx prisma migrate deploy; then
        echo "  Adoption complete — database is in sync."
      else
        echo "  WARNING: migrate deploy still failing after adoption. Continuing."
      fi
    else
      echo "  WARNING: could not record baseline (0_init). Continuing."
    fi
  else
    echo "  WARNING: 'db push' failed — destructive drift, or DIRECT_URL unset/unreachable."
    echo "  Schema NOT changed. Continuing so the service stays up."
  fi
else
  echo "$DEPLOY_OUT"
  echo "WARNING: 'prisma migrate deploy' failed (not P3005) — schema NOT applied."
  echo "  Check DIRECT_URL is the direct (non-pooled) connection. Continuing."
fi

#
# 6. Seed only on a first-time (userless) database.
#
if [ "$ENABLE_SEEDING" = "true" ]; then
  USER_COUNT=$(timeout 15 npx prisma db execute --url "$DATABASE_URL" --stdin <<'SQL' 2>/dev/null
SELECT COUNT(*) FROM "User";
SQL
)
  USER_COUNT=$(echo "$USER_COUNT" | grep -Eo '[0-9]+' | tail -1 || echo "0")
  if [ -z "$USER_COUNT" ]; then USER_COUNT=0; fi
  echo "User count: $USER_COUNT"
  if [ "$USER_COUNT" -eq 0 ]; then
    echo "No users found, running seed..."
    if timeout 120 npx prisma db seed; then
      echo "Seed completed successfully"
    else
      echo "WARNING: Seed failed/timed out, continuing"
    fi
  else
    echo "Database already contains data ($USER_COUNT users), skipping seed"
  fi
else
  echo "Seeding disabled (ENABLE_SEEDING=false)"
fi

#
# 7. Start the app
#
echo "Launching API..."

# Prisma client is now generated and ready for runtime
echo "Prisma client ready for runtime operations"

echo "Starting NestJS application..."
exec npm run start

