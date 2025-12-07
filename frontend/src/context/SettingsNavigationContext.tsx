import React, { createContext, useContext, useMemo, useState, ReactNode } from "react";

export type SettingsTab = "ai" | "livekit" | "processing" | "filecoin" | "encryption";

interface SettingsNavigationContextValue {
  isOpen: boolean;
  activeTab: SettingsTab;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setActiveTab: (tab: SettingsTab) => void;
}

const SettingsNavigationContext = createContext<SettingsNavigationContextValue | undefined>(undefined);

interface SettingsNavigationProviderProps {
  children: ReactNode;
  defaultTab?: SettingsTab;
}

export const SettingsNavigationProvider: React.FC<SettingsNavigationProviderProps> = ({
  children,
  defaultTab = "ai",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  const openSettings = (tab?: SettingsTab) => {
    setActiveTab(tab ?? defaultTab);
    setIsOpen(true);
  };

  const closeSettings = () => {
    setIsOpen(false);
  };

  const value = useMemo<SettingsNavigationContextValue>(
    () => ({
      isOpen,
      activeTab,
      openSettings,
      closeSettings,
      setActiveTab,
    }),
    [isOpen, activeTab]
  );

  return (
    <SettingsNavigationContext.Provider value={value}>
      {children}
    </SettingsNavigationContext.Provider>
  );
};

export const useSettingsNavigation = (): SettingsNavigationContextValue => {
  const context = useContext(SettingsNavigationContext);
  if (!context) {
    throw new Error("useSettingsNavigation must be used within a SettingsNavigationProvider");
  }
  return context;
};

