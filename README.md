# Vault Manager

A personal finance app for tracking accounts, transactions, budgets, bills, loans, goals, credit cards and investments. It's a React progressive web app (installable on phones, works offline) backed by Firebase Authentication and Cloud Firestore.

**Features:** multi-currency accounts and transfers · undoable deletes · budgets with 80% / 100% alerts · bills & recurring rules · monthly close (reconcile balances, review the month) · loans and IOUs · goals · credit cards · investments · bank statement import (OFX / QFX / QIF) and CSV import/export · encrypted backups · PIN lock and privacy mode · light and dark themes.

---

## Run it locally

### 1. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 20–24 (22 recommended, see `.nvmrc`) | `node -v` |
| npm | comes with Node | `npm -v` |
| A Firebase project | free Spark plan is enough | [console.firebase.google.com](https://console.firebase.google.com/) |

### 2. Get the code and install

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>/frontend
npm install
```

### 3. Create your Firebase project (first time only)

1. In the [Firebase console](https://console.firebase.google.com/), click **Add project**.
2. **Build → Authentication → Get started**, then enable **Email/Password**.
3. **Build → Firestore Database → Create database** (production mode, pick a region).
4. **Project settings → General → Your apps → Web (`</>`)**: register a web app and copy the `firebaseConfig` values.

### 4. Add your config

```bash
cp .env.example .env
```

Open `frontend/.env` and paste in the values from step 3:

```ini
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

`.env` is ignored by git. Never commit it.

### 5. Deploy the security rules (first time only)

The app relies on the Firestore rules in this repo to keep each user's data private. From the repository root:

```bash
npx firebase-tools login
npx firebase-tools use --add          # choose your project
npx firebase-tools deploy --only firestore:rules
```

### 6. Start the app

```bash
cd frontend
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173), create an account, and verify your email. A **Get started** checklist on the Dashboard walks you through the first steps.

---

## Try it without Firebase

An isolated test harness runs every page against an in-memory fake database, with no account or config needed:

```bash
cd frontend
npm run dev:test
```

Then open http://127.0.0.1:5177/test/browser/dashboard (or `/accounts`, `/transactions`, `/budgets`, `/bills`, `/settings`, and so on).

---

## Scripts (run inside `frontend/`)

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server with hot reload |
| `npm run dev:test` | Test harness with fake data on port 5177 (no Firebase) |
| `npm test` | Unit tests (Node's built-in test runner) |
| `npm run lint` | Static analysis with oxlint |
| `npm run build` | Production build into `frontend/dist` |
| `npm run test:browser` | Playwright browser tests, desktop and mobile (first run: `npx playwright install chromium`) |
| `npm run test:rules:emulator` | Firestore security-rule tests against a local emulator (needs Java 21+; never touches production) |
| `npm run verify` | Unit tests + lint + build |
| `npm run verify:full` | `verify` + browser tests (runs automatically before every deploy) |

## Deploy to Firebase Hosting

```bash
npx firebase-tools deploy --only hosting
```

`firebase.json` runs `verify:full` first and only deploys if everything passes. Stop `npm run dev:test` beforehand, because the browser tests need port 5177. Edit `.firebaserc` and the `site` in `firebase.json` to point at your own project.

## Project layout

```
frontend/            React app (Vite)
  src/pages/         One file per screen (Dashboard, Transactions, …)
  src/components/    Shared UI, modals, the app shell
  src/utils/         Business logic: ledger, money math, alerts, import/export
  src/motion/        Animation system (Liquid Glass, pull-to-refresh, tilt)
  src/styles/        Global CSS layers (base → theme → shell → depth → motion → glass)
  test/              Unit tests (*.test.js)
  test/browser/      Playwright tests + the isolated fake-data harness
backend/             Optional local SQLite API (not used by the web app; see backend/README.md)
firestore.rules      Security rules: per-user data isolation and validation
storage.rules        Storage security rules
docs/BACKUP.md       Backup and restore runbook
```

## Security notes

- **Secrets never live in the repo.** Firebase web config goes in `frontend/.env`; server credentials (service-account JSON) are only for the optional backend and must stay outside the repo (see `.gitignore`).
- The Firebase *web* config isn't a secret: it ships inside the app's JavaScript to every visitor. Your data is protected by **Authentication plus `firestore.rules`**, so always deploy the rules.
- To report a security issue, please open a private security advisory on GitHub instead of a public issue.

### Turn on App Check (recommended for production)

App Check makes Firebase accept requests only from your real app, so nobody can reuse the public web config from a script.

1. Firebase console → **App Check** → **Apps** → your web app → **reCAPTCHA v3**. Create a reCAPTCHA v3 key at [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin) for your domains (include `localhost` for development) and paste in the secret key.
2. Put the **site key** in `frontend/.env` as `VITE_APPCHECK_SITE_KEY=…`, then rebuild and deploy.
3. For local development, open the app with `npm run dev`. The browser console prints an **App Check debug token**; add it under App Check → Apps → ⋮ → **Manage debug tokens**.
4. Watch **App Check → APIs → Cloud Firestore** for a day or two. Once nearly all requests show as verified, click **Enforce** (and do the same for Storage and Authentication).

## Tech stack

React 19 · Vite 8 · Firebase (Auth, Firestore, Hosting) · framer-motion · Recharts · lucide-react · vite-plugin-pwa · Playwright · oxlint
