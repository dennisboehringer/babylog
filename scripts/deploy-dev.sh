#!/usr/bin/env bash
# Deploy the current branch to the dev preview environment.
# Builds with VITE_FIREBASE_PATH_PREFIX=rooms-dev so it reads/writes to the
# isolated Firebase path, then aliases the deployment to babylog-dev.vercel.app.
set -euo pipefail

echo "→ Deploying to dev preview (Firebase path: rooms-dev)…"

DEPLOY_URL=$(npx vercel --build-env VITE_FIREBASE_PATH_PREFIX=rooms-dev --yes 2>&1 \
  | grep -oE 'https://babylog-[a-z0-9-]+\.vercel\.app' \
  | head -1)

if [ -z "$DEPLOY_URL" ]; then
  echo "✗ Could not determine deployment URL"
  exit 1
fi

echo "→ Deployment: $DEPLOY_URL"
echo "→ Aliasing to babylog-dev.vercel.app…"

npx vercel alias set "$DEPLOY_URL" babylog-dev.vercel.app

echo "✓ Dev environment live: https://babylog-dev.vercel.app"
