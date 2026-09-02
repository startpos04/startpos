#!/bin/sh
# prisma/ensure-database.sh
#
# Runs once as the `db-init` service after Postgres is healthy.
# Creates the application database if it doesn't already exist.

set -e

echo "[db-init] Ensuring database '$POSTGRES_DB' exists..."

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  --host="$POSTGRES_HOST" \
  --port="${POSTGRES_PORT:-5432}" \
  --username="$POSTGRES_USER" \
  --dbname="postgres" \
  --command="DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '$POSTGRES_DB') THEN EXECUTE 'CREATE DATABASE \"$POSTGRES_DB\"'; END IF; END \$\$;"

echo "[db-init] Done."
