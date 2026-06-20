import { qrcodegen } from './qrcodegen';
import { createClient, zoAsk, getAvailableModels, getAvailablePersonas } from 'zocomputer';
import { saveState, loadState, clearState, type SavedMessage } from './storage';

declare global {
  interface Window {
    ZO_API_KEY: string;
  }
}

// Global scope initialization
let apiKey = '';
let selectedModel: string | null = null;
let selectedPersona: string | null = null;
let conversationId: string | null = null;
let modelsList: any[] = [];
let personasList: any[] = [];
let fetchedData = false;
let open = false;
let messageCounter = 0;
let messages: SavedMessage[] = [];

// DOM Elements
const statusEl = document.getElementById("api-status") as HTMLButtonElement | null;
const modal = document.getElementById("qr-modal") as HTMLDivElement | null;
const backdrop = document.getElementById("qr-backdrop") as HTMLButtonElement | null;
const closeButton = document.getElementById("qr-close") as HTMLButtonElement | null;
const buildButton = document.getElementById("qr-build") as HTMLButtonElement | null;
const keyInput = document.getElementById("qr-key-input") as HTMLInputElement | null;
const setup = document.getElementById("qr-setup") as HTMLDivElement | null;
const result = document.getElementById("qr-result") as HTMLDivElement | null;
const image = document.getElementById("qr-image") as unknown as SVGSVGElement | null;
const link = document.getElementById("qr-link") as HTMLAnchorElement | null;
const value = document.getElementById("qr-value") as HTMLParagraphElement | null;
const copy = document.getElementById("qr-copy") as HTMLParagraphElement | null;

const chatInput = document.getElementById("chat-message-input") as HTMLInputElement | null;
const chatSend = document.getElementById("chat-send") as HTMLButtonElement | null;
const chatHint = document.getElementById("chat-hint") as HTMLParagraphElement | null;
const chatMessageList = document.getElementById("chat-message-list") as HTMLDivElement | null;

const modelsPlaceholder = document.getElementById("models-placeholder") as HTMLDivElement | null;
const modelsListEl = document.getElementById("models-list") as HTMLDivElement | null;
const modelsMetaEl = document.getElementById("models-meta") as HTMLSpanElement | null;

const personasPlaceholder = document.getElementById("personas-placeholder") as HTMLDivElement | null;
const personasListEl = document.getElementById("personas-list") as HTMLDivElement | null;
const personasMetaEl = document.getElementById("personas-meta") as HTMLSpanElement | null;

const chatModelSelected = document.getElementById("chat-model-selected") as HTMLSpanElement | null;
const chatPersonaSelected = document.getElementById("chat-persona-selected") as HTMLSpanElement | null;

/**
 * Parses queries out of the search parameters (e.g. `?key=...`)
 */
const getQueryParam = (name: string): string => {
  const query = window.location.search;
  if (!query || query.length < 2) return "";
  const parts = query.substring(1).split("&");
  for (const part of parts) {
    const [key, val] = part.split("=");
    if (decodeURIComponent(key.replace(/\+/g, " ")) === name) {
      return decodeURIComponent((val || "").replace(/\+/g, " "));
    }
  }
  return "";
};

apiKey = getQueryParam("key");
window.ZO_API_KEY = apiKey;

/**
 * Returns the Base URL for API requests.
 * 
 * NOTE: Browsers enforce CORS policies, but the Zo API domain does not allow
 * requests originating from localhost:5173. To bypass this during local development, 
 * we route calls to '/zo-api', which Vite's proxy forwards to 'https://api.zo.computer'.
 * On non-local production or real 3DS console viewports, we directly hit the main API
 * because legacy 3DS NetFront does not enforce modern CORS rules.
 */
const getApiBaseUrl = (): string => {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocal ? `${window.location.origin}/zo-api` : 'https://api.zo.computer';
};

const getSessionUrl = (): string => {
  const [base] = window.location.href.split("?");
  const hash = window.location.hash || "";
  return `${base}?key=${encodeURIComponent(apiKey || "")}${hash}`;
};

/**
 * Generates an SVG representation of the session URL's QR code
 */
const renderQr = () => {
  const sessionUrl = getSessionUrl();
  const qr = qrcodegen.QrCode.encodeText(sessionUrl, qrcodegen.QrCode.Ecc.LOW);
  const size = qr.size;
  const border = 4;
  const totalSize = size + border * 2;
  const parts: string[] = [];

  if (link) link.href = sessionUrl;
  if (value) value.textContent = sessionUrl;

  if (image) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (qr.getModule(x, y)) {
          parts.push(`M${x + border},${y + border}h1v1h-1z`);
        }
      }
    }

    image.setAttribute("viewBox", `0 0 ${totalSize} ${totalSize}`);
    image.innerHTML = `
      <rect width="100%" height="100%" fill="#ffffff"></rect>
      <path d="${parts.join(" ")}" fill="#000000"></path>
    `;
  }
};

const resetDataViews = () => {
  fetchedData = false;
  modelsList = [];
  personasList = [];
  selectedModel = null;
  selectedPersona = null;
  conversationId = null;
  messages = [];
  messageCounter = 0;
  clearState();

  if (chatMessageList) chatMessageList.innerHTML = "";

  if (modelsPlaceholder) {
    modelsPlaceholder.hidden = false;
    modelsPlaceholder.style.display = "block";
    modelsPlaceholder.textContent = "Add a key to view models.";
  }
  if (modelsListEl) modelsListEl.innerHTML = "";
  if (modelsMetaEl) modelsMetaEl.textContent = "0 active";

  if (personasPlaceholder) {
    personasPlaceholder.hidden = false;
    personasPlaceholder.style.display = "block";
    personasPlaceholder.textContent = "Add a key to view personas.";
  }
  if (personasListEl) personasListEl.innerHTML = "";
  if (personasMetaEl) personasMetaEl.textContent = "0 active";

  updateConfigBar();
};

const renderModels = () => {
  if (modelsPlaceholder) {
    modelsPlaceholder.hidden = true;
    modelsPlaceholder.style.display = "none";
  }

  if (modelsMetaEl) {
    modelsMetaEl.textContent = `${modelsList.length} available`;
  }

  if (!modelsListEl) return;
  modelsListEl.innerHTML = "";

  modelsList.forEach((model) => {
    const card = document.createElement("div");
    card.className = `card${selectedModel === model.model_name ? " active-item" : ""}`;

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = model.label || model.model_name;
    card.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "card-desc";
    let info = `Vendor: ${model.vendor}`;
    if (model.context_window) {
      info += ` · Context: ${Math.round(model.context_window / 1000)}k`;
    }
    if (model.type) {
      info += ` · ${model.type}`;
    }
    desc.textContent = info;
    card.appendChild(desc);

    const selectBtn = document.createElement("button");
    selectBtn.className = "card-btn";
    selectBtn.type = "button";
    selectBtn.textContent = selectedModel === model.model_name ? "Selected" : "Select Model";
    selectBtn.onclick = () => {
      selectedModel = selectedModel === model.model_name ? null : model.model_name;
      updateConfigBar();
      persistState();
      renderModels();
    };
    card.appendChild(selectBtn);

    modelsListEl.appendChild(card);
  });
};

const renderPersonas = () => {
  if (personasPlaceholder) {
    personasPlaceholder.hidden = true;
    personasPlaceholder.style.display = "none";
  }

  if (personasMetaEl) {
    personasMetaEl.textContent = `${personasList.length} configured`;
  }

  if (!personasListEl) return;
  personasListEl.innerHTML = "";

  personasList.forEach((persona) => {
    const card = document.createElement("div");
    card.className = `card${selectedPersona === persona.id ? " active-item" : ""}`;

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = persona.name || persona.id;
    card.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = persona.prompt || "No prompt description.";
    card.appendChild(desc);

    const selectBtn = document.createElement("button");
    selectBtn.className = "card-btn";
    selectBtn.type = "button";
    selectBtn.textContent = selectedPersona === persona.id ? "Selected" : "Select Persona";
    selectBtn.onclick = () => {
      selectedPersona = selectedPersona === persona.id ? null : persona.id;
      updateConfigBar();
      persistState();
      renderPersonas();
    };
    card.appendChild(selectBtn);

    personasListEl.appendChild(card);
  });
};

const updateConfigBar = () => {
  if (chatModelSelected) {
    if (selectedModel) {
      const match = modelsList.find(m => m.model_name === selectedModel);
      chatModelSelected.textContent = match ? match.label : selectedModel;
    } else {
      chatModelSelected.textContent = "Default";
    }
  }

  if (chatPersonaSelected) {
    if (selectedPersona) {
      const match = personasList.find(p => p.id === selectedPersona);
      chatPersonaSelected.textContent = match ? match.name : selectedPersona;
    } else {
      chatPersonaSelected.textContent = "Default";
    }
  }
};

const fetchModelsAndPersonas = async () => {
  if (!apiKey) return;
  fetchedData = true;

  if (modelsMetaEl) modelsMetaEl.textContent = "loading...";
  if (personasMetaEl) personasMetaEl.textContent = "loading...";

  const client = createClient({
    auth: apiKey,
    baseUrl: getApiBaseUrl(),
  });

  try {
    const modelsRes = await getAvailableModels({ client });
    if (modelsRes.error) {
      console.error("Failed to fetch models", modelsRes.error);
      if (modelsPlaceholder) {
        modelsPlaceholder.hidden = false;
        modelsPlaceholder.style.display = "block";
        modelsPlaceholder.textContent = "Failed to load models.";
      }
    } else {
      modelsList = modelsRes.data?.models || [];
      renderModels();
    }
  } catch (err) {
    console.error(err);
    if (modelsPlaceholder) {
      modelsPlaceholder.hidden = false;
      modelsPlaceholder.style.display = "block";
      modelsPlaceholder.textContent = "Error loading models.";
    }
  }

  try {
    const personasRes = await getAvailablePersonas({ client });
    if (personasRes.error) {
      console.error("Failed to fetch personas", personasRes.error);
      if (personasPlaceholder) {
        personasPlaceholder.hidden = false;
        personasPlaceholder.style.display = "block";
        personasPlaceholder.textContent = "Failed to load personas.";
      }
    } else {
      personasList = personasRes.data?.personas || [];
      renderPersonas();
    }
  } catch (err) {
    console.error(err);
    if (personasPlaceholder) {
      personasPlaceholder.hidden = false;
      personasPlaceholder.style.display = "block";
      personasPlaceholder.textContent = "Error loading personas.";
    }
  }
};

const syncState = () => {
  const unlocked = !!apiKey;

  if (statusEl) {
    statusEl.textContent = apiKey ? "api key set · tap for QR" : "api key missing · tap for QR";
    statusEl.setAttribute("aria-expanded", String(open));
  }

  if (modal) modal.hidden = !open;
  if (setup) setup.hidden = !!apiKey;
  if (result) result.hidden = !apiKey;

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

  if (chatHint) {
    chatHint.innerHTML = unlocked
      ? "Chat input is unlocked."
      : "Add a key to unlock chat input.";
  }

  if (apiKey) {
    renderQr();
    if (!fetchedData) {
      fetchModelsAndPersonas();
    }
  } else {
    resetDataViews();
  }
};

const getShortTime = (): string => {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
  return `${hours}:${minutesStr} ${ampm}`;
};

const appendMessage = (text: string, type: string, savedTimestamp?: number): string => {
  if (!chatMessageList) return "";
  messageCounter++;
  const id = `msg-${messageCounter}`;

  const article = document.createElement("article");
  article.className = `message ${type}`;
  article.id = id;

  const p = document.createElement("p");
  p.style.whiteSpace = "pre-wrap";
  p.textContent = text;
  article.appendChild(p);

  const span = document.createElement("span");
  const sender = type.includes("outgoing") ? "you" : "zo";
  const ts = savedTimestamp ? new Date(savedTimestamp) : new Date();
  let hours = ts.getHours();
  const minutes = ts.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
  span.textContent = `${sender} · ${hours}:${minutesStr} ${ampm}`;
  article.appendChild(span);

  chatMessageList.appendChild(article);
  chatMessageList.scrollTop = chatMessageList.scrollHeight;

  if (!savedTimestamp) {
    messages.push({ text, type, timestamp: Date.now() });
    persistState();
  }

  return id;
};

const persistState = (): void => {
  saveState({
    messages,
    conversationId,
    selectedModel,
    selectedPersona,
  });
};

const restoreState = (): void => {
  const saved = loadState();
  if (!saved) return;

  conversationId = saved.conversationId;
  selectedModel = saved.selectedModel;
  selectedPersona = saved.selectedPersona;
  messages = saved.messages;

  for (const msg of messages) {
    appendMessage(msg.text, msg.type, msg.timestamp);
  }

  updateConfigBar();
};

const removeMessage = (id: string) => {
  if (!id) return;
  const el = document.getElementById(id);
  if (el?.parentNode) {
    el.parentNode.removeChild(el);
  }
  // Remove the last message from tracking (used for loading indicators)
  messages.pop();
};

const sendMessage = async () => {
  if (!apiKey || !chatInput) return;
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";

  appendMessage(text, "outgoing");

  if (chatInput) chatInput.disabled = true;
  if (chatSend) chatSend.disabled = true;

  const loadingId = appendMessage("Zo is thinking...", "incoming loading-indicator");

  const client = createClient({
    auth: apiKey,
    baseUrl: getApiBaseUrl(),
  });

  try {
    const res = await zoAsk({
      client,
      body: {
        input: text,
        conversation_id: conversationId || undefined,
        model_name: selectedModel || undefined,
        persona_id: selectedPersona || undefined,
      }
    });

    removeMessage(loadingId);

    if (res.error) {
      const errorMsg = (res.error as any).error || "Failed to get a response from Zo.";
      appendMessage(`Error: ${errorMsg}`, "incoming error-message");
    } else {
      let outputText = "";
      if (res.data?.output) {
        if (typeof res.data.output === "string") {
          outputText = res.data.output;
        } else {
          outputText = JSON.stringify(res.data.output, null, 2);
        }
      } else {
        outputText = "No response output received.";
      }

      if (res.data?.conversation_id) {
        conversationId = res.data.conversation_id;
        persistState();
      }

      appendMessage(outputText, "incoming");
    }
  } catch (err: any) {
    removeMessage(loadingId);
    appendMessage(`Error: ${err.message || "An unexpected error occurred."}`, "incoming error-message");
  } finally {
    if (chatInput) chatInput.disabled = false;
    if (chatSend) chatSend.disabled = false;
    if (chatInput) chatInput.focus();
  }
};

const openDialog = () => {
  open = true;
  syncState();
  if (!apiKey && keyInput) {
    keyInput.focus();
  }
};

const closeDialog = () => {
  open = false;
  syncState();
};

const buildQr = () => {
  const nextKey = keyInput?.value || "";

  if (!nextKey) {
    keyInput?.focus();
    return;
  }

  apiKey = nextKey;
  window.ZO_API_KEY = apiKey;
  clearState();
  resetDataViews();
  syncState();
  fetchModelsAndPersonas();
};

// Event Binding
if (statusEl) {
  statusEl.onclick = () => {
    if (open) {
      closeDialog();
    } else {
      openDialog();
    }
  };
}

if (backdrop) backdrop.onclick = closeDialog;
if (closeButton) closeButton.onclick = closeDialog;
if (buildButton) buildButton.onclick = buildQr;

if (keyInput) {
  keyInput.onkeydown = (event) => {
    const keyCode = event?.keyCode || event?.which || 0;
    if (keyCode === 13) {
      buildQr();
    }
  };
}

if (chatSend) chatSend.onclick = sendMessage;

if (chatInput) {
  chatInput.onkeydown = (event) => {
    const keyCode = event?.keyCode || event?.which || 0;
    if (keyCode === 13) {
      sendMessage();
    }
  };
}

const handleRoute = () => {
  let hash = window.location.hash || "#chat";
  const panels = ["chat", "models", "personas"];
  if (!panels.includes(hash.substring(1))) {
    hash = "#chat";
  }

  panels.forEach((panel) => {
    const panelEl = document.getElementById(panel);
    if (panelEl) {
      panelEl.style.display = `#${panel}` === hash ? "block" : "none";
    }
  });

  const menu = document.getElementById("primary-menu");
  if (menu) {
    const tiles = menu.getElementsByTagName("a");
    Array.from(tiles).forEach((tile) => {
      const href = tile.getAttribute("href");
      tile.className = href === hash ? "tile active" : "tile";
    });
  }
};

window.onhashchange = handleRoute;

// Initialize
if (apiKey) {
  restoreState();
}
syncState();
handleRoute();
