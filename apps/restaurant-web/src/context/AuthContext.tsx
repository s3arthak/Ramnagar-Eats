import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import type { User } from "../lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  verifyOtp: (email: string, code: string) => Promise<{ token?: string; user?: User; regToken?: string; isNew: boolean }>;
  register: (data: { email: string; regToken: string; name: string; phone?: string }) => Promise<User>;
  setSession: (token: string, user: User) => void;
  updateMe: (data: { phone?: string }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const data = await api.get<{ user: User }>("/auth/me");
        if (active) setUser(data.user);
      } catch {
        setToken(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const verifyOtp = async (email: string, code: string) => {
    // No role sent — let the backend find any user by email. This allows
    // the same email to sign in across apps, and the admin email
    // (ramnagareats@admin.com) routes correctly via the login page's land().
    const data = await api.post<{ token?: string; user?: User; regToken?: string; isNew: boolean }>("/auth/verify-otp", { email, code });
    if (data.token && data.user) {
      setToken(data.token);
      setUser(data.user);
    }
    return data;
  };

  const register = async (values: { email: string; regToken: string; name: string; phone?: string }) => {
    const data = await api.post<{ token: string; user: User }>("/auth/register", { ...values, role: "RESTAURANT" });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const setSession = (token: string, user: User) => {
    setToken(token);
    setUser(user);
  };

  const updateMe = async (data: { phone?: string }) => {
    const result = await api.patch<{ user: User }>("/auth/me", data);
    setUser(result.user);
    return result.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
    disconnectSocket();
  };

  return <AuthContext.Provider value={{ user, loading, verifyOtp, register, setSession, updateMe, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
