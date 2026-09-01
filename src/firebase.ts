import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, browserPopupRedirectResolver,
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || "AIzaSyDxfd9hJ0NYN9KNP6UdCTU5VWHGLum-VFE",
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || "allowance-001.firebaseapp.com",
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || "allowance-001",
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || "allowance-001.firebasestorage.app",
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || "463313212619",
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || "1:463313212619:web:29b6ae18f4648e6ae1774e",
  measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID || "G-1K8Q2V9G2Y"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

/** Popup failures that mean "use a redirect instead", not "you did it wrong". */
const POPUP_UNAVAILABLE = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
]);

let loginPromise: Promise<any> | null = null;

/**
 * Sign in with Google.
 *
 * THE POPUP IS STILL THE PRIMARY PATH, on every device, because it works and
 * it keeps the page state. The redirect is a FALLBACK for the cases where the
 * browser refuses to open a popup at all -- which mobile Safari does under
 * memory pressure, and which surfaces as `auth/popup-closed-by-user`, reading
 * as though the person cancelled when they never got the chance.
 *
 * A redirect does not resolve here. The page navigates away to Google and
 * comes back as a fresh load, where completeRedirectLogin() and
 * onAuthStateChanged pick it up. That is why this returns null on that path
 * rather than a user, and why the caller must not treat null as failure.
 */
export async function loginWithGoogle() {
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    try {
      try {
        const result = await signInWithPopup(
          auth, googleProvider, browserPopupRedirectResolver);
        return result.user;
      } catch (e: any) {
        if (POPUP_UNAVAILABLE.has(e?.code)) {
          // The popup did not happen. Take the whole page to Google instead.
          await signInWithRedirect(auth, googleProvider);
          return null;
        }
        throw e;
      }
    } finally {
      loginPromise = null;
    }
  })();

  return loginPromise;
}

/**
 * Finish a redirect sign-in, if that is how we got here.
 *
 * Returns the user on the load that follows a redirect, and null on an
 * ordinary load. It has to be called on startup: without it a redirect
 * sign-in can be left half-finished, and any error Google returned is
 * swallowed instead of shown.
 */
export async function completeRedirectLogin() {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (e: any) {
    // Worth surfacing rather than hiding. `auth/unauthorized-domain` in
    // particular means this exact hostname is not on the Firebase
    // authorised-domains list, which is a console setting and not a bug in
    // the code — and every Vercel preview URL is a new hostname.
    console.error('[auth] redirect sign-in failed:', e?.code, e?.message);
    throw e;
  }
}

export async function logoutFirebase() {
  await signOut(auth);
}
