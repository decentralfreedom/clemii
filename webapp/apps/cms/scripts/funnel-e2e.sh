#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Clemens Kressmann
#
# FUNNEL-001: the funnel is only proven end to end. Starts the Umami version
# production runs (with its own PostgreSQL) in Docker, makes known visits to
# the website in a real browser (apps/web tests/funnel.spec.ts), then has the
# CMS import them (tests/funnel-e2e.test.ts): both halves must see exactly the
# visits and downloads that count, and none of the noise. Nothing reaches
# production. Needs Docker, the CMS test database (HUSH_TEST_DATABASE_URL) and
# Playwright's Chromium. Run from anywhere:
#   apps/cms/scripts/funnel-e2e.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
# The version production runs (Coolify, Internal tools > umami): update both together.
umami_image="ghcr.io/umami-software/umami:3.5.0"
name="hush-funnel-e2e-$$"
cleanup() {
  # The build wrote the fixture articles into the generated blog list: back to the committed content.
  (cd apps/web && bun run blog:generate >/dev/null 2>&1) || true
  docker rm -f "$name-umami" "$name-db" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$name" >/dev/null
docker run -d --name "$name-db" --network "$name" \
  -e POSTGRES_DB=umami -e POSTGRES_USER=umami -e POSTGRES_PASSWORD=umami-e2e postgres:17-alpine >/dev/null
# Umami exits when its database does not answer yet. Over TCP: during its first start the
# image runs a temporary server on the Unix socket only.
for _ in $(seq 1 60); do docker exec "$name-db" pg_isready -h 127.0.0.1 -U umami -d umami >/dev/null 2>&1 && break; sleep 1; done
docker run -d --name "$name-umami" --network "$name" -p 127.0.0.1::3000 \
  -e DATABASE_URL="postgresql://umami:umami-e2e@$name-db:5432/umami" -e APP_SECRET="funnel-e2e-$$" -e DISABLE_TELEMETRY=1 \
  "$umami_image" >/dev/null
umami="http://127.0.0.1:$(docker port "$name-umami" 3000 | head -1 | cut -d: -f2)"
for _ in $(seq 1 90); do curl -sf "$umami/api/heartbeat" >/dev/null && break; sleep 2; done
curl -sf "$umami/api/heartbeat" >/dev/null

# A fresh Umami's own first sign-in, a website and an API key, as an owner sets them up.
json() { python3 -c "import json,sys; print(json.load(sys.stdin)[sys.argv[1]])" "$1"; }
token=$(curl -sf -X POST "$umami/api/auth/login" -H 'content-type: application/json' -d '{"username":"admin","password":"umami"}' | json token)
website=$(curl -sf -X POST "$umami/api/websites" -H "authorization: Bearer $token" -H 'content-type: application/json' -d '{"name":"behu.sh","domain":"behu.sh"}' | json id)
key=$(curl -sf -X POST "$umami/api/me/api-keys" -H "authorization: Bearer $token" -H 'content-type: application/json' -d '{"name":"funnel-e2e"}' | json key)

# The website half: fixture articles, the production build, then the journey.
(
  cd apps/web
  HUSH_BLOG_CONTENT_DIR=scripts/blog/fixtures/content bun run build >/dev/null
  HUSH_UMAMI_URL="$umami" HUSH_UMAMI_WEBSITE_ID="$website" HUSH_FUNNEL_UMAMI_API_KEY="$key" \
    bunx playwright test tests/funnel.spec.ts --project desktop
)

# The CMS half: import what Umami counted and compare.
(
  cd apps/cms
  HUSH_FUNNEL_UMAMI_URL="$umami" HUSH_FUNNEL_UMAMI_WEBSITE_ID="$website" HUSH_FUNNEL_UMAMI_API_KEY="$key" \
    bun test tests/funnel-e2e.test.ts
)
echo "FUNNEL-001 passed: the website counted, Umami stored and the CMS imported exactly the expected visits and downloads."
