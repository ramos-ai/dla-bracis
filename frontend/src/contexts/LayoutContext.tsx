import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from "react";

const SIDEBAR_WIDTH_EXPANDED = 260;
const SIDEBAR_WIDTH_COLLAPSED = 72;
const STORAGE_KEY = "sidebar-collapsed";

interface LayoutContextValue {
  sidebarWidth: number;
  isCollapsed: boolean;
  toggleSidebar: () => void;
  hasSidebar: boolean;
}

const LayoutContext = createContext<LayoutContextValue>({
  sidebarWidth: 0,
  isCollapsed: false,
  toggleSidebar: () => {},
  hasSidebar: false,
});

export const useLayout = () => useContext(LayoutContext);

interface LayoutProviderProps {
  children: ReactNode;
  hasSidebar: boolean;
}

export const LayoutProvider = ({ children, hasSidebar }: LayoutProviderProps) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const sidebarWidth = hasSidebar
    ? isCollapsed
      ? SIDEBAR_WIDTH_COLLAPSED
      : SIDEBAR_WIDTH_EXPANDED
    : 0;

  return (
    <LayoutContext.Provider value={{ sidebarWidth, isCollapsed, toggleSidebar, hasSidebar }}>
      {children}
    </LayoutContext.Provider>
  );
};

export { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED };
