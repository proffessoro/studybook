import { type Browser, expect, type Page, test } from '@playwright/test';
import { createUser, emailedCode, PASSWORD, resetRateLimits, uniqueUser } from './helpers';

async function fillLogin(page: Page, email: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** A leader in their own browser, with a new group. Returns the group page and its invite link. */
async function leaderWithGroup(browser: Browser, email: string, name: string) {
  const page = await browser.newPage({ locale: 'fr-FR' });
  await page.goto('/login');
  await fillLogin(page, email);
  await expect(page).toHaveURL('/groups');
  await page.goto('/groups/new');
  await page.getByLabel('Nom').fill(name);
  await page.getByRole('button', { name: 'Créer le groupe' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const link = await page.getByLabel("Lien d'invitation").inputValue();
  expect(link).toMatch(/\/join\/[\w-]+$/);
  return { page, link };
}

test.describe('invites', () => {
  test.use({ locale: 'fr-FR' });

  test('someone logged out opens the link, logs in, and joins', async ({ page, request, browser }) => {
    const [leader, member] = [await createUser(request), await createUser(request)];
    const { link } = await leaderWithGroup(browser, leader.email, 'Club Python');

    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Club Python' })).toBeVisible();
    await page.getByRole('link', { name: "J'ai déjà un compte" }).click();
    await fillLogin(page, member.email);

    await page.getByRole('button', { name: 'Rejoindre le groupe' }).click();
    await expect(page.getByText('Membre · 2 membres')).toBeVisible();
    // Members don't get the leader's invite tools.
    await expect(page.getByLabel("Lien d'invitation")).toHaveCount(0);
  });

  test('a new visitor signs up from the link and lands in the group', async ({ page, request, browser }) => {
    const leader = await createUser(request);
    const { link } = await leaderWithGroup(browser, leader.email, 'Groupe ouvert');
    const user = uniqueUser();
    resetRateLimits();

    await page.goto(link);
    await page.getByRole('link', { name: 'Créer un compte' }).click();
    await page.getByLabel('Nom complet').fill('Nouvelle Personne');
    await page.getByLabel('Pseudo').fill(user.pseudo);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Numéro de téléphone').fill(user.phone);
    await page.getByLabel('Mot de passe').fill(PASSWORD);
    await page.getByLabel(/j'accepte la politique/i).check();
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await page.getByLabel('Code').fill(await emailedCode(request, user.email));
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await page.getByRole('link', { name: 'Se connecter' }).last().click();
    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible();
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    // Back on the invite, as GRP-03 asks.
    await page.getByRole('button', { name: 'Rejoindre le groupe' }).click();
    await expect(page.getByRole('heading', { name: 'Groupe ouvert' })).toBeVisible();
  });

  test('with approval on, the leader accepts the request', async ({ page, request, browser }) => {
    const [leader, member] = [await createUser(request), await createUser(request)];
    const { page: leaderPage, link } = await leaderWithGroup(browser, leader.email, 'Groupe sur validation');
    const groupUrl = leaderPage.url();
    await leaderPage.getByRole('link', { name: 'Paramètres' }).click();
    await leaderPage.getByLabel("Valider les personnes qui utilisent le lien d'invitation").check();
    await leaderPage.getByRole('button', { name: 'Enregistrer les paramètres' }).click();
    await expect(leaderPage.getByText('Paramètres enregistrés.')).toBeVisible();

    await page.goto('/login');
    await fillLogin(page, member.email);
    await expect(page).toHaveURL('/groups');
    await page.goto(link);
    await expect(page.getByText('Le responsable valide les nouveaux membres.')).toBeVisible();
    await page.getByRole('button', { name: 'Demander à rejoindre' }).click();
    await expect(page.getByText('Votre demande est envoyée.', { exact: false })).toBeVisible();

    await leaderPage.goto(groupUrl);
    await expect(leaderPage.getByText('1 personne veut rejoindre')).toBeVisible();
    await expect(leaderPage.getByText(member.email, { exact: false })).toBeVisible();
    await leaderPage.getByRole('button', { name: `Accepter ${member.pseudo}` }).click();
    await expect(leaderPage.getByText('1 personne veut rejoindre')).toBeHidden();

    await page.goto(link);
    await expect(page).toHaveURL(groupUrl);
  });

  test('after a reset, the old link no longer works', async ({ page, request, browser }) => {
    const leader = await createUser(request);
    const { page: leaderPage, link } = await leaderWithGroup(browser, leader.email, 'Groupe à lien');

    await leaderPage.getByRole('button', { name: 'Réinitialiser le lien' }).click();
    await leaderPage.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
    await expect(leaderPage.getByText("Nouveau lien prêt. L'ancien ne fonctionne plus.")).toBeVisible();
    await expect(leaderPage.getByLabel("Lien d'invitation")).not.toHaveValue(link);

    await page.goto(link);
    await expect(page.getByRole('heading', { name: "Ce lien d'invitation ne fonctionne plus" })).toBeVisible();
  });
});
