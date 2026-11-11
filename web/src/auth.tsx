import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, setCsrfToken } from "./lib/api";
import type { Billing, Role } from "./lib/types";

interface Session {
  email: string;
  role: Role;
  name: string | null;
  csrfToken: string;
  selfSignup: boolean;
  billing: Billing;
}

interface AuthState {
  status: "loading" | "authenticated" | "anonymous";
  email: string | null;
  role: Role | null;
  name: string | null;
  selfSignup: boolean;
  billing: Billing | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Recarrega a sessão (ex.: depois de um pagamento confirmado). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [session, setSession] = useState<Session | null>(null);

  const apply = useCallback((s: Session | null) => {
    setCsrfToken(s?.csrfToken ?? null);
    setSession(s);
    setStatus(s ? "authenticated" : "anonymous");
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api<Session>("/auth/session"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) apply(null);
      else if (!(err instanceof ApiError)) apply(null);
      else throw err;
    }
  }, [apply]);

  useEffect(() => {
    api<Session>("/auth/session")
      .then(apply)
      .catch(() => apply(null));
    const onExpired = () => apply(null);
    // A API respondeu "plano vencido": atualiza a sessão para o app levar à página do plano.
    const onPayment = () => void refresh().catch(() => undefined);
    window.addEventListener("auth:expired", onExpired);
    window.addEventListener("billing:required", onPayment);
    return () => {
      window.removeEventListener("auth:expired", onExpired);
      window.removeEventListener("billing:required", onPayment);
    };
  }, [apply, refresh]);

  const login = useCallback(
    async (e: string, password: string) => {
      apply(await api<Session>("/auth/login", { method: "POST", body: { email: e, password } }));
    },
    [apply],
  );

  const signup = useCallback(
    async (data: { name: string; email: string; password: string }) => {
      apply(await api<Session>("/auth/signup", { method: "POST", body: data }));
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

  return (
    <Ctx.Provider
      value={{
        status,
        email: session?.email ?? null,
        role: session?.role ?? null,
        name: session?.name ?? null,
        selfSignup: session?.selfSignup ?? false,
        billing: session?.billing ?? null,
        login,
        signup,
        logout,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
