import { expect, type Page, test } from '@playwright/test';
import { createUser, PASSWORD } from './helpers';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/groups');
}

async function createGroup(page: Page, name: string) {
  await page.goto('/groups/new');
  await page.getByLabel('Nom').fill(name);
  await page.getByLabel('Description').fill('On apprend Python ensemble.');
  await page.getByLabel('Langue du groupe').fill('Français');
  await page.getByRole('button', { name: 'Créer le groupe' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return page.url();
}

test.describe('groups', () => {
  test.use({ locale: 'fr-FR' });

  test('a new user creates a group and becomes its leader', async ({ page, request }) => {
    const user = await createUser(request);
    await loginAs(page, user.email);
    await expect(page.getByText("Vous n'êtes encore dans aucun groupe.")).toBeVisible();

    await page.getByRole('link', { name: 'Créer un groupe' }).click();
    await createGroup(page, 'Club Python');

    await expect(page.getByText('Responsable · 1 membre · Français')).toBeVisible();
    // On a phone the nav links sit in the menu; the logo leads home (My groups) too.
    await page.getByRole('link', { name: 'Studybook' }).click();
    await expect(page).toHaveURL('/groups');
    await expect(page.getByRole('link', { name: /Club Python/ })).toBeVisible();
  });

  test('the leader changes settings, archives, and deletes the group', async ({ page, request }) => {
    const user = await createUser(request);
    await loginAs(page, user.email);
    await createGroup(page, 'Groupe à paramétrer');

    await page.getByRole('link', { name: 'Paramètres' }).click();
    await page.getByLabel('Visible dans le catalogue').check();
    await page.getByRole('button', { name: 'Enregistrer les paramètres' }).click();
    // GRP-04: a listed group needs a category.
    await expect(page.getByText("Choisissez au moins un centre d'intérêt pour lister le groupe dans le catalogue.")).toBeVisible();
    await page.getByLabel('Tech').check();
    await page.getByLabel("Valider les personnes qui utilisent le lien d'invitation").check();
    await page.getByRole('button', { name: 'Enregistrer les paramètres' }).click();
    await expect(page.getByText('Paramètres enregistrés.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Visible dans le catalogue')).toBeChecked();

    await page.getByRole('button', { name: 'Archiver le groupe' }).click();
    await expect(page.getByText(/Ce groupe est archivé, ses paramètres sont en lecture seule/)).toBeVisible();
    await page.getByRole('button', { name: 'Désarchiver le groupe' }).click();
    await expect(page.getByRole('button', { name: 'Enregistrer les paramètres' })).toBeVisible();

    const deleteButton = page.getByRole('button', { name: 'Supprimer définitivement le groupe' });
    await page.getByLabel(/Pour supprimer, tapez le nom du groupe/).fill('groupe à paramétrer');
    await expect(deleteButton).toBeDisabled();
    await page.getByLabel(/Pour supprimer, tapez le nom du groupe/).fill('Groupe à paramétrer');
    await deleteButton.click();
    await expect(page).toHaveURL('/groups');
    await expect(page.getByText("Vous n'êtes encore dans aucun groupe.")).toBeVisible();
  });

  test("someone who isn't a member gets 'not found'", async ({ page, request, browser }) => {
    const [owner, stranger] = [await createUser(request), await createUser(request)];
    await loginAs(page, owner.email);
    const groupUrl = await createGroup(page, 'Groupe privé');

    const other = await browser.newPage({ locale: 'fr-FR' });
    await loginAs(other, stranger.email);
    const res = await other.goto(groupUrl);
    expect(res?.status()).toBe(404);
    await expect(other.getByText('Groupe privé')).toHaveCount(0);
    await other.close();
  });
});
