/* MAIN world (sayfanın kendi JS bağlamı) enjektörü.
   - EventTarget.prototype.addEventListener'ı sarmalayarak sayfanın eklediği
     her dinleyiciyi (fonksiyon kaynağı + kayıt anındaki yığın izi) kaydeder.
   - Kaynakları yalnızca metin olarak yalıtılmış content script'e bildirir.
   - Varsayılan olarak kullanıcı tıklamasıyla; erken kayıt seçilmişse o sitede
     document_start anında yüklenir. Sayfaya ayrıcalıklı bir komut sunmaz. */
(() => {
  if (window.__CJS_MAIN__) return;
  window.__CJS_MAIN__ = true;

  const MAX_PER_TARGET = 300;

  let registry = new WeakMap(); // hedef -> kayıt listesi
  let recording = true;
  const proto = EventTarget.prototype;
  const origAdd = proto.addEventListener;
  const origRemove = proto.removeEventListener;
  const functionSource = Function.prototype.toString;

  function stackFrames() {
    let stack = "";
    try {
      stack = new Error().stack || "";
    } catch (e) {}
    const out = [];
    for (const raw of String(stack).split("\n")) {
      const line = raw.trim();
      if (!line || line.indexOf("Error") === 0) continue;
      if (line.indexOf("chrome-extension://") !== -1) continue; // kendi çerçevelerimiz
      const m = line.match(/((?:https?|file|blob|about):\/\/[^\s()]+):(\d+):(\d+)/);
      if (m) {
        out.push({ url: m[1], line: +m[2], col: +m[3], raw: line });
      } else {
        out.push({ url: "", line: 0, col: 0, raw: line });
      }
      if (out.length >= 6) break;
    }
    return out;
  }

  function record(target, type, listener, options) {
    try {
      let fn = null;
      if (typeof listener === "function") fn = listener;
      else if (listener && typeof listener.handleEvent === "function") fn = listener.handleEvent;
      if (!recording || !fn || fn.__cjsInternal) return;

      let list = registry.get(target);
      if (!list) {
        list = [];
        registry.set(target, list);
      }
      if (list.length >= MAX_PER_TARGET) return;

      const opts = typeof options === "object" && options !== null ? options : {};
      const capture = typeof options === "object" && options !== null ? !!opts.capture : !!options;
      if (list.some((entry) => entry.type === String(type) && entry.orig === listener && entry.capture === capture)) return;
      let source = "";
      try {
        source = functionSource.call(fn);
      } catch (e) {
        source = "/* kaynak alınamadı */";
      }
      if (source.length > 60000) source = source.slice(0, 60000) + "\n/* … kesildi */";

      list.push({
        type: String(type),
        capture,
        once: !!opts.once,
        passive: !!opts.passive,
        source,
        fn,
        orig: listener, // handleEvent nesneleri için orijinal referans
        frames: stackFrames(),
      });
    } catch (e) {}
  }

  proto.addEventListener = function (type, listener, options) {
    const result = origAdd.call(this, type, listener, options);
    try {
      record(this, type, listener, options);
    } catch (e) {}
    return result;
  };

  proto.removeEventListener = function (type, listener, options) {
    try {
      const list = registry.get(this);
      if (list) {
        const capture =
          typeof options === "object" && options !== null ? !!options.capture : !!options;
        for (let i = list.length - 1; i >= 0; i--) {
          const r = list[i];
          if (r.type === String(type) && r.capture === capture && (r.fn === listener || r.orig === listener)) {
            list.splice(i, 1);
            break;
          }
        }
      }
    } catch (e) {}
    return origRemove.call(this, type, listener, options);
  };

  /* ---- Content script ile köprü (postMessage) ---- */
  function onMsg(ev) {
    if (ev.source !== window) return;
    const msg = ev.data;
    if (!msg || msg.__cjs !== 1) return;

    // These messages only affect this website's in-memory diagnostics.
    if (msg.kind === "clear") { registry = new WeakMap(); recording = false; return; }
    if (msg.kind === "resume") { recording = true; return; }

    if (msg.kind === "getListeners") {
      const payload = { registered: [], inline: [], jquery: [] };
      try {
        let el = null;
        if (msg.target === "document") el = document;
        else if (msg.target === "body") el = document.body;
        else if (msg.target === "window") el = window;
        else {
          if (typeof msg.qid !== "string" || !/^q[a-z0-9]{1,80}$/.test(msg.qid)) return;
          el = document.querySelector(
            '[data-cjsq="' + msg.qid + '"]'
          );
        }
        if (el) {
          const list = registry.get(el) || [];
          payload.registered = list.map((r) => ({
            type: r.type,
            capture: r.capture,
            once: r.once,
            passive: r.passive,
            source: r.source,
            frames: r.frames,
          }));

          if (el.attributes) {
            for (const a of el.attributes) {
              if (/^on[a-z]+$/i.test(a.name) && a.value) {
                payload.inline.push({ attr: a.name, code: a.value });
              }
            }
          }

          try {
            const jq = window.jQuery || window.$;
            if (jq && jq.fn && jq._data) {
              const evs = jq._data(el, "events");
              if (evs) {
                for (const t of Object.keys(evs)) {
                  for (const h of evs[t] || []) {
                    payload.jquery.push({
                      type: t,
                      namespace: h.namespace || "",
                      selector: h.selector || null,
                      source: functionSource.call(h.handler).slice(0, 60000),
                    });
                  }
                }
              }
            }
          } catch (e) {}

          if (msg.target !== "document" && msg.target !== "body" && msg.target !== "window") {
            try {
              el.removeAttribute("data-cjsq");
            } catch (e) {}
          }
        }
      } catch (e) {}
      window.postMessage({ __cjs: 1, kind: "listeners", req: msg.req, payload }, "*");
    }
  }
  onMsg.__cjsInternal = true;
  window.addEventListener("message", onMsg);
})();
