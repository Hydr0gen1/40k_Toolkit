# Deploy on your server

## 1. Build and configure

Copy this project to your server. Use Docker Engine with the Compose plugin and Linux containers. The container build runs the test suite before producing the runtime image.

```sh
docker build -t black-templars-toolkit:local .
```

Generate local configuration without requiring Node on the host. On Linux:

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/setup" -w /setup black-templars-toolkit:local node /app/dist/src/admin.js init
```

On a Windows server with Linux containers, use PowerShell:

```powershell
docker run --rm -v "${PWD}:/setup" -w /setup black-templars-toolkit:local node /app/dist/src/admin.js init
```

Set `PUBLIC_URL` in `.env` to your dedicated subdomain, for example `https://templars.your-domain.example`. Use a bare origin, without `/mcp` or another path. Preserve the generated password hash. Move the password from `secrets/owner-password.txt` to your password manager, then delete that file.

```sh
docker compose up -d
docker compose logs --tail 100 toolkit
```

The first refresh runs automatically. To retry or inspect:

```sh
docker compose exec toolkit node dist/src/admin.js refresh
docker compose exec toolkit node dist/src/admin.js research
docker compose exec toolkit node dist/src/admin.js status
```

`/healthz` checks the process; `/readyz` reports whether any snapshot is available and whether it is stale/partial. A ready response is not a claim of complete rules coverage.

## 2. Reverse proxy

Route the entire dedicated subdomain to port 8787. Preserve the Host header and Authorization header. OAuth discovery, `/authorize`, `/login`, `/register`, `/token`, `/revoke` and `/mcp` all need to reach this service. Do not add a browser-only authentication gate in front of these routes; the toolkit supplies its own OAuth.

The Compose file binds port 8787 to the host's loopback interface. This works when the proxy runs on the host. If your proxy runs in Docker, attach both containers to the same private Docker network and forward to `toolkit:8787`; remove the host port mapping if unnecessary. Keep the backend off the public network.

Example Nginx location inside your existing TLS server block:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Authorization $http_authorization;
    proxy_buffering off;
    proxy_read_timeout 65s;
}
```

`TRUST_PROXY=true` trusts exactly one hop. Keep this topology or configure it deliberately for your network. The service does not manage your DNS or certificates.

## 3. Connect both assistants

Use the same endpoint in both: `https://YOUR_DOMAIN/mcp`.

**ChatGPT:** enable developer mode if available in your account/workspace, create a custom MCP connection, enter the endpoint, select OAuth, and complete the owner-password login. If the UI exposes OAuth client credentials, leave them empty to use dynamic registration. Follow the current [official connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

**Claude:** add a custom connector using the endpoint and complete the same owner login. Follow the [official custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

The default callback origin allowlist includes `https://chatgpt.com`, `https://claude.ai`, and `https://claude.com`. If a client requires a different callback origin, confirm it in that product's official documentation and add only that exact origin to `CALLBACK_ORIGINS`, then restart. Paid subscriptions do not override workspace restrictions.

Paste `docs/ASSISTANT-INSTRUCTIONS.md` into your assistant's project instructions. In each assistant ask:

> Call get_data_status. Report the snapshot ID, source versions and coverage gaps. Look up High Marshal Helbrecht using that snapshot. Do not declare a list legal while coverage is incomplete.

Then run a 1,000-point and a 2,000-point build/validate/compare workflow. Verify both assistants report the same snapshot and costs. Daily refresh may change the active ID; pin one ID across each comparison.

## 4. Backup, restore and upgrade

Create a consistent SQLite backup, including OAuth state:

```sh
docker compose exec toolkit node dist/src/admin.js backup /app/data/backup.sqlite
docker compose cp toolkit:/app/data/backup.sqlite ./backup.sqlite
```

Choose a new filename for later backups; the command refuses to overwrite. Backups contain sensitive authentication state. Store them privately alongside a secure copy of `.env`.

To restore, stop the service, preserve the current volume as a rollback copy, and replace `toolkit.sqlite` in the volume with the backup. Remove only that database's `toolkit.sqlite-wal` and `toolkit.sqlite-shm` files while the service is stopped. Ensure UID 1000 can write the database, restart, and run `status`. Prefer restoring into a fresh volume first. Test `/readyz` and a tool call before retiring the old volume.

Upgrade with `docker compose build` and `docker compose up -d`; the named data volume persists. Take a backup first. This version has one additive schema, initialized on startup; future incompatible migrations must be explicit.

Revoke all assistant authorizations if needed:

```sh
docker compose exec toolkit node dist/src/admin.js revoke-all
```

Access tokens last one hour, refresh tokens rotate and last 30 days. Revocation invalidates their authorization family. Restarting does not discard active authorizations. Logs omit passwords and token values.

## What has not been done for you

The project was tested outside Docker because Docker was unavailable in the development environment. Your server, DNS, proxy and actual assistant accounts have not been accessed or changed. The build and connection steps above are required before using the hosted service.
