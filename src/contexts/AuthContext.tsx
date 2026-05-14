"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api } from "@/lib/api";

interface User {
  id: number;
  email: string;
  username: string;
  role: string;
  avatar: string | null;
  isBanned: boolean;
  favoriteTeamId: number | null;
  provider?: string;
  favoriteTeam?: {
    id: number;
    name: string;
    shortName: string;
    crest: string;
  } | null;
  _count?: {
    threads: number;
    posts: number;
    following: number;
    followers: number;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  loginWithGoogle: (googleToken: string) => Promise<string | null>;
  signup: (email: string, password: string, username: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    const { data, error } = await api.get<{ user: User }>("/auth/me");
    if (error) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setUser(null);
    } else if (data) {
      setUser(data.user);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<string | null> => {
    const { data, error } = await api.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>("/auth/login", { email, password }, { skipAuth: true });

    if (error) return error;

    if (data) {
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      setUser(data.user);
    }
    return null;
  };

  const loginWithGoogle = async (googleToken: string): Promise<string | null> => {
    const { data, error } = await api.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>("/auth/google", { token: googleToken }, { skipAuth: true });

    if (error) return error;

    if (data) {
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("googleAccessToken", googleToken);
      setUser(data.user);
    }
    return null;
  };

  const signup = async (email: string, password: string, username: string): Promise<string | null> => {
    const { data, error } = await api.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>("/auth/signup", { email, password, username }, { skipAuth: true });

    if (error) return error;

    if (data) {
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      setUser(data.user);
    }
    return null;
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      await api.post("/auth/logout", { refreshToken });
    }

    const googleAccessToken = localStorage.getItem("googleAccessToken");
    if (googleAccessToken) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${googleAccessToken}`, {
        method: "POST",
      }).catch(() => {});
      localStorage.removeItem("googleAccessToken");
    }

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        loginWithGoogle,
        signup,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
