import { expect, test } from '@playwright/test';
import { createUser, PASSWORD } from './helpers';

test.describe('login', () => {
  test.use({ locale: 'fr-FR' });

  test('a verified user logs in, stays logged in, and logs out', async ({ page, request }) => {
    const user = await createUser(request);

    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    const account = page.getByRole('button', { name: `Compte de ${user.pseudo}` });
    await expect(account).toBeVisible();
    await expect(page).toHaveURL('/');

    await page.reload();
    await expect(account).toBeVisible();

    await account.click();
    await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
    await expect(account).toBeHidden();
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible();
  });

  test('a wrong password shows a generic error', async ({ page, request }) => {
    const user = await createUser(request);

    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mot de passe').fill('not the password');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    // Scoped to the form: Next.js adds its own route-announcer alert to every page.
    await expect(page.locator('form').getByRole('alert')).toHaveText('Email ou mot de passe incorrect.');
  });

  test('an unverified user is sent to verify their email', async ({ page, request }) => {
    const user = await createUser(request, { verified: false });

    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await page.getByRole('link', { name: 'Vérifier mon email' }).click();
    await page.getByLabel('Code').fill(user.code);
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await expect(page.getByText('Votre email est vérifié.')).toBeVisible();
  });

  test('a logged-in user opening /login goes home', async ({ page, request }) => {
    const user = await createUser(request);
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/login');
    await expect(page).toHaveURL('/');
  });
});
