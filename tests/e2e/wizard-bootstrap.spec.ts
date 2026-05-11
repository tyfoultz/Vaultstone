import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { openNewCharacterStandalone } from './helpers/wizard';

// Before fanning out the matrix, prove the wizard's fork screen +
// standalone setup work as expected and we land on Species.
test('standalone wizard reaches Species step with pack selected', async ({ page }) => {
  await signIn(page);
  await openNewCharacterStandalone(page, {
    packName: '2014 Core + TCE + VGM',
  });

  // The Species step renders a title "Choose your species" (mirror of StepClass)
  await expect(page.getByText(/Choose your species|Choose a species/i).first()).toBeVisible({ timeout: 10_000 });
});
