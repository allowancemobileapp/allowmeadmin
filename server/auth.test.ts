import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { verifyIdToken, bearerToken, __resetCertCacheForTests } from './auth';

/**
 * The token verifier, attacked on purpose.
 *
 * Each of these is a real way people get JWT verification wrong, and each one
 * fully defeats the login if it is missing. They are tested against a locally
 * generated key pair with Google's cert endpoint stubbed, so the assertions
 * are about OUR checks rather than about Google being up.
 */

const PROJECT_ID = 'allowance-001';
const KID = 'test-key-1';

let privateKey: crypto.KeyObject;
let certPem: string;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Build and sign a token, with any claim or header overridden. */
function makeToken(claims: Record<string, any> = {}, header: Record<string, any> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: 'uid-123',
    iat: now - 10,
    exp: now + 3600,
    auth_time: now - 10,
    email: 'someone@example.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    ...claims,
  };
  const head = { alg: 'RS256', kid: KID, typ: 'JWT', ...header };

  const signingInput = `${b64url(JSON.stringify(head))}.${b64url(JSON.stringify(payload))}`;

  if (head.alg === 'none') return `${signingInput}.`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${b64url(signer.sign(privateKey))}`;
}

beforeAll(() => {
  const { publicKey, privateKey: priv } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  privateKey = priv;

  // Google serves X.509 CERTIFICATE PEMs; this is an SPKI public-key PEM.
  // crypto.createPublicKey reads both, so the verifier does not care, and
  // these tests are about our checks rather than about PEM parsing. That the
  // real endpoint works was confirmed separately against Google's live certs
  // (4 keys, RSA-2048, createPublicKey accepts them unmodified).
  certPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubCerts(certs: Record<string, string> = { [KID]: certPem }) {
  // Without this the keys fetched by the first test answer every later one,
  // and the unknown-kid case silently passes against a stale cache.
  __resetCertCacheForTests();
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => certs,
    headers: { get: (h: string) => (h === 'cache-control' ? 'max-age=3600' : null) },
  })));
}

describe('verifyIdToken', () => {
  it('accepts a properly signed, current token', async () => {
    stubCerts();
    const user = await verifyIdToken(makeToken());
    expect(user.email).toBe('someone@example.com');
    expect(user.uid).toBe('uid-123');
  });

  it('lowercases the email so the allowlist cannot be case-dodged', async () => {
    stubCerts();
    const user = await verifyIdToken(makeToken({ email: 'Someone@Example.COM' }));
    expect(user.email).toBe('someone@example.com');
  });

  it('rejects a token whose payload was edited after signing', async () => {
    stubCerts();
    const token = makeToken({ email: 'nobody@example.com' });
    const [h, , sig] = token.split('.');
    // Swap in a payload claiming to be the founder, keep the old signature.
    const forged = b64url(JSON.stringify({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID, sub: 'uid-123',
      iat: Math.floor(Date.now() / 1000) - 10,
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'allowancemobileapp@gmail.com', email_verified: true,
    }));
    await expect(verifyIdToken(`${h}.${forged}.${sig}`))
      .rejects.toThrow(/signature is not valid/i);
  });

  it("rejects alg: none, the oldest trick there is", async () => {
    stubCerts();
    await expect(verifyIdToken(makeToken({}, { alg: 'none' })))
      .rejects.toThrow(/algorithm/i);
  });

  it('rejects a token signed by the wrong key', async () => {
    stubCerts();
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const saved = privateKey;
    privateKey = other.privateKey;
    const token = makeToken();
    privateKey = saved;
    await expect(verifyIdToken(token)).rejects.toThrow(/signature is not valid/i);
  });

  it('rejects an expired token', async () => {
    stubCerts();
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyIdToken(makeToken({ exp: now - 3600, iat: now - 7200 })))
      .rejects.toThrow(/expired/i);
  });

  it('rejects a token minted for a different Firebase project', async () => {
    stubCerts();
    // Signed correctly, valid, current -- and belongs to somebody else's app.
    await expect(verifyIdToken(makeToken({ aud: 'some-other-project' })))
      .rejects.toThrow(/different application/i);
  });

  it('rejects a token from an unexpected issuer', async () => {
    stubCerts();
    await expect(verifyIdToken(makeToken({ iss: 'https://evil.example.com' })))
      .rejects.toThrow(/issuer/i);
  });

  it('rejects an unverified email from a non-Google provider', async () => {
    stubCerts();
    await expect(verifyIdToken(makeToken({
      email_verified: false,
      firebase: { sign_in_provider: 'password' },
    }))).rejects.toThrow(/not been verified/i);
  });

  it('rejects a token with no email at all', async () => {
    stubCerts();
    await expect(verifyIdToken(makeToken({ email: undefined })))
      .rejects.toThrow(/no email/i);
  });

  it('rejects a token signed with an unknown key id', async () => {
    stubCerts({ 'some-other-kid': certPem });
    await expect(verifyIdToken(makeToken())).rejects.toThrow(/unknown key/i);
  });

  it('rejects malformed input rather than throwing something odd', async () => {
    stubCerts();
    for (const bad of ['', 'nonsense', 'a.b', 'a.b.c.d']) {
      await expect(verifyIdToken(bad)).rejects.toThrow();
    }
  });
});

describe('bearerToken', () => {
  it('reads a bearer token', () => {
    expect(bearerToken({ headers: { authorization: 'Bearer abc.def.ghi' } }))
      .toBe('abc.def.ghi');
  });

  it('is case insensitive on the scheme', () => {
    expect(bearerToken({ headers: { authorization: 'bearer xyz' } })).toBe('xyz');
  });

  it('returns null when there is nothing to read', () => {
    expect(bearerToken({ headers: {} })).toBeNull();
    expect(bearerToken({ headers: { authorization: 'Basic abc' } })).toBeNull();
    expect(bearerToken({})).toBeNull();
  });
});
