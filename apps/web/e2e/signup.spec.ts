import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Needs the API, the email worker (or WORKER_IN_PROCESS=true), and Mailpit
 * from deploy/docker-compose.dev.yml, which catches the verification email.
 */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

function uniqueUser() {
  const n = `${Date.now()}`.slice(-8);
  return {
    email: `e2e-${n}@e2e.test`,
    pseudo: `e2e${n}`,
    // A valid Cameroon mobile number that differs on every run
    phone: `6${n.padStart(8, '0')}`,
  };
}

async function emailedCode(request: APIRequestContext, email: string): Promise<string> {
  let code = '';
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
        const { messages } = (await res.json()) as { messages: { Subject: string }[] };
        code = messages[0]?.Subject.match(/\d{6}/)?.[0] ?? '';
        return code;
      },
      { timeout: 15_000 },
    )
    .toMatch(/^\d{6}$/);
  return code;
}

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
  });

  test('the link in the email verifies on its own', async ({ page, request }) => {
    const user = uniqueUser();
    const res = await request.post('/api/v1/auth/signup', {
      data: { fullName: 'Test E2E', ...user, password: 'correct horse', locale: 'fr', acceptPrivacy: true },
    });
    expect(res.status()).toBe(201);
    const code = await emailedCode(request, user.email);

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
