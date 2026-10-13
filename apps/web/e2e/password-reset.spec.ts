import { expect, test } from '@playwright/test';
import { createUser, emailedLink, PASSWORD } from './helpers';

test.describe('password reset', () => {
  test.use({ locale: 'fr-FR' });

  test('a user who forgot their password gets a link and chooses a new one', async ({ page, request }) => {
    const user = await createUser(request);

    await page.goto('/login');
    await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
    await expect(page.getByRole('heading', { name: 'Mot de passe oublié ?' })).toBeVisible();
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByText(`Si un compte utilise ${user.email}, un lien arrive.`)).toBeVisible();

    const link = await emailedLink(request, user.email, /Réinitialiser/);
    await page.goto(link);
    await page.getByLabel('Nouveau mot de passe').fill('a brand new password');
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click();
    await expect(page.getByText('Votre mot de passe est changé.')).toBeVisible();

    await page.getByRole('link', { name: 'Se connecter' }).last().click();
    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible();
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('a brand new password');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('button', { name: `Compte de ${user.pseudo}` })).toBeVisible();
  });

  test('a used link says so and offers a new one', async ({ page, request }) => {
    const user = await createUser(request);
    await request.post('/api/v1/auth/recover', { data: { email: user.email } });
    const link = await emailedLink(request, user.email, /Réinitialiser/);
    const token = new URL(link).searchParams.get('token');
    await request.post('/api/v1/auth/recover/confirm', { data: { token, password: 'first new password' } });

    await page.goto(link);
    await page.getByLabel('Nouveau mot de passe').fill('second new password');
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click();

    await expect(page.getByText('Ce lien a expiré ou a déjà été utilisé.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Recevoir un nouveau lien' })).toBeVisible();
    // The old password stopped working only because the first reset succeeded.
    expect((await request.post('/api/v1/auth/login', { data: { email: user.email, password: PASSWORD } })).status()).toBe(401);
  });
});
