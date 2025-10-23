#!/usr/bin/env bash
set -euo pipefail

FORCE="${FORCE:-false}"

# Load .env safely
if [ -f .env ]; then
  set -o allexport
  source .env
  set +o allexport
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Aborting."
  exit 2
fi

echo "Using DATABASE_URL host: ${DATABASE_URL%%/*} (host portion hidden)"

has_psql() {
  command -v psql >/dev/null 2>&1
}

check_db_empty_via_psql() {
 
  psql "$DATABASE_URL" -t -A -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%';"
}

echo "1) prisma generate"
npx prisma generate

if [ "$FORCE" = "true" ]; then
  echo "FORCE=true -> skipping DB-empty check and proceeding to migration/push."
else
  if has_psql; then
    echo "psql found — checking for existing tables in public schema..."
    TABLE_COUNT=$(check_db_empty_via_psql) || {
      echo "Warning: failed to query DB with psql. Proceeding to migrations/push (psql query error)."
      TABLE_COUNT=0
    }

    TABLE_COUNT="$(echo -n "$TABLE_COUNT" | tr -d '[:space:]')"
    if [ -z "$TABLE_COUNT" ]; then TABLE_COUNT=0; fi

    if [ "$TABLE_COUNT" -gt 0 ]; then
      echo "✅ Database already contains ${TABLE_COUNT} table(s)."
      echo "No schema push/migrate will be performed. If you want to force re-initialization, run with FORCE=true."
      exit 0
    else
      echo "No user tables found in DB. Proceeding to migrate/push..."
    fi
  else
    echo "⚠️ psql not found. Cannot safely check DB emptiness."
    echo "The script will proceed to run migrations/push. (Recommend installing psql in CI for a safe pre-check.)"
  fi
fi

echo "2) Attempt prisma migrate deploy (recommended for prod)"
if npx prisma migrate deploy; then
  echo "✅ prisma migrate deploy succeeded"
else
  echo "⚠️ prisma migrate deploy failed or no migrations found — falling back to prisma db push"
  npx prisma db push
fi

echo "3) Run seed (prisma db seed -> uses prisma.seed from package.json)"
if npx prisma db seed; then
  echo "✅ Seed completed"
else
  echo "⚠️ Seed failed or no seed file found. Skipping seed step."
fi

echo "Done ✅"
