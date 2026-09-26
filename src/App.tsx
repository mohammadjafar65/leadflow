import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ThemeProvider } from "next-themes";
import { authApi, type AuthUser } from "@/api/auth";
import { ApiError, getAccessToken } from "@/lib/api-client";
import { LoginPage } from "@/components/auth/login-page";
import { SignupPage } from "@/components/auth/signup-page";
import { AppShell } from "@/components/layout/app-shell";
interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (orgName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (getAccessToken()) {
          try {
            const { user: me } = await authApi.me();
            if (!cancelled) {
              setUser(me);
              return;
            }
          } catch {
            // Access token might be expired — proceed to refresh cookie below
          }
        }
        const refreshed = await authApi.refresh();
        if (!cancelled) setUser(refreshed);
      } catch {
        /* not authenticated */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await authApi.login(email, password);
    setUser(u);
    navigate("/overview");
  }, [navigate]);

  const signup = useCallback(async (orgName: string, email: string, password: string) => {
    const u = await authApi.register(orgName, email, password);
    setUser(u);
    navigate("/overview");
  }, [navigate]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (e) {
      if (e instanceof ApiError && e.status !== 401) toast.error("Logout failed");
    }
    setUser(null);
    navigate("/login");
  }, [navigate]);

  const value = useMemo(() => ({ user, loading, login, signup, logout }), [user, loading, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading LeadFlow…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}