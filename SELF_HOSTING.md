# Self-Hosting Guide

This guide walks through deploying your own instance of Calibrate's frontend. It is a Next.js app that talks to a separate Calibrate backend over REST.

## Steps

### 1. Fork or clone the repo

For self-hosting a separate tenant, **fork** the repo into your own GitHub org. This gives you control over your release cadence and any tenant-specific changes. You can pull updates from upstream when you're ready.

To test it locally, clone your fork:

```bash
git clone https://github.com/<your-org>/calibrate-frontend.git
cd calibrate-frontend
npm install
```

### 2. Set up Google OAuth

The frontend uses Google Sign-In via NextAuth. You need a dedicated OAuth client per deployment because the redirect URI is tied to your domain.

1. Go to https://console.cloud.google.com/apis/credentials
2. **Create Credentials → OAuth client ID → Web application**
3. **Authorized JavaScript origins**:
   - `http://localhost:3000` (local dev)
   - `https://your-production-domain.com`
4. **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-production-domain.com/api/auth/callback/google`
5. Save the **Client ID** and **Client Secret** — you'll plug these into env vars. The same **Client ID** will be needed for the backend setup.

### 3. Environment variables

Copy `env.example` to `.env.local` for local dev:

```bash
cp env.example .env.local
```

#### Required

| Variable                  | Description                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_BACKEND_URL` | Backend base URL, no trailing slash. e.g. `https://api.your-domain.com`                  |
| `AUTH_SECRET`             | NextAuth session-signing key. Generate with `openssl rand -base64 32`                    |
| `GOOGLE_CLIENT_ID`        | From step 2                                                                              |
| `GOOGLE_CLIENT_SECRET`    | From step 2. Treat as secret.                                                            |
| `AUTH_URL`                | Required in production. Full URL of the deployed app, e.g. `https://app.your-domain.com` |

#### Optional

| Variable                         | Description                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`            | Same as `AUTH_URL`. Used by client code for absolute links.                       |
| `NEXT_PUBLIC_DOCS_URL`           | Best to point it to the actual docs site: https://calibrate.artpark.ai/docs       |
| `NEXT_PUBLIC_SENTRY_DSN`         | Sentry project DSN for error monitoring. Leave empty to disable.                  |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production`, `preview`, or `development`. Not needed if Sentry is not enabled.   |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`  | Google Analytics 4 ID (`G-...`). Leave empty to disable analytics.                |
| `MAINTENANCE_MODE`               | Set to `true` to redirect all non-API traffic to `/`. Useful for cutover windows. |

### 4. Run locally

```bash
npm run dev
```

The app is live on http://localhost:3000!

### 5. Deploy to Vercel (recommended)

Vercel is the easiest path to deploy the frontend.

1. Sign in to Vercel and connect your forked repo.

2. Configure the environment variables and custom domain (optional) for the project on the Vercel dashboard.

3. Deploy!

### 6. Updating from upstream

If you forked, periodically pull upstream from the Github UI itself. Vercel will auto-deploy the merge.

### 7. Self-host on your own infrastructure

If you can't or don't want to use Vercel, the app runs anywhere Node.js runs.
