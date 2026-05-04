# Overnight build — campaign ↔ system / pack linking

Branch: `feature/homebrew-packs`
Phases: 4 (all shipped)
Last commit before phase 4 ship: `e22e34a`
Typecheck baseline holds at 6 (all in pre-existing files outside this scope).

---

## What's now wired end-to-end

A DM creates a campaign, picks a system, attaches homebrew packs. A player joins,
sees the campaign's system + active packs, and can roll a character that's
locked to that ruleset and pulls from the campaign's enabled homebrew alongside
the SRD.

Concretely:

1. **DM creates campaign** at `/campaign/new` — radio picker over D&D 5e 2024
   (default), D&D 5e 2014, or Custom. The chosen system id is required by the
   server-side RPC and validated against `game_systems`.
2. **DM attaches packs** via the new "Content Packs" card on the campaign
   detail page. Picker shows their personal-library + this-campaign-scoped
   homebrew packs whose `system` matches. Toggle enabled / disabled in place,
   or remove from the campaign.
3. **Player joins** → sees the same Content Packs card read-only with
   Active/Off chips. Sees the System card with the bundled definition's
   display name + version + license.
4. **Player creates character** via the existing `pick-character` post-join
   landing or the "Link a character" picker on the campaign page. Both now
   route to `/character/new?campaignId=...`. The wizard:
   - Loads the campaign's system, pins the draft to it
   - Skips the ruleset step entirely (5 steps instead of 6)
   - Filters Species/Class/Background queries to SRD + the campaign's
     enabled homebrew packs (other tiers and other packs are hidden)
   - Saves the character with `campaign_id` set so it lives inside the
     campaign

---

## Phase-by-phase

### Phase 1 — Schema (commit `f146f6b`)
- New migration `20260514000000_campaigns_system_and_packs.sql`:
  - Seeds `dnd5e_2014` and `dnd5e_2024` rows in `game_systems` so campaigns
    can pick an explicit edition. Legacy `dnd5e` row stays as the
    backwards-compat alias for existing characters.
  - Adds `campaigns.system text not null references game_systems(id)`.
    Default `'dnd5e'` for backfill, then drop default so future inserts
    must specify.
  - New `campaign_packs(campaign_id, pack_id, enabled, added_at)` join
    table with RLS: members read, only DM writes.
  - Updates `create_campaign_with_gm` RPC to require `p_system` and
    validate it against `game_systems`.
- `database.types.ts` updated for both table changes and the new RPC
  signature.
- API: `createCampaign(name, { system, ... })` is now required-arg;
  new `updateCampaignSystem`; new `packages/api/src/campaign-packs.ts`
  with list/add/setEnabled/remove plus `listEligiblePacksForCampaign`
  for the picker.

### Phase 2 — Campaign UI (commit `5909323`)
- `app/campaign/new.tsx` rewritten to use the design system primitives
  and a radio-style system picker (D&D 5e 2024 default → 5e 2014 →
  Custom).
- `app/campaign/[id]/index.tsx` System card now resolves the bundled
  definition from `campaign.system`. Falls back to `system_label` /
  `content_sources` for older campaigns. The legacy "Manage System" modal
  (which edits content_sources / rulebook PDFs) is left intact — it's a
  separate concern.
- New `components/campaign/CampaignPacksCard.tsx` mounted just below
  the System card. DM sees a toggleable list with checkbox + delete
  affordances and an "Add pack" button that opens an in-card picker.
  Players see the same list read-only with Active/Off chips.

### Phase 3 — Wizard inherits campaign context (commit `e22e34a`)
- `ContentQuery.campaignId` added. `packages/content/src/homebrew/index.ts`
  fetches the matching `campaign_packs` rows and restricts results to
  entries from packs flagged enabled for that campaign. Empty allowlist
  short-circuits the homebrew tier.
- `app/character/new.tsx` reads `?campaignId=` from the route, fetches
  the campaign's system, pins the draft (system + srdVersion +
  campaignId), and uses a 5-step list (no Ruleset step). Step rendering
  + completion checks now key off step `key` instead of numeric index
  so both step lists work. `SheetSoFar.onJumpTo` switches to step keys.
- `StepSpecies` / `StepClass` / `StepBackground` read `campaignId` from
  the draft store and pass it to ContentResolver, with
  `tiers: ['srd', 'homebrew']` when in a campaign so authorized homebrew
  surfaces alongside SRD options.
- `pick-character` now routes to the wizard with `?campaignId=...`.

### Phase 4 — Player entry points (this commit)
- `CharacterPickerModal` (the "Link a character" sheet on the campaign
  detail page) now has a "+ Create new character" row at the top that
  closes the modal and routes to `/character/new?campaignId=...`. So
  whether the player lands via post-join (`pick-character`) or via the
  campaign detail page later, they can roll a character that inherits
  the campaign's ruleset.
- The Content Packs card from Phase 2 already serves as the player
  view of enabled packs (same component renders read-only when
  `isDM={false}`).

---

## Things to verify in the morning

1. **End-to-end flow**: create a new campaign with Pack A attached, log in
   as a different user, join with the code, click "Link a character",
   click "Create new character" — wizard should open with no ruleset
   step, and species/class/background pickers should show only the
   campaign system's SRD content. If Pack A has, say, a homebrew
   species, it should show on the Species step alongside SRD species.
2. **Existing campaigns** — pre-existing campaigns got `system: 'dnd5e'`
   from the migration default. Open one and verify the System card
   still renders correctly (`BUNDLED_BY_SYSTEM_ID['dnd5e']` →
   `dnd5e2024System`).
3. **Toggle vs remove** — disabled (toggled off) packs should hide their
   content from the wizard pickers; re-enabling should bring them back
   without losing the join row.
4. **Player who's the DM** of one campaign and a player in another —
   shouldn't see the wrong campaign's packs in either context.

## Known limitations / follow-ups

- **`characters.system` stays `'dnd5e'`** even when the campaign uses
  `dnd5e_2014` or `dnd5e_2024`. SRD content rows are all keyed under the
  legacy `'dnd5e'` system alias, so changing the character's system
  would break the existing content lookups (which filter by
  `system: 'dnd5e'`). The campaign edition is conveyed through
  `srdVersion`. Cleanup: backfill content `system` columns to match the
  edition explicitly, then update characters to do the same. Out of
  scope for this slice.
- **Tools and other content types** — the wizard doesn't expose pickers
  for tools, items, or spells yet; those flows live in the character
  sheet and spellbook screens. Once those are also campaign-aware they
  should pass `campaignId` to ContentResolver.
- **System lock** — the campaign's system can technically still be
  changed via `updateCampaignSystem` even after characters exist. The
  UX guardrail (lock the picker once any character is created) hasn't
  been added yet; the API allows it because there are legitimate
  scenarios (DM correcting a typo). Worth a confirmation modal in a
  follow-up.
- **Custom system content** — Custom currently has no SRD content for
  the wizard to surface. A character created in a Custom-system
  campaign with no homebrew has nothing to pick from. We should either
  block the wizard or surface a "Set up your custom system first" CTA.
