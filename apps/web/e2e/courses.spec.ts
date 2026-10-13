import { expect, type Page, test } from '@playwright/test';
import { apiSession, createUser, PASSWORD } from './helpers';

/** A 1×1 PNG, for the lesson image. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/groups');
}

test.describe('courses and lessons', () => {
  test.use({ locale: 'fr-FR' });

  test('a leader writes and publishes a lesson; a member reads it, never the drafts', async ({ page, browser, playwright, request }) => {
    // A long journey across two browsers; on a cold dev server each first visit compiles a page.
    test.slow();
    const [leader, member] = [await createUser(request), await createUser(request)];
    const leaderApi = await apiSession(playwright, leader.email);
    const group = (await (await leaderApi.post('/api/v1/groups', { data: { name: 'Club Python' } })).json()) as { id: string };
    const { token } = (await (await leaderApi.get(`/api/v1/groups/${group.id}/invite-link`)).json()) as { token: string };
    await (await apiSession(playwright, member.email)).post(`/api/v1/invites/${token}/join`);

    // The leader builds a course.
    await loginAs(page, leader.email);
    await page.goto(`/groups/${group.id}`);
    await page.getByRole('button', { name: 'Nouveau cours' }).click();
    await page.getByLabel('Titre du cours').fill('Python pour débutants');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByLabel('Titre du cours')).toHaveValue('Python pour débutants');

    await page.getByLabel('Nouveau module').fill('Semaine 1');
    await page.getByRole('button', { name: 'Ajouter un module' }).click();
    await expect(page.getByRole('heading', { name: 'Semaine 1' })).toBeVisible();
    await page.getByLabel('Nouvelle leçon dans Semaine 1').fill('Les variables');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByRole('link', { name: /Les variables/ })).toBeVisible();
    await page.getByLabel('Nouvelle leçon dans Semaine 1').fill('Brouillon secret');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByRole('link', { name: /Brouillon secret/ })).toBeVisible();

    // …writes the first lesson with a heading, bold text, and an image…
    await page.getByRole('link', { name: /Les variables/ }).click();
    const editor = page.getByRole('textbox', { name: 'Texte de la leçon' });
    await editor.click();
    await page.getByRole('button', { name: 'Titre', exact: true }).click();
    await page.keyboard.type('Ce qu’est une variable');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Gras' }).click();
    await page.keyboard.type('Une boîte');
    await page.getByRole('button', { name: 'Gras' }).click();
    await page.keyboard.type(' qui garde une valeur.');
    await page.locator('input[type="file"]').setInputFiles({ name: 'schema.png', mimeType: 'image/png', buffer: PNG });
    await expect(editor.locator('img')).toHaveCount(1);
    await page.getByLabel('Publiée', { exact: true }).check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Enregistré.')).toBeVisible();

    // …and publishes the course.
    await page.getByRole('link', { name: /Python pour débutants/ }).click();
    await expect(page).toHaveURL(/\/courses\//);
    await page.getByLabel('Publié', { exact: true }).check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Enregistré.')).toBeVisible();

    // A member reads it.
    const memberPage = await browser.newPage({ locale: 'fr-FR' });
    await loginAs(memberPage, member.email);
    await memberPage.goto(`/groups/${group.id}`);
    await memberPage.getByRole('link', { name: /Python pour débutants/ }).click();
    await expect(memberPage.getByRole('link', { name: 'Brouillon secret' })).toHaveCount(0);
    await memberPage.getByRole('link', { name: 'Les variables' }).click();
    await expect(memberPage.getByRole('heading', { name: 'Ce qu’est une variable' })).toBeVisible();
    await expect(memberPage.locator('strong', { hasText: 'Une boîte' })).toBeVisible();
    // The image is a protected file, served to the member.
    const image = memberPage.locator('main img');
    await expect(image).toHaveCount(1);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1);
    await expect(memberPage.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
    await memberPage.close();
  });
});
