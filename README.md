# sub-proxy

Cloudflare Worker subscription proxy for:

- Clash Party / OpenClash: `/clash`
- Shadowrocket: `/shadowrocket`

The Worker fetches upstream subscription URLs on a cron, keeps only node data, and applies your local Clash rule template. The default template uses ACL4SSR Clash fragments, with ad blocking rules evaluated first.

## Setup

```bash
npm install
```

Create the R2 bucket if it does not already exist:

```bash
npx wrangler r2 bucket create sub
```

Use secrets for real tokens/links:

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

GitHub Actions deploys automatically on pushes to `main`. Add these repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Manually update:

```text
https://your-worker.workers.dev/update?token=ADMIN_TOKEN
```

Client URLs:

```text
https://your-worker.workers.dev/clash?token=ADMIN_TOKEN
https://your-worker.workers.dev/shadowrocket?token=ADMIN_TOKEN
```

`/sub` is kept as an alias of `/clash`.

## Files To Edit

- `src/config/subscriptions.js`: upstream/converter behavior.
- `src/config/clash-template.js`: your Clash/Mihomo DNS, groups, ACL4SSR rule-providers, and rules.

Do not commit real subscription URLs if the repository is public. Put them in Cloudflare secrets instead.
