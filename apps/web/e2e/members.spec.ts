import { expect, type Page, test } from '@playwright/test';
import { apiSession, createUser, PASSWORD } from './helpers';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/groups');
}

test.describe('members', () => {
  test.use({ locale: 'fr-FR' });

  /** A leader with a group that `bob` and `carol` joined through the invite link. */
  async function groupWithMembers(playwright: Parameters<typeof apiSession>[0], request: Parameters<typeof createUser>[0]) {
    const [leader, bob, carol] = [await createUser(request), await createUser(request), await createUser(request)];
    const leaderApi = await apiSession(playwright, leader.email);
    const group = (await (await leaderApi.post('/api/v1/groups', { data: { name: 'Club des membres' } })).json()) as { id: string };
    const { token } = (await (await leaderApi.get(`/api/v1/groups/${group.id}/invite-link`)).json()) as { token: string };
    for (const member of [bob, carol]) {
      const api = await apiSession(playwright, member.email);
      expect((await api.post(`/api/v1/invites/${token}/join`)).status()).toBe(201);
    }
    return { leader, bob, carol, groupId: group.id, token };
  }

  test('members see pseudos only; the leader also sees contacts', async ({ page, browser, playwright, request }) => {
    const { leader, bob, carol, groupId } = await groupWithMembers(playwright, request);

    await loginAs(page, bob.email);
    await page.goto(`/groups/${groupId}`);
    await page.getByRole('link', { name: 'Membres (3)' }).click();
    await expect(page.getByText(carol.pseudo)).toBeVisible();
    await expect(page.getByText(carol.email)).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Actions pour ${carol.pseudo}` })).toHaveCount(0);

    const leaderPage = await browser.newPage({ locale: 'fr-FR' });
    await loginAs(leaderPage, leader.email);
    await leaderPage.goto(`/groups/${groupId}/members`);
    await expect(leaderPage.getByText(carol.email, { exact: false })).toBeVisible();
    await leaderPage.close();
  });

  test('the leader promotes a member, then bans another who then cannot come back', async ({ page, browser, playwright, request }) => {
    const { leader, bob, carol, groupId, token } = await groupWithMembers(playwright, request);
    await loginAs(page, leader.email);
    await page.goto(`/groups/${groupId}/members`);

    await page.getByRole('button', { name: `Actions pour ${bob.pseudo}` }).click();
    await page.getByRole('menuitem', { name: 'Nommer modérateur' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: bob.pseudo }).getByText('Modérateur')).toBeVisible();

    await page.getByRole('button', { name: `Actions pour ${carol.pseudo}` }).click();
    await page.getByRole('menuitem', { name: 'Bannir du groupe' }).click();
    await page.getByRole('button', { name: 'Bannir', exact: true }).click();
    await expect(page.getByText(carol.pseudo)).toHaveCount(0);

    const carolPage = await browser.newPage({ locale: 'fr-FR' });
    await loginAs(carolPage, carol.email);
    await carolPage.goto(`/join/${token}`);
    await expect(carolPage.getByText('Vous ne pouvez pas rejoindre ce groupe.')).toBeVisible();
    await carolPage.close();
  });

  test('the leader hands over leadership and stays as a moderator', async ({ page, playwright, request }) => {
    const { leader, bob, groupId } = await groupWithMembers(playwright, request);
    await loginAs(page, leader.email);
    await page.goto(`/groups/${groupId}/members`);

    await page.getByRole('button', { name: `Actions pour ${bob.pseudo}` }).click();
    await page.getByRole('menuitem', { name: 'Transmettre la responsabilité' }).click();
    await page.getByRole('button', { name: 'Transmettre', exact: true }).click();

    await expect(page).toHaveURL(`/groups/${groupId}`);
    await expect(page.getByText(/^Modérateur ·/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Paramètres' })).toHaveCount(0);
  });

  test('a member leaves the group', async ({ page, playwright, request }) => {
    const { bob, groupId } = await groupWithMembers(playwright, request);
    await loginAs(page, bob.email);
    await page.goto(`/groups/${groupId}`);

    await page.getByRole('button', { name: 'Quitter le groupe' }).click();
    await page.getByRole('button', { name: 'Quitter', exact: true }).click();

    await expect(page).toHaveURL('/groups');
    await expect(page.getByText("Vous n'êtes encore dans aucun groupe.")).toBeVisible();
  });
});
