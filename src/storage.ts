import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

const PREFIX = 'zo3ds_';

export interface SavedMessage {
  text: string;
  type: string;
  timestamp: number;
}

export interface SavedState {
  messages: SavedMessage[];
  conversationId: string | null;
  selectedModel: string | null;
  selectedPersona: string | null;
}

const tryGetLS = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

const trySetLS = (key: string, value: string): boolean => {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
};

const setCookie = (name: string, value: string): void => {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000`;
  } catch { /* noop */ }
};

const getCookie = (name: string): string | null => {
  try {
    const prefix = `${name}=`;
    for (const c of document.cookie.split(';')) {
      const trimmed = c.trim();
      if (trimmed.startsWith(prefix)) {
        return decodeURIComponent(trimmed.substring(prefix.length));
      }
    }
  } catch { /* noop */ }
  return null;
};

export const saveData = (key: string, value: string): void => {
  const prefixed = PREFIX + key;
  if (!trySetLS(prefixed, value)) {
    setCookie(prefixed, value);
  }
};

export const loadData = (key: string): string | null => {
  const prefixed = PREFIX + key;
  const ls = tryGetLS(prefixed);
  if (ls !== null) return ls;
  return getCookie(prefixed);
};

export const removeData = (key: string): void => {
  const prefixed = PREFIX + key;
  try { localStorage.removeItem(prefixed); } catch { /* noop */ }
  try { document.cookie = `${prefixed}=; path=/; max-age=0`; } catch { /* noop */ }
};

const C1 = 'c1:';

export const saveState = (state: SavedState): void => {
  const json = JSON.stringify(state);
  saveData('state', C1 + compressToUTF16(json));
};

export const loadState = (): SavedState | null => {
  const raw = loadData('state');
  if (!raw) return null;
  try {
    const decompressed = raw.startsWith(C1) ? decompressFromUTF16(raw.substring(C1.length)) : raw;
    if (decompressed == null) return null;
    const parsed = JSON.parse(decompressed) as SavedState;
    if (Array.isArray(parsed.messages)) return parsed;
  } catch { /* noop */ }
  return null;
};

export const clearState = (): void => {
  removeData('state');
};

export const clearAllData = (): void => {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }
};
