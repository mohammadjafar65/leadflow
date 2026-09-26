#!/bin/bash
set -euo pipefail
umask 077
RELEASE_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
CONFIG="$HOME/.config/leadflow/deploy.env"
if [[ ! -f "$CONFIG" ]]; then
  echo "Create $CONFIG using docs/github-namecheap-setup.md before deploying." >&2
  exit 1
fi
source "$CONFIG"
: "${APP_ROOT:?Set APP_ROOT in deploy.env}"
: "${WEB_ROOT:?Set WEB_ROOT in deploy.env}"
: "${NODE_ACTIVATE:?Set NODE_ACTIVATE in deploy.env}"
APP_ROOT="$(realpath -e "$APP_ROOT")"
WEB_ROOT="$(realpath -e "$WEB_ROOT")"
USER_ROOT="$(realpath -e "$HOME")"
for target in "$APP_ROOT" "$WEB_ROOT"; do
  [[ "$target" == "$USER_ROOT/"* && "$target" != "$RELEASE_ROOT" ]] || { echo 'Invalid deployment target'; exit 1; }
  [[ "$RELEASE_ROOT" != "$target/"* && "$target" != "$RELEASE_ROOT/"* ]] || { echo 'Keep the Git checkout separate from live directories'; exit 1; }
done
[[ "$APP_ROOT" != "$WEB_ROOT" && "$APP_ROOT" != "$WEB_ROOT/"* && "$WEB_ROOT" != "$APP_ROOT/"* ]] || { echo 'API and web folders must be separate'; exit 1; }
[[ -f "$APP_ROOT/.env" && -f "$RELEASE_ROOT/server/dist/src/index.js" && -f "$RELEASE_ROOT/web/index.html" ]] || { echo 'Missing production .env or release build'; exit 1; }
# CloudLinux's activation script reads optional unset variables (CL_VIRTUAL_ENV).
# Keep fail-fast command handling, but allow its normal unset-variable behavior.
set +u
source "$NODE_ACTIVATE"
set -u
BACKUP="$HOME/.leadflow-deploy-backups/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$BACKUP"
tar --exclude='./node_modules' --exclude='./data' --exclude='./.git' -czf "$BACKUP/server.tgz" -C "$APP_ROOT" .
tar -czf "$BACKUP/web.tgz" -C "$WEB_ROOT" .
echo "Backup saved privately at $BACKUP"
# Preserve .env, cPanel symlinks, local extracts and Passenger configuration.
cp -a "$RELEASE_ROOT/server/." "$APP_ROOT/"
cd "$APP_ROOT"
node scripts/repair-cpanel.mjs
npm install --omit=dev --legacy-peer-deps --no-audit --no-fund
node --check dist/src/index.js
# Preserve an existing frontend .htaccess (it may contain hosting directives).
while IFS= read -r -d '' file; do
  name="$(basename "$file")"
  [[ "$name" == '.htaccess' && -f "$WEB_ROOT/.htaccess" ]] && continue
  cp -a "$file" "$WEB_ROOT/"
done < <(find "$RELEASE_ROOT/web" -mindepth 1 -maxdepth 1 -print0)
mkdir -p tmp
touch tmp/restart.txt
echo 'Files deployed and Passenger restart requested. Check API health and sign-in.'
echo 'Database migrations and credential changes were not run automatically.'
