import crypto from "crypto";

/**
 * Real authentication for the admin API.
 *
 * WHAT WAS THERE BEFORE. Every request carried `x-admin-email: someone@…`
 * and the server believed it. There was no token, no signature and nothing to
 * forge — one curl with the founder's address in a header read every salary,
 * the cap table and the share register, and could write to all of them. The
 * login screen was a formality: it decided what the browser drew, not what
 * the server would answer.
 *
 * WHAT REPLACES IT. A Firebase ID token, signed by Google, verified here on
 * every request. The email is read out of the VERIFIED token and the header
 * is ignored entirely, so the caller no longer gets a say in who they are.
 *
 * WHY NOT firebase-admin, WHICH IS ALREADY A DEPENDENCY. Its verifyIdToken
 * wants a service account, which is another secret to hold, rotate and leak.
 * Verifying an ID token needs only Google's PUBLIC keys — that is the whole
 * point of an asymmetric signature — so this does it directly and the
 * deployment needs no new credential at all.
 *
 * WHAT THIS DOES NOT DO. It proves who is calling. Whether they are allowed
 * is admin_users plus the finance screen guard, which run after this.
 */

const CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// The Firebase project these tokens must have been minted for. A token from
// any other project is signed by the same Google key and would verify
// perfectly — the `aud` check below is the only thing that makes it ours.
const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'allowance-001';

// A minute either way, because a laptop clock is not a source of truth and
// rejecting a valid login over two seconds of drift is its own outage.
const CLOCK_SKEW_SECONDS = 60;

type Certs = Record<string, string>;
let certCache: { certs: Certs; expiresAt: number } | null = null;

async function googlePublicKeys(): Promise<Certs> {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.certs;

  const res = await fetch(CERT_URL);
  if (!res.ok) {
    throw new Error(`Could not fetch Google's signing keys (${res.status}).`);
  }
  const certs = (await res.json()) as Certs;

  // Google says how long the keys are good for. Honour it rather than
  // guessing: too long and a rotated key breaks every login, too short and
  // this fetches on every request.
  const cc = res.headers.get('cache-control') || '';
  const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] || 3600);
  certCache = { certs, expiresAt: Date.now() + maxAge * 1000 };

  return certs;
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeSegment(s: string): any {
  return JSON.parse(b64urlToBuffer(s).toString('utf8'));
}

export type VerifiedUser = {
  uid: string;
  email: string;
  emailVerified: boolean;
  signInProvider: string;
};

/**
 * Verify a Firebase ID token and return who it belongs to.
 *
 * Throws with a readable message on anything wrong. Every check here matters;
 * dropping any one of them makes the rest decorative:
 *
 *   signature  — otherwise the token is just a claim the caller typed
 *   aud/iss    — otherwise a token from ANY Firebase project is accepted
 *   exp        — otherwise a token stolen once works forever
 *   alg        — otherwise `alg: none` walks straight through
 */
export async function verifyIdToken(token: string): Promise<VerifiedUser> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token.');

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: any;
  let payload: any;
  try {
    header = decodeSegment(headerB64);
    payload = decodeSegment(payloadB64);
  } catch {
    throw new Error('Token could not be read.');
  }

  // `alg: none` is the oldest JWT attack there is: strip the signature, set
  // the algorithm to none, and a naive verifier accepts anything. Pinning
  // RS256 is what closes it.
  if (header.alg !== 'RS256') {
    throw new Error(`Unexpected token algorithm: ${header.alg}.`);
  }
  if (!header.kid) throw new Error('Token has no key id.');

  let certs = await googlePublicKeys();
  if (!certs[header.kid]) {
    // Google rotates its signing keys. A kid we have not seen is far more
    // likely a stale cache than an attack, so drop the cache and try once
    // more -- but use the FRESH set from here on. Merging the new key into
    // the old object would leave the verification reading from a cache that
    // has already expired in every other respect.
    certCache = null;
    certs = await googlePublicKeys();
    if (!certs[header.kid]) {
      throw new Error('Token was signed with an unknown key.');
    }
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const publicKey = crypto.createPublicKey(certs[header.kid]);
  if (!verifier.verify(publicKey, b64urlToBuffer(signatureB64))) {
    throw new Error('Token signature is not valid.');
  }

  const now = Math.floor(Date.now() / 1000);

  if (payload.aud !== PROJECT_ID) {
    throw new Error('Token was issued for a different application.');
  }
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) {
    throw new Error('Token came from an unexpected issuer.');
  }
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error('Session has expired. Sign in again.');
  }
  if (typeof payload.iat !== 'number' || payload.iat - CLOCK_SKEW_SECONDS > now) {
    throw new Error('Token is dated in the future.');
  }
  if (typeof payload.auth_time === 'number'
      && payload.auth_time - CLOCK_SKEW_SECONDS > now) {
    throw new Error('Token reports a sign-in that has not happened yet.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Token has no subject.');
  }
  if (!payload.email || typeof payload.email !== 'string') {
    throw new Error('Token carries no email address.');
  }

  const provider = payload.firebase?.sign_in_provider || 'unknown';

  // An unverified address is a claim, not an identity: sign-up flows that do
  // not send a confirmation let somebody assert any address they like. Google
  // sign-in always verifies, so this only ever bites a provider that should
  // not be reaching an admin console anyway.
  if (payload.email_verified !== true && provider !== 'google.com') {
    throw new Error(
      'That email address has not been verified with its provider.');
  }

  return {
    uid: payload.sub,
    email: String(payload.email).toLowerCase(),
    emailVerified: payload.email_verified === true,
    signInProvider: provider,
  };
}

/** Pull the bearer token out of the Authorization header. */
export function bearerToken(req: any): string | null {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  if (!raw || typeof raw !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : null;
}

/** Testing only: drop the cached Google keys so a test can control them. */
export function __resetCertCacheForTests() {
  certCache = null;
}
