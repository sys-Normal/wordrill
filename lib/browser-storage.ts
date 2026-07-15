export const browserStorageItems = {
  session: {
    chat: {
      lastNickname: {
        category: "chat-session",
        description: "Keeps the last joined nickname for the current browser tab session.",
        key: "wordrill:chat:lastNickname"
      }
    }
  },
  local: {
    preferences: {
      testMode: {
        category: "developer-preferences",
        description: "Persists local-only UI test mode across browser sessions.",
        key: "wordrill:preferences:test-mode"
      },
      theme: {
        category: "appearance-preferences",
        description: "Persists the selected light or dark color theme across browser sessions.",
        key: "wordrill:preferences:theme"
      }
    }
  }
} as const;

export const browserStorageKeys = {
  session: {
    chat: {
      lastNickname: browserStorageItems.session.chat.lastNickname.key
    }
  },
  local: {
    preferences: {
      testMode: browserStorageItems.local.preferences.testMode.key,
      theme: browserStorageItems.local.preferences.theme.key
    }
  }
} as const;

export function getSessionStorageItem(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(key);
}

export function setSessionStorageItem(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(key, value);
}

export function removeSessionStorageItem(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(key);
}

export function getLocalStorageItem(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
}

export function setLocalStorageItem(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value);
}
