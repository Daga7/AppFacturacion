const BASE_URL = "";

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("accessToken");

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(`${BASE_URL}${url}`, { ...options, headers });

  if (res.status === 401) {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken && !url.includes("/auth/refresh")) {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);

        (headers as Record<string, string>)["Authorization"] =
          `Bearer ${data.accessToken}`;
        res = await fetch(`${BASE_URL}${url}`, { ...options, headers });
      }
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || "Error de conexión");
  }

  return res.json();
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "POST", body: JSON.stringify(data) }),
};
