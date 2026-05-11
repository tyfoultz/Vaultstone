import { expect, type Page } from '@playwright/test';

// Opens the standalone wizard fork by going through the Characters tab.
// Assumes the test user is already signed in (signIn fixture).
export async function openNewCharacterStandalone(
  page: Page,
  opts: { packName?: string } = {},
) {
  // RN-Web renders Touchable* as divs, so role=button doesn't apply; use text.
  await page.goto('/characters');
  await page.getByText('New Character', { exact: true }).first().click();
  await page.waitForURL(/\/character\/new/, { timeout: 10_000 });

  // Fork screen — pick "Standalone character"
  await page.getByText('Standalone character', { exact: true }).click();

  // Pick the 2014 ruleset card. Each card renders the label + year as
  // separate text nodes ("D&D 5e" / "2014"); the year alone disambiguates.
  await page.getByText('D&D 5e 2014', { exact: true }).waitFor({ timeout: 10_000 });
  await page.getByText('D&D 5e 2014', { exact: true }).click();

  // Tick the pack checkbox if a name was supplied
  if (opts.packName) {
    await page.getByText(opts.packName, { exact: true }).click();
  }

  // Continue out of Ruleset
  await clickContinue(page);
  // Standalone flow inserts a "Rules" step (campaign-rules editor) between
  // Ruleset and Species. System defaults are pre-seeded, so we just Continue.
  await page.getByText('Character creation rules', { exact: true })
    .waitFor({ timeout: 10_000 });
  await clickContinue(page);
}

export async function clickContinue(page: Page) {
  // The wizard's footer button reads "Continue →" between steps, and
  // "Create Character" on the final step.
  const btn = page.getByText(/^Continue →$|^Create Character$/).last();
  await btn.click();
}

export async function selectSpecies(page: Page, name: string) {
  // Species cards each contain the species name. Tap the card, then
  // commit by tapping its detail-page "Choose <Name>" button.
  await page.getByText(name, { exact: true }).first().click();
  await page.getByRole('button', { name: new RegExp(`Choose ${name}`, 'i') }).click();
}

export async function selectClass(
  page: Page,
  name: string,
  skills: string[],
) {
  await page.getByText(name, { exact: true }).first().click();
  // Tick the requested class skills (lower-case "Acrobatics", etc.).
  for (const sk of skills) {
    await page.getByText(sk, { exact: true }).first().click();
  }
  await page.getByRole('button', { name: new RegExp(`Choose ${name}`, 'i') }).click();
}

export async function selectBackground(page: Page, name: string) {
  await page.getByText(name, { exact: true }).first().click();
  await page.getByRole('button', { name: new RegExp(`Choose ${name}`, 'i') }).click();
}

export async function fillAbilityScoresViaRoll(page: Page) {
  // Switch to Roll 4d6 method, then "Roll All" — sets all six at once.
  await page.getByText('Roll 4d6', { exact: true }).click();
  await page.getByText(/🎲 ROLL ALL|↺ REROLL ALL/).click();
}

export async function fillReviewAndCreate(page: Page, characterName: string) {
  // Review step has a text input for character name.
  const nameInput = page.locator('input').filter({ hasNot: page.locator('[type="checkbox"]') }).first();
  await nameInput.fill(characterName);
  await page.getByText('Create Character', { exact: true }).click();
  // After create, we redirect to /character/<id>
  await page.waitForURL(/\/character\/[a-z0-9-]+/i, { timeout: 15_000 });
}
