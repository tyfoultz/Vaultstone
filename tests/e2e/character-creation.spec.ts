import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { openNewCharacterStandalone } from './helpers/wizard';

const PACK_NAME = '2014 Core + TCE + VGM';

// One sanity-check spec across species × class × background, plus a
// targeted regression for the StepClass-hooks bug. Each test drives the
// 2014 + pack standalone flow end-to-end and confirms the character lands
// on the character sheet.
//
// Tests are sequential (workers: 1 in playwright.config) so they share a
// single browser, which keeps the auth state cached across cases. Each
// test signs in fresh — the auth helper is fast (~7s) and isolating
// tests makes failures actionable.

type Case = {
  species: string;
  classKey: string;
  classSkills: string[];        // must match class.skillChoices.count
  background: string;
  featContains?: string;        // partial match — picks first matching feat
};

// Species coverage — fixed Fighter (skill count 2, no spellcasting,
// straightforward picks) so any species-specific issue surfaces.
// StepClass.tsx hooks-order fix is exercised on every entry here.
const SPECIES_MATRIX: Case[] = [
  { species: 'Human',       classKey: 'Fighter', classSkills: ['Athletics', 'Intimidation'], background: 'Acolyte' },
  { species: 'Elf',          classKey: 'Fighter', classSkills: ['Athletics', 'Intimidation'], background: 'Acolyte' },
  { species: 'Dwarf',        classKey: 'Fighter', classSkills: ['Athletics', 'Intimidation'], background: 'Acolyte' },
  { species: 'Halfling',     classKey: 'Fighter', classSkills: ['Athletics', 'Intimidation'], background: 'Acolyte' },
  { species: 'Tiefling',     classKey: 'Fighter', classSkills: ['Athletics', 'Intimidation'], background: 'Acolyte' },
];

// Class coverage — fixed Human so the picker matrix is small.
// One class per archetype (Martial / Hybrid / Caster) plus a Rogue
// (uses Expertise + 4 skills, distinct UI shape).
const CLASS_MATRIX: Case[] = [
  // Religion on the Paladin specifically guards against the
  // Oxford-comma "And X" regression in scripts/import-srd/transforms/classes.js.
  { species: 'Human', classKey: 'Paladin', classSkills: ['Athletics', 'Religion'], background: 'Acolyte' },
  { species: 'Human', classKey: 'Wizard',  classSkills: ['Arcana', 'History'],     background: 'Acolyte' },
  { species: 'Human', classKey: 'Rogue',   classSkills: ['Acrobatics', 'Deception', 'Investigation', 'Stealth'], background: 'Acolyte' },
];

async function runWizardEndToEnd(page: Page, c: Case) {
  await openNewCharacterStandalone(page, { packName: PACK_NAME });

  // ── Species ─────────────────────────────────────────────────────
  await expect(page.getByText('Choose your species', { exact: true })).toBeVisible();
  await page.getByText(c.species, { exact: true }).first().click();
  // Detail page commits via "Choose <Name>"
  await page.getByText(`Choose ${c.species}`, { exact: true }).first().click();

  // ── Class ───────────────────────────────────────────────────────
  // StepClass auto-commits the class on detail open (the hook-order fix
  // we just landed), so the commit bar shows "Deselect" + "Continue →"
  // immediately. Pick skills, then advance via Continue.
  await expect(page.getByText('Choose your class', { exact: true })).toBeVisible();
  await page.getByText(c.classKey, { exact: true }).first().click();
  for (const sk of c.classSkills) {
    await page.getByText(sk, { exact: true }).first().click();
  }
  await page.getByText('Continue →', { exact: true }).first().click();

  // ── Background ──────────────────────────────────────────────────
  await expect(page.getByText('Choose a background', { exact: true })).toBeVisible();
  await page.getByText(c.background, { exact: true }).first().click();
  // If the background grants a skill the class already picked, the
  // detail page surfaces a "Skill conflict" picker that gates Choose.
  // Resolve it by tapping the first replacement chip — any non-colliding
  // skill is fine for sanity testing.
  const conflictPanel = page.getByText('Skill conflict', { exact: true });
  if (await conflictPanel.count() > 0) {
    // The first replacement option after the "Replace X with:" label is
    // the first child of the chip row.
    const firstReplacement = page.getByText(/^Replace .+ with:$/).first()
      .locator('xpath=following-sibling::*[1]')
      .locator('xpath=*[1]');
    await firstReplacement.click();
  }
  await page.getByText(`Choose ${c.background}`, { exact: true }).first().click();

  // ── Feats (auto-mounted because Feats at L1 is "On" by default) ──
  // Step header reads "Pick a starting feat". Tap the first available
  // feat card, then commit. Origin feats: Alert, Lucky, Magic Initiate, etc.
  await expect(page.getByText('Pick a starting feat', { exact: true })).toBeVisible({ timeout: 10_000 });
  // First feat card is rendered as a clickable row — tap the first
  // "Choose <Name>" we can find after opening the first card.
  const firstFeatHeading = page.locator('div[role="button"], [aria-label]').first();
  // Simpler approach: tap the first feat name we can find. Origin feats
  // include "Alert"; widely available across SRDs and homebrew packs.
  const candidateFeats = ['Alert', 'Lucky', 'Magic Initiate', 'Tough', 'Skilled', 'Crafter'];
  let pickedFeat: string | null = null;
  for (const f of candidateFeats) {
    const loc = page.getByText(f, { exact: true }).first();
    if (await loc.count() > 0) {
      await loc.click();
      pickedFeat = f;
      break;
    }
  }
  if (!pickedFeat) throw new Error('No expected feat name found on Feats step');
  await page.getByText(`Choose ${pickedFeat}`, { exact: true }).first().click();

  // ── Ability Scores (Roll 4d6 → Roll All) ────────────────────────
  await expect(page.getByText('Roll 4d6', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Roll 4d6', { exact: true }).click();
  await page.getByText(/🎲 ROLL ALL/).click();
  await page.getByText('Continue →', { exact: true }).click();

  // ── Review & name ───────────────────────────────────────────────
  await expect(page.getByText('Review & name your character', { exact: true })).toBeVisible({ timeout: 10_000 });
  const charName = `E2E ${c.species} ${c.classKey} ${Date.now()}`;
  await page.getByPlaceholder('Enter a name…').fill(charName);
  await page.getByText('Create Character', { exact: true }).click();

  // Should land on /character/<uuid>
  await page.waitForURL(/\/character\/[a-z0-9-]+/i, { timeout: 20_000 });
}

test.describe('Character creation — 2014 + pack', () => {
  for (const c of SPECIES_MATRIX) {
    test(`species: ${c.species} → ${c.classKey}`, async ({ page }) => {
      await signIn(page);
      await runWizardEndToEnd(page, c);
    });
  }

  for (const c of CLASS_MATRIX) {
    test(`class: ${c.species} → ${c.classKey}`, async ({ page }) => {
      await signIn(page);
      await runWizardEndToEnd(page, c);
    });
  }
});
