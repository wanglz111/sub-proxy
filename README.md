# sub-proxy

Cloudflare Worker subscription proxy for:

- Clash Party / OpenClash: `/clash`
- Shadowrocket: `/shadowrocket`

This version is designed for upstream providers that block Cloudflare egress IPs.
The Worker no longer fetches upstream subscriptions directly. Instead:

1. Your VPS requests `GET /update` from the Worker to receive the current update job.
2. The VPS fetches each upstream subscription itself.
3. The VPS sends the raw results back to `POST /update`.
4. The Worker merges proxies, applies your local Clash template, stores outputs in R2, and serves clients.

## Worker Setup

Install dependencies:

```bash
npm install
```

Create the R2 bucket if it does not already exist:

```bash
npx wrangler r2 bucket create sub
```

Use secrets for real tokens and links:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put SUB_URLS
```

`SUB_URLS` supports comma-separated or line-separated URLs.
Raw upstream subscription links and already-converted subscription links are both accepted.

Deploy:

```bash
npm run deploy
```

## Worker Endpoints

Admin endpoints:

```text
GET  https://your-worker.workers.dev/update?token=ADMIN_TOKEN
POST https://your-worker.workers.dev/update?token=ADMIN_TOKEN
GET  https://your-worker.workers.dev/meta?token=ADMIN_TOKEN
```

Client endpoints:

```text
https://your-worker.workers.dev/clash?token=ACCESS_TOKEN
https://your-worker.workers.dev/shadowrocket?token=ACCESS_TOKEN
```

`/sub` is kept as an alias of `/clash`.

## Docker Compose

The VPS updater can run as a single long-running container.

1. Copy the example env file:

```bash
cp .env.docker.example .env
```

2. Edit `.env`:

```dotenv
WORKER_BASE_URL=https://sub.example.com
ADMIN_TOKEN=replace-with-your-admin-token
UPDATE_INTERVAL_SECONDS=1800
```

3. Start the updater:

```bash
docker compose up -d
```

4. Watch logs:

```bash
docker compose logs -f
```

Default behavior is one update every 1800 seconds.

By default, [compose.yaml](/home/lucascool/sub-proxy/compose.yaml) pulls the published GHCR image:

```yaml
services:
  sub-proxy-updater:
    image: ghcr.io/wanglz111/sub-proxy-updater:latest
    container_name: sub-proxy-updater
    restart: unless-stopped
    env_file:
      - .env
    environment:
      UPDATE_INTERVAL_SECONDS: ${UPDATE_INTERVAL_SECONDS:-1800}
```

If you want to build locally instead, replace the `image` line with:

```yaml
    build:
      context: .
    image: sub-proxy-updater:local
```

## Bare Node Alternative

The one-shot updater script lives at [scripts/vps-update.mjs](/home/lucascool/sub-proxy/scripts/vps-update.mjs).

```bash
export WORKER_BASE_URL="https://sub.example.com"
export ADMIN_TOKEN="your-admin-token"
npm run update:vps
```

Loop mode without Docker:

```bash
export WORKER_BASE_URL="https://sub.example.com"
export ADMIN_TOKEN="your-admin-token"
export UPDATE_INTERVAL_SECONDS="1800"
npm run update:vps:loop
```

## Docker Image CI

GitHub Actions builds the updater image automatically with [docker-image.yml](/home/lucascool/sub-proxy/.github/workflows/docker-image.yml).

- Push to `main`: build and publish `ghcr.io/<owner>/<repo>-updater:latest`
- Push tag like `v1.0.0`: publish a matching version tag
- Pull request: build-only validation, no push

To pull from GHCR on your VPS, make sure the package is public or log in first:

```bash
docker login ghcr.io
docker pull ghcr.io/wanglz111/sub-proxy-updater:latest
```

## Behavior Notes

- Cloudflare Worker no longer performs any scheduled update. Subscription refresh is fully driven by the VPS updater.
- The Worker still does deduplication, Clash template assembly, Shadowrocket merge, metadata generation, and R2 archival.
- If a direct upstream response is already Clash YAML with `proxies`, the Worker prefers that.
- If the direct response is not Clash YAML, the VPS also fetches the converter URLs provided by the Worker, and the Worker falls back to those results.

## Files To Edit

- `src/config/subscriptions.js`: upstream/converter behavior.
- `src/config/clash-template.js`: your Clash/Mihomo DNS, groups, ACL4SSR rule-providers, and rules.
- `wrangler.toml`: Worker route and variables.

Do not commit real subscription URLs if the repository is public. Put them in Cloudflare secrets instead.
