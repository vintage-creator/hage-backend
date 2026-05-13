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
until npx prisma db execute --url "$DATABASE_URL" --stdin <<'SQL' > /dev/null 2>&1
SELECT 1;
SQL
do
  echo "DB not ready yet, waiting 5 seconds..."
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
# 5. Initialize only if empty or FORCE=true
#
if [ "$FORCE" = "true" ] || [ "$TABLE_COUNT" -eq 0 ]; then
  echo "Running DB initialization..."

  echo "Synchronizing database schema..."
  # Skip migrations and go straight to db push to avoid P3005 errors
  if timeout 60 npx prisma db push --accept-data-loss --skip-generate; then
    echo "Database schema synchronized"
  else
    echo "WARNING: Database push failed or timed out, but continuing with startup"
  fi

  if [ "$ENABLE_SEEDING" = "true" ]; then
    echo "Seeding enabled, checking if database needs seeding..."
    
    # Check if database has any user data (indicating it's already been seeded)
    USER_COUNT=$(timeout 15 npx prisma db execute --url "$DATABASE_URL" --stdin <<'SQL' 2>/dev/null
SELECT COUNT(*) FROM "User";
SQL
)
    
    USER_COUNT=$(echo "$USER_COUNT" | grep -Eo '[0-9]+' | tail -1 || echo "0")
    if [ -z "$USER_COUNT" ]; then USER_COUNT=0; fi
    
    echo "User count: $USER_COUNT"
    
    if [ "$USER_COUNT" -eq 0 ]; then
      echo "Database appears empty, running seed..."
      if timeout 120 npx prisma db seed; then
        echo "Seed completed successfully"
        echo "Skipping seed verification to prevent startup delays"
      else
        echo "WARNING: Seed failed/timed out, continuing"
      fi
    else
      echo "Database already contains data ($USER_COUNT users), skipping seed"
    fi
  else
    echo "Seeding disabled (ENABLE_SEEDING=false)"
    echo "For production: Run seeding manually if needed"
    
    # Show current data status for production verification
    USER_COUNT=$(timeout 15 npx prisma db execute --url "$DATABASE_URL" --stdin <<'SQL' 2>/dev/null
SELECT COUNT(*) FROM "User";
SQL
)
    USER_COUNT=$(echo "$USER_COUNT" | grep -Eo '[0-9]+' | tail -1 || echo "0")
    echo "Current user count: $USER_COUNT"
  fi
else
  echo "Existing DB detected ($TABLE_COUNT tables) — skipping migrations & seed"
fi

#
# 6. Start the app
#
echo "Launching API..."

# Prisma client is now generated and ready for runtime
echo "Prisma client ready for runtime operations"

echo "Starting NestJS application..."
exec npm run start

