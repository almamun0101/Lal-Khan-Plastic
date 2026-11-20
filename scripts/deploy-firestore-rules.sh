#!/usr/bin/env sh
set -eu
PROJECT_ID="factory-7faaa"
if ! command -v npx >/dev/null 2>&1; then
  echo "Node.js/npm is required to deploy Firestore rules." >&2
  exit 1
fi
npx --yes firebase-tools deploy --only firestore:rules --project "$PROJECT_ID"
