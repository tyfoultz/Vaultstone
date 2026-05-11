import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { openNewCharacterStandalone } from './helpers/wizard';

const PACK_NAME = '2014 Core + TCE + VGM';

// Create a baseline L1 character via the wizard and return its
// character-sheet URL ID. Used as setup for the level-up tests so each
// test owns its own throwaway character.
async function createL1Fighter(page: Page, name: string): Promise<string> {
  await openNewCharacterStandalone(page, { packName: PACK_NAME });
  await expect(page.getByText('Choose your species', { exact: true })).toBeVisible();
  await page.getByText('Dragonborn', { exact: true }).first().click();
  await page.getByText('Choose Dragonborn', { exact: true }).first().click();
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
  await page.getByPlaceholder('Enter a name…').fill(name);
  await page.getByText('Create Character', { exact: true }).click();
  // Match a real UUID (8-4-4-4-12 hex) so the regex doesn't fire on
  // the still-on-/character/new URL the moment we arrive at it.
  const uuidPattern = /\/character\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  await page.waitForURL(uuidPattern, { timeout: 20_000 });
  const match = page.url().match(uuidPattern);
  if (!match) throw new Error(`Could not parse character id from URL ${page.url()}`);
  const id = match[0].split('/').pop()!;
  // Wait for the character sheet to render before navigating to level-up.
  await expect(page.getByText('Hit Points', { exact: true }).first())
    .toBeVisible({ timeout: 10_000 });
  return id;
}

// Drive one level-up via the wizard at /character/<id>/level-up.
// Defaults: existing class (skipped when only one class), fixed HP, no
// subclass pick (caller passes one if the target level is the unlock
// level), no ASI (level 4/8/etc. require asiAllocation).
async function levelUpOnce(
  page: Page,
  characterId: string,
  opts: {
    subclass?: string;            // required at unlock level (3 for Fighter 5.1)
    asi?: Partial<Record<'Strength' | 'Dexterity' | 'Constitution' | 'Intelligence' | 'Wisdom' | 'Charisma', number>>;
  } = {},
) {
  await page.goto(`/character/${characterId}/level-up`);
  await expect(page.getByText(/Level \d+ → \d+/).first()).toBeVisible({ timeout: 15_000 });

  // Class step only mounts when entries.length > 1 OR multiclass is on.
  // Standalone character with default rules: multiclass is on by default
  // for 2024 / typically off for 2014. We probe for the step's heading
  // and skip if absent.
  if (await page.getByText('Choose a class to level', { exact: true }).count() > 0) {
    // Pick the first "Currently L? → L?" row — that's the existing
    // class. With a single class, there's only one match.
    await page.getByText(/^Currently L\d+ → L\d+$/).first().click();
    await page.getByText('Continue', { exact: true }).click();
  }

  // Subclass step — only mounted at the unlock level (Fighter 5.1: L3).
  if (await page.getByText(/^Choose a .+ subclass$/).count() > 0) {
    if (!opts.subclass) {
      throw new Error('Reached subclass step but no subclass option supplied');
    }
    await page.getByText(opts.subclass, { exact: true }).first().click();
    await page.getByText('Continue', { exact: true }).click();
  }

  // HP step — always present. Default to Fixed (no roll needed).
  await expect(page.getByText('Roll for Hit Points', { exact: true })).toBeVisible();
  await page.getByText(/^Fixed \(\+\d+\)$/).click();
  await page.getByText('Continue', { exact: true }).click();

  // ASI step — only at L4/8/12/16/19 for most classes (Fighter gets
  // bonus ASIs at L6 and L14 in 5.1). If present and caller didn't
  // supply an allocation, throw — that's an unhandled case.
  if (await page.getByText('Ability Score Improvement', { exact: true }).count() > 0) {
    if (!opts.asi) {
      throw new Error('Reached ASI step but no allocation supplied');
    }
    // Tap the "Ability Score Improvement" segmented option (not the heading).
    // The segment is a Pressable; the heading is a Text title. Both contain
    // the same string, so distinguish by clicking the *second* match (the
    // segment renders after the title).
    const asiOptions = page.getByText('Ability Score Improvement', { exact: true });
    await asiOptions.nth(1).click();
    // Each ability row exposes STR/DEX/CON/INT/WIS/CHA badge + a "+"
    // button as siblings. Find the badge, walk to the row's "+", click.
    const shortFor: Record<string, string> = {
      Strength: 'STR', Dexterity: 'DEX', Constitution: 'CON',
      Intelligence: 'INT', Wisdom: 'WIS', Charisma: 'CHA',
    };
    for (const [ability, points] of Object.entries(opts.asi)) {
      if (!points) continue;
      const short = shortFor[ability];
      if (!short) throw new Error(`Unknown ability ${ability}`);
      // Walk up to the ability row (the View that holds badge + label +
      // stepper buttons), then find the row's "+" button.
      const plus = page.getByText(short, { exact: true })
        .locator('xpath=ancestor::*[2]')
        .getByText('+', { exact: true })
        .first();
      for (let i = 0; i < points; i++) {
        await plus.click();
      }
    }
    await page.getByText('Continue', { exact: true }).click();
  }

  // Confirm step — apply.
  await expect(page.getByText('Confirm level-up', { exact: true })).toBeVisible();
  await page.getByText('Apply level-up', { exact: true }).click();
  // After apply, the wizard routes back to the character sheet (URL ends
  // in the bare character ID, no trailing path segment).
  await page.waitForURL(
    new RegExp(`/character/${characterId}$`),
    { timeout: 15_000 },
  );
}

test.describe('Level-up — 2014 + pack', () => {
  test('L1 → L2: Fighter gains a level (fixed HP, no subclass yet)', async ({ page }) => {
    await signIn(page);
    const charId = await createL1Fighter(page, `LU L1→L2 ${Date.now()}`);
    await levelUpOnce(page, charId);
    // Sheet should now read Level 2.
    await expect(page.getByText('Level 2', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('L1 → L3: subclass unlocks at L3 for 2014 Fighter', async ({ page }) => {
    await signIn(page);
    const charId = await createL1Fighter(page, `LU L1→L3 ${Date.now()}`);
    // L1 → L2: no subclass yet.
    await levelUpOnce(page, charId);
    await expect(page.getByText('Level 2', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    // L2 → L3: pick a subclass. 2014 Fighter SRD ships Champion only.
    await levelUpOnce(page, charId, { subclass: 'Champion' });
    await expect(page.getByText('Level 3', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('L1 → L4: ASI step fires at L4 for Fighter', async ({ page }) => {
    await signIn(page);
    const charId = await createL1Fighter(page, `LU L1→L4 ${Date.now()}`);
    await levelUpOnce(page, charId);
    await levelUpOnce(page, charId, { subclass: 'Champion' });
    await levelUpOnce(page, charId, { asi: { Strength: 2 } });
    await expect(page.getByText('Level 4', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });
});
