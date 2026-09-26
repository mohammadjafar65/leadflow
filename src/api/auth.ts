import { apiClient, setAccessToken } from "@/lib/api-client";
import type { Role } from "@/types/user";

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  orgName: string;
}

export interface Session {
  accessToken: string;
  user: AuthUser;
}

export const authApi = {
  register: async (orgName: string, email: string, password: string): Promise<AuthUser> => {
    const session = await apiClient.post<Session>("/auth/register", { orgName, email, password });
    setAccessToken(session.accessToken);
    return session.user;
  },

  login: async (email: string, password: string): Promise<AuthUser> => {
    const session = await apiClient.post<Session>("/auth/login", { email, password });
    setAccessToken(session.accessToken);
    return session.user;
  },

  logout: async () => { try { await apiClient.post<void>("/auth/logout"); } finally { setAccessToken(null); } },

  me: () => apiClient.get<{ user: AuthUser }>("/auth/me"),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<{ success: boolean }>("/auth/change-password", { currentPassword, newPassword }),

  /** Explicit refresh (used on app boot when no access token is cached). */
  refresh: async (): Promise<AuthUser | null> => {
    try {
      const session = await apiClient.post<Session>("/auth/refresh", undefined);
      setAccessToken(session.accessToken);
      return session.user;
    } catch {
      setAccessToken(null);
      return null;
    }
  },
};