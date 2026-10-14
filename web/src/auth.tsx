import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, setCsrfToken } from "./lib/api";

interface Session {
  email: string;
  csrfToken: string;
}

interface AuthState {
  status: "loading" | "authenticated" | "anonymous";
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [email, setEmail] = useState<string | null>(null);

  const apply = useCallback((s: Session | null) => {
    setCsrfToken(s?.csrfToken ?? null);
    setEmail(s?.email ?? null);
    setStatus(s ? "authenticated" : "anonymous");
  }, []);

  useEffect(() => {
    api<Session>("/auth/session")
      .then(apply)
      .catch(() => apply(null));
    const onExpired = () => apply(null);
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [apply]);

  const login = useCallback(
    async (e: string, password: string) => {
      apply(await api<Session>("/auth/login", { method: "POST", body: { email: e, password } }));
    },
    [apply],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
    }
    apply(null);
  }, [apply]);

  return <Ctx.Provider value={{ status, email, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
