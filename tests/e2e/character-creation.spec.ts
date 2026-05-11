import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import {
  openNewCharacterStandalone,
  fillAbilityScoresViaStandardArray,
  fillAbilityScoresViaPointBuy,
} from './helpers/wizard';

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
  scoreMethod?: 'roll' | 'array' | 'point_buy';  // default: roll
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

  // ── Ability Scores ──────────────────────────────────────────────
  await expect(page.getByText('Assign ability scores', { exact: true })).toBeVisible({ timeout: 10_000 });
  if (c.scoreMethod === 'array') {
    await fillAbilityScoresViaStandardArray(page);
  } else if (c.scoreMethod === 'point_buy') {
    await fillAbilityScoresViaPointBuy(page);
  } else {
    await page.getByText('Roll 4d6', { exact: true }).click();
    await page.getByText(/🎲 ROLL ALL/).click();
  }
  await page.getByText('Continue →', { exact: true }).click();

  // ── Review & name ───────────────────────────────────────────────
  await expect(page.getByText('Review & name your character', { exact: true })).toBeVisible({ timeout: 10_000 });
  const charName = `E2E ${c.species} ${c.classKey} ${Date.now()}`;
  await page.getByPlaceholder('Enter a name…').fill(charName);
  await page.getByText('Create Character', { exact: true }).click();

  // Should land on /character/<uuid>
  await page.waitForURL(/\/character\/[a-z0-9-]+/i, { timeout: 20_000 });
  return { charName };
}

// After the wizard redirects to /character/<id>, confirm the sheet
// rendered with the right top-level identity bits. Catches bugs where
// the wizard saves wrong data but the redirect still succeeds.
async function assertSheetRendered(
  page: Page,
  expected: { name: string; level: number },
) {
  // Character name appears in the desktop layout's name heading.
  await expect(page.getByText(expected.name).first()).toBeVisible({ timeout: 10_000 });
  // Level badge — "Level N"
  await expect(page.getByText(`Level ${expected.level}`, { exact: true }).first()).toBeVisible();
  // Hit Points section label confirms the sheet actually rendered (not
  // an empty / error state).
  await expect(page.getByText('Hit Points', { exact: true }).first()).toBeVisible();
}

test.describe('Character creation — 2014 + pack', () => {
  for (const c of SPECIES_MATRIX) {
    test(`species: ${c.species} → ${c.classKey}`, async ({ page }) => {
      await signIn(page);
      const { charName } = await runWizardEndToEnd(page, c);
      await assertSheetRendered(page, { name: charName, level: 1 });
    });
  }

  for (const c of CLASS_MATRIX) {
    test(`class: ${c.species} → ${c.classKey}`, async ({ page }) => {
      await signIn(page);
      const { charName } = await runWizardEndToEnd(page, c);
      await assertSheetRendered(page, { name: charName, level: 1 });
    });
  }

  // Ability-score method coverage. Roll 4d6 is exercised by every test
  // above; this case validates the Standard Array UI specifically.
  test('ability scores: Standard Array', async ({ page }) => {
    await signIn(page);
    const { charName } = await runWizardEndToEnd(page, {
      species: 'Human',
      classKey: 'Fighter',
      classSkills: ['Athletics', 'Intimidation'],
      background: 'Acolyte',
      scoreMethod: 'array',
    });
    await assertSheetRendered(page, { name: charName, level: 1 });
  });

  test('ability scores: Point Buy', async ({ page }) => {
    await signIn(page);
    const { charName } = await runWizardEndToEnd(page, {
      species: 'Human',
      classKey: 'Fighter',
      classSkills: ['Athletics', 'Intimidation'],
      background: 'Acolyte',
      scoreMethod: 'point_buy',
    });
    await assertSheetRendered(page, { name: charName, level: 1 });
  });

  // Save a partial draft, confirm the wizard navigates back to the
  // characters list. The save half of the round-trip; the resume half
  // requires clicking a draft card whose "Tap to resume →" text resolves
  // to a hidden element in RN-Web's FlatList output (parent stack uses
  // CSS that defeats Playwright's scroll-into-view). See the
  // app/character/new.tsx changes in this branch — `currentStep` now
  // persists on save and rehydrates on resume; verifying that round-trip
  // end-to-end is blocked on a FlatList visibility quirk.
  test('save draft navigates back to characters', async ({ page }) => {
    await signIn(page);
    await openNewCharacterStandalone(page, { packName: PACK_NAME });
    await expect(page.getByText('Choose your species', { exact: true })).toBeVisible();
    await page.getByText('Dwarf', { exact: true }).first().click();
    await page.getByText('Choose Dwarf', { exact: true }).first().click();
    await expect(page.getByText('Choose your class', { exact: true })).toBeVisible();
    await page.getByText('Save draft', { exact: true }).click();
    await page.waitForURL(/\/characters$/, { timeout: 15_000 });
  });

  // Confirms that homebrew (pack-imported) species render in StepSpecies
  // alongside the SRD ones. Probes a few common VGM/TCE species and uses
  // whichever appears first. Skips with a clear message if none are
  // present so failures point at the pack contents, not the test.
  test('homebrew species: pick a pack-imported species', async ({ page }) => {
    await signIn(page);
    await openNewCharacterStandalone(page, { packName: PACK_NAME });
    await expect(page.getByText('Choose your species', { exact: true })).toBeVisible();
    const candidates = ['Aasimar', 'Goliath', 'Tabaxi', 'Firbolg', 'Tortle', 'Kenku', 'Lizardfolk', 'Triton', 'Yuan-ti Pureblood'];
    let picked: string | null = null;
    for (const name of candidates) {
      if (await page.getByText(name, { exact: true }).first().count() > 0) {
        picked = name;
        break;
      }
    }
    if (!picked) {
      test.skip(true, `Pack '${PACK_NAME}' has no recognized non-SRD species; expected one of: ${candidates.join(', ')}`);
      return;
    }
    await page.getByText(picked, { exact: true }).first().click();
    await page.getByText(`Choose ${picked}`, { exact: true }).first().click();
    // Continue the wizard through to the sheet to verify the homebrew
    // species saves and renders.
    await expect(page.getByText('Choose your class', { exact: true })).toBeVisible();
    await page.getByText('Fighter', { exact: true }).first().click();
    for (const sk of ['Athletics', 'Intimidation']) {
      await page.getByText(sk, { exact: true }).first().click();
    }
    await page.getByText('Continue →', { exact: true }).first().click();
    await expect(page.getByText('Choose a background', { exact: true })).toBeVisible();
    await page.getByText('Acolyte', { exact: true }).first().click();
    await page.getByText('Choose Acolyte', { exact: true }).first().click();
    await expect(page.getByText('Pick a starting feat', { exact: true })).toBeVisible();
    for (const f of ['Alert', 'Lucky', 'Tough']) {
      const loc = page.getByText(f, { exact: true }).first();
      if (await loc.count() > 0) {
        await loc.click();
        await page.getByText(`Choose ${f}`, { exact: true }).first().click();
        break;
      }
    }
    await expect(page.getByText('Assign ability scores', { exact: true })).toBeVisible();
    await page.getByText('Roll 4d6', { exact: true }).click();
    await page.getByText(/🎲 ROLL ALL/).click();
    await page.getByText('Continue →', { exact: true }).click();
    await expect(page.getByText('Review & name your character', { exact: true })).toBeVisible();
    const charName = `E2E ${picked} Fighter ${Date.now()}`;
    await page.getByPlaceholder('Enter a name…').fill(charName);
    await page.getByText('Create Character', { exact: true }).click();
    await page.waitForURL(/\/character\/[a-z0-9-]+/i, { timeout: 20_000 });
    await assertSheetRendered(page, { name: charName, level: 1 });
  });
});
