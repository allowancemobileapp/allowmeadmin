import { auth } from '../firebase';

/**
 * Every call to the admin API, carrying proof of who is making it.
 *
 * WHAT THIS USED TO SEND. `x-admin-email: whoever@…`, read out of
 * localStorage, which the server believed. There was nothing to forge — the
 * whole authentication story was a string the browser chose. It now sends the
 * Firebase ID token and the server reads the address out of the signature.
 *
 * The token is fetched per request rather than cached here. Firebase keeps
 * its own cache and only does real work when the hour-long token is close to
 * expiring, so this is a cheap call that quietly handles refresh — which a
 * cache of our own would get wrong.
 */
async function authHeaders(json = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';

  const user = auth.currentUser;
  if (user) {
    try {
      headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    } catch {
      // Left unset deliberately. A request with no token gets a clean 401
      // that the caller surfaces, which is better than inventing a header
      // and getting a confusing failure further in.
    }
  }
  return headers;
}

/** Multipart: no Content-Type, or the boundary marker is lost. */
export async function authHeadersForUpload(): Promise<Record<string, string>> {
  return authHeaders(false);
}

async function readError(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const err = await res.json().catch(() => ({}));
    // A 401 means the session is gone rather than the request being wrong,
    // and "API Error" sends people hunting for a bug that is not there.
    if (res.status === 401) {
      return err.error || 'Your session has expired. Sign in again.';
    }
    return err.error || 'API Error';
  }

  const rawText = await res.text();
  if (rawText.includes('413') || rawText.includes('Too Large')) {
    return 'Payload too large. Please reduce the size of your request (Max 50MB).';
  }
  if (rawText.includes('<html')) {
    return 'Server returned an unexpected error. Please try again.';
  }
  return rawText;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: await authHeaders() });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export const useApi = () => {
  const get = <T,>(url: string): Promise<T> =>
    request<T>(url, { method: 'GET' });

  const post = <T,>(url: string, body: any): Promise<T> =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body) });

  const put = <T,>(url: string, body: any): Promise<T> =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(body) });

  const del = <T,>(url: string): Promise<T> =>
    request<T>(url, { method: 'DELETE' });

  return { get, post, put, del };
};
