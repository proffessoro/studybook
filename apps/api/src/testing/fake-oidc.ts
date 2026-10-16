import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export type FakeGoogleUser = { sub: string; email: string; email_verified: boolean; name: string };

type IssuedCode = { user: FakeGoogleUser; nonce: string; challenge: string; redirectUri: string };

/**
 * A tiny OpenID Connect provider standing in for Google in tests: discovery,
 * signing keys, and a token endpoint that checks PKCE and returns a signed ID token.
 * The "consent screen" is `approve()`, which turns an authorization URL into a code.
 */
export async function startFakeGoogle(clientId: string) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const codes = new Map<string, IssuedCode>();
  let issuer = '';

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', issuer);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    };

    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      });
    }
    if (url.pathname === '/jwks') return json(200, { keys: [jwk] });

    if (url.pathname === '/token' && req.method === 'POST') {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        void (async () => {
          const form = new URLSearchParams(raw);
          const issued = codes.get(form.get('code') ?? '');
          codes.delete(form.get('code') ?? '');
          const verifier = form.get('code_verifier') ?? '';
          const challenge = createHash('sha256').update(verifier).digest('base64url');
          if (!issued || issued.challenge !== challenge || issued.redirectUri !== form.get('redirect_uri')) {
            return json(400, { error: 'invalid_grant' });
          }
          const idToken = await new SignJWT({ ...issued.user, nonce: issued.nonce })
            .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
            .setIssuer(issuer)
            .setAudience(clientId)
            .setSubject(issued.user.sub)
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(privateKey);
          json(200, { access_token: 'fake-access-token', token_type: 'Bearer', expires_in: 300, id_token: idToken });
        })();
      });
      return;
    }
    json(404, { error: 'not_found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    issuer,
    /** The user approves on the "Google" side: returns the URL Google would send the browser back to. */
    approve(authorizationUrl: string, user: FakeGoogleUser): string {
      const params = new URL(authorizationUrl).searchParams;
      const code = randomBytes(16).toString('hex');
      codes.set(code, {
        user,
        nonce: params.get('nonce') ?? '',
        challenge: params.get('code_challenge') ?? '',
        redirectUri: params.get('redirect_uri') ?? '',
      });
      const back = new URL(params.get('redirect_uri') ?? '');
      back.search = new URLSearchParams({ code, state: params.get('state') ?? '' }).toString();
      return back.pathname + back.search;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
