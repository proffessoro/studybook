import { expect, test } from '@playwright/test';
import { createUser, emailedCode, uniqueUser } from './helpers';

test.describe('sign-up', () => {
  test.use({ locale: 'fr-FR' });

  test('a new user signs up and verifies their email with the code', async ({ page, request }) => {
    const user = uniqueUser();
    await page.goto('/signup');

    await page.getByLabel('Nom complet').fill('Test E2E');
    await page.getByLabel('Pseudo').fill(user.pseudo);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Numéro de téléphone').fill(user.phone);
    await page.getByLabel('Mot de passe').fill('correct horse');
    await page.getByLabel(/j'accepte la politique/i).check();
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page).toHaveURL(/\/verify-email\?email=/);
    await expect(page.getByText(`Nous avons envoyé un code à 6 chiffres à ${user.email}`)).toBeVisible();

    await page.getByLabel('Code').fill(await emailedCode(request, user.email));
    await page.getByRole('button', { name: 'Vérifier' }).click();

    await expect(page.getByText('Votre email est vérifié.')).toBeVisible();
    await page.getByRole('link', { name: 'Se connecter' }).last().click();
    await expect(page.getByLabel('Email')).toHaveValue(user.email);
  });

  test('the link in the email verifies on its own', async ({ page, request }) => {
    const { email, code } = await createUser(request, { verified: false });
    const user = { email };

    await page.goto(`/verify-email?${new URLSearchParams({ email: user.email, code })}`);

    await expect(page.getByText('Votre email est vérifié.')).toBeVisible();
  });

  test('shows what to fix, in French', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Numéro de téléphone').fill('12');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page.getByText('Saisissez votre nom complet.')).toBeVisible();
    await expect(page.getByText(/Saisissez un numéro camerounais/)).toBeVisible();
    await expect(page.getByText(/Vous devez accepter la politique/)).toBeVisible();
    await expect(page.getByLabel('Numéro de téléphone')).toHaveAttribute('aria-invalid', 'true');
  });
});
