export const useApi = () => {
  const getHeaders = () => {
    const email = localStorage.getItem('admin_email');
    return {
      'Content-Type': 'application/json',
      'x-admin-email': email || '',
    };
  };

  const get = async <T>(url: string): Promise<T> => {
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'API Error');
    }
    return res.json();
  };

  const post = async <T>(url: string, body: any): Promise<T> => {
    const res = await fetch(url, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'API Error');
    }
    return res.json();
  };

  const put = async <T>(url: string, body: any): Promise<T> => {
    const res = await fetch(url, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'API Error');
    }
    return res.json();
  };

  const del = async <T>(url: string): Promise<T> => {
    const res = await fetch(url, { method: 'DELETE', headers: getHeaders() });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'API Error');
    }
    return res.json();
  };

  return { get, post, put, del };
};
