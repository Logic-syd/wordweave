#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
npm run db:migrate
# Set true for the first deployment; turn it off afterwards if demos are deleted.
if [[ "${SEED_DEMOS:-false}" == "true" ]]; then
  npm run db:seed
fi
