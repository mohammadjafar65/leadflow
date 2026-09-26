# GitHub and Namecheap deployment

Repository: https://github.com/mohammadjafar65/leadflow

`main` contains source. After CI succeeds for a push to main, **Prepare Namecheap release** builds both applications with Node 22 and publishes the prebuilt `hosting` branch. That branch contains `web/`, `server/`, `.cpanel.yml`, and the deployment script; no credentials or node_modules. A downloadable release is also attached to the Actions run.

## Connect cPanel once

1. Wait for GitHub Actions CI and Prepare Namecheap release to succeed. The `hosting` branch must exist before continuing.
2. In cPanel → Git Version Control → Create, clone the repository into `/home/softoatk/repositories/leadflow`. Keep this checkout outside all website document roots and separate from the live API directory.
3. Use the HTTPS clone URL for a public repository. For a private repository use `ssh://git@github.com/mohammadjafar65/leadflow.git` and add a cPanel-generated **public** SSH key to GitHub repository Settings → Deploy keys with read-only access. The matching private key stays on the hosting account. A public key alone cannot authenticate a connection from your computer to Namecheap.
4. Open Manage for the repository and select the `hosting` checked-out branch (not main).
5. In cPanel → Domains, copy the exact Document Root for `leads.mzistudio.com`. Do not assume it is `public_html`.
6. In cPanel Terminal create the private deployment configuration:

```sh
mkdir -p /home/softoatk/.config/leadflow
chmod 700 /home/softoatk/.config/leadflow
nano /home/softoatk/.config/leadflow/deploy.env
```

Save these settings, replacing the frontend path with the actual Document Root:

```sh
APP_ROOT='/home/softoatk/mzistudio.com/leadflow-server'
WEB_ROOT='/home/softoatk/mzistudio.com/leadflow'
NODE_ACTIVATE='/home/softoatk/nodevenv/mzistudio.com/leadflow-server/22/bin/activate'
```

```sh
chmod 600 /home/softoatk/.config/leadflow/deploy.env
```

The existing API `.env` and cPanel node_modules symlink must remain in place. Keep the cPanel startup file `app.cjs`. The script does not change signing/encryption keys or run database migrations.

## Deploy each update

Push changes to GitHub `main`, wait for both workflows to succeed, then in cPanel Git Version Control → Manage → Pull or Deploy click **Update from Remote**, followed by **Deploy HEAD Commit**. Pulling from GitHub alone does not deploy changes automatically.

The deployment creates private backups, installs runtime dependencies, copies the builds without deleting `.env` or local data, preserves Passenger directives, and requests restart using `tmp/restart.txt`. A failed install can leave partially updated files; keep the printed backup path for recovery. Check the API and login after every deployment. Schema changes require a separately planned migration and database backup.

Expected verification:

- https://api-leads.mzistudio.com/ returns HTTP 200 and online JSON.
- Frontend login loads and can authenticate.
- OPTIONS `/api/v1/auth/login` with Origin `https://leads.mzistudio.com` returns HTTP 204 with the matching allowed origin.

Namecheap setup cannot be completed from a public SSH key alone. To connect from this computer, use the hosting SSH hostname/port and the local path to the matching authorized private key; never paste private keys or passwords into source files or chat.

References: [Namecheap Git Version Control](https://www.namecheap.com/support/knowledgebase/article.aspx/10113/2210/how-to-use-git-version-control-cpanel-plugin/), [Namecheap SSH](https://www.namecheap.com/support/knowledgebase/article.aspx/1016/89/how-to-access-a-hosting-account-via-ssh/).

