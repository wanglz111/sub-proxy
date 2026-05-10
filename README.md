# sub-proxy

Cloudflare Worker subscription proxy for:

- Clash Party / OpenClash: `/clash`
- Shadowrocket: `/shadowrocket`

This version is designed for upstream providers that block Cloudflare egress IPs.
The Worker now only stores and serves generated subscription outputs. All upstream subscription fetching happens on your VPS.

## Architecture

1. Your VPS reads `SUB_URL_1` to `SUB_URL_3` from `.env`.
2. The VPS fetches upstream subscriptions directly.
3. The VPS posts raw fetch results to `POST /update`.
4. The Worker merges proxies, applies your Clash template, stores outputs in R2, and serves clients.

Worker no longer stores upstream subscription URLs.

## Worker Setup

Install dependencies:

```bash
npm install
```

Create the R2 bucket if it does not already exist:

```bash
npx wrangler r2 bucket create sub
```

Set secrets for access control only:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put ACCESS_TOKEN
```

Deploy:

```bash
npm run deploy
```

## Worker Endpoints

Admin endpoints:

```text
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

The VPS updater runs as a single long-running container and reads all upstream subscription config from `.env`.

1. Copy the example env file:

```bash
cp .env.docker.example .env
```

2. Edit `.env`:

```dotenv
WORKER_BASE_URL=https://sub.example.com
ADMIN_TOKEN=replace-with-your-admin-token
UPDATE_INTERVAL_SECONDS=1800

CONVERTER_BASE_URL=https://api.wd-purple.com/sub
UPSTREAM_USER_AGENT=ClashParty/1.8.3 CFNetwork/1410.1 Darwin/22.6.0
UPSTREAM_ACCEPT=*/*
UPSTREAM_ACCEPT_LANGUAGE=zh-CN,zh-Hans;q=0.9

SUB_URL_1=https://example.com/subscription-1
SUB_URL_2=https://example.com/subscription-2
SUB_URL_3=
SUB_FALLBACK_1=false
SUB_FALLBACK_2=true
SUB_FALLBACK_3=false
```

`SUB_URL_1` and `SUB_URL_2` are typical. `SUB_URL_3` is optional and can be left empty.
If a source is known to rotate tokens but old nodes remain usable, set its matching `SUB_FALLBACK_n=true`.
Example: keep `SUB_FALLBACK_2=true` for a `wd-purple.com` source so a failed refresh reuses the last successful version instead of dropping those nodes.

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
export SUB_URL_1="https://example.com/subscription-1"
export SUB_URL_2="https://example.com/subscription-2"
export SUB_URL_3=""
export SUB_FALLBACK_1="false"
export SUB_FALLBACK_2="true"
export SUB_FALLBACK_3="false"
npm run update:vps
```

Loop mode without Docker:

```bash
export WORKER_BASE_URL="https://sub.example.com"
export ADMIN_TOKEN="your-admin-token"
export UPDATE_INTERVAL_SECONDS="1800"
export SUB_URL_1="https://example.com/subscription-1"
export SUB_URL_2="https://example.com/subscription-2"
export SUB_URL_3=""
export SUB_FALLBACK_1="false"
export SUB_FALLBACK_2="true"
export SUB_FALLBACK_3="false"
npm run update:vps:loop
```

## Behavior Notes

- Cloudflare Worker performs no scheduled update and stores no upstream source list.
- Subscription refresh is fully driven by the VPS updater.
- The Worker still does deduplication, Clash template assembly, Shadowrocket merge, metadata generation, and R2 archival.
- If a direct upstream response is already Clash YAML with `proxies`, the Worker prefers that.
- If the direct response is not Clash YAML, the VPS also fetches converter URLs and the Worker falls back to those results.
- If `SUB_FALLBACK_n=true` and that source fails this round, the Worker reuses that source's last successful stored result instead of dropping it.
- Upstream request headers are controlled from the VPS `.env`, so you can adjust client impersonation without redeploying the Worker.

## Docker Image CI

GitHub Actions builds the updater image automatically with [docker-image.yml](/home/lucascool/sub-proxy/.github/workflows/docker-image.yml).

- Push to `main`: build and publish `ghcr.io/<owner>/<repo>-updater:latest`
- Push tag like `v1.0.0`: publish a matching version tag
- Pull request: build-only validation, no push

## Files To Edit

- `.env`: VPS updater settings, upstream URLs, and request headers.
- `src/config/clash-template.js`: your Clash/Mihomo DNS, groups, ACL4SSR rule-providers, and rules.
- `wrangler.toml`: Worker route and access-control variables.

Do not commit real subscription URLs if the repository is public.
