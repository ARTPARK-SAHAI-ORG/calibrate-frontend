# Pense

Voice agent simulation and evaluation platform.

## Prerequisites

- Node.js 18+
- npm

## Setup

### Install dependencies

```bash
npm install
```

### Configure environment variables

Copy the example env file and fill in the values:

```bash
cp env.example .env.local
```

Required variables:

```bash
# Backend API URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# NextAuth.js secret (generate with: openssl rand -base64 32)
AUTH_SECRET=

# Google OAuth credentials (from Google Cloud Console)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build for Production

```bash
npm run build
npm start
```
