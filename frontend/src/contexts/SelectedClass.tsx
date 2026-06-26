import { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from "react";

export interface SelectedClassContextProps {
  selectedClassId: string | null;
  setSelectedClassId: Dispatch<SetStateAction<string | null>>;
}

const SelectedClassContext = createContext<SelectedClassContextProps | undefined>(undefined);

export const useSelectedClass = (): SelectedClassContextProps => {
  const context = useContext(SelectedClassContext);
  if (context === undefined) {
    throw new Error("useSelectedClass must be used within a SelectedClassProvider");
  }
  return context;
};

interface SelectedClassProviderProps {
  children: ReactNode;
}

export const SelectedClassProvider = ({ children }: SelectedClassProviderProps) => {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  return (
    <SelectedClassContext.Provider value={{ selectedClassId, setSelectedClassId }}>
      {children}
    </SelectedClassContext.Provider>
  );
};
