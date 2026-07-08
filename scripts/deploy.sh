#!/usr/bin/env bash
# Build the site (with the GitHub Pages base path and the current scraped data)
# and publish it to the gh-pages branch. Requires SSH access to the repo.
set -euo pipefail

REPO="git@github.com:pdesainteagathe/avignon-planner.git"
BASE="/avignon-planner/"
URL="https://pdesainteagathe.github.io/avignon-planner/"

cd "$(dirname "$0")/.."

echo "→ build (base=$BASE, data de public/ incluse)"
VITE_BASE="$BASE" npm run build

TMP="$(mktemp -d)"
cp -r dist/. "$TMP"/
touch "$TMP/.nojekyll"
(
  cd "$TMP"
  git init -q
  git checkout -q -b gh-pages
  git add -A
  git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "Deploy $(date -u +%FT%TZ)"
  git push -f -q "$REPO" gh-pages
)
rm -rf "$TMP"
echo "✓ déployé → $URL (propagation ~30 s)"
