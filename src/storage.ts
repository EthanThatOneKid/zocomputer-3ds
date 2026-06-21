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

export interface ConversationMeta {
  id: string;
  title: string;
  messageCount: number;
  lastUpdated: number;
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

const CONVERSATIONS_KEY = 'conversations';

export const loadConversationList = (): ConversationMeta[] => {
  const raw = loadData(CONVERSATIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ConversationMeta[];
  } catch { /* noop */ }
  return [];
};

const saveConversationList = (list: ConversationMeta[]): void => {
  saveData(CONVERSATIONS_KEY, JSON.stringify(list));
};

const conversationMessagesKey = (id: string): string => `conversation_${id}`;

export const saveConversationMessages = (id: string, messages: SavedMessage[]): void => {
  const json = JSON.stringify(messages);
  saveData(conversationMessagesKey(id), C1 + compressToUTF16(json));
};

export const loadConversationMessages = (id: string): SavedMessage[] | null => {
  const raw = loadData(conversationMessagesKey(id));
  if (!raw) return null;
  try {
    const decompressed = raw.startsWith(C1) ? decompressFromUTF16(raw.substring(C1.length)) : raw;
    if (decompressed == null) return null;
    const parsed = JSON.parse(decompressed);
    if (Array.isArray(parsed)) return parsed as SavedMessage[];
  } catch { /* noop */ }
  return null;
};

const removeConversationMessages = (id: string): void => {
  removeData(conversationMessagesKey(id));
};

export const upsertConversationMeta = (
  id: string,
  title: string,
  messages: SavedMessage[],
  selectedModel: string | null,
  selectedPersona: string | null
): void => {
  const list = loadConversationList();
  const lastUpdated = messages.length > 0 ? messages[messages.length - 1].timestamp : Date.now();
  const existing = list.find(m => m.id === id);
  if (existing) {
    existing.title = title;
    existing.messageCount = messages.length;
    existing.lastUpdated = lastUpdated;
    existing.selectedModel = selectedModel;
    existing.selectedPersona = selectedPersona;
  } else {
    list.push({
      id,
      title,
      messageCount: messages.length,
      lastUpdated,
      selectedModel,
      selectedPersona,
    });
  }
  saveConversationList(list);
  saveConversationMessages(id, messages);
};

export const deleteConversation = (id: string): void => {
  const list = loadConversationList().filter(m => m.id !== id);
  saveConversationList(list);
  removeConversationMessages(id);
};

export const renameConversation = (id: string, newTitle: string): void => {
  const list = loadConversationList();
  const meta = list.find(m => m.id === id);
  if (meta) {
    meta.title = newTitle;
    saveConversationList(list);
  }
};

export const migrateOldState = (): void => {
  const existingList = loadConversationList();
  if (existingList.length > 0) return;

  const state = loadState();
  if (!state || !state.conversationId || state.messages.length === 0) return;

  upsertConversationMeta(
    state.conversationId,
    state.messages[0]?.text?.substring(0, 50) || 'Conversation',
    state.messages,
    state.selectedModel,
    state.selectedPersona
  );
};

export const clearAllData = (): void => {
  const list = loadConversationList();
  for (const conv of list) {
    removeConversationMessages(conv.id);
  }
  removeData(CONVERSATIONS_KEY);
  removeData('state');
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
    try { document.cookie = `${key}=; path=/; max-age=0`; } catch { /* noop */ }
  }
};
