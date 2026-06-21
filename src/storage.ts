var PREFIX = 'zo3ds_';

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

function tryGetLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function trySetLS(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function setCookie(name: string, value: string): void {
  try {
    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000';
  } catch {}
}

function getCookie(name: string): string | null {
  try {
    var prefix = name + '=';
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var trimmed = cookies[i].trim();
      if (trimmed.indexOf(prefix) === 0) {
        return decodeURIComponent(trimmed.substring(prefix.length));
      }
    }
  } catch {}
  return null;
}

export function saveData(key: string, value: string): void {
  var prefixed = PREFIX + key;
  if (!trySetLS(prefixed, value)) {
    setCookie(prefixed, value);
  }
}

export function loadData(key: string): string | null {
  var prefixed = PREFIX + key;
  var ls = tryGetLS(prefixed);
  if (ls !== null) return ls;
  return getCookie(prefixed);
}

export function removeData(key: string): void {
  var prefixed = PREFIX + key;
  try { localStorage.removeItem(prefixed); } catch {}
  try { document.cookie = prefixed + '=; path=/; max-age=0'; } catch {}
}

export function saveState(state: SavedState): void {
  saveData('state', JSON.stringify(state));
}

export function loadState(): SavedState | null {
  var raw = loadData('state');
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw) as SavedState;
    if (Array.isArray(parsed.messages)) return parsed;
  } catch {}
  return null;
}

export function clearState(): void {
  removeData('state');
}

var CONVERSATIONS_KEY = 'conversations';

export function loadConversationList(): ConversationMeta[] {
  var raw = loadData(CONVERSATIONS_KEY);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ConversationMeta[];
  } catch {}
  return [];
}

function saveConversationList(list: ConversationMeta[]): void {
  saveData(CONVERSATIONS_KEY, JSON.stringify(list));
}

function conversationMessagesKey(id: string): string {
  return 'conversation_' + id;
}

export function saveConversationMessages(id: string, messages: SavedMessage[]): void {
  saveData(conversationMessagesKey(id), JSON.stringify(messages));
}

export function loadConversationMessages(id: string): SavedMessage[] | null {
  var raw = loadData(conversationMessagesKey(id));
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SavedMessage[];
  } catch {}
  return null;
}

function removeConversationMessages(id: string): void {
  removeData(conversationMessagesKey(id));
}

export function upsertConversationMeta(
  id: string,
  title: string,
  messages: SavedMessage[],
  selectedModel: string | null,
  selectedPersona: string | null
): void {
  var list = loadConversationList();
  var lastUpdated = messages.length > 0 ? messages[messages.length - 1].timestamp : Date.now();
  var existing: ConversationMeta | null = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      existing = list[i];
      break;
    }
  }
  if (existing) {
    existing.title = title;
    existing.messageCount = messages.length;
    existing.lastUpdated = lastUpdated;
    existing.selectedModel = selectedModel;
    existing.selectedPersona = selectedPersona;
  } else {
    list.push({
      id: id,
      title: title,
      messageCount: messages.length,
      lastUpdated: lastUpdated,
      selectedModel: selectedModel,
      selectedPersona: selectedPersona,
    });
  }
  saveConversationList(list);
  saveConversationMessages(id, messages);
}

export function deleteConversation(id: string): void {
  var orig = loadConversationList();
  var list: ConversationMeta[] = [];
  for (var i = 0; i < orig.length; i++) {
    if (orig[i].id !== id) {
      list.push(orig[i]);
    }
  }
  saveConversationList(list);
  removeConversationMessages(id);
}

export function renameConversation(id: string, newTitle: string): void {
  var list = loadConversationList();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      list[i].title = newTitle;
      break;
    }
  }
  saveConversationList(list);
}

export function migrateOldState(): void {
  var existingList = loadConversationList();
  if (existingList.length > 0) return;
  var state = loadState();
  if (!state || !state.conversationId || state.messages.length === 0) return;
  var title = state.messages[0] && state.messages[0].text ? state.messages[0].text.substring(0, 50) : 'Conversation';
  upsertConversationMeta(
    state.conversationId,
    title,
    state.messages,
    state.selectedModel,
    state.selectedPersona
  );
}

export function clearAllData(): void {
  var list = loadConversationList();
  for (var i = 0; i < list.length; i++) {
    removeConversationMessages(list[i].id);
  }
  removeData(CONVERSATIONS_KEY);
  removeData('state');
  var toRemove: string[] = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.indexOf(PREFIX) === 0) {
      toRemove.push(key);
    }
  }
  for (var i = 0; i < toRemove.length; i++) {
    try { localStorage.removeItem(toRemove[i]); } catch {}
    try { document.cookie = toRemove[i] + '=; path=/; max-age=0'; } catch {}
  }
}
