import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getCurrentUser, login as loginService, LoginData } from "../services/AuthService";
import { AuthStorage } from "../utils/AuthStorage";

interface UserProps {
  _id: string;
  name: string;
  email: string;
  classId?: string;
  classIds?: string[];
  role: UserRoles;
  contact_info?: string;
  profile_image_id?: string;
}

export enum UserRoles {
  STUDENT = 'student',
  TEACHER = 'teacher',
  ADMIN = 'admin',
  UNASSIGNED = 'unassigned',
  OFF = 'off',
}

interface AuthContextProps {
  user: UserProps | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setAnotherUser: (userData: UserProps) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de <Authentication>");
  return context;
};

interface AuthenticationProps {
  children: ReactNode;
}

const Authentication = ({ children }: AuthenticationProps) => {
  const [user, setUser] = useState<UserProps | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const loadUserFromStorage = (): UserProps | null => {
    const storedUser = AuthStorage.getUser();
    if (!storedUser) return null;

    try {
      return JSON.parse(storedUser);
    } catch {
      return null;
    }
  };

  const verifyTokenAndLoadUser = async (): Promise<UserProps | null> => {
    try {
      const userData = await getCurrentUser();
      AuthStorage.setUser(userData);
      return userData;
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } };
      if (err?.response?.status === 401) {
        AuthStorage.clearAuth();
        return null;
      }
      return loadUserFromStorage();
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const token = AuthStorage.getToken();

      if (token) {
        const userData = await verifyTokenAndLoadUser();
        if (userData) {
          setUser(userData);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }

      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      AuthStorage.clearAuth();

      const loginData: LoginData = { email, password };
      const response = await loginService(loginData);

      if (!response.access_token || !response.user) {
        throw new Error("Resposta de login inválida");
      }

      AuthStorage.setToken(response.access_token);
      AuthStorage.setUser(response.user);

      setUser(response.user);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      AuthStorage.clearAuth();
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
      AuthStorage.setUser(userData);
    } catch (error) {
      console.error("Erro ao atualizar usuário:", error);
      throw error;
    }
  };

  const setAnotherUser = (userData: UserProps) => {
    setUser(userData);
    AuthStorage.setUser(userData);
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    AuthStorage.clearAuth();
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoading,
      login,
      logout,
      setAnotherUser,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export default Authentication;
