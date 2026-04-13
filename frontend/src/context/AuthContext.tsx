import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren
} from 'react';

import { api, setApiToken } from '../lib/api';
import type { User } from '../types';

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  updateUser: (nextUser: User) => void;
};

const TOKEN_KEY = 'speakai_token';
const USER_KEY = 'speakai_user';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readStoredUser = () => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [isLoading, setIsLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  useEffect(() => {
    setApiToken(token ?? undefined);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    refreshMe().finally(() => setIsLoading(false));
  }, []);

  const persistAuth = (nextToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  };

  const clearAuth = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setApiToken(undefined);
  };

  const login = async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    persistAuth(response.data.token, response.data.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const response = await api.post('/auth/register', { name, email, password });
    persistAuth(response.data.token, response.data.user);
  };

  const logout = () => {
    clearAuth();
  };

  const refreshMe = async () => {
    if (!token) {
      clearAuth();
      return;
    }

    try {
      const response = await api.get('/auth/me');
      localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
      setUser(response.data.user);
    } catch {
      clearAuth();
    }
  };

  const updateUser = (nextUser: User) => {
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshMe,
        updateUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
};
