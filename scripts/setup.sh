#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ ! -f .env ]]; then cp .env.example .env; fi
npm ci --no-audit --no-fund
npm run db:generate
if [[ "${START_LOCAL_DB:-1}" == "1" ]]; then docker compose up -d --wait db; fi
npm run db:migrate
npm run db:seed
