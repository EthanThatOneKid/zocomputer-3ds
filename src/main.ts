import { qrcodegen } from './qrcodegen';
import { createClient, zoAsk, getAvailableModels, getAvailablePersonas } from 'zocomputer';

declare global {
  interface Window {
    ZO_API_KEY: string;
  }
}

(function () {
  function getQueryParam(name: string): string {
    var query = window.location.search;
    var parts;
    var i;

    if (!query || query.length < 2) {
      return "";
    }

    parts = query.substring(1).split("&");
    for (i = 0; i < parts.length; i += 1) {
      var pair = parts[i].split("=");
      var key = decodeURIComponent(pair[0].replace(/\+/g, " "));
      var value = pair.length > 1 ? pair.slice(1).join("=") : "";

      if (key === name) {
        return decodeURIComponent(value.replace(/\+/g, " "));
      }
    }

    return "";
  }

  var apiKey = getQueryParam("key");
  var selectedModel: string | null = null;
  var selectedPersona: string | null = null;
  var conversationId: string | null = null;
  var modelsList: any[] = [];
  var personasList: any[] = [];
  var fetchedData = false;

  // DOM Elements
  var statusEl = document.getElementById("api-status") as HTMLButtonElement | null;
  var modal = document.getElementById("qr-modal") as HTMLDivElement | null;
  var backdrop = document.getElementById("qr-backdrop") as HTMLButtonElement | null;
  var closeButton = document.getElementById("qr-close") as HTMLButtonElement | null;
  var buildButton = document.getElementById("qr-build") as HTMLButtonElement | null;
  var keyInput = document.getElementById("qr-key-input") as HTMLInputElement | null;
  var setup = document.getElementById("qr-setup") as HTMLDivElement | null;
  var result = document.getElementById("qr-result") as HTMLDivElement | null;
  var image = document.getElementById("qr-image") as unknown as SVGSVGElement | null;
  var link = document.getElementById("qr-link") as HTMLAnchorElement | null;
  var value = document.getElementById("qr-value") as HTMLParagraphElement | null;
  var copy = document.getElementById("qr-copy") as HTMLParagraphElement | null;

  var chatInput = document.getElementById("chat-message-input") as HTMLInputElement | null;
  var chatSend = document.getElementById("chat-send") as HTMLButtonElement | null;
  var chatHint = document.getElementById("chat-hint") as HTMLParagraphElement | null;
  var chatMessageList = document.getElementById("chat-message-list") as HTMLDivElement | null;

  var modelsPlaceholder = document.getElementById("models-placeholder") as HTMLDivElement | null;
  var modelsListEl = document.getElementById("models-list") as HTMLDivElement | null;
  var modelsMetaEl = document.getElementById("models-meta") as HTMLSpanElement | null;

  var personasPlaceholder = document.getElementById("personas-placeholder") as HTMLDivElement | null;
  var personasListEl = document.getElementById("personas-list") as HTMLDivElement | null;
  var personasMetaEl = document.getElementById("personas-meta") as HTMLSpanElement | null;

  var chatModelSelected = document.getElementById("chat-model-selected") as HTMLSpanElement | null;
  var chatPersonaSelected = document.getElementById("chat-persona-selected") as HTMLSpanElement | null;

  var open = false;
  var messageCounter = 0;

  window.ZO_API_KEY = apiKey;

  function getSessionUrl(): string {
    var base = window.location.href.split("?")[0];
    var hash = window.location.hash || "";

    return base + "?key=" + encodeURIComponent(apiKey || "") + hash;
  }

  function renderQr() {
    var sessionUrl = getSessionUrl();
    var qr = qrcodegen.QrCode.encodeText(sessionUrl, qrcodegen.QrCode.Ecc.LOW);
    var size = qr.size;
    var border = 4;
    var totalSize = size + border * 2;
    var parts: string[] = [];
    var y: number;
    var x: number;

    if (link) {
      link.href = sessionUrl;
    }

    if (value) {
      value.textContent = sessionUrl;
    }

    if (image) {
      for (y = 0; y < size; y += 1) {
        for (x = 0; x < size; x += 1) {
          if (qr.getModule(x, y)) {
            parts.push("M" + (x + border) + "," + (y + border) + "h1v1h-1z");
          }
        }
      }

      image.setAttribute("viewBox", "0 0 " + totalSize + " " + totalSize);
      image.innerHTML =
        '<rect width="100%" height="100%" fill="#ffffff"></rect>' +
        '<path d="' + parts.join(" ") + '" fill="#000000"></path>';
    }
  }

  function syncState() {
    var unlocked = !!apiKey;

    if (statusEl) {
      statusEl.textContent = apiKey ? "api key set · tap for QR" : "api key missing · tap for QR";
      statusEl.setAttribute("aria-expanded", open ? "true" : "false");
    }

    if (modal) {
      modal.hidden = !open;
    }

    if (setup) {
      setup.hidden = !!apiKey;
    }

    if (result) {
      result.hidden = !apiKey;
    }

    if (copy) {
      copy.textContent = apiKey
        ? "Scan this link on another device to open Zo 3DS with the key already attached."
        : "Enter an API key first, then build a QR code for the session link.";
    }

    if (chatInput) {
      chatInput.disabled = !unlocked;
      chatInput.setAttribute("aria-disabled", unlocked ? "false" : "true");
    }

    if (chatSend) {
      chatSend.disabled = !unlocked;
      chatSend.setAttribute("aria-disabled", unlocked ? "false" : "true");
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
  }

  function resetDataViews() {
    fetchedData = false;
    modelsList = [];
    personasList = [];
    selectedModel = null;
    selectedPersona = null;
    conversationId = null;

    if (modelsPlaceholder) {
      modelsPlaceholder.hidden = false;
      modelsPlaceholder.style.display = "block";
      modelsPlaceholder.textContent = "Add a key to view models.";
    }
    if (modelsListEl) {
      modelsListEl.innerHTML = "";
    }
    if (modelsMetaEl) {
      modelsMetaEl.textContent = "0 active";
    }

    if (personasPlaceholder) {
      personasPlaceholder.hidden = false;
      personasPlaceholder.style.display = "block";
      personasPlaceholder.textContent = "Add a key to view personas.";
    }
    if (personasListEl) {
      personasListEl.innerHTML = "";
    }
    if (personasMetaEl) {
      personasMetaEl.textContent = "0 active";
    }

    updateConfigBar();
  }

  async function fetchModelsAndPersonas() {
    if (!apiKey) return;
    fetchedData = true;

    if (modelsMetaEl) modelsMetaEl.textContent = "loading...";
    if (personasMetaEl) personasMetaEl.textContent = "loading...";

    var client = createClient({ auth: apiKey });

    try {
      var modelsRes = await getAvailableModels({ client });
      if (modelsRes.error) {
        console.error("Failed to fetch models", modelsRes.error);
        if (modelsPlaceholder) {
          modelsPlaceholder.hidden = false;
          modelsPlaceholder.style.display = "block";
          modelsPlaceholder.textContent = "Failed to load models.";
        }
      } else {
        modelsList = modelsRes.data.models || [];
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
      var personasRes = await getAvailablePersonas({ client });
      if (personasRes.error) {
        console.error("Failed to fetch personas", personasRes.error);
        if (personasPlaceholder) {
          personasPlaceholder.hidden = false;
          personasPlaceholder.style.display = "block";
          personasPlaceholder.textContent = "Failed to load personas.";
        }
      } else {
        personasList = personasRes.data.personas || [];
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
  }

  function renderModels() {
    if (modelsPlaceholder) {
      modelsPlaceholder.hidden = true;
      modelsPlaceholder.style.display = "none";
    }

    if (modelsMetaEl) {
      modelsMetaEl.textContent = modelsList.length + " available";
    }

    if (!modelsListEl) return;
    modelsListEl.innerHTML = "";

    for (var i = 0; i < modelsList.length; i++) {
      (function (model) {
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
          info += " · Context: " + Math.round(model.context_window / 1000) + "k";
        }
        if (model.type) {
          info += " · " + model.type;
        }
        desc.textContent = info;
        card.appendChild(desc);

        var selectBtn = document.createElement("button");
        selectBtn.className = "card-btn";
        selectBtn.type = "button";
        selectBtn.textContent = selectedModel === model.model_name ? "Selected" : "Select Model";
        selectBtn.onclick = function () {
          if (selectedModel === model.model_name) {
            selectedModel = null;
          } else {
            selectedModel = model.model_name;
          }
          updateConfigBar();
          renderModels();
        };
        card.appendChild(selectBtn);

        modelsListEl.appendChild(card);
      })(modelsList[i]);
    }
  }

  function renderPersonas() {
    if (personasPlaceholder) {
      personasPlaceholder.hidden = true;
      personasPlaceholder.style.display = "none";
    }

    if (personasMetaEl) {
      personasMetaEl.textContent = personasList.length + " configured";
    }

    if (!personasListEl) return;
    personasListEl.innerHTML = "";

    for (var i = 0; i < personasList.length; i++) {
      (function (persona) {
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
        selectBtn.onclick = function () {
          if (selectedPersona === persona.id) {
            selectedPersona = null;
          } else {
            selectedPersona = persona.id;
          }
          updateConfigBar();
          renderPersonas();
        };
        card.appendChild(selectBtn);

        personasListEl.appendChild(card);
      })(personasList[i]);
    }
  }

  function updateConfigBar() {
    if (chatModelSelected) {
      if (selectedModel) {
        var modelLabel = selectedModel;
        for (var i = 0; i < modelsList.length; i++) {
          if (modelsList[i].model_name === selectedModel) {
            modelLabel = modelsList[i].label;
            break;
          }
        }
        chatModelSelected.textContent = modelLabel;
      } else {
        chatModelSelected.textContent = "Default";
      }
    }

    if (chatPersonaSelected) {
      if (selectedPersona) {
        var personaName = selectedPersona;
        for (var i = 0; i < personasList.length; i++) {
          if (personasList[i].id === selectedPersona) {
            personaName = personasList[i].name;
            break;
          }
        }
        chatPersonaSelected.textContent = personaName;
      } else {
        chatPersonaSelected.textContent = "Default";
      }
    }
  }

  function getShortTime(): string {
    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();
    var ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    var minutesStr = minutes < 10 ? "0" + minutes : minutes;
    return hours + ":" + minutesStr + " " + ampm;
  }

  function appendMessage(text: string, type: string): string {
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
    span.textContent = sender + " · " + getShortTime();
    article.appendChild(span);

    chatMessageList.appendChild(article);
    chatMessageList.scrollTop = chatMessageList.scrollHeight;

    return id;
  }

  function removeMessage(id: string) {
    if (!id) return;
    var el = document.getElementById(id);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  async function sendMessage() {
    if (!apiKey || !chatInput) return;
    var text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = "";

    appendMessage(text, "outgoing");

    if (chatInput) chatInput.disabled = true;
    if (chatSend) chatSend.disabled = true;

    var loadingId = appendMessage("Zo is thinking...", "incoming loading-indicator");

    var client = createClient({ auth: apiKey });

    try {
      var res = await zoAsk({
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
        var errorMsg = (res.error as any).error || "Failed to get a response from Zo.";
        appendMessage("Error: " + errorMsg, "incoming error-message");
      } else {
        var outputText = "";
        if (res.data && res.data.output) {
          if (typeof res.data.output === "string") {
            outputText = res.data.output;
          } else {
            outputText = JSON.stringify(res.data.output, null, 2);
          }
        } else {
          outputText = "No response output received.";
        }

        if (res.data && res.data.conversation_id) {
          conversationId = res.data.conversation_id;
        }

        appendMessage(outputText, "incoming");
      }
    } catch (err: any) {
      removeMessage(loadingId);
      appendMessage("Error: " + (err.message || "An unexpected error occurred."), "incoming error-message");
    } finally {
      if (chatInput) chatInput.disabled = false;
      if (chatSend) chatSend.disabled = false;
      if (chatInput) chatInput.focus();
    }
  }

  function openDialog() {
    open = true;
    syncState();
    if (!apiKey && keyInput) {
      keyInput.focus();
    }
  }

  function closeDialog() {
    open = false;
    syncState();
  }

  function buildQr() {
    var nextKey = keyInput && keyInput.value ? keyInput.value : "";

    if (!nextKey) {
      if (keyInput) {
        keyInput.focus();
      }
      return;
    }

    apiKey = nextKey;
    window.ZO_API_KEY = apiKey;
    syncState();
    fetchModelsAndPersonas();
  }

  if (statusEl) {
    statusEl.onclick = function () {
      if (open) {
        closeDialog();
      } else {
        openDialog();
      }
    };
  }

  if (backdrop) {
    backdrop.onclick = closeDialog;
  }

  if (closeButton) {
    closeButton.onclick = closeDialog;
  }

  if (buildButton) {
    buildButton.onclick = buildQr;
  }

  if (keyInput) {
    keyInput.onkeydown = function (event) {
      var keyCode = event && (event.keyCode || event.which) ? (event.keyCode || event.which) : 0;

      if (keyCode === 13) {
        buildQr();
      }
    };
  }

  if (chatSend) {
    chatSend.onclick = sendMessage;
  }

  if (chatInput) {
    chatInput.onkeydown = function (event) {
      var keyCode = event && (event.keyCode || event.which) ? (event.keyCode || event.which) : 0;

      if (keyCode === 13) {
        sendMessage();
      }
    };
  }

  function handleRoute() {
    var hash = window.location.hash || "#chat";
    var panels = ["chat", "models", "personas"];
    var matched = false;
    var i;

    for (i = 0; i < panels.length; i += 1) {
      if ("#" + panels[i] === hash) {
        matched = true;
      }
    }
    if (!matched) {
      hash = "#chat";
    }

    for (i = 0; i < panels.length; i += 1) {
      var panelEl = document.getElementById(panels[i]);
      if (panelEl) {
        if ("#" + panels[i] === hash) {
          panelEl.style.display = "block";
        } else {
          panelEl.style.display = "none";
        }
      }
    }

    var menu = document.getElementById("primary-menu");
    if (menu) {
      var tiles = menu.getElementsByTagName("a");
      for (i = 0; i < tiles.length; i += 1) {
        var href = tiles[i].getAttribute("href");
        if (href === hash) {
          tiles[i].className = "tile active";
        } else {
          tiles[i].className = "tile";
        }
      }
    }
  }

  window.onhashchange = handleRoute;

  syncState();
  handleRoute();
})();
