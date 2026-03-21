# Job Hunter Pro

Next.js + TypeScript dashboard for AI job tracking and outreach.

## Project Structure

- `pages/`: Next.js Pages Router routes (`index`, `login`, `api/data`, `_app`)
- `components/`: Shared React components (`JobDetailPanel`, `ThemeSwitcher`)
- `styles/`: Global styling (`globals.css`)
- `data/`: JSON job snapshots used by the dashboard API
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

## Optional Environment Variables

For login page credentials:

- `USERNAME`
- `PASSWORD`

For dashboard windows/retention:

- `LATEST_JOBS_TIME` (default: `5`)
- `APPLIED_JOBS_TIME` (default: `30`)

For scheduled job-fetch workflows:

- `APIFY_TOKEN`
- `GOOGLE_API_KEY`
