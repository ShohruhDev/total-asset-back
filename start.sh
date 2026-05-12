#!/bin/sh
set -e

cd /directus

# bootstrap creates DB schema + admin on first boot. Idempotent on subsequent runs.
node cli.js bootstrap

# Apply schema snapshot if present.
if [ -f /directus/snapshots/snapshot.yaml ]; then
  echo "[start] applying schema snapshot…"
  node cli.js schema apply --yes /directus/snapshots/snapshot.yaml || echo "[start] schema apply finished (or no diff)"
fi

# Start Directus
exec node cli.js start
