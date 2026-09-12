#!/bin/sh
set -eu

has_database_config=false
if [ -n "${DATABASE_URL:-}" ] || [ -n "${DB_HOST:-}" ]; then
  has_database_config=true
fi

if [ "$has_database_config" = "true" ] && [ "${SKIP_DB_MIGRATIONS:-false}" != "true" ]; then
  attempt=1
  while ! node /app/scripts/migrate.mjs /app/migrations/0001_initial.sql; do
    if [ "$attempt" -ge 10 ]; then
      echo "Database migration failed after $attempt attempts." >&2
      exit 1
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
fi

if [ "$has_database_config" = "true" ] && [ "${SKIP_CORPUS_IMPORT:-false}" != "true" ]; then
  set -- /app/corpus/published/*.json
  if [ -e "$1" ]; then
    node /app/scripts/import-corpus.mjs --publish --replace-editions "$@"
  fi
fi

if [ "$has_database_config" = "true" ] && [ "${SKIP_CORPUS_RETIREMENTS:-false}" != "true" ]; then
  set -- /app/corpus/retired/*.retired
  if [ -e "$1" ]; then
    node /app/scripts/archive-editions.mjs "$@"
  fi
fi

exec node /app/apps/web/server.js
