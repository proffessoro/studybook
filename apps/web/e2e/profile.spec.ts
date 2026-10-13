import { expect, type Page, test } from '@playwright/test';
import { createUser, emailedCode, emailedSubjects, PASSWORD, uniqueUser } from './helpers';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe('profile', () => {
  test.use({ locale: 'fr-FR' });

  test('opening the profile while logged out goes through login and back', async ({ page, request }) => {
    const user = await createUser(request);

    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile/);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();
  });

  test('a user changes their pseudo and language', async ({ page, request }) => {
    const user = await createUser(request);
    const newPseudo = uniqueUser().pseudo;
    await loginAs(page, user.email);

    await page.goto('/profile');
    await page.getByLabel('Pseudo').fill(newPseudo);
    await page.getByLabel('English').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    // The interface switches to the chosen language.
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Account of ${newPseudo}` })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Pseudo')).toHaveValue(newPseudo);
  });

  test('a pseudo taken by someone else is refused', async ({ page, request }) => {
    const [user, other] = [await createUser(request), await createUser(request)];
    await loginAs(page, user.email);

    await page.goto('/profile');
    await page.getByLabel('Pseudo').fill(other.pseudo.toUpperCase());
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText('Ce pseudo est déjà pris. Essayez-en un autre.')).toBeVisible();
  });

  test('a user changes their email with a code sent to the new address', async ({ page, request }) => {
    const user = await createUser(request);
    const newEmail = uniqueUser().email;
    await loginAs(page, user.email);

    await page.goto('/profile');
    await page.getByRole('button', { name: "Changer d'email" }).click();
    await page.getByLabel('Nouvel email').fill(newEmail);
    await page.getByLabel('Mot de passe actuel').fill(PASSWORD);
    await page.getByRole('button', { name: 'Envoyer un code' }).click();
    await expect(page.getByText(`Nous avons envoyé un code à 6 chiffres à ${newEmail}`)).toBeVisible();

    await page.getByLabel('Code').fill(await emailedCode(request, newEmail));
    await page.getByRole('button', { name: 'Confirmer mon nouvel email' }).click();

    await expect(page.getByText(`Votre email est maintenant ${newEmail}`)).toBeVisible();
    // The old address is told, in case it wasn't the owner.
    await expect.poll(() => emailedSubjects(request, user.email), { timeout: 15_000 }).toContain('Votre email Studybook a changé');
  });

  test('a wrong current password stops an email change', async ({ page, request }) => {
    const user = await createUser(request);
    await loginAs(page, user.email);

    await page.goto('/profile');
    await page.getByRole('button', { name: "Changer d'email" }).click();
    await page.getByLabel('Nouvel email').fill(uniqueUser().email);
    await page.getByLabel('Mot de passe actuel').fill('not my password');
    await page.getByRole('button', { name: 'Envoyer un code' }).click();

    await expect(page.getByText('Ce mot de passe est incorrect.')).toBeVisible();
  });
});
