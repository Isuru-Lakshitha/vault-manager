#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-preview}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔍 Running verification suite (unit tests + lint + production build)..."
npm --prefix frontend run verify

if [[ "$MODE" == "live" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "⚠️  Working tree has uncommitted changes. Please commit before deploying live."
    exit 1
  fi
  echo "🚀 Deploying Firestore rules and Hosting to live production..."
  npx firebase-tools deploy --only firestore:rules,hosting
elif [[ "$MODE" == "preview" ]]; then
  echo "🧪 Deploying to Firebase Hosting preview channel (7-day expiry)..."
  npx firebase-tools hosting:channel:deploy preview --expires 7d
else
  echo "Usage: ./scripts/deploy.sh [preview|live]"
  exit 1
fi
