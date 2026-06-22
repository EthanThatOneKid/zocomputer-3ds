import {
  saveState, loadState, clearState, clearAllData,
  migrateOldState, loadConversationList, loadConversationMessages,
  upsertConversationMeta, deleteConversation as deleteStoredConversation,
  renameConversation
} from './storage';

declare global {
  interface Window {
    ZO_API_KEY: string;
    __qrcodegen: any;
  }
}

var apiKey = '';
var selectedModel: string | null = null;
var selectedPersona: string | null = null;
var conversationId: string | null = null;
var modelsList: any[] = [];
var personasList: any[] = [];
var fetchedData = false;
var open = false;
var messageCounter = 0;
var messages: any[] = [];
var conversationTitle = '';
var MAX_CONVERSATION_MESSAGES = 100;

var statusEl: HTMLButtonElement | null = null;
var modal: HTMLDivElement | null = null;
var backdrop: HTMLButtonElement | null = null;
var closeButton: HTMLButtonElement | null = null;
var buildButton: HTMLButtonElement | null = null;
var keyInput: HTMLInputElement | null = null;
var setup: HTMLDivElement | null = null;
var result: HTMLDivElement | null = null;
var image: SVGSVGElement | null = null;
var link: HTMLAnchorElement | null = null;
var value: HTMLParagraphElement | null = null;
var copy: HTMLParagraphElement | null = null;

var chatInput: HTMLInputElement | null = null;
var chatSend: HTMLButtonElement | null = null;
var chatHint: HTMLParagraphElement | null = null;
var chatMessageList: HTMLDivElement | null = null;

var modelsPlaceholder: HTMLDivElement | null = null;
var modelsListEl: HTMLDivElement | null = null;
var modelsMetaEl: HTMLSpanElement | null = null;

var personasPlaceholder: HTMLDivElement | null = null;
var personasListEl: HTMLDivElement | null = null;
var personasMetaEl: HTMLSpanElement | null = null;

var chatModelSelected: HTMLSpanElement | null = null;
var chatPersonaSelected: HTMLSpanElement | null = null;
var chatMessageCount: HTMLSpanElement | null = null;

var settingsClearBtn: HTMLButtonElement | null = null;
var settingsStatus: HTMLParagraphElement | null = null;

var conversationsListEl: HTMLDivElement | null = null;
var conversationsMetaEl: HTMLSpanElement | null = null;
var conversationsNewBtn: HTMLButtonElement | null = null;
var conversationsSearch: HTMLInputElement | null = null;
var chatNewBtn: HTMLAnchorElement | null = null;

function getQueryParam(name: string): string {
  var query = window.location.search;
  if (!query || query.length < 2) return "";
  var parts = query.substring(1).split("&");
  for (var i = 0; i < parts.length; i++) {
    var pair = parts[i].split("=");
    if (decodeURIComponent(pair[0].replace(/\+/g, " ")) === name) {
      return decodeURIComponent((pair[1] || "").replace(/\+/g, " "));
    }
  }
  return "";
}

function normalizeApiKey(value: string): string {
  return value.replace(/^Bearer\s+/i, "").trim();
}

apiKey = normalizeApiKey(getQueryParam("key"));
window.ZO_API_KEY = apiKey;

function getApiBaseUrl(): string {
  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return window.location.origin + '/zo-api';
  }
  return 'https://etok.zo.space/zo-proxy?path=';
}

function getSessionUrl(): string {
  var href = window.location.href;
  var idx = href.indexOf("?");
  var base = idx === -1 ? href : href.substring(0, idx);
  var hash = window.location.hash || "";
  return base + "?key=" + encodeURIComponent(apiKey || "") + hash;
}

function getQrcodegenUrl(): string {
  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return '/src/qrcodegen.ts';
  }
  var path = window.location.pathname;
  var dir = path.substring(0, path.lastIndexOf('/') + 1);
  return dir + 'assets/qrcodegen.js';
}

function loadQrcodegen(callback: () => void): void {
  if (window.__qrcodegen) {
    callback();
    return;
  }
  var script = document.createElement('script');
  script.src = getQrcodegenUrl();
  script.onload = callback;
  script.onerror = function () {
    console.error('Failed to load qrcodegen script');
  };
  document.head.appendChild(script);
}

function renderQr(): void {
  if (!window.__qrcodegen) {
    loadQrcodegen(function () { renderQr(); });
    return;
  }
  var sessionUrl = getSessionUrl();
  var qr = window.__qrcodegen.QrCode.encodeText(sessionUrl, window.__qrcodegen.QrCode.Ecc.LOW);
  var size = qr.size;
  var border = 4;
  var totalSize = size + border * 2;
  var parts: string[] = [];

  if (link) link.href = sessionUrl;
  if (value) value.textContent = sessionUrl;

  if (image) {
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (qr.getModule(x, y)) {
          parts.push('M' + (x + border) + ',' + (y + border) + 'h1v1h-1z');
        }
      }
    }

    image.setAttribute("viewBox", "0 0 " + totalSize + " " + totalSize);
    image.innerHTML = '<rect width="100%" height="100%" fill="#ffffff"></rect><path d="' + parts.join(" ") + '" fill="#000000"></path>';
  }
}

function xhrRequest(method: string, url: string, headers: Record<string, string>, body: string | null, callback: (err: any, data: any) => void): void {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    for (var key in headers) {
      if (headers.hasOwnProperty(key)) {
        xhr.setRequestHeader(key, headers[key]);
      }
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          var contentType = xhr.getResponseHeader('Content-Type') || '';
          if (contentType.indexOf('application/json') !== -1 || contentType.indexOf('text/json') !== -1) {
            try {
              callback(null, JSON.parse(xhr.responseText));
            } catch (e) {
              callback(null, xhr.responseText);
            }
          } else {
            callback(null, xhr.responseText);
          }
        } else {
          callback(new Error('Request failed: ' + xhr.status + ' ' + xhr.statusText), null);
        }
      }
    };
    xhr.onerror = function () {
      callback(new Error('Network error'), null);
    };
    xhr.send(body);
  } catch (e) {
    callback(e, null);
  }
}

function getAuthHeaders(): Record<string, string> {
  var headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = 'Bearer ' + apiKey;
    // Zo's edge strips Authorization before it reaches the /zo-proxy route handler,
    // so mirror the key into X-Zo-Api-Key (a custom header that survives the edge);
    // the proxy translates it back to Authorization for the upstream Zo API. Harmless
    // on the direct (3DS) path, where the origin ignores the extra header.
    headers['X-Zo-Api-Key'] = apiKey;
  }
  return headers;
}

function resetDataViews(): void {
  fetchedData = false;
  modelsList = [];
  personasList = [];
  selectedModel = null;
  selectedPersona = null;
  conversationId = null;
  messages = [];
  conversationTitle = '';
  messageCounter = 0;
  clearState();

  if (chatMessageList) chatMessageList.innerHTML = "";

  if (modelsPlaceholder) {
    modelsPlaceholder.style.display = "block";
    modelsPlaceholder.textContent = "Add a key to view models.";
  }
  if (modelsListEl) modelsListEl.innerHTML = "";
  if (modelsMetaEl) modelsMetaEl.textContent = "0 active";

  if (personasPlaceholder) {
    personasPlaceholder.style.display = "block";
    personasPlaceholder.textContent = "Add a key to view personas.";
  }
  if (personasListEl) personasListEl.innerHTML = "";
  if (personasMetaEl) personasMetaEl.textContent = "0 active";

  updateConfigBar();
}

function clearSiteData(): void {
  if (!confirm("This will permanently delete all saved messages, model selection, persona, and conversation history. Continue?")) {
    return;
  }
  clearAllData();
  clearState();
  resetDataViews();
  conversationTitle = '';
  if (settingsStatus) settingsStatus.textContent = "All site data cleared.";
}

function renderModels(): void {
  if (modelsPlaceholder) {
    modelsPlaceholder.style.display = "none";
  }

  if (modelsMetaEl) {
    modelsMetaEl.textContent = modelsList.length + " available";
  }

  if (!modelsListEl) return;
  modelsListEl.innerHTML = "";

  for (var i = 0; i < modelsList.length; i++) {
    var model = modelsList[i];
    var card = document.createElement("div");
    card.className = "card" + (selectedModel === model.model_name ? " active-item" : "");

    var title = document.createElement("div");
    title.className = "card-title";
    title.textContent = model.label || model.model_name;
    card.appendChild(title);

    var desc = document.createElement("div");
    desc.className = "card-desc";
    var info = "Vendor: " + model.vendor;
    if (model.context_window) {
      info += " \u00B7 Context: " + Math.round(model.context_window / 1000) + "k";
    }
    if (model.type) {
      info += " \u00B7 " + model.type;
    }
    desc.textContent = info;
    card.appendChild(desc);

    var selectBtn = document.createElement("button");
    selectBtn.className = "card-btn";
    selectBtn.type = "button";
    selectBtn.textContent = selectedModel === model.model_name ? "Selected" : "Select Model";
    selectBtn.onclick = ((modelName: string) => {
      return function () {
        selectedModel = selectedModel === modelName ? null : modelName;
        updateConfigBar();
        persistState();
        renderModels();
      };
    })(model.model_name);
    card.appendChild(selectBtn);

    modelsListEl.appendChild(card);
  }
}

function renderPersonas(): void {
  if (personasPlaceholder) {
    personasPlaceholder.style.display = "none";
  }

  if (personasMetaEl) {
    personasMetaEl.textContent = personasList.length + " configured";
  }

  if (!personasListEl) return;
  personasListEl.innerHTML = "";

  for (var i = 0; i < personasList.length; i++) {
    var persona = personasList[i];
    var card = document.createElement("div");
    card.className = "card" + (selectedPersona === persona.id ? " active-item" : "");

    var title = document.createElement("div");
    title.className = "card-title";
    title.textContent = persona.name || persona.id;
    card.appendChild(title);

    var desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = persona.prompt || "No prompt description.";
    card.appendChild(desc);

    var selectBtn = document.createElement("button");
    selectBtn.className = "card-btn";
    selectBtn.type = "button";
    selectBtn.textContent = selectedPersona === persona.id ? "Selected" : "Select Persona";
    selectBtn.onclick = ((personaId: string) => {
      return function () {
        selectedPersona = selectedPersona === personaId ? null : personaId;
        updateConfigBar();
        persistState();
        renderPersonas();
      };
    })(persona.id);
    card.appendChild(selectBtn);

    personasListEl.appendChild(card);
  }
}

function updateConfigBar(): void {
  if (chatModelSelected) {
    if (selectedModel) {
      var match = null;
      for (var i = 0; i < modelsList.length; i++) {
        if (modelsList[i].model_name === selectedModel) {
          match = modelsList[i];
          break;
        }
      }
      chatModelSelected.textContent = match ? match.label : selectedModel;
    } else {
      chatModelSelected.textContent = "Default";
    }
  }

  if (chatPersonaSelected) {
    if (selectedPersona) {
      var match = null;
      for (var i = 0; i < personasList.length; i++) {
        if (personasList[i].id === selectedPersona) {
          match = personasList[i];
          break;
        }
      }
      chatPersonaSelected.textContent = match ? match.name : selectedPersona;
    } else {
      chatPersonaSelected.textContent = "Default";
    }
  }

  if (chatMessageCount) {
    chatMessageCount.textContent = String(messages.length);
  }
}

function fetchModelsAndPersonas(): void {
  if (!apiKey) return;
  fetchedData = true;

  if (modelsMetaEl) modelsMetaEl.textContent = "loading...";
  if (personasMetaEl) personasMetaEl.textContent = "loading...";

  var baseUrl = getApiBaseUrl();
  var headers = getAuthHeaders();
  var loaded = 0;

  var checkDone = function () {
    loaded++;
    if (loaded === 2) {
      // both requests completed
    }
  };

  xhrRequest('GET', baseUrl + '/models/available', headers, null, function (err, data) {
    if (err) {
      console.error("Failed to fetch models", err);
      if (modelsPlaceholder) {
        modelsPlaceholder.style.display = "block";
        modelsPlaceholder.textContent = "Failed to load models.";
      }
    } else {
      modelsList = data?.models || [];
      renderModels();
    }
    checkDone();
  });

  xhrRequest('GET', baseUrl + '/personas/available', headers, null, function (err, data) {
    if (err) {
      console.error("Failed to fetch personas", err);
      if (personasPlaceholder) {
        personasPlaceholder.style.display = "block";
        personasPlaceholder.textContent = "Failed to load personas.";
      }
    } else {
      personasList = data?.personas || [];
      renderPersonas();
    }
    checkDone();
  });
}

function updateChatHint(): void {
  if (!chatHint) return;

  if (!apiKey) {
    chatHint.innerHTML = "Add a key to unlock chat input.";
    return;
  }

  var atLimit = messages.length >= MAX_CONVERSATION_MESSAGES;
  if (atLimit) {
    chatHint.innerHTML = "Message limit reached (" + MAX_CONVERSATION_MESSAGES + "). Start a new chat to continue.";
  } else {
    chatHint.innerHTML = "Chat input is unlocked. " + messages.length + "/" + MAX_CONVERSATION_MESSAGES;
  }

  if (chatInput) chatInput.disabled = atLimit;
  if (chatSend) chatSend.disabled = atLimit;
}

function syncState(): void {
  var unlocked = !!apiKey;

  if (statusEl) {
    statusEl.textContent = apiKey ? "api key set \u00B7 tap for QR" : "api key missing \u00B7 tap for QR";
    statusEl.setAttribute("aria-expanded", String(open));
  }

  if (modal) modal.style.display = open ? "block" : "none";
  if (setup) setup.style.display = apiKey ? "none" : "block";
  if (result) result.style.display = apiKey ? "block" : "none";

  if (copy) {
    copy.textContent = apiKey
      ? "Scan this link on another device to open Zo 3DS with the key already attached."
      : "Enter an API key first, then build a QR code for the session link.";
  }

  if (chatInput) {
    chatInput.disabled = !unlocked;
    chatInput.setAttribute("aria-disabled", String(!unlocked));
  }

  if (chatSend) {
    chatSend.disabled = !unlocked;
    chatSend.setAttribute("aria-disabled", String(!unlocked));
  }

  updateChatHint();

  if (apiKey) {
    renderQr();
    if (!fetchedData) {
      fetchModelsAndPersonas();
    }
  } else {
    resetDataViews();
  }
}

function getShortTime(): string {
  var now = new Date();
  var hours = now.getHours();
  var minutes = now.getMinutes();
  var ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  var minutesStr = minutes < 10 ? "0" + minutes : String(minutes);
  return hours + ":" + minutesStr + " " + ampm;
}

function appendMessage(text: string, type: string, savedTimestamp?: number): string {
  if (!chatMessageList) return "";
  messageCounter++;
  var id = "msg-" + messageCounter;

  var article = document.createElement("article");
  article.className = "message " + type;
  article.id = id;

  var p = document.createElement("p");
  p.style.whiteSpace = "pre-wrap";
  p.textContent = text;
  article.appendChild(p);

  var span = document.createElement("span");
  var sender = type.indexOf("outgoing") !== -1 ? "you" : "zo";
  var ts = savedTimestamp ? new Date(savedTimestamp) : new Date();
  var hours = ts.getHours();
  var minutes = ts.getMinutes();
  var ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  var minutesStr = minutes < 10 ? "0" + minutes : String(minutes);
  span.textContent = sender + " \u00B7 " + hours + ":" + minutesStr + " " + ampm;
  article.appendChild(span);

  chatMessageList.appendChild(article);
  chatMessageList.scrollTop = chatMessageList.scrollHeight;

  if (!savedTimestamp) {
    messages.push({ text: text, type: type, timestamp: Date.now() });
    persistState();
  }

  return id;
}

function persistState(): void {
  var state = { messages: messages, conversationId: conversationId, selectedModel: selectedModel, selectedPersona: selectedPersona };
  saveState(state);

  if (conversationId) {
    upsertConversationMeta(conversationId, conversationTitle, messages, selectedModel, selectedPersona);
  }
}

function deriveTitle(msgs: any[]): string {
  for (var i = 0; i < msgs.length; i++) {
    if (msgs[i].type === 'outgoing') {
      return msgs[i].text.substring(0, 60);
    }
  }
  return 'Chat';
}

function restoreState(): void {
  migrateOldState();

  var saved = loadState();
  if (!saved) return;

  conversationId = saved.conversationId;
  selectedModel = saved.selectedModel;
  selectedPersona = saved.selectedPersona;
  messages = saved.messages;
  conversationTitle = deriveTitle(messages);

  for (var i = 0; i < messages.length; i++) {
    appendMessage(messages[i].text, messages[i].type, messages[i].timestamp);
  }

  updateConfigBar();
}

function removeMessage(id: string): void {
  if (!id) return;
  var el = document.getElementById(id);
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
  messages.pop();
}

function sendMessage(): void {
  if (!apiKey || !chatInput) return;
  var text = chatInput.value.trim();
  if (!text) return;

  if (messages.length >= MAX_CONVERSATION_MESSAGES) {
    updateChatHint();
    return;
  }

  chatInput.value = "";

  appendMessage(text, "outgoing");

  if (chatInput) chatInput.disabled = true;
  if (chatSend) chatSend.disabled = true;

  messageCounter++;
  var tempId = "msg-" + messageCounter;
  var tempArticle = document.createElement("article");
  tempArticle.className = "message incoming";
  tempArticle.id = tempId;
  var tempP = document.createElement("p");
  tempP.style.whiteSpace = "pre-wrap";
  tempArticle.appendChild(tempP);
  var tempSpan = document.createElement("span");
  tempSpan.textContent = "zo \u00B7 " + getShortTime();
  tempArticle.appendChild(tempSpan);
  if (chatMessageList) {
    chatMessageList.appendChild(tempArticle);
    chatMessageList.scrollTop = chatMessageList.scrollHeight;
  }

  var baseUrl = getApiBaseUrl();
  var url = baseUrl + '/zo/ask';

  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', 'Bearer ' + apiKey);
    // Mirror into X-Zo-Api-Key so it survives Zo's edge when going through /zo-proxy.
    xhr.setRequestHeader('X-Zo-Api-Key', apiKey);

    var lastIndex = 0;
    var fullOutput = '';
    var finalConversationId: string | undefined;
    var lastEvent = '';

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        var newData = xhr.responseText.substring(lastIndex);
        lastIndex = xhr.responseText.length;

        if (newData.length > 0) {
          var lines = newData.split('\n');
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.indexOf('event: ') === 0) {
              lastEvent = line.substring(7).trim();
            } else if (line.indexOf('data: ') === 0) {
              var dataStr = line.substring(6);
              if (dataStr === '[DONE]') continue;
              try {
                var data = JSON.parse(dataStr);
                if (data.conversation_id) {
                  finalConversationId = data.conversation_id;
                }
                if (data.error) {
                  console.error('Stream error:', data.error);
                }
                if (lastEvent === 'PartStartEvent' && data.part && data.part.part_kind === 'text' && data.part.content) {
                  fullOutput += data.part.content;
                  tempP.textContent = fullOutput;
                } else if (lastEvent === 'PartDeltaEvent' && data.delta && data.delta.part_delta_kind === 'text' && data.delta.content_delta) {
                  fullOutput += data.delta.content_delta;
                  tempP.textContent = fullOutput;
                } else if (lastEvent === 'PartStartEvent' && data.part && data.part.part_kind === 'tool-call') {
                  // Tool call start — ignore for output
                } else if (lastEvent === 'PartDeltaEvent' && data.delta && data.delta.part_delta_kind === 'tool_call') {
                  // Tool call args delta — ignore
                } else if (lastEvent === 'FunctionToolResultEvent' && data.result && data.result.content) {
                  fullOutput += '\n' + data.result.content;
                  tempP.textContent = fullOutput;
                } else if (lastEvent === 'FrontendModelRequest' && data.parts) {
                  for (var j = 0; j < data.parts.length; j++) {
                    var p = data.parts[j];
                    if (p.part_kind === 'tool-return' && p.content) {
                      fullOutput += '\n' + p.content;
                      tempP.textContent = fullOutput;
                    }
                  }
                }
              } catch (e) {
                // Partial line, ignore parse errors
              }
            }
          }
        }

        if (xhr.readyState === 4) {
          try {
            if (tempArticle.parentNode) {
              tempArticle.parentNode.removeChild(tempArticle);
            }
          } catch (e) {}

          if (xhr.status >= 200 && xhr.status < 300) {
            if (finalConversationId) {
              conversationId = finalConversationId;
              if (!conversationTitle && messages.length > 0) {
                conversationTitle = deriveTitle(messages);
              }
            }

            appendMessage(fullOutput || "No response output received.", "incoming");
            persistState();
          } else {
            appendMessage("Error: Request failed (" + xhr.status + ")", "incoming error-message");
          }

          if (chatInput) chatInput.disabled = false;
          if (chatSend) chatSend.disabled = false;
          if (chatInput) chatInput.focus();
        }
      }
    };

    xhr.onerror = function () {
      try {
        if (tempArticle.parentNode) {
          tempArticle.parentNode.removeChild(tempArticle);
        }
      } catch (e) {}
      appendMessage("Error: Network error occurred.", "incoming error-message");
      if (chatInput) chatInput.disabled = false;
      if (chatSend) chatSend.disabled = false;
    };

    xhr.send(JSON.stringify({
      input: text,
      conversation_id: conversationId || undefined,
      model_name: selectedModel || undefined,
      persona_id: selectedPersona || undefined,
      stream: true,
    }));
  } catch (err: any) {
    try {
      if (tempArticle.parentNode) {
        tempArticle.parentNode.removeChild(tempArticle);
      }
    } catch (e) {}
    appendMessage("Error: " + (err.message || "An unexpected error occurred."), "incoming error-message");
    if (chatInput) chatInput.disabled = false;
    if (chatSend) chatSend.disabled = false;
  }
}

function getRelativeTime(ts: number): string {
  var diff = Date.now() - ts;
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  var days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  var months = Math.floor(days / 30);
  return months + 'mo ago';
}

function renderConversations(): void {
  var list = loadConversationList();

  for (var i = 0; i < list.length - 1; i++) {
    for (var j = i + 1; j < list.length; j++) {
      if (list[j].lastUpdated > list[i].lastUpdated) {
        var tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
      }
    }
  }

  var query = '';
  if (conversationsSearch) {
    query = (conversationsSearch.value || '').trim().toLowerCase();
  }
  var filtered = list;
  if (query) {
    filtered = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].title.toLowerCase().indexOf(query) !== -1) {
        filtered.push(list[i]);
      }
    }
  }

  if (conversationsMetaEl) {
    var total = loadConversationList().length;
    conversationsMetaEl.textContent = query
      ? filtered.length + " of " + total + " saved"
      : total + " saved";
  }

  if (!conversationsListEl) return;
  conversationsListEl.innerHTML = '';

  if (filtered.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'list-placeholder';
    empty.textContent = 'No saved chats yet.';
    conversationsListEl.appendChild(empty);
    return;
  }

  for (var i = 0; i < filtered.length; i++) {
    var conv = filtered[i];
    var card = document.createElement('div');
    card.className = 'card';

    var row = document.createElement('div');
    row.className = 'card-row';

    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = conv.title || 'Untitled Chat';
    row.appendChild(title);

    var renameBtn = document.createElement('button');
    renameBtn.className = 'card-btn-small';
    renameBtn.type = 'button';
    renameBtn.textContent = 'Rename';
    renameBtn.onclick = ((id: string, currentTitle: string) => {
      return function (e: Event) {
        e.stopPropagation();
        var newTitle = prompt('Rename conversation:', currentTitle || '');
        if (newTitle && newTitle.trim()) {
          renameConversation(id, newTitle.trim());
          renderConversations();
        }
      };
    })(conv.id, conv.title);
    row.appendChild(renameBtn);

    card.appendChild(row);

    var desc = document.createElement('div');
    desc.className = 'card-desc';
    desc.textContent = conv.messageCount + " messages \u00B7 " + getRelativeTime(conv.lastUpdated);
    card.appendChild(desc);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:8px; margin-top:8px;';

    var loadBtn = document.createElement('button');
    loadBtn.className = 'card-btn';
    loadBtn.type = 'button';
    var isActive = conv.id === conversationId;
    loadBtn.textContent = isActive ? 'Current' : 'Open';
    loadBtn.onclick = ((id: string, active: boolean) => {
      return function () {
        if (!active) switchConversation(id);
      };
    })(conv.id, isActive);
    btnRow.appendChild(loadBtn);

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-btn-danger';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = ((id: string) => {
      return function (e: Event) {
        e.stopPropagation();
        if (confirm('Delete this conversation? This cannot be undone.')) {
          handleDeleteConversation(id);
        }
      };
    })(conv.id);
    btnRow.appendChild(deleteBtn);

    card.appendChild(btnRow);

    conversationsListEl.appendChild(card);
  }
}

function switchConversation(id: string): void {
  if (conversationId) {
    persistState();
  }

  var msgs = loadConversationMessages(id);
  var list = loadConversationList();
  var meta = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      meta = list[i];
      break;
    }
  }

  conversationId = id;
  messages = msgs || [];
  conversationTitle = meta?.title || deriveTitle(messages);
  selectedModel = meta?.selectedModel || null;
  selectedPersona = meta?.selectedPersona || null;

  if (chatMessageList) {
    chatMessageList.innerHTML = '';
    for (var i = 0; i < messages.length; i++) {
      appendMessage(messages[i].text, messages[i].type, messages[i].timestamp);
    }
  }

  updateConfigBar();
  persistState();
  window.location.hash = '#chat';
}

function newConversation(): void {
  if (conversationId && messages.length > 0) {
    persistState();
  }

  conversationId = null;
  messages = [];
  conversationTitle = '';

  if (chatMessageList) {
    chatMessageList.innerHTML = '<article class="message incoming"><p>Need something done? Enter your API key to connect to your Zo Computer.</p><span>system \u00B7 now</span></article>';
  }

  clearState();
  updateConfigBar();
  window.location.hash = '#chat';
}

function handleDeleteConversation(id: string): void {
  var wasActive = id === conversationId;
  deleteStoredConversation(id);

  if (wasActive) {
    conversationId = null;
    messages = [];
    conversationTitle = '';
    clearState();
    if (chatMessageList) {
      chatMessageList.innerHTML = '<article class="message incoming"><p>Need something done? Enter your API key to connect to your Zo Computer.</p><span>system \u00B7 now</span></article>';
    }
    updateConfigBar();
  }

  renderConversations();
}

function openDialog(): void {
  open = true;
  syncState();
  if (!apiKey && keyInput) {
    keyInput.focus();
  }
}

function closeDialog(): void {
  open = false;
  syncState();
}

function buildQr(): void {
  var nextKey = normalizeApiKey(keyInput?.value || "");

  if (!nextKey) {
    if (keyInput) keyInput.focus();
    return;
  }

  apiKey = nextKey;
  window.ZO_API_KEY = apiKey;
  clearState();
  resetDataViews();
  syncState();
  fetchModelsAndPersonas();
}

function handleRoute(): void {
  var hash = window.location.hash || "#chat";
  var panels = ["chat", "models", "personas", "conversations", "settings"];
  if (hash.charAt(0) === '#') {
    var found = false;
    for (var i = 0; i < panels.length; i++) {
      if (panels[i] === hash.substring(1)) {
        found = true;
        break;
      }
    }
    if (!found) {
      hash = "#chat";
    }
  } else {
    hash = "#chat";
  }

  for (var i = 0; i < panels.length; i++) {
    var panelEl = document.getElementById(panels[i]);
    if (panelEl) {
      panelEl.style.display = "#" + panels[i] === hash ? "block" : "none";
    }
  }

  if (hash === "#conversations") {
    renderConversations();
  }

  var menu = document.getElementById("primary-menu");
  if (menu) {
    var tiles = menu.getElementsByTagName("a");
    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i];
      var href = tile.getAttribute("href");
      tile.className = href === hash ? "tile active" : "tile";
    }
  }
}

document.addEventListener('DOMContentLoaded', function () {
  statusEl = document.getElementById("api-status") as HTMLButtonElement | null;
  modal = document.getElementById("qr-modal") as HTMLDivElement | null;
  backdrop = document.getElementById("qr-backdrop") as HTMLButtonElement | null;
  closeButton = document.getElementById("qr-close") as HTMLButtonElement | null;
  buildButton = document.getElementById("qr-build") as HTMLButtonElement | null;
  keyInput = document.getElementById("qr-key-input") as HTMLInputElement | null;
  setup = document.getElementById("qr-setup") as HTMLDivElement | null;
  result = document.getElementById("qr-result") as HTMLDivElement | null;
  image = document.getElementById("qr-image") as unknown as SVGSVGElement | null;
  link = document.getElementById("qr-link") as HTMLAnchorElement | null;
  value = document.getElementById("qr-value") as HTMLParagraphElement | null;
  copy = document.getElementById("qr-copy") as HTMLParagraphElement | null;

  chatInput = document.getElementById("chat-message-input") as HTMLInputElement | null;
  chatSend = document.getElementById("chat-send") as HTMLButtonElement | null;
  chatHint = document.getElementById("chat-hint") as HTMLParagraphElement | null;
  chatMessageList = document.getElementById("chat-message-list") as HTMLDivElement | null;

  modelsPlaceholder = document.getElementById("models-placeholder") as HTMLDivElement | null;
  modelsListEl = document.getElementById("models-list") as HTMLDivElement | null;
  modelsMetaEl = document.getElementById("models-meta") as HTMLSpanElement | null;

  personasPlaceholder = document.getElementById("personas-placeholder") as HTMLDivElement | null;
  personasListEl = document.getElementById("personas-list") as HTMLDivElement | null;
  personasMetaEl = document.getElementById("personas-meta") as HTMLSpanElement | null;

  chatModelSelected = document.getElementById("chat-model-selected") as HTMLSpanElement | null;
  chatPersonaSelected = document.getElementById("chat-persona-selected") as HTMLSpanElement | null;
  chatMessageCount = document.getElementById("chat-message-count") as HTMLSpanElement | null;

  settingsClearBtn = document.getElementById("settings-clear-btn") as HTMLButtonElement | null;
  settingsStatus = document.getElementById("settings-status") as HTMLParagraphElement | null;

  conversationsListEl = document.getElementById("conversations-list") as HTMLDivElement | null;
  conversationsMetaEl = document.getElementById("conversations-meta") as HTMLSpanElement | null;
  conversationsNewBtn = document.getElementById("conversations-new-btn") as HTMLButtonElement | null;
  conversationsSearch = document.getElementById("conversations-search") as HTMLInputElement | null;
  chatNewBtn = document.getElementById("chat-new-btn") as HTMLAnchorElement | null;

  function toggleDialog(): void {
    if (open) { closeDialog(); } else { openDialog(); }
  }

  function onTap(el: HTMLElement, fn: () => void): void {
    el.addEventListener('click', fn);
    try { el.addEventListener('touchend', function (e) { try { e.preventDefault(); } catch (ex) {} fn(); }); } catch (ex) {}
  }

  if (statusEl) onTap(statusEl, toggleDialog);
  if (backdrop) onTap(backdrop, closeDialog);
  if (closeButton) onTap(closeButton, closeDialog);
  if (buildButton) onTap(buildButton, buildQr);

  if (keyInput) {
    keyInput.onkeydown = function (event) {
      var keyCode = event?.keyCode || event?.which || 0;
      if (keyCode === 13) {
        buildQr();
      }
    };
  }

  if (chatSend) chatSend.onclick = sendMessage;

  if (chatInput) {
    chatInput.onkeydown = function (event) {
      var keyCode = event?.keyCode || event?.which || 0;
      if (keyCode === 13) {
        sendMessage();
      }
    };
  }

  if (settingsClearBtn) {
    settingsClearBtn.onclick = clearSiteData;
  }

  if (conversationsNewBtn) {
    conversationsNewBtn.onclick = newConversation;
  }

  if (conversationsSearch) {
    conversationsSearch.oninput = function () {
      renderConversations();
    };
  }

  if (chatNewBtn) {
    chatNewBtn.onclick = function (e) {
      e.preventDefault();
      newConversation();
    };
  }

  window.onhashchange = handleRoute;

  try {
    if (apiKey) {
      restoreState();
    }
  } catch (e) {
    console.error('Failed to restore saved state:', e);
  }
  syncState();
  handleRoute();
});
