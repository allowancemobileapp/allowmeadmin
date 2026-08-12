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
      const contentType = res.headers.get("content-type");
      let errorMessage = "API Error";
      if (contentType && contentType.includes("application/json")) {
        const err = await res.json();
        errorMessage = err.error || "API Error";
      } else {
        let rawText = await res.text();
        if (rawText.includes('413') || rawText.includes('Too Large')) {
          errorMessage = "Payload too large. Please reduce the size of your request (Max 50MB).";
        } else if (rawText.includes('<html')) {
          errorMessage = "Server returned an unexpected error. Please try again.";
        } else {
          errorMessage = rawText;
        }
      }
      throw new Error(errorMessage);
    }
    return res.json();
  };

  const post = async <T>(url: string, body: any): Promise<T> => {
    const res = await fetch(url, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      const contentType = res.headers.get("content-type");
      let errorMessage = "API Error";
      if (contentType && contentType.includes("application/json")) {
        const err = await res.json();
        errorMessage = err.error || "API Error";
      } else {
        let rawText = await res.text();
        if (rawText.includes('413') || rawText.includes('Too Large')) {
          errorMessage = "Payload too large. Please reduce the size of your request (Max 50MB).";
        } else if (rawText.includes('<html')) {
          errorMessage = "Server returned an unexpected error. Please try again.";
        } else {
          errorMessage = rawText;
        }
      }
      throw new Error(errorMessage);
    }
    return res.json();
  };

  const put = async <T>(url: string, body: any): Promise<T> => {
    const res = await fetch(url, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      const contentType = res.headers.get("content-type");
      let errorMessage = "API Error";
      if (contentType && contentType.includes("application/json")) {
        const err = await res.json();
        errorMessage = err.error || "API Error";
      } else {
        let rawText = await res.text();
        if (rawText.includes('413') || rawText.includes('Too Large')) {
          errorMessage = "Payload too large. Please reduce the size of your request (Max 50MB).";
        } else if (rawText.includes('<html')) {
          errorMessage = "Server returned an unexpected error. Please try again.";
        } else {
          errorMessage = rawText;
        }
      }
      throw new Error(errorMessage);
    }
    return res.json();
  };

  const del = async <T>(url: string): Promise<T> => {
    const res = await fetch(url, { method: 'DELETE', headers: getHeaders() });
    if (!res.ok) {
      const contentType = res.headers.get("content-type");
      let errorMessage = "API Error";
      if (contentType && contentType.includes("application/json")) {
        const err = await res.json();
        errorMessage = err.error || "API Error";
      } else {
        let rawText = await res.text();
        if (rawText.includes('413') || rawText.includes('Too Large')) {
          errorMessage = "Payload too large. Please reduce the size of your request (Max 50MB).";
        } else if (rawText.includes('<html')) {
          errorMessage = "Server returned an unexpected error. Please try again.";
        } else {
          errorMessage = rawText;
        }
      }
      throw new Error(errorMessage);
    }
    return res.json();
  };

  return { get, post, put, del };
};
