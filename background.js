/* All executable code ships in the extension. Network responses are text only. */
"use strict";

const MAX_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12000;
const PANEL_URL = chrome.runtime.getURL("sidepanel/sidepanel.html");
const SCRIPT_PREFIX = "cjs-early-";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error("Yan panel açılamadı:", error));

// A normal action click grants activeTab before opening the panel.
chrome.action.onClicked.addListener((tab) => {
  if (Number.isInteger(tab.id)) chrome.sidePanel.open({ tabId: tab.id })
    .catch((error) => console.error("Yan panel açılamadı:", error));
});

function resourceUrl(value) {
  if (typeof value !== "string" || value.length > 8192) throw new Error("Geçersiz kaynak adresi.");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Yalnızca HTTP/HTTPS kaynakları desteklenir; adres içinde kimlik bilgisi kullanılamaz.");
  }
  url.hash = "";
  return url;
}

function originPattern(value) {
  const url = resourceUrl(value);
  return `${url.protocol}//${url.hostname}/*`;
}

async function scriptId(pattern) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pattern));
  return SCRIPT_PREFIX + Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function isPanel(sender) {
  return sender.id === chrome.runtime.id && sender.url === PANEL_URL && !sender.tab;
}

function isTopFrame(sender) {
  return sender.id === chrome.runtime.id && Number.isInteger(sender.tab?.id) &&
    sender.frameId === 0 && typeof sender.url === "string" && /^https?:\/\//.test(sender.url);
}

async function earlyRecording(msg) {
  const pattern = originPattern(msg.origin);
  const id = await scriptId(pattern);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (msg.type === "cjs:disableEarly") {
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
    return { ok: true, enabled: false };
  }
  const allowed = await chrome.permissions.contains({ origins: [pattern] });
  if (msg.type === "cjs:getEarly") return { ok: true, enabled: allowed && registered.length > 0, allowed };
  if (!allowed) throw new Error("Önce bu site için erişim izni verin.");
  if (!registered.length) {
    await chrome.scripting.registerContentScripts([{
      id, matches: [pattern], js: ["inject/main.js"],
      runAt: "document_start", world: "MAIN", allFrames: false, persistAcrossSessions: true,
    }]);
  }
  return { ok: true, enabled: true };
}

async function fetchText(msg) {
  const url = resourceUrl(msg.url);
  if (msg.kind !== "css" && msg.kind !== "js") throw new Error("Kaynak türü CSS veya JS olmalı.");
  const pattern = originPattern(url.href);
  if (!await chrome.permissions.contains({ origins: [pattern] })) {
    return { ok: false, needsPermission: true, origin: pattern, error: "Bu kaynağın sitesine erişim izni verilmedi." };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.href, {
      credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const mime = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    const cssTypes = ["text/css", "text/plain", "application/octet-stream", ""];
    const jsTypes = ["application/javascript", "text/javascript", "application/ecmascript", "text/ecmascript", "application/x-javascript", "text/plain", "application/octet-stream", ""];
    if (!(msg.kind === "css" ? cssTypes : jsTypes).includes(mime)) {
      throw new Error("Yanıt CSS/JS metni değil; HTML, JSON ve diğer dosyalar açılmaz.");
    }
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Dosya 2 MiB sınırını aşıyor.");
    if (!response.body) throw new Error("Boş yanıt.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parts = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error("Dosya 2 MiB sınırını aşıyor.");
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode());
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return { ok: true, status: response.status, text: parts.join(""), finalUrl: url.href, contentType: mime };
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;
  let action;
  if (["cjs:getEarly", "cjs:enableEarly", "cjs:disableEarly"].includes(msg.type) && isPanel(sender)) {
    action = () => earlyRecording(msg);
  } else if (msg.type === "cjs:fetchText" && isTopFrame(sender)) {
    action = () => fetchText(msg);
  } else {
    return;
  }
  action().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});

// Revoke automatic injection when the user removes a site's host permission.
chrome.permissions.onRemoved.addListener(() => {
  (async () => {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    for (const script of scripts.filter((entry) => entry.id.startsWith(SCRIPT_PREFIX))) {
      if (!await chrome.permissions.contains({ origins: script.matches })) {
        await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
      }
    }
  })().catch((error) => console.error("Site kaydı kaldırılamadı:", error));
});
