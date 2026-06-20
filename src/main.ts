import { qrcodegen } from './qrcodegen';

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
  var open = false;

  window.ZO_API_KEY = apiKey;

  if (statusEl) {
    statusEl.textContent = apiKey ? "api key set · tap for QR" : "api key missing · tap for QR";
  }

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

  function handleRoute() {
    var hash = window.location.hash || "#home";
    var panels = ["home", "chat", "tasks", "tools"];
    var matched = false;
    var i;

    for (i = 0; i < panels.length; i += 1) {
      if ("#" + panels[i] === hash) {
        matched = true;
      }
    }
    if (!matched) {
      hash = "#home";
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
