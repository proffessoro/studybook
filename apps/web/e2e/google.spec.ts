import { expect, test } from '@playwright/test';

/**
 * The full Google flow is tested in the API against a fake provider
 * (apps/api/src/auth/google.spec.ts). These cover the pages, on a dev
 * server without Google configured.
 */
test.describe('Google login pages', () => {
  test.use({ locale: 'fr-FR' });

  test('no Google button when the instance has not set it up', async ({ page, request }) => {
    const { features } = (await (await request.get('/api/v1/instance')).json()) as { features: { googleLogin: boolean } };
    test.skip(features.googleLogin, 'Google login is configured on this dev server');

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continuer avec Google' })).toHaveCount(0);
  });

  test('a failed Google login is explained on the login page', async ({ page }) => {
    await page.goto('/login?error=google-failed');
    await expect(page.getByText("La connexion avec Google n'a pas fonctionné. Veuillez réessayer.")).toBeVisible();
  });

  test('the last sign-up step asks to start again once it has expired', async ({ page }) => {
    await page.goto('/signup/google');
    await expect(page.getByText('Cette étape a expiré. Recommencez avec Google.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Recommencer avec Google' })).toHaveAttribute('href', '/api/v1/auth/google?next=%2F');
  });
});
