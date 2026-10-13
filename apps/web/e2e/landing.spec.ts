import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test.use({ locale: 'fr-FR' });

  test('defaults to French', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('link', { name: 'Créer un groupe' })).toBeVisible();
  });

  test('switches to English and remembers it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Changer de langue' }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(page.getByRole('link', { name: 'Create a group' })).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('landing page in an English browser', () => {
  test.use({ locale: 'en-US' });

  test('follows the browser language', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Create a group' })).toBeVisible();
  });
});
