# cPanel repair: npm peers, stopped app and directory listing

The latest screenshots show npm still failing, the Node app stopped (`START APP` button), and the API URL serving an Apache directory listing. They also show manifest sizes consistent with development manifests rather than the earlier runtime-only patch. This is evidence to check/update the actual deployed files, not proof that the prior ZIP was installed.

Upload `repair-cpanel.mjs` from the repair ZIP directly into `/home/softoatk/mzistudio.com/leadflow-server`. Do not place it inside a nested server folder. The standalone script needs only Node, so the broken npm installation does not prevent running it.

Run this exact block in the hosting terminal:

```bash
source /home/softoatk/nodevenv/mzistudio.com/leadflow-server/22/bin/activate
cd /home/softoatk/mzistudio.com/leadflow-server
node repair-cpanel.mjs && npm install --omit=dev --legacy-peer-deps --no-audit --no-fund
```

The repair validates the project name, backs up the original manifests, `.htaccess` and any existing `app.cjs` under `/home/softoatk/.leadflow-repair-backups/`, removes development dependencies from the deployed manifest/lock, appends static-source protection to `.htaccess`, and writes a CommonJS Passenger entry point that imports the compiled ESM server. It preserves cPanel's Passenger directives, `.env`, database content and the managed `node_modules` link. It prints its backup location. Development tools remain in the local source workspace; build future releases locally.

The installation command uses `--legacy-peer-deps` to bypass the peer-resolution operation identified in the supplied npm stack trace. This is a deployment workaround for this known failing path, not evidence that all peer combinations are compatible. Use this terminal command rather than repeatedly clicking cPanel's Run NPM Install button without the flag.

After installation succeeds:

1. Set cPanel's **Application startup file** to **`app.cjs`**.
2. Click **Save**, then **Start App**. Keep Node 22.23.2 and Production mode.
3. Open `https://api-leads.mzistudio.com/`. The expected result is the LeadFlow API JSON response, not the frontend dashboard or an `Index of /` page.
4. Open `/api/v1/health` to check database and Redis availability.

A 403 while the app is stopped is preferable to exposing its directory. If Apache returns 500 immediately after the repair, inspect the hosting Apache error log for disallowed `.htaccess` directives; do not overwrite the cPanel Passenger block. The original `.htaccess` is in the printed backup directory, and cPanel's Indexes setting can also disable directory listing.

If npm fails again, **read** the new log using `tail -n 60` followed by its filename. Typing a `.log` path by itself tries to execute it and causes the separate `Permission denied` error shown in the screenshot. Do not change log permissions or use chmod 777.

Verification: the repair has a local regression test covering backup creation, development dependency removal, retained Passenger directives and repeat-safe protection rules. The proposed npm command succeeds with npm 10.9.8 locally. Apache/Passenger behavior and the Linux hosting installation cannot be verified from this workspace; verify the live responses after applying.

References: [npm legacy-peer-deps](https://docs.npmjs.com/cli/v10/using-npm/config#legacy-peer-deps), [Apache Options](https://httpd.apache.org/docs/2.4/mod/core.html#options), [Passenger Apache application configuration](https://www.phusionpassenger.com/library/config/apache/reference/).
