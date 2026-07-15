"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  browserStorageKeys,
  getLocalStorageItem,
  setLocalStorageItem
} from "../lib/browser-storage";

type TestModeContextValue = {
  isLocalEnvironment: boolean;
  testModeEnabled: boolean;
  testModeReady: boolean;
  toggleTestMode: () => void;
};

const TestModeContext = createContext<TestModeContextValue | null>(null);

type TestModeProviderProps = {
  children: ReactNode;
};

export function TestModeProvider({ children }: TestModeProviderProps) {
  const [isLocalEnvironment, setIsLocalEnvironment] = useState(false);
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testModeReady, setTestModeReady] = useState(false);

  useEffect(() => {
    const isLocal = isLoopbackHostname(window.location.hostname);

    setIsLocalEnvironment(isLocal);
    setTestModeEnabled(
      isLocal && getLocalStorageItem(browserStorageKeys.local.preferences.testMode) === "true"
    );
    setTestModeReady(true);
  }, []);

  const toggleTestMode = useCallback(() => {
    if (!isLocalEnvironment) {
      return;
    }

    setTestModeEnabled((current) => {
      const nextValue = !current;

      setLocalStorageItem(
        browserStorageKeys.local.preferences.testMode,
        String(nextValue)
      );

      return nextValue;
    });
  }, [isLocalEnvironment]);

  const value = useMemo(() => ({
    isLocalEnvironment,
    testModeEnabled,
    testModeReady,
    toggleTestMode
  }), [isLocalEnvironment, testModeEnabled, testModeReady, toggleTestMode]);

  return (
    <TestModeContext.Provider value={value}>
      {children}
    </TestModeContext.Provider>
  );
}

export function useTestMode() {
  const context = useContext(TestModeContext);

  if (!context) {
    throw new Error("useTestMode must be used within TestModeProvider.");
  }

  return context;
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
