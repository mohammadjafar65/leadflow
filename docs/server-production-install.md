# LeadFlow server release — 26 September 2026

This server-only release addresses the confirmed startup refusal:
`Production requires a private encryption key and distinct JWT signing secrets.`
The API returned LiteSpeed 503 responses, so the browser reported missing CORS headers.
No frontend replacement is needed for this error.

## Install

1. Back up your existing server outside its public directory. Upload and extract this ZIP's contents directly into `/home/softoatk/mzistudio.com/leadflow-server`. Keep your existing `.env`, data files, and cPanel `node_modules` symlink. This archive contains no `.env` and no credentials. Do not upload local `node_modules`.
2. Run in cPanel Terminal:

```sh
source /home/softoatk/nodevenv/mzistudio.com/leadflow-server/22/bin/activate
cd /home/softoatk/mzistudio.com/leadflow-server
node scripts/repair-cpanel.mjs && npm install --omit=dev --legacy-peer-deps --no-audit --no-fund && node scripts/setup-production.mjs
```

The repair preserves cPanel's Passenger directives. The setup creates private random keys only when missing, development defaults, or invalid JWT settings require replacements. Existing private encryption keys and unrelated settings are preserved. It sets `NODE_ENV=production` and `CLIENT_ORIGIN=https://leads.mzistudio.com`. A private `.env` backup is kept outside the application directory; secrets are never printed.

If setup reports conflicting cPanel Environment Variables, remove only the listed overrides from the Node.js app settings, Save, then open a fresh terminal, activate the environment again, and rerun `node scripts/setup-production.mjs`. Existing valid private keys are retained. Do not replace the encryption key on every deployment.

3. In cPanel Node.js settings, set **Application startup file** to **app.cjs**, Save, then **Start App** or **Restart**.
4. Verify `https://api-leads.mzistudio.com/` returns JSON with `status: online`. Reload the frontend and sign in.

When a development encryption key is replaced, previously encrypted integrations need reconnecting. Signing secret changes may require users to sign in again. Database settings are preserved; no database migrations run automatically during this repair.

## Verify deployment

```sh
curl -i https://api-leads.mzistudio.com/
curl -i -X OPTIONS https://api-leads.mzistudio.com/api/v1/auth/login -H 'Origin: https://leads.mzistudio.com' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type'
```

Expected: root HTTP 200 JSON; OPTIONS HTTP 204 with `Access-Control-Allow-Origin: https://leads.mzistudio.com` and credentials allowed. If startup still fails, read `tail -n 80 stderr.log` (do not execute the log filename). A new database or Redis error is a separate hosting configuration issue.

This archive includes prebuilt server code, production dependencies manifests, migrations, and deployment/import scripts. It excludes development dependencies, old deployment bundles, credentials, and local data. Local build and tests passed; live recovery requires installation and restart on your hosting account.
