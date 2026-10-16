import { expect, test } from '@playwright/test';
import { apiSession, createUser, PASSWORD, uniqueUser } from './helpers';

test.describe('catalogue', () => {
  test.use({ locale: 'fr-FR' });

  test('a visitor finds a listed group, logs in, asks to join, and gets in', async ({ page, browser, request }) => {
    const [leader, visitor] = [await createUser(request), await createUser(request)];
    const name = `Révisions ${uniqueUser().pseudo}`;
    const tag = `bepc${Date.now() % 100000}`;

    // The leader lists a group with a category and a tag.
    const leaderPage = await browser.newPage({ locale: 'fr-FR' });
    await leaderPage.goto('/login');
    await leaderPage.getByLabel('Email').fill(leader.email);
    await leaderPage.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await leaderPage.getByRole('button', { name: 'Se connecter' }).click();
    await leaderPage.goto('/groups/new');
    await leaderPage.getByLabel('Nom').fill(name);
    await leaderPage.getByLabel('Description').fill('On prépare le BEPC ensemble.');
    await leaderPage.getByRole('button', { name: 'Créer le groupe' }).click();
    await leaderPage.getByRole('link', { name: 'Paramètres' }).click();
    await leaderPage.getByLabel('Visible dans le catalogue').check();
    await leaderPage.getByLabel('Préparation aux examens').check();
    await leaderPage.getByLabel('Étiquettes').fill(`${tag}, maths`);
    await leaderPage.getByRole('button', { name: 'Enregistrer les paramètres' }).click();
    await expect(leaderPage.getByText('Paramètres enregistrés.')).toBeVisible();
    const groupUrl = leaderPage.url().replace(/\/settings$/, '');

    // A visitor, logged out, browses by category and searches by tag.
    await page.goto('/catalogue');
    await page.getByRole('navigation', { name: 'Catégories' }).getByRole('link', { name: 'Préparation aux examens' }).click();
    await expect(page).toHaveURL(/category=exam-prep/);
    await page.getByRole('searchbox', { name: 'Rechercher' }).fill(tag.toUpperCase());
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText(`#${tag}`)).toBeVisible();

    await page.getByRole('link', { name: "J'ai déjà un compte" }).click();
    await page.getByLabel('Email').fill(visitor.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByRole('button', { name: 'Demander à rejoindre' }).click();
    await expect(page.getByText('Votre demande est envoyée.', { exact: false })).toBeVisible();

    // The leader accepts; the visitor's catalogue page now leads into the group.
    await leaderPage.goto(groupUrl);
    await leaderPage.getByRole('button', { name: `Accepter ${visitor.pseudo}` }).click();
    await expect(leaderPage.getByText('1 personne veut rejoindre')).toBeHidden();
    await page.reload();
    await expect(page).toHaveURL(groupUrl);
    await leaderPage.close();
  });

  test('private groups never show up', async ({ page, playwright, request }) => {
    const leader = await createUser(request);
    const api = await apiSession(playwright, leader.email);
    const name = `Secret ${uniqueUser().pseudo}`;
    const { slug } = (await (await api.post('/api/v1/groups', { data: { name } })).json()) as { slug: string };

    await page.goto(`/catalogue?${new URLSearchParams({ q: name })}`);
    await expect(page.getByText(`Aucun groupe ne correspond à « ${name} ».`)).toBeVisible();
    expect((await page.goto(`/catalogue/${slug}`))?.status()).toBe(404);
  });
});
