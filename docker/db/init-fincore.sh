#!/bin/sh
# Runs once, when the database volume is first created (docker-entrypoint-initdb.d).
#
#   FINCORE_DB_INIT=schema  (default) apply docs/database migrations 001..020 —
#                           a fresh, empty FinCore with reference data only.
#   FINCORE_DB_INIT=empty   only the service roles; for restoring a pg_dump of
#                           an existing FinCore database (see docker/README.md).
set -eu

# Written last. The healthcheck requires it, so a database whose first-time
# setup stopped half-way is never reported healthy after a restart.
marker=/var/lib/postgresql/fincore-init.done

psql_run() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$@"
}

# The schema grants USAGE/EXECUTE to these NOLOGIN roles; a restored dump
# refers to them too, so they exist in both modes.
psql_run <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_migrator') THEN
    CREATE ROLE fincore_migrator NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_service') THEN
    CREATE ROLE fincore_service NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_app') THEN
    CREATE ROLE fincore_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_audit_writer') THEN
    CREATE ROLE fincore_audit_writer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_actor_verifier') THEN
    CREATE ROLE fincore_actor_verifier NOLOGIN;
  END IF;
END
$$;
SQL

mode="${FINCORE_DB_INIT:-schema}"
if [ "$mode" = "empty" ]; then
  echo "fincore: roles only — restore a dump next"
  touch "$marker"
  exit 0
fi
if [ "$mode" != "schema" ]; then
  echo "fincore: unknown FINCORE_DB_INIT=$mode (use schema or empty)" >&2
  exit 1
fi

# In byte order (018_0_… before 018_director_…). 004_verification.sql is a
# test suite that rolls itself back, not a migration.
for name in $(ls /fincore-migrations | grep -E '^[0-9]{3}_.*\.sql$' | LC_ALL=C sort); do
  [ "$name" = 004_verification.sql ] && continue
  echo "fincore: applying $name"
  psql_run --quiet --file "/fincore-migrations/$name"
done
touch "$marker"
echo "fincore: schema ready"
