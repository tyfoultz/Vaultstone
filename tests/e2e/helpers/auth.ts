import { expect, type Page } from '@playwright/test';

export async function signIn(page: Page) {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error('TEST_USER_EMAIL / TEST_USER_PASSWORD missing — fill in .env.test');
  }

  await page.goto('/');
  // Login route is /(auth)/login but Expo Router serves it at /login on web.
  await page.waitForURL(/\/login/, { timeout: 15_000 });

  // RN-Web renders Input primitives as raw <input> tags — label is a
  // sibling node, not <label for>. Select by autocomplete (most stable)
  // with placeholder as a fallback.
  const emailInput = page.locator('input[autocomplete="email"]').first();
  const passwordInput = page.locator('input[autocomplete="current-password"]').first();
  await emailInput.fill(email);
  await passwordInput.fill(password);

  await page.getByRole('button', { name: /sign in/i }).click();

  // After auth, the drawer layout renders — wait for a nav item only
  // an authed user sees.
  await expect(page.getByText('Campaigns', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
}
