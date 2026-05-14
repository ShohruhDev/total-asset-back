# Total Asset Silk Road — Backend (CMS)

Directus 11 + PostgreSQL 16 backend for [Total Asset Silk Road](https://total-asset.uz). Deployed on **Railway**. Serves the public REST/GraphQL API and the admin panel that powers the frontend in [`total-asset-front`](https://github.com/ShohruhDev/total-asset-front).

## Stack

- **Directus 11** — headless CMS with built-in admin UI, RBAC, translations
- **PostgreSQL 16** — primary data store (Railway Postgres add-on in prod, local Docker in dev)
- **Cloudflare R2** — media storage in production (S3-compatible, free egress)

## Local development

Requires Docker Desktop or OrbStack.

```bash
# 1. Configure env
cp .env.example .env
# Generate KEY and SECRET once:
#   openssl rand -hex 16   →  DIRECTUS_KEY
#   openssl rand -hex 32   →  DIRECTUS_SECRET

# 2. Boot Postgres + Directus
docker compose up -d
docker compose logs -f directus   # wait for "Server started"

# 3. Seed schema + starter content (idempotent)
node scripts/seed.mjs

# 4. Open admin
open http://localhost:8055/admin
#    email: admin@example.com  /  password: admin  (from .env)
```

## Repository structure

```
.
├── Dockerfile             # built on directus/directus:11
├── start.sh               # entrypoint: bootstrap + schema apply + start
├── docker-compose.yml     # local-dev only (Postgres + Directus)
├── snapshots/
│   └── snapshot.yaml      # schema-as-code (auto-applied on container boot)
├── extensions/            # custom hooks / endpoints (empty by default)
└── scripts/
    └── seed.mjs           # idempotent seed: collections, fields, policy,
                           # languages, starter content (5 services, 5 team
                           # members, 4 projects, sample news, page settings)
```

## How schema-as-code works

`start.sh` runs `directus bootstrap` then `directus schema apply ./snapshots/snapshot.yaml` on every container boot. Both commands are idempotent — they only apply diffs.

To update the schema:
1. Make changes in the Directus admin UI locally.
2. Export an updated snapshot:
   ```bash
   docker compose exec directus node cli.js schema snapshot --yes /directus/snapshots/snapshot.yaml
   ```
3. Commit `snapshots/snapshot.yaml`. The next Railway deploy will apply your changes.

## Deploy to Railway

1. Push this repo to GitHub.
2. Railway → New Project → Deploy from GitHub → select `total-asset-back`.
3. Add Plugin → **Postgres**.
4. Service → Variables (minimum):
   ```
   KEY=<openssl rand -hex 16, NEVER rotate>
   SECRET=<openssl rand -hex 32, NEVER rotate>
   PUBLIC_URL=https://<railway-domain>
   HOST=0.0.0.0
   ADMIN_EMAIL=you@total-asset.uz       # FIRST DEPLOY ONLY
   ADMIN_PASSWORD=<TempStrongPwd>       # FIRST DEPLOY ONLY

   DB_CLIENT=pg
   DB_HOST=${{Postgres.PGHOST}}
   DB_PORT=${{Postgres.PGPORT}}
   DB_DATABASE=${{Postgres.PGDATABASE}}
   DB_USER=${{Postgres.PGUSER}}
   DB_PASSWORD=${{Postgres.PGPASSWORD}}

   CORS_ENABLED=true
   CORS_ORIGIN=https://total-asset.uz,https://<vercel-domain>

   RATE_LIMITER_ENABLED=true
   RATE_LIMITER_STORE=memory
   ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION=2400
   ASSETS_TRANSFORM_MAX_OPERATIONS=5

   STORAGE_LOCATIONS=r2
   STORAGE_R2_DRIVER=s3
   STORAGE_R2_KEY=<from-cloudflare>
   STORAGE_R2_SECRET=<from-cloudflare>
   STORAGE_R2_BUCKET=total-asset-media
   STORAGE_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   STORAGE_R2_REGION=auto
   STORAGE_R2_FORCE_PATH_STYLE=true
   STORAGE_R2_ACL=

   EMAIL_TRANSPORT=smtp
   EMAIL_FROM=noreply@total-asset.uz
   EMAIL_SMTP_HOST=smtp.resend.com
   EMAIL_SMTP_PORT=587
   EMAIL_SMTP_USER=resend
   EMAIL_SMTP_PASSWORD=re_xxx_xxx

   TELEMETRY=false
   ```
5. Settings → Networking → Healthcheck path: **`/server/health`**.
6. Deploy. Wait for `Server started` in logs.
7. **After first successful deploy:**
   - Log into the admin, change password in UI
   - Delete `ADMIN_EMAIL` and `ADMIN_PASSWORD` from Railway env
   - Trigger a redeploy
8. (Optional) Custom domain: `cms.total-asset.uz` in Railway → Networking → Add Domain.

## Cloudflare R2 (media)

1. Cloudflare Dashboard → R2 → Create bucket → `total-asset-media`.
2. Manage R2 API Tokens → Create token with `Object Read & Write` on bucket.
3. Save Access Key ID + Secret Access Key + Account ID (for endpoint URL).
4. (Recommended) Bucket Settings → Connect Domain → `cdn.total-asset.uz`.
5. Plug values into Railway `STORAGE_R2_*` env vars.

## Public access token for the frontend

After deploy, in the admin:
1. Settings → Access Tokens → Create Token
2. Role = **Public**
3. Copy the token; paste into the frontend's `NUXT_DIRECTUS_STATIC_TOKEN` env on Vercel.

## Contact form Flow

Settings → Flows → Create Flow:
- Trigger: **Webhook** (POST, copy the URL)
- Operation: **Send Email**
  - To: `info@total-asset.uz`
  - Subject: `New contact form: {{ $trigger.body.name }}`
  - Body: `{{ $trigger.body.message }}` (+ name/email/company)

Paste the webhook URL into the frontend's `NUXT_CONTACT_FLOW_URL` env on Vercel.

## Useful commands

```bash
# Apply schema after a teammate pushed snapshot changes
docker compose exec directus node cli.js schema apply --yes /directus/snapshots/snapshot.yaml

# Snapshot after editing schema in UI
docker compose exec directus node cli.js schema snapshot --yes /directus/snapshots/snapshot.yaml

# Reseed content (idempotent — safe to re-run)
node scripts/seed.mjs

# Local Postgres backup
docker compose exec postgres pg_dump -U directus directus > backup-$(date +%F).sql

# Wipe everything locally
docker compose down -v && rm -rf uploads/*
```

## Gotchas

- **Never rotate `KEY` / `SECRET` in production** — it invalidates all sessions and breaks flows.
- **In production, `STORAGE_LOCATIONS` must be only `r2`** — do not include `local`, otherwise Directus writes to Railway's ephemeral disk on some operations.
- **Healthcheck path** is `/server/health` (returns `{status: "ok"}`).
- **First-boot admin credentials** should be removed from env once you rotate the password in the UI.
- **Schema permissions** for translations need explicit `["*", "translations"]` in the `fields` array — `["*"]` does not cover alias fields. See `scripts/seed.mjs` for the implementation.

## Related repositories

- **Frontend:** [`total-asset-front`](https://github.com/ShohruhDev/total-asset-front) — Nuxt 3, deployed on Vercel
