import { create } from "zustand";
import { api } from "../lib/api";

interface User {
  id: string;
  username: string;
  role: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const data = await api.post<LoginResponse>("/auth/login", {
        username,
        password,
      });
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      set({ user: data.user, accessToken: data.accessToken, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Error al iniciar sesión",
        loading: false,
      });
    }
  },

  logout: () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    set({ user: null, accessToken: null, error: null });
  },

  init: () => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      set({ accessToken: token });
      api
        .get<User>("/auth/me")
        .then((user) => set({ user }))
        .catch(() => {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          set({ accessToken: null });
        });
    }
  },
}));
