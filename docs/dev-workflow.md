# Local Verification Workflow

Two checks are expected before pushing a branch for Netlify preview: **Tier 1** (typecheck) and **Tier 4** (functional browser check via Playwright against the local dev server). The intermediate tiers (local `expo export`, Netlify deploy watch) were intentionally skipped — Tier 1 catches most build-breakers fast, Tier 4 proves the feature actually works, and Netlify itself is the backstop for bundler-only regressions.

---

## Tier 1 — `npm run typecheck`

Runs `tsc --noEmit`. Fast (5–15s). Catches: missing props, wrong types, bad imports, API signature drift. Misses: runtime errors, SSR-only issues, actual feature behavior.

```bash
npm run typecheck
```

**Known baseline (as of 2026-04-14):** the repo currently reports ~13 pre-existing errors:

- ~11 `TS2322`/`TS2345` errors on `router.push('/(drawer)/...')` calls. These come from a stale `.expo/types/router.d.ts` that was generated before the `/(tabs)/` → `/(drawer)/` refactor. Routes are valid at runtime. Regenerate by running `npx expo start` once and letting typed-routes rewrite the file.
- ~2 `TS2352` errors in `app/campaign/[id]/index.tsx` on Supabase `.select()` joins where the PostgREST return shape doesn't satisfy the `Member[]` cast.

**How to use the baseline:** before you start, run `npm run typecheck` and note the error count. After your edits, run it again. The goal is "no net new errors," not "zero errors." If you touch one of the known-baseline files, bring those errors down if you can, but don't block the branch on them.

---

## Tier 4 — Playwright + local dev server + test user

End-to-end functional check in a real browser. Catches: broken queries, misrouted nav, modals that don't open, RLS/auth failures, wrong copy, anything that bundles fine but behaves wrong.

### One-time setup

**Status on Tyler's machine (as of 2026-04-14):** all three setup steps below are already done. `.env.test` is populated with the test account `claudebot@vaultstone.com`, the account is seeded with one campaign and one character, and Playwright MCP is registered in `~/.claude.json` under the `vaultstone` project scope. If you are Tyler on this machine, skip to *Per-iteration loop*. New contributors, follow these steps:

1. **Create a dedicated test user in Supabase.**
   - Supabase Dashboard → Authentication → Add user → email/password.
   - Use an address you control but that no real campaign/character data is tied to.
   - Seed one test campaign + one test character owned by this user so screens have something to render.
2. **Create `.env.test`** at the repo root (gitignored):
   ```bash
   cp .env.test.example .env.test
   ```
   Fill in `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`. Leave `TEST_BASE_URL=http://localhost:8081` unless you're pointing at a different origin.
3. **Install Playwright MCP** in your Claude Code client:
   ```bash
   claude mcp add playwright -- npx -y @playwright/mcp@latest
   ```
   Restart Claude Code after install; MCP servers are only picked up at session start. On first use, Playwright auto-downloads browser binaries (~200MB, one-time). Verify with `claude mcp list` — you should see `playwright: ✓ Connected`.

### Per-iteration loop

Rough shape of what Claude (or you) should do on each feature iteration:

1. **Start the web dev server in the background.**
   ```bash
   npm run web
   ```
   Wait for "Web is waiting on http://localhost:8081" in the output before proceeding. Leave running across edits — Metro hot-reloads.
2. **Drive the browser with Playwright MCP.** Typical first actions:
   - Navigate to `http://localhost:8081`.
   - Sign in with `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`.
   - Navigate to the screen you're iterating on.
   - Exercise the specific interaction (tap, type, submit) and read the DOM / take a screenshot to confirm the expected result.
3. **Iterate.** Metro hot-reloads on file save, so on the next Playwright call the new behavior is already live — no rebuild step.
4. **When the flow passes, run Tier 1 again** (`npm run typecheck`), then push.

### What "passes" means

Pick the 1–2 golden-path interactions that the feature is *for* and verify them end-to-end. Not every edge case — that's over-spec for pre-push. Example for the Phase 5 campaign-linking work:

- Sign in → open campaign → tap party card row → picker modal opens → pick a character → modal closes → party card row now shows the character name.
- Open drawer → characters list → the picked character shows "In: &lt;campaign name&gt;" badge; others show "Unassigned".

### When Tier 4 is too expensive to be worth it

Skip Tier 4 and rely on Tier 1 + Netlify preview for:

- Docs-only changes (`docs/**`).
- Pure refactors with no behavior change where `tsc` gives high confidence.
- Config files (`app.config.ts`, `netlify.toml`, `metro.config.js`) — these need a real build to validate, not a browser session. Use Tier 2 (`npm run build:web`) manually for those.

---

## Reference: package scripts

- `npm run typecheck` — Tier 1.
- `npm run web` — dev server for Tier 4 (and manual dev).
- `npm run build:web` — the exact command Netlify runs. Useful as an on-demand check for config/bundler-class changes.
