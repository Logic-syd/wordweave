#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ ! -f .env ]]; then
  echo '请先执行 npm run setup，或参考 .env.example 配置数据库。' >&2
  exit 1
fi
docker compose up -d --wait db
exec npm run dev
