import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { apiSession, createUser, PASSWORD, setStorageQuota } from './helpers';

// Playwright runs from apps/web. Playwright's Chromium has no H.264, so the video is WebM.
const fixture = (name: string) => path.resolve('e2e/fixtures', name);

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/groups');
}

type Api = Awaited<ReturnType<typeof apiSession>>;

/** A group with a published course holding one published lesson, built through the API. */
async function publishedLesson(leaderApi: Api) {
  const json = async (res: Promise<{ json: () => Promise<unknown> }>) => (await (await res).json()) as { id: string; token: string };
  const group = await json(leaderApi.post('/api/v1/groups', { data: { name: 'Club Python' } }));
  const g = `/api/v1/groups/${group.id}`;
  const course = await json(leaderApi.post(`${g}/courses`, { data: { title: 'Python pour débutants' } }));
  const courseModule = await json(leaderApi.post(`${g}/courses/${course.id}/modules`, { data: { title: 'Semaine 1' } }));
  const lesson = await json(leaderApi.post(`${g}/modules/${courseModule.id}/lessons`, { data: { title: 'Les variables' } }));
  await leaderApi.patch(`${g}/courses/${course.id}`, { data: { published: true } });
  await leaderApi.patch(`${g}/lessons/${lesson.id}`, { data: { published: true } });
  const { token } = await json(leaderApi.get(`${g}/invite-link`));
  return { groupId: group.id, lessonId: lesson.id, token };
}

test.describe('lesson files and views', () => {
  test.use({ locale: 'fr-FR' });

  test('a leader adds a PDF, audio, and video; a member on slow 3G streams the video; the leader sees who opened it', async ({
    page,
    browser,
    playwright,
    request,
  }) => {
    test.slow();
    const [leader, member] = [await createUser(request), await createUser(request)];
    const leaderApi = await apiSession(playwright, leader.email);
    const { groupId, lessonId, token } = await publishedLesson(leaderApi);
    await (await apiSession(playwright, member.email)).post(`/api/v1/invites/${token}/join`);

    // The leader adds three files to the lesson.
    await loginAs(page, leader.email);
    await page.goto(`/groups/${groupId}/lessons/${lessonId}/edit`);
    const files = page.getByRole('region', { name: 'Fichiers' });
    const input = page.locator('input[type="file"][accept^="application/pdf"]');
    for (const [name, count] of [['lesson-notes.pdf', 1], ['lesson-audio.mp3', 2], ['lesson-video.webm', 3]] as const) {
      await expect(files.getByRole('button', { name: 'Ajouter un fichier' })).toBeEnabled();
      await input.setInputFiles(fixture(name));
      await expect(files.getByRole('listitem')).toHaveCount(count);
    }
    await expect(files.getByRole('listitem').nth(2)).toContainText('lesson-video.webm');

    // A member opens the lesson; the page records the visit (CNT-03).
    const memberPage = await browser.newPage({ ...playwright.devices['Pixel 7'], locale: 'fr-FR' });
    await loginAs(memberPage, member.email);
    const fileResponses: { url: string; status: number }[] = [];
    memberPage.on('response', (res) => {
      if (res.url().includes('/api/v1/files/')) fileResponses.push({ url: res.url(), status: res.status() });
    });
    const viewRecorded = memberPage.waitForResponse((res) => res.url().endsWith(`/lessons/${lessonId}/view`) && res.status() === 204);
    await memberPage.goto(`/groups/${groupId}/lessons/${lessonId}`);
    await expect(memberPage.getByRole('heading', { name: 'Les variables' })).toBeVisible();
    await viewRecorded;

    // From here the connection is Chrome DevTools' "Slow 3G". It starts after the page loads because
    // `next dev` serves megabytes of unminified JavaScript; the page budget on 3G is checked in step 1.8.
    const cdp = await memberPage.context().newCDPSession(memberPage);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: (500 * 1024) / 8,
      uploadThroughput: (500 * 1024) / 8,
    });
    await expect(memberPage.getByRole('link', { name: 'Ouvrir' })).toHaveAttribute('href', /\/api\/v1\/files\//);
    await expect(memberPage.getByRole('link', { name: /Télécharger/ })).toHaveCount(3);
    await expect(memberPage.locator('audio')).toHaveAttribute('preload', 'none');

    // Nothing plays or downloads before the member asks (CNT-04).
    const video = memberPage.locator('video');
    await expect(video).toHaveAttribute('preload', 'none');
    await expect(video).not.toHaveAttribute('autoplay');
    const videoUrl = await video.evaluate((v: HTMLVideoElement) => v.currentSrc || v.src);
    expect(fileResponses.filter((r) => videoUrl.endsWith(new URL(r.url).pathname))).toHaveLength(0);

    // It streams: playback starts and moves on, fetched with range requests (CNT-02).
    await video.evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      return v.play();
    });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(1);
    expect(fileResponses.some((r) => videoUrl.endsWith(new URL(r.url).pathname) && r.status === 206)).toBe(true);

    // The PDF is served to the member as a PDF.
    const pdfHref = await memberPage.getByRole('link', { name: 'Ouvrir' }).getAttribute('href');
    const pdf = await memberPage.request.get(pdfHref!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    await memberPage.close();

    // The leader sees that the member opened the lesson (CNT-03).
    await page.goto(`/groups/${groupId}/lessons/${lessonId}`);
    await page.getByText('1 membre sur 1 a ouvert cette leçon').click();
    const row = page.getByRole('listitem').filter({ hasText: member.pseudo });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText('Pas encore');
  });

  test('an upload over the group’s storage is refused with a clear message', async ({ page, playwright, request }) => {
    const leader = await createUser(request);
    const { groupId, lessonId } = await publishedLesson(await apiSession(playwright, leader.email));
    setStorageQuota(groupId, 50_000);

    await loginAs(page, leader.email);
    await page.goto(`/groups/${groupId}/lessons/${lessonId}/edit`);
    const files = page.getByRole('region', { name: 'Fichiers' });
    await expect(files.getByRole('button', { name: 'Ajouter un fichier' })).toBeEnabled();
    // 128 kB of video into a 50 kB quota
    await page.locator('input[type="file"][accept^="application/pdf"]').setInputFiles(fixture('lesson-video.webm'));
    await expect(files.getByRole('alert')).toContainText("Le groupe n'a plus d'espace de stockage");
    await expect(files.getByRole('listitem')).toHaveCount(0);
  });
});
