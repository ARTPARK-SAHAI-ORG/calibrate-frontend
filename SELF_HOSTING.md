# Self-Hosting Guide

This guide walks through deploying Calibrate frontend for your own tenant. The frontend is a Next.js 16 / React 19 app that talks to a separate Calibrate backend over REST.

## Overview

To run Calibrate end-to-end, you need:

1. **A running Calibrate backend** — this repo is frontend only. The backend exposes the REST API the frontend calls.
2. **A Google Cloud OAuth client** — for "Sign in with Google".
3. **A hosting target** — Vercel (recommended) or any Node.js host.
4. **A domain** — required for Google OAuth and production NextAuth callbacks.

## Prerequisites

- Node.js 18+
- npm
- A GitHub account (for Vercel deploys)
- Access to a Calibrate backend deployment with its base URL
- Google Cloud Console access to create an OAuth client

## 1. Fork or clone the repo

For self-hosting a separate tenant, **fork** the repo into your own GitHub org. This gives you control over your release cadence and any tenant-specific changes. You can pull updates from upstream when you're ready.

```bash
# After forking on GitHub:
git clone https://github.com/<your-org>/calibrate-frontend.git
cd calibrate-frontend
npm install
```

## 2. Set up Google OAuth

The frontend uses Google Sign-In via NextAuth. You need a dedicated OAuth client per deployment because the redirect URI is tied to your domain.

1. Go to https://console.cloud.google.com/apis/credentials
2. **Create Credentials → OAuth client ID → Web application**
3. **Authorized JavaScript origins**:
   - `http://localhost:3000` (local dev)
   - `https://your-production-domain.com`
4. **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-production-domain.com/api/auth/callback/google`
5. Save the **Client ID** and **Client Secret** — you'll plug these into env vars.

**Backend coordination**: the backend's `/auth/google` endpoint must accept your Client ID. Confirm with whoever owns the backend that your Google Client ID is whitelisted server-side, otherwise sign-in will fail with a backend 4xx after Google redirects back.

## 3. Environment variables

Copy `env.example` to `.env.local` for local dev:

```bash
cp env.example .env.local
```

### Required

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Backend base URL, no trailing slash. e.g. `https://api.your-domain.com` |
| `AUTH_SECRET` | NextAuth session-signing key. Generate with `openssl rand -base64 32`. Use a different secret per environment. |
| `GOOGLE_CLIENT_ID` | From step 2 |
| `GOOGLE_CLIENT_SECRET` | From step 2. Treat as secret. |
| `AUTH_URL` | Required in production. Full URL of the deployed app, e.g. `https://app.your-domain.com`. Not needed for local dev. |

### Optional

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Same as `AUTH_URL`. Used by client code for absolute links. |
| `NEXT_PUBLIC_DOCS_URL` | Base URL of your docs site. Sidebar/help links route here. Leave unset to hide doc links. |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry project DSN for error monitoring. Leave empty to disable. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production`, `preview`, or `development`. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 ID (`G-...`). Leave empty to disable analytics. |
| `MAINTENANCE_MODE` | Set to `true` to redirect all non-API traffic to `/`. Useful for cutover windows. |

## 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000. Verify:
- Landing page loads
- `/login` → "Sign in with Google" completes the flow and lands on `/agents`
- Network tab shows requests going to `NEXT_PUBLIC_BACKEND_URL`

## 5. Deploy to Vercel (recommended)

Vercel is the easiest path — zero config beyond env vars.

### Connect the repo

1. Sign in to https://vercel.com with the account that should own the deployment.
2. **Add New → Project** → import your forked repo.
3. If Vercel says "permission sent to admin": this is a GitHub-side approval. Go to https://github.com/organizations/`<your-org>`/settings/installations → find Vercel → **Configure** → grant access to the fork. Org owners (not just repo admins) need to approve.
4. Vercel auto-detects Next.js. Leave build settings on defaults:
   - **Build Command**: `next build`
   - **Output Directory**: (default)
   - **Install Command**: `npm install`

### Configure env vars in Vercel

In **Project Settings → Environment Variables**, add each variable from the table above. For each, choose which environments it applies to (**Production**, **Preview**, **Development**).

Tips:
- Mark `AUTH_SECRET`, `GOOGLE_CLIENT_SECRET` as **Sensitive** so they're write-only after creation.
- Set `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` for Production and `preview` for Preview.
- Don't set `AUTH_URL` until you know the final domain — see custom domain step below.

### First deploy

1. Trigger a deploy (push to `main` or click **Deploy**).
2. The first build will succeed but auth will be broken until you set the custom domain and update `AUTH_URL` + Google redirect URIs.
3. After every env var change, **redeploy manually** — Vercel does not auto-redeploy on env var edits.

### Custom domain

1. **Project Settings → Domains** → add `app.your-domain.com`.
2. Add the CNAME / A record Vercel shows you with your DNS provider.
3. Once the domain is live:
   - Set `AUTH_URL=https://app.your-domain.com` in env vars.
   - Set `NEXT_PUBLIC_APP_URL` to the same.
   - Add `https://app.your-domain.com` and `https://app.your-domain.com/api/auth/callback/google` to your Google OAuth client's authorized origins/redirect URIs.
   - Redeploy.

### Multiple tenants on one repo

Each tenant gets its own Vercel project pointed at the same fork (or different forks). Per-project env vars handle tenant differentiation:
- Different `NEXT_PUBLIC_BACKEND_URL`
- Different `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Different `AUTH_URL` / domain
- Different `NEXT_PUBLIC_SENTRY_DSN` so error streams don't mix

A push to the tracked branch triggers builds in all connected Vercel projects in parallel.

## 6. Self-host on your own infrastructure

If you can't or don't want to use Vercel, the app runs anywhere Node.js runs.

### Build and run

```bash
# Build
npm run build

# Start (defaults to port 3000)
npm start

# Or with a custom port
PORT=8080 npm start
```

Set all env vars in your process manager (`systemd`, `pm2`, Docker, etc.) — `.env.local` is loaded by `next dev` but **not** by `next start` in all cases, so prefer real env vars for production.

### Behind a reverse proxy

Most setups put Nginx/Caddy in front of `next start`:

```nginx
server {
    server_name app.your-domain.com;
    listen 443 ssl http2;
    # ... TLS config ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Make sure `X-Forwarded-Proto` is forwarded — NextAuth uses it to build correct callback URLs.

### Docker

A minimal Dockerfile:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
```

Pass env vars at runtime:

```bash
docker run -d \
  -p 3000:3000 \
  -e NEXT_PUBLIC_BACKEND_URL=https://api.your-domain.com \
  -e AUTH_SECRET=... \
  -e AUTH_URL=https://app.your-domain.com \
  -e GOOGLE_CLIENT_ID=... \
  -e GOOGLE_CLIENT_SECRET=... \
  calibrate-frontend
```

`NEXT_PUBLIC_*` vars are baked in at **build time**, not runtime — if you change them, rebuild the image.

## 7. Verify the deploy

After deploying, walk through:

1. Landing page (`/`) loads.
2. `/login` → Google sign-in completes and lands on `/agents`.
3. Network tab shows backend calls hitting `NEXT_PUBLIC_BACKEND_URL` and returning 200s with a Bearer token.
4. Sign out clears the session: `localStorage.access_token`, `localStorage.user`, the `access_token` cookie, and the NextAuth session should all be gone.
5. If Sentry is wired: trigger a test error and confirm it shows up in your Sentry project.

## Troubleshooting

**"Sign in with Google" redirects back with an error.**
The redirect URI in Google Cloud Console doesn't match your deployed URL. The path must be exactly `/api/auth/callback/google`. Also check that `AUTH_URL` matches your actual domain.

**Sign-in succeeds with Google but the app immediately signs out.**
The backend rejected the Google token exchange. The backend's `/auth/google` endpoint must whitelist your Google Client ID — coordinate with whoever runs the backend.

**API calls return 401 in a loop.**
The frontend auto-signs-out on 401. Either the JWT is expired, the backend rejects the token, or `NEXT_PUBLIC_BACKEND_URL` is wrong. Check the actual request URL in the Network tab.

**Build succeeds but `NEXT_PUBLIC_*` values are empty in the browser.**
`NEXT_PUBLIC_*` vars are inlined at build time. After changing them in Vercel, you must redeploy. For Docker, rebuild the image.

**"permission sent to admin" when connecting the repo to Vercel.**
GitHub App approval is org-scoped. An **org owner** (not a repo admin) has to approve from https://github.com/organizations/`<org>`/settings/installations.

## Updating from upstream

If you forked, periodically pull upstream changes:

```bash
git remote add upstream https://github.com/<upstream-org>/calibrate-frontend.git
git fetch upstream
git merge upstream/main
git push origin main
```

Vercel will auto-deploy the merge. Test on a Preview deployment first if you have non-trivial customizations.
