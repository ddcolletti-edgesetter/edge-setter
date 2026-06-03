import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const LS_KEY = "es_user_email";

export interface AuthUser {
  email?: string | null;
  plan?: string | null;
  access_status?: string | null;
  billing_status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  beta_until?: string | null;
  is_pro?: boolean;
}

interface AuthState {
  email: string | null;
  user?: AuthUser | null;
  isPro: boolean;
  authLoading: boolean;
  /** Returns null on success (Pro verified), or an error string. */
  login: (email: string) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // On mount: restore saved email and re-validate with server
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) { setAuthLoading(false); return; }

    fetch(`/api/user?email=${encodeURIComponent(saved)}`)
      .then(r => r.json())
      .then(user => {
        if (user) {
          setEmail(saved);
          setUser(user);
          setIsPro(user.is_pro ?? false);
        } else {
          // Email no longer in DB — clear stale session
          setUser(null);
          localStorage.removeItem(LS_KEY);
        }
      })
      .catch(() => {
        // Network error on startup: keep email in state but don't grant Pro
        setEmail(saved);
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const login = useCallback(async (inputEmail: string): Promise<string | null> => {
    const e = inputEmail.trim().toLowerCase();
    if (!e) return "Email is required.";

    try {
      const res = await fetch(`/api/user?email=${encodeURIComponent(e)}`);
      const user = await res.json();

      if (!user) return "No account found for this email.";

      const pro = user.is_pro ?? false;
      setEmail(e);
      setUser(user);
      setIsPro(pro);

      if (pro) {
        localStorage.setItem(LS_KEY, e);
        return null; // success — Pro access granted
      }

      return "No active Pro subscription found for this email.";
    } catch {
      return "Could not verify email. Please try again.";
    }
  }, []);

  const logout = useCallback(() => {
    setEmail(null);
    setUser(null);
    setIsPro(false);
    localStorage.removeItem(LS_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ email, user, isPro, authLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
