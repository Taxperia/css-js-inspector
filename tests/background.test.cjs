"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");

// No browser account, real network, credentials or page data is used.
const source = fs.readFileSync(path.join(__dirname, "../background.js"), "utf8");
const extensionId = "testextension";
const panelSender = { id: extensionId, url: `chrome-extension://${extensionId}/sidepanel/sidepanel.html` };
const contentSender = { id: extensionId, tab: { id: 7 }, frameId: 0, url: "https://example.test/page" };

function fixture({ allowed = true, response = () => new Response("body { color: red; }", { headers: { "Content-Type": "text/css" } }) } = {}) {
  let listener;
  let onRemoved;
  const requests = [];
  const scripts = new Map();
  const context = vm.createContext({
    URL, TextEncoder, TextDecoder, AbortController, crypto: webcrypto,
    setTimeout, clearTimeout, console: { error() {} },
    fetch: async (url, options) => { requests.push({ url, options }); return response(); },
    chrome: {
      runtime: { id: extensionId, getURL: (name) => `chrome-extension://${extensionId}/${name}`, onMessage: { addListener: (fn) => { listener = fn; } } },
      sidePanel: { setPanelBehavior: async () => {}, open: async () => {} },
      action: { onClicked: { addListener() {} } },
      permissions: { contains: async () => allowed, onRemoved: { addListener: (fn) => { onRemoved = fn; } } },
      scripting: {
        getRegisteredContentScripts: async (filter) => [...scripts.values()].filter((script) => !filter || filter.ids.includes(script.id)),
        registerContentScripts: async (entries) => { for (const entry of entries) scripts.set(entry.id, entry); },
        unregisterContentScripts: async ({ ids }) => { for (const id of ids) scripts.delete(id); },
      },
    },
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(source, context, { timeout: 1000 });
  return {
    requests, scripts, onRemoved,
    send: (msg, sender = contentSender) => new Promise((resolve) => {
      const result = listener(msg, sender, (reply) => resolve(JSON.parse(JSON.stringify(reply))));
      if (result !== true) resolve(undefined);
    }),
  };
}

test("fetch omits credentials/referrer/cache and rejects redirects", async () => {
  const app = fixture();
  const reply = await app.send({ type: "cjs:fetchText", url: "https://assets.test/app.css#fragment", kind: "css" });
  assert.equal(reply.ok, true);
  assert.equal(reply.text, "body { color: red; }");
  assert.equal(app.requests[0].url, "https://assets.test/app.css");
  assert.equal(app.requests[0].options.credentials, "omit");
  assert.equal(app.requests[0].options.redirect, "error");
  assert.equal(app.requests[0].options.referrerPolicy, "no-referrer");
  assert.equal(app.requests[0].options.cache, "no-store");
});

test("no network request without a resource host grant", async () => {
  const app = fixture({ allowed: false });
  const reply = await app.send({ type: "cjs:fetchText", url: "https://assets.test/app.css", kind: "css" });
  assert.equal(reply.ok, false);
  assert.equal(reply.needsPermission, true);
  assert.equal(app.requests.length, 0);
});

test("rejects unsupported URLs, embedded credentials and resource kinds", async () => {
  for (const [url, kind] of [["file:///private.txt", "css"], ["data:text/plain,secret", "js"], ["https://user:pass@example.test/app.js", "js"], ["https://example.test/api", "json"]]) {
    const app = fixture();
    assert.equal((await app.send({ type: "cjs:fetchText", url, kind })).ok, false);
    assert.equal(app.requests.length, 0);
  }
});

test("only this extension's top-frame content scripts may fetch", async () => {
  const app = fixture();
  for (const sender of [panelSender, {}, { ...contentSender, id: "different" }, { ...contentSender, frameId: 1 }, { ...contentSender, url: "file:///private" }]) {
    assert.equal(await app.send({ type: "cjs:fetchText", url: "https://assets.test/app.css", kind: "css" }, sender), undefined);
  }
  assert.equal(app.requests.length, 0);
});

test("rejects HTML and JSON responses", async () => {
  for (const mime of ["text/html", "application/json"]) {
    const app = fixture({ response: () => new Response("private data", { headers: { "Content-Type": mime } }) });
    assert.equal((await app.send({ type: "cjs:fetchText", url: "https://assets.test/app.js", kind: "js" })).ok, false);
  }
});

test("limits both declared length and streamed length", async () => {
  for (const response of [
    () => new Response("x", { headers: { "Content-Type": "text/css", "Content-Length": String(3 * 1024 * 1024) } }),
    () => new Response("x".repeat(2 * 1024 * 1024 + 1), { headers: { "Content-Type": "text/css" } }),
  ]) {
    const app = fixture({ response });
    const reply = await app.send({ type: "cjs:fetchText", url: "https://assets.test/app.css", kind: "css" });
    assert.equal(reply.ok, false);
    assert.match(reply.error, /2 MiB/);
  }
});

test("handles HTTP and network failures without leaking response bodies", async () => {
  for (const response of [() => new Response("secret error body", { status: 403 }), () => { throw new Error("Network failed"); }]) {
    const app = fixture({ response });
    const reply = await app.send({ type: "cjs:fetchText", url: "https://assets.test/app.css", kind: "css" });
    assert.equal(reply.ok, false);
    assert.equal(reply.text, undefined);
  }
});

test("early recording requires a panel request and a granted site", async () => {
  const app = fixture({ allowed: false });
  assert.equal(await app.send({ type: "cjs:enableEarly", origin: "https://example.test/*" }), undefined);
  const reply = await app.send({ type: "cjs:enableEarly", origin: "https://example.test/*" }, panelSender);
  assert.equal(reply.ok, false);
  assert.equal(app.scripts.size, 0);
});

test("enables exactly one host at document_start and can disable it", async () => {
  const app = fixture();
  const msg = { type: "cjs:enableEarly", origin: "https://example.test/*" };
  assert.equal((await app.send(msg, panelSender)).enabled, true);
  assert.equal((await app.send(msg, panelSender)).enabled, true);
  assert.equal(app.scripts.size, 1);
  const script = [...app.scripts.values()][0];
  assert.deepEqual(Array.from(script.matches), ["https://example.test/*"]);
  assert.equal(script.runAt, "document_start");
  assert.equal(script.world, "MAIN");
  assert.equal(script.allFrames, false);
  assert.equal((await app.send({ ...msg, type: "cjs:getEarly" }, panelSender)).enabled, true);
  assert.equal((await app.send({ ...msg, type: "cjs:disableEarly" }, panelSender)).enabled, false);
  assert.equal(app.scripts.size, 0);
});
