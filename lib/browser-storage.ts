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
  local: {}
} as const;

export const browserStorageKeys = {
  session: {
    chat: {
      lastNickname: browserStorageItems.session.chat.lastNickname.key
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
