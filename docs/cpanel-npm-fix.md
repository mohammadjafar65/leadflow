# cPanel npm peer-resolver fix

The supplied debug log locates the crash in npm 10.9.8's Arborist `#loadPeerSet`, while building `node_modules/vitest`. It fetches `@vitest/browser-playwright@5.0.2` and `vitest@4.1.11` immediately before the failure. This identifies a development peer-resolution failure, not an application startup or input-file error. The exact internal npm defect is not reproduced locally.

The patch supplies a **runtime-only package.json and matching package-lock.json** for a prebuilt server deployment. It preserves the source project's runtime dependencies and locked versions, but removes development/test dependencies from the deployment graph. The original source package retains its build and test tools. Merely using `--omit=dev` does not prevent dev dependency resolution: [npm documents this distinction](https://docs.npmjs.com/cli/v10/commands/npm-install/#omit).

## Apply on the hosting server

1. Stop the Node app in cPanel for this dependency update. This patch expects the existing compiled `dist/src/index.js`; it is not a source-build deployment.
2. In the hosting terminal, activate the app environment and back up the current manifests:

```bash
source /home/softoatk/nodevenv/mzistudio.com/leadflow-server/22/bin/activate
cd /home/softoatk/mzistudio.com/leadflow-server
BACKUP_DIR="npm-manifests-backup-$(date +%Y%m%d-%H%M%S)"
mkdir "$BACKUP_DIR"
cp package.json "$BACKUP_DIR/"
if [ -f package-lock.json ]; then cp package-lock.json "$BACKUP_DIR/"; fi
```

3. Upload `leadflow-cpanel-npm-fix-20260926.zip` and extract **inside** `/home/softoatk/mzistudio.com/leadflow-server`, replacing only `package.json` and `package-lock.json`. Keep `.env`, the CloudLinux `node_modules` symlink, compiled `dist`, migrations and application files.
4. In the same activated terminal, run:

```bash
node --check dist/src/index.js && npm install --omit=dev --no-audit --no-fund
```

5. If installation succeeds, restart the app through cPanel and verify its health. If it fails, leave it stopped and share the new debug-log tail; don't apply additional force/cache-clearing/deletion workarounds blindly. Restore the backed-up manifest pair if abandoning this update.

The patch does not run database migrations, modify credentials, send messages or replace application code. It removes build/test npm scripts from the deployed manifest: future code builds should happen in the source workspace, followed by uploading the compiled dist directory. Generate future runtime manifests with `node server/scripts/prepare-runtime-package.mjs NEW_OUTPUT_DIRECTORY`, then verify them before deployment.

## Verification scope

The runtime-package regression test verifies that runtime dependencies are retained and the Vitest/Vite development graph is absent. A clean runtime install with npm 10.9.8 is checked locally on Windows/Node 24.10.0. The user's environment is Linux/Node 22.23.2: installation and restart there still need confirmation. No remote fix is claimed until that succeeds.
