# Vaultstone — Developer Setup Guide

## Prerequisites

Install the following before starting:

- [Node.js 20](https://nodejs.org/) (v20.x — other versions untested)
- [Git](https://git-scm.com/)
- [VS Code](https://code.visualstudio.com/) (recommended)

---

## 1. Clone the Repository

```bash
git clone https://github.com/tyfoultz/Vaultstone.git
cd Vaultstone
```

---

## 2. Create the `.env` File

Create a file named `.env` in the project root. This file is gitignored and must be obtained from the team lead.

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
EAS_PROJECT_ID=
```

Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the values provided to you separately.
Leave `EAS_PROJECT_ID` blank — it is only needed for App Store / Play Store builds.

---

## 3. Install Dependencies

```bash
npm install
```

Expected output: `added NNN packages, found 0 vulnerabilities`

---

## 4. Start the Dev Server

```bash
npm start -- --clear
```

Once Metro starts you will see a QR code and the line:
```
› Web is waiting on http://localhost:8081
```

Press `w` to open in the browser. You should see a white screen with the text **"Login"** — that is the app running correctly.

> If port 8081 is in use, Expo will offer an alternate port. Accept it.

---

## 5. Verify It Works

- Browser opens to `http://localhost:808x/`
- Page shows "Login" text
- No red error screen in the browser
- Terminal shows bundled successfully (warnings about `shadow*` and `resizeMode` are harmless)

---

## Folder Structure

```
Vaultstone/
├── app/                          # Expo Router screens (file-based routing)
│   ├── _layout.tsx               # Root stack navigator
│   ├── index.tsx                 # Redirects to login
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx             # Login screen (stub)
│   │   └── signup.tsx            # Signup screen (stub)
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── campaigns.tsx         # Campaigns tab (stub)
│   │   ├── characters.tsx        # Characters tab (stub)
│   │   └── settings.tsx          # Settings tab (stub)
│   ├── campaign/[id]/
│   │   ├── index.tsx             # Party view (stub)
│   │   └── session.tsx           # Session mode (stub)
│   └── character/
│       ├── [id].tsx              # Character sheet (stub)
│       └── new.tsx               # Character builder (stub)
├── packages/
│   ├── api/src/                  # Supabase client + typed query functions
│   ├── content/src/              # ContentResolver (SRD / local / homebrew)
│   ├── store/src/                # Zustand state stores
│   ├── systems/src/              # GameSystemDefinition schemas (D&D 5e, custom)
│   ├── types/src/                # Shared TypeScript types + DB types
│   └── ui/src/                   # Shared NativeWind component library + tokens
├── supabase/
│   ├── migrations/               # SQL migrations (apply via Supabase SQL editor)
│   ├── functions/                # Edge Functions (Deno)
│   └── seed.sql                  # Dev seed data
├── scripts/
│   └── patch-metro.js            # Fixes metro package exports for Node 20 compat
├── assets/images/                # App icons, splash screen
├── .env                          # Local only — never committed (see step 2)
├── .env.example                  # Template — copy to .env and fill in values
├── app.config.ts                 # Expo config
├── babel.config.js               # Babel config (NativeWind + Reanimated)
├── CLAUDE.md                     # Claude Code project guide
├── SETUP.md                      # This file
├── tailwind.config.js            # Tailwind / NativeWind config
└── tsconfig.json                 # TypeScript config
```

---

## Database

The database is a shared hosted Supabase project. You do not need to run any migrations locally — the schema is already applied to the shared project.

If a new migration file appears in `supabase/migrations/`, apply it by:
1. Opening the [Supabase SQL editor](https://supabase.com/dashboard)
2. Selecting the Vaultstone project
3. Creating a new query, pasting the migration SQL, and running it

Coordinate with the team before applying migrations.

---

## Troubleshooting

**`Cannot find module` errors on start**
Run `npm install` then `npm start -- --clear` (the `--clear` flag wipes Metro's cache).

**Port already in use**
Accept the alternate port Expo offers — the app will work on any port.

**Red error screen in browser**
Check the terminal for the specific error. Most common causes are missing `.env` values or a stale Metro cache (`npm start -- --clear`).

**Dependency conflicts**
Do not use plain `npm install <package>` to add new packages — always use `npx expo install <package>` which resolves Expo-compatible versions automatically.
