import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';

// Smoke check before we invest in the character-creation matrix.
// Confirms the auth helper works against the local dev server and
// the test user lands in an authed shell with the expected nav.
test('test user can sign in and sees the drawer nav', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Home', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Campaigns', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Characters', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Game Systems', { exact: true }).first()).toBeVisible();
});
