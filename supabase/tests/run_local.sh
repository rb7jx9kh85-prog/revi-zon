#!/usr/bin/env bash
# Teste les migrations sur un Postgres 16 temporaire, sans Docker ni compte Supabase.
# Usage : bash supabase/tests/run_local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || echo /usr/lib/postgresql/16/bin/pg_ctl)")}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$WORK"
  RUN_AS=(runuser -u postgres --)
fi

cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -w start >/dev/null

PSQL=("${RUN_AS[@]}" psql -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres)

"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"

HAS_VECTOR="$("${PSQL[@]}" -tAc "select count(*) from pg_available_extensions where name = 'vector'")"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [ "$HAS_VECTOR" = "1" ]; then
    "${PSQL[@]}" -f "$f"
  else
    # pgvector absent : on remplace le type vector par real[] pour tester le reste.
    sed -e '/create extension if not exists vector/d' \
        -e 's/extensions\.vector(1536)/real[]/' \
        -e '/document_chunks_embedding_idx/,/vector_cosine_ops);/d' "$f" | "${PSQL[@]}"
  fi
done
[ "$HAS_VECTOR" = "1" ] || echo "(pgvector absent : colonne embedding testée en real[])"

"${PSQL[@]}" -f "$ROOT/supabase/tests/database_test.sql"
