# Deploy the CMS on Coolify

The CMS stack is defined in one file, [`webapp/apps/cms/compose.yaml`](../../compose.yaml):
the API (`cms`), its clock (`cms-scheduler`: due posts every minute, a daily
backup) and its own PostgreSQL. Any Docker Compose host runs that file as it is
([deploy anywhere](../../../../../docs/reference/deploy-anywhere.md)); locally, `webapp/compose.yaml` includes
it with `compose.local.yaml` (local password, volumes instead of R2, a host port).

On Coolify the stack is three resources, in the same shape as the website
(an application and a Coolify database), because Coolify replaces only
applications with a rolling update and stops every service of a Docker Compose
resource on each deploy ([Coolify: rolling updates](https://coolify.io/docs/applications/deployments/rolling-updates)):

| Resource | What | Deploys |
| --- | --- | --- |
| `hush-cms-api` | Dockerfile application, the API and the admin at cms.clemii.com | Rolling update on every push: the new container passes `/health/ready`, then the old one drains (10 s) and stops. `scripts/rolling-update-e2e.ts` proves no request is dropped (CI runs it). |
| `hush-cms-scheduler` | Dockerfile application, the same image built with target `scheduler`, no domain | Rolling update; for a moment two schedulers run, which is safe (every step is idempotent). |
| `hush-cms-postgres` | Coolify PostgreSQL 17 database, user and database `cms` | Never on code deploys. Its internal address (the database's uuid) never changes. |

The applications reach the database by its internal URL, which Coolify shows
on the database's page; both apply migrations at start under one lock and
answer `/health/ready` on port 3100, so they start in any order. The website's
build reads the CMS at `https://cms.clemii.com`. Keep the database at PostgreSQL
17: the image's `pg_dump` is version 17 and refuses a newer server.

## Create the resources

The database `hush-cms-postgres`: project `hush` → environment `production` →
**New Resource** → **PostgreSQL** → server `automation`, destination `hush` →
**PostgreSQL 17**. Set user and database `cms`, start it, and copy its
**Postgres URL (internal)** for the applications. No public port.

The applications `hush-cms-api` and `hush-cms-scheduler`, each:

1. **New Resource** → **Git Repository (with GitHub App)** → server
   `automation`, destination `hush` → `decentralfreedom/clemii`, branch `main`, build
   pack **Dockerfile**. Then under **General**: Base Directory `/webapp`,
   Dockerfile Location `/apps/cms/Dockerfile`, port `3100`.
2. No **Ports Mappings**, no **Custom Container Name** and no custom IP: each
   makes Coolify stop the old container first instead of rolling over.
3. **Healthcheck**: enable it, HTTP `GET localhost:3100/health/ready`, expected
   code 200, interval 5 s (scheduler 10 s), timeout 3 s, retries 3, start
   period 10 s (scheduler 15 s).
4. **Environment variables**: `NODE_ENV=production`, `PORT=3100`, and for
   every `CMS_*` variable a reference to the environment's shared variable,
   such as `CMS_S3_SECRET_ACCESS_KEY={{environment.CMS_S3_SECRET_ACCESS_KEY}}`.
   No value is stored on the application itself.
5. **Watch Paths**: `webapp/apps/cms/**`, `webapp/packages/**`,
   `webapp/package.json`, `webapp/bun.lock`, and for the API also
   `webapp/apps/cms-admin/**` (the image includes the admin). Auto deploy on
   push, as the website.

`hush-cms-api` gets the domain `https://cms.clemii.com`. `hush-cms-scheduler`
gets the **Docker Build Stage Target** `scheduler` and no domain.

### Move from one Compose resource (once)

Production ran all three services in the Compose resource `hush-cms` until
2026-11-16. The move, without losing data or the domain:

1. Create the database and both applications as above. Deploy neither yet.
2. In `hush-cms`, take a fresh backup and restore it into the new database:
   `bun run cms:backup && bun run cms:restore --target-url <new database's internal URL>`
   in its `cms` container (a one-off **Scheduled Task**, deleted afterwards).
3. Deploy `hush-cms-api` and check it is healthy, then move the domain
   `cms.clemii.com` from `hush-cms` to it.
4. Stop `hush-cms`, then deploy `hush-cms-scheduler`.
5. Sign in at cms.clemii.com, run `hush-cms auth status`, and check the
   scheduler's logs for its next tick. Keep the stopped `hush-cms` and its
   volume for a week as a fallback, then delete it.

## Secrets

The values come from [`webapp/deploy/production/cms.env`](../../../../deploy/README.md),
encrypted with SOPS, which is their source of truth. On Coolify they are the
**shared variables** of the environment `hush / production` (Developer View:
paste `sops decrypt deploy/production/cms.env | grep ^CMS_`, run in `webapp/`), and both
applications reference them, so a value lives in one place
([Coolify: shared variables](https://coolify.io/docs/knowledge-base/environment-variables)).
Lock the secret ones (the R2 keys, `CMS_GITHUB_CLIENT_SECRET`,
`CMS_COOLIFY_TOKEN`, `CMS_DATABASE_URL`): Coolify then never shows them again,
not even in the Developer View, which shows a placeholder instead. Never copy
values out of Coolify; take them from the SOPS file.

At start the API checks that its media bucket answers and that GitHub accepts
the OAuth client, and the scheduler checks its backup bucket; until then they
report not ready, so a deploy with a wrong credential keeps the running version.

### Where each value comes from

The names are listed in [`apps/cms/.env.production.example`](../../.env.production.example).
`CMS_DATABASE_URL` is the database's internal URL from its page in Coolify.

| Variables | Source |
| --- | --- |
| `CMS_S3_ENDPOINT`, `CMS_S3_ACCESS_KEY_ID`, `CMS_S3_SECRET_ACCESS_KEY` | Cloudflare R2 → Manage API tokens → a token with Object Read & Write on **`hush-blog-media` only** |
| `CMS_BACKUP_S3_ENDPOINT`, `CMS_BACKUP_S3_ACCESS_KEY_ID`, `CMS_BACKUP_S3_SECRET_ACCESS_KEY` | A second token with Object Read & Write on **`hush-cms-backups` only** (a private bucket) |

The endpoint is `https://<account-id>.r2.cloudflarestorage.com`. Never use the
app-update bucket `hush`, which ships the Mac app. Copy each value straight from
Cloudflare into Coolify; it must not pass through Git, `.env` files or chat.

## Website deploys and IndexNow

The scheduler keeps behu.sh in step with the CMS (`src/site/deploy.ts`): when
the site serves an older revision than the CMS holds, it asks Coolify for a
forced build of `hush-website` (a normal deploy reuses the image of the current
commit and skips the build), which pulls the export; once the new revision is live it
submits the changed pages to IndexNow.

The CMS reaches Coolify's API only over a private network, never the internet:

1. **Hetzner private network** `hush-private`, `172.16.0.0/16` (subnet
   `172.16.0.0/24`, zone eu-central): the Coolify server is `172.16.0.2`, the
   app server `172.16.0.3`. Not `10.x`: Coolify gives Docker the `10.0.0.0/8`
   pools, and the app server's Docker uses `172.17` to `172.31`.
2. **Hetzner Cloud Firewall** `coolify-host` on the Coolify server: 80 and 443
   only from Cloudflare's ranges (https://www.cloudflare.com/ips/), SSH and
   ICMP; 8000, 6001 and 6002 are closed publicly (the dashboard, realtime and
   terminal run through 443). Cloud firewalls filter before Docker, which
   bypasses UFW; private network traffic is not filtered.
3. Coolify **Settings > Advanced**: API access on, **Allowed IPs** `172.16.0.3`.
4. **Cloudflare custom rule** "Block public Coolify API" on the Coolify domain:
   `(http.host eq "admin.decentralfreedom.com" and starts_with(lower(url_decode(http.request.uri.path)), "/api"))`
   with action Block, so the API is unreachable through the public hostname.
5. **Keys & Tokens > API tokens**: `hush-cms deploy`, only the `deploy`
   permission, scoped to the `hush-website` resource, one year. Renew it before
   it expires; the scheduler turns unhealthy when deploys fail.
6. In hush-cms, locked and runtime only: `CMS_SITE_URL=https://behu.sh`,
   `CMS_COOLIFY_URL=http://172.16.0.2:8000`, `CMS_COOLIFY_TOKEN`,
   `CMS_COOLIFY_WEBSITE_UUID` and `CMS_INDEXNOW_KEY` (the key the website
   serves at `/<key>.txt`).
7. A read-only CMS token for the website build:
   `bun run cms:token --name website-build --scopes posts:read`, stored in
   `hush-website` as described in the website's deployment guide.

### Google Search Console (PRD R12)

The scheduler imports Search Console numbers per post and its searches once a
day. If Google fails, it logs the error and retries hourly; this never affects
readiness, so publishing continues.

**Accuracy:** it reads web search one day per request, as Google's guide
advises, because the API keeps only the top 50,000 rows of a request. Page
numbers come from a request without the query dimension, so they are exact.
Searches are a separate request, in which Google leaves out rare ones. Ranges
never reach before the first imported day. If a site ever nears 50,000 rows a
day, Search Console's BigQuery bulk export (it needs billing) is the complete
source.

1. **Google Cloud project:** a project of its own (here `hush-cms-ba3574`,
   "hush CMS", owned by the owner's Google account, no billing) with the Search
   Console API enabled.
2. **Service account:** `search-console@…`, with no project roles, and one
   JSON key.
3. **Search Console:** on `behu.sh`, **Settings > Users and permissions > Add
   user**, add the account's email as **Restricted**, so it can read only.
4. **Coolify:** in hush-cms-scheduler only, add `CMS_SEARCH_CONSOLE_KEY` with
   the key's JSON as its value: locked, runtime only, Literal (no `$`
   interpolation). Delete the downloaded key file afterwards.
5. **Optional:** set `CMS_SEARCH_CONSOLE_SITE` when the property is not the
   domain property of `CMS_SITE_URL`.

**Check:** the first import after a deploy logs "Imported Search Console
numbers" with `from` about 16 months back. A post's 28-day impressions and
clicks in the admin match Search Console's Performance report filtered to that
page.

**After a domain move:** add the new domain's property, grant the same
account, run Search Console's Change of address, and update
`CMS_SEARCH_CONSOLE_SITE` if needed. Posts are matched by path, so their
history carries over.

### Page views and downloads from Umami (PRD R11)

The scheduler imports every complete US Pacific day from Umami: page views
per page and the website's `download` events, which carry the page they came
from. It writes them per post and for the whole site, from the day the Umami
website was created, and retries hourly on failure without affecting
readiness. Unique visitors are not imported: summed over days, they would
count a person once a day. Umami sits behind Cloudflare Access, so the
scheduler needs both an Umami API key and an Access service token.

1. **Umami:** **Settings > API keys**, create a key named `hush-cms` (keys
   do not expire; revoke it there).
2. **Cloudflare Zero Trust:** **Access controls > Service credentials >
   Service tokens**, create `hush-cms-umami`. In the Access application
   "Umami", add a policy with the action **Service Auth** that includes only
   this token.
3. **Coolify:** in hush-cms-scheduler only, add `CMS_UMAMI_URL`
   (`https://umami.decentralfreedom.com`), `CMS_UMAMI_WEBSITE_ID` (behu.sh's
   website id), `CMS_UMAMI_API_KEY`, `CMS_UMAMI_ACCESS_CLIENT_ID` and
   `CMS_UMAMI_ACCESS_CLIENT_SECRET`: locked, runtime only, Literal.

**Check:** the log shows "Imported page views and downloads", with `from` set
to the website's creation day. A post's page views for one day match Umami's
Pages report for that day in the America/Los_Angeles time zone.

Check after changes: from the `hush-cms-scheduler` container a request to
`http://172.16.0.2:8000/api/v1/applications/<website uuid>` with the deploy
token answers "Missing required permissions: read" (the IP is allowed, the
token is limited), and from the internet every `/api` path answers 403.

## The admin at cms.clemii.com

The CMS serves its admin (`apps/cms-admin`, built into the image) on its own
origin. Sign-in is a GitHub OAuth App with PKCE; only listed GitHub user ids get
a session.

1. **GitHub > Settings > Developer settings > OAuth Apps > New**: name
   `hush CMS`, homepage `https://cms.clemii.com`, callback
   `https://cms.clemii.com/auth/github/callback`, wildcard matching off, device
   flow off, expiring user tokens on. Generate a client secret.
2. **Cloudflare DNS**: `cms.clemii.com`, A, the app server's address, proxied.
3. **Coolify, hush-cms-api > General**: domain `https://cms.clemii.com` (Traefik
   routes to the container's port 3100; nothing is published on the host).
4. **Environment variables**, runtime only: `CMS_PUBLIC_URL=https://cms.clemii.com`,
   `CMS_ADMIN_GITHUB_IDS` (numeric ids, `https://api.github.com/users/<login>`
   shows `id`), `CMS_GITHUB_CLIENT_ID`, and `CMS_GITHUB_CLIENT_SECRET` locked.
   Copy the secret from GitHub straight into Coolify.
5. Redeploy, open `https://cms.clemii.com` and sign in. A GitHub account outside
   the list gets "This GitHub account may not use the hush CMS."

Protect the allowed GitHub accounts with a passkey or two-factor
authentication: the admin inherits their sign-in.

## After the first deploy

1. Connect the CLI on the owner's Mac with `hush-cms auth login` and approve
   its code at cms.clemii.com/device ([CLI guide](../../../cms-cli/README.md)).
   `bun run cms:token` in the `cms` container is only for tokens no person
   signs in for, such as the website build's read token (step 7 above).
2. Check the `cms-scheduler` logs for "Backed up the CMS database" and
   "Exported the posts as Markdown".
3. Restore drill: create a scratch database in `cms-postgres`
   (`createdb -U cms cms_restore`), run
   `bun run cms:restore --target-url postgresql://cms:<password>@cms-postgres:5432/cms_restore`
   in the `cms` container, compare `select count(*) from posts`, then drop it.
   Repeat after any change to the backup code and at least every quarter.
4. Markdown export: the newest `markdown/<time>.tar.gz` in `hush-cms-backups`
   opens with `tar -xzf` on any computer. It holds every post as
   `<lang>/<slug>.md` (drafts marked `draft: true`) and `posts.json` with each
   post's status, dates and image hashes; the images are in the media bucket
   under those hashes. `hush-cms posts push <file>` brings a post back as a draft.
