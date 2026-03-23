# Job Hunter Pro

Next.js + TypeScript dashboard for AI job tracking and outreach.

## Project Structure

- `pages/`: Next.js Pages Router routes (`index`, `login`, `api/data`, `_app`)
- `components/`: Shared React components (`JobDetailPanel`, `CustomSelect`)
- `styles/`: Global styling (`globals.css`)
- `data/`: local JSON snapshot cache used by fetch/clean/sync scripts
- `supabase/`: database schema for production storage
- `lib/`: shared auth/supabase/business logic modules
- `scripts/`: Data fetch and cleanup automation scripts
- `.github/workflows/`: CI and scheduled data update workflows

## Local Development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Quality Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Vercel Deployment (on commit)

This repo is configured for Vercel + GitHub auto-deploy.

1. Import this GitHub repo into Vercel.
2. Set the Production Branch in Vercel (usually `main`).
3. Add required environment variables in Vercel Project Settings.
4. Push commits to the connected branch.

Every commit to the production branch will trigger a new Vercel deployment.

### Vercel Build Settings

- Install Command: `npm ci`
- Build Command: `npm run build`
- Framework Preset: `Next.js`

These are also reflected in `vercel.json`.

## GitHub CI

`/.github/workflows/ci.yml` runs on every push and PR:

- `npm ci`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

If CI is green, Vercel deployment should be stable for the same commit.

## Environment Variables

Core production:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (service role/secret key, not publishable key)
- `CRON_SECRET` (required for `/api/jobs/trigger-all` endpoint authorization)

Default bootstrap login user:

- `USERNAME` (default `suman`)
- `PASSWORD` (default `sumansuman`)
- `FULL_NAME` (default `Suman`)
- `USER_EMAIL` (default `${USERNAME}@local.app`)

Retention/window:

- `LATEST_JOBS_TIME` (default `5`)
- `APPLIED_JOBS_TIME` (default `30`)
- `CROSS_DAY_DEDUPE_DAYS` (default `14`)

Scraper:

- `APIFY_TOKEN` (required for fetch)
- `GOOGLE_API_KEY` (optional for AI skill enrichment)

User-run queue worker (optional tuning):

- `RUN_TRIGGER_WINDOW_MINUTES` (default `15`)
- `RUN_WORKER_CONCURRENCY` (default `3`)
- `RUN_WORKER_MAX_RUNS` (default `20` per dispatch)
- `USER_RUN_MAX_RESULTS` (default `180`)
- `USER_RUN_APIFY_TIMEOUT_SECS` (default `360`)
- `USER_RUN_APIFY_POLL_INTERVAL_MS` (default `4000`)
- `APIFY_LINKEDIN_ACTOR` (default `curious_coder~linkedin-jobs-scraper`)
- `USER_RUN_LLM_BATCH_SIZE` (default `5`)
- `USER_RUN_LLM_TIMEOUT_MS` (default `45000`)
