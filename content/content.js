/* Content script (yalıtılmış dünya):
   - Seçim modu arayüzü (hover çerçevesi, ipucu çubuğu)
   - Seçilen öğenin tüm verisini toplar: eşleşen CSS kuralları (::before/::after
     ve durum sözde-sınıfları dahil), inline stil, hesaplanan stiller,
     event listener'lar, breadcrumb, HTML
   - Sitenin CSS/JS dosyalarını listeler; içeriklerini (CORS'a takılanları arka
     plan üzerinden) getirir. */
(() => {
  if (window.__CJS_CONTENT__) return;
  window.__CJS_CONTENT__ = true;

  const RULE_CAP = 500;
  const PICK_Z = 2147483646;
  const PANEL_URL = chrome.runtime.getURL("sidepanel/sidepanel.html");
  const BLOCKED_EVENTS = ["pointerdown", "mousedown", "mouseup", "dblclick", "auxclick", "contextmenu", "submit", "dragstart", "selectstart"];

  let pickMode = false;
  let currentEl = null;
  let overlay = null;
  let overlayLabel = null;
  let hint = null;
  let reqSeq = 0;
  let selectionSeq = 0;
  const textCache = new Map(); // url -> {ok, text, status, error}

  /* ================================================================
     Yardımcılar
  ================================================================ */
  function notify(msg) {
    try {
      const p = chrome.runtime.sendMessage(msg);
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }

  function shortName(url) {
    try {
      const u = new URL(url, location.href);
      const parts = u.pathname.split("/").filter(Boolean);
      return parts.length ? parts[parts.length - 1] : u.hostname;
    } catch (e) {
      return String(url).slice(0, 60);
    }
  }

  function describeEl(el) {
    let s = (el.tagName || "?").toLowerCase();
    if (el.id) s += "#" + el.id;
    if (el.classList && el.classList.length) {
      s += "." + Array.from(el.classList).slice(0, 3).join(".");
    }
    return s;
  }

  /* ================================================================
     Seçici sözde-sınıf / sözde-öğe işleme
  ================================================================ */
  const PSEUDO_ELEMENTS = new Set([
    "before", "after", "first-line", "first-letter", "placeholder", "marker",
    "selection", "backdrop", "file-selector-button", "grammar-error",
    "spelling-error", "highlight",
  ]);

  const DYN =
    "focus-visible|focus-within|placeholder-shown|out-of-range|in-range|read-write|" +
    "read-only|user-valid|user-invalid|popover-open|indeterminate|autofill|" +
    "fullscreen|checked|disabled|enabled|hover|active|focus|target|visited|link|" +
    "valid|invalid|required|optional|default|modal|open|closed|paused|playing|" +
    "muted|seeking|buffering|stalled|volume-locked";

  const NOT_DYN_RE = new RegExp(":not\\(\\s*:(?:" + DYN + ")\\s*\\)", "gi");
  const STANDALONE_DYN_RE = new RegExp(
    "(^|[\\s>+~]):(?:" + DYN + ")(?=$|[\\s>+~])",
    "gi"
  );
  const ATTACHED_DYN_RE = new RegExp(":(?:" + DYN + ")\\b", "gi");
  const ENDS_WITH_DYN_RE = new RegExp(":(?:" + DYN + ")\\s*$", "i");

  function splitSelectorList(text) {
    const parts = [];
    let depth = 0;
    let cur = "";
    let q = null;
    for (const ch of String(text)) {
      if (q) {
        cur += ch;
        if (ch === q && cur[cur.length - 2] !== "\\") q = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        q = ch;
        cur += ch;
        continue;
      }
      if (ch === "(" || ch === "[") {
        depth++;
        cur += ch;
        continue;
      }
      if (ch === ")" || ch === "]") {
        depth = Math.max(0, depth - 1);
        cur += ch;
        continue;
      }
      if (ch === "," && depth === 0) {
        if (cur.trim()) parts.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function splitPseudoElement(sel) {
    const m = sel.match(/(::?)([a-zA-Z-]+)\s*$/);
    if (m) {
      const name = m[2];
      if (
        PSEUDO_ELEMENTS.has(name) ||
        name.indexOf("-webkit-") === 0 ||
        name.indexOf("-moz-") === 0 ||
        name.indexOf("-ms-") === 0
      ) {
        return { base: sel.slice(0, m.index), pe: name };
      }
    }
    return { base: sel, pe: null };
  }

  /* Durum sözde-sınıflarını (:hover vb.) konumuna göre temizler:
     - bileşenin tek başına olduğu yerde "*" ile değiştirir (ul :hover -> ul *)
     - bileşene yapışık ise siler (ul:hover -> ul) */
  function stripDynSelector(sel) {
    let s = sel.replace(NOT_DYN_RE, "");
    s = s.replace(STANDALONE_DYN_RE, "$1*");
    s = s.replace(ATTACHED_DYN_RE, "");
    s = s.replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (/^[>+~]/.test(s)) s = "* " + s;
    if (/[>+~]$/.test(s)) s = s + " *";
    return s;
  }

  function tryMatch(el, sel) {
    try {
      return el.matches(sel);
    } catch (e) {
      return false;
    }
  }

  /* eşleşme: pseudo-öğe dönerse o sözde-öğe için eşleşti; null → temel eşleşme;
     undefined → eşleşmedi */
  function matchSelector(el, sel) {
    const { base, pe } = splitPseudoElement(sel);
    if (!base) return undefined;
    if (tryMatch(el, base)) return pe;
    const stripped = stripDynSelector(base);
    if (stripped && tryMatch(el, stripped)) return pe;
    return undefined;
  }

  /* ================================================================
     CSS kural toplama
  ================================================================ */
  function declsOf(style) {
    const out = [];
    try {
      for (let i = 0; i < style.length; i++) {
        const p = style[i];
        out.push([p, style.getPropertyValue(p), style.getPropertyPriority(p)]);
      }
    } catch (e) {}
    return out;
  }

  function isStyleRule(rule) {
    if (typeof CSSStyleRule !== "undefined" && rule instanceof CSSStyleRule) return true;
    return rule && rule.style && rule.selectorText !== undefined && rule.keyText === undefined;
  }

  function walkRuleList(list, ctx, el, out, depth) {
    if (!list || depth > 12) return;
    for (const rule of list) {
      if (out.rules.length >= RULE_CAP) {
        out.capHit = true;
        return;
      }
      if (isStyleRule(rule)) {
        for (const sel of splitSelectorList(rule.selectorText)) {
          const pe = matchSelector(el, sel);
          if (pe !== undefined) {
            out.rules.push({
              selector: sel,
              pseudoEl: pe,
              declarations: declsOf(rule.style),
              source: ctx.source,
              media: ctx.media.join(" • "),
              href: ctx.href,
            });
            if (out.rules.length >= RULE_CAP) {
              out.capHit = true;
              return;
            }
          }
        }
      } else if (rule && rule.cssRules) {
        // @media / @supports / @layer / @container vb.
        const cond = rule.conditionText || rule.name || "";
        walkRuleList(
          rule.cssRules,
          { source: ctx.source, href: ctx.href, media: ctx.media.concat(cond ? [cond] : []) },
          el,
          out,
          depth + 1
        );
      }
    }
  }

  async function fetchViaBg(url, kind = "css") {
    const seq = selectionSeq;
    const key = kind + ":" + url;
    if (textCache.has(key)) return textCache.get(key);
    try {
      const result = await chrome.runtime.sendMessage({ type: "cjs:fetchText", url, kind });
      if (seq !== selectionSeq) return { ok: false, error: "İnceleme iptal edildi." };
      if (!result) return { ok: false, error: "Yanıt alınamadı." };
      if (result.ok) {
        // Only keep a bounded, in-memory cache. Never persist inspected data.
        while (textCache.size >= 4) textCache.delete(textCache.keys().next().value);
        textCache.set(key, result);
      }
      return result;
    } catch (error) {
      return { ok: false, error: String(error.message || error) };
    }
  }

  /* Getirilen CSS metnini ayrıştırmak için yapay stylesheet kullanılır
     (@import yapay stylesheet'te çalışmaz; önce çıkarılıp ayrı getirilir). */
  function extractImports(text) {
    const urls = [];
    const re = /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi;
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) urls.push(m[1]);
    }
    return urls;
  }

  async function parseSheet(text) {
    try {
      const cleaned = String(text)
        .replace(/@charset[^;]*;/ig, "")
        .replace(/@import[^;]*;/ig, "");
      const ss = new CSSStyleSheet();
      await ss.replace(cleaned);
      return ss.cssRules;
    } catch (e) {
      return null;
    }
  }

  async function collectRules(el) {
    const out = { rules: [], restricted: [], capHit: false };
    for (const sheet of document.styleSheets) {
      let href = sheet.href || "";
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        rules = null;
      }
      if (rules) {
        const source = href || "inline <style>";
        walkRuleList(rules, { source, href, media: [] }, el, out, 0);
      } else if (href) {
        out.restricted.push(href);
      }
    }

    if (out.restricted.length && out.rules.length < RULE_CAP) {
      const fetched = await Promise.all(
        out.restricted.slice(0, 20).map((u) => fetchViaBg(u))
      );
      const successful = new Set();
      for (const [index, f] of fetched.entries()) {
        if (out.rules.length >= RULE_CAP) {
          out.capHit = true;
          break;
        }
        if (!f.ok || !f.text) continue;
        const parsed = await parseSheet(f.text);
        if (parsed) {
          successful.add(out.restricted[index]);
          walkRuleList(parsed, { source: f.finalUrl || f.url, href: f.finalUrl || f.url, media: [] }, el, out, 0);
        }
      }
      out.restricted = out.restricted.filter((url) => !successful.has(url));
    }
    return out;
  }

  /* ================================================================
     Hesaplanan stiller + sözde öğeler
  ================================================================ */
  function computedListOf(cs) {
    const out = [];
    try {
      for (let i = 0; i < cs.length; i++) {
        const p = cs[i];
        out.push([p, cs.getPropertyValue(p)]);
      }
    } catch (e) {}
    return out;
  }

  const PSEUDO_PROPS = [
    "content", "display", "position", "inset", "top", "right", "bottom", "left",
    "width", "height", "margin", "padding", "border", "border-radius", "background",
    "color", "font", "line-height", "text-align", "text-transform", "opacity",
    "transform", "z-index", "box-shadow", "overflow", "flex", "grid", "white-space",
  ];

  function pseudoInfo(el, pe) {
    let cs;
    try {
      cs = getComputedStyle(el, pe);
    } catch (e) {
      return null;
    }
    const content = cs ? cs.content : "none";
    if (!content || content === "none" || content === "normal") {
      return { rendered: false, content: content || "none", props: [] };
    }
    const props = [];
    const seen = new Set();
    try {
      for (let i = 0; i < cs.length; i++) {
        const p = cs[i];
        if (seen.has(p)) continue;
        if (PSEUDO_PROPS.some((k) => p === k || p.indexOf(k + "-") === 0)) {
          seen.add(p);
          props.push([p, cs.getPropertyValue(p)]);
        }
      }
    } catch (e) {}
    return { rendered: true, content, props };
  }

  function breadcrumb(el) {
    const chain = [];
    let n = el;
    let d = 0;
    while (n && n.nodeType === 1 && d < 32) {
      chain.unshift(describeEl(n));
      n = n.parentElement;
      d++;
    }
    return chain.map((label, idx) => ({ level: chain.length - 1 - idx, label }));
  }

  /* ================================================================
     Listener sorgusu (main world üzerinden)
     spec: {qid} → geçici attribute ile öğe; {target:"document"|"body"|"window"}
  ================================================================ */
  function queryRegistered(spec) {
    return new Promise((resolve) => {
      const req = ++reqSeq;
      let done = false;
      const finish = (payload) => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onReply);
        if (spec.qid) {
          const el = spec.el;
          if (el) {
            try {
              el.removeAttribute("data-cjsq");
            } catch (e) {}
          }
        }
        resolve(
          cleanListeners(payload)
        );
      };
      const onReply = markInternal((ev) => {
        if (ev.source !== window) return;
        const m = ev.data;
        if (m && m.__cjs === 1 && m.kind === "listeners" && m.req === req) finish(m.payload);
      });
      window.addEventListener("message", onReply);

      const msg = { __cjs: 1, kind: "getListeners", req };
      if (spec.qid) {
        try {
          spec.el.setAttribute("data-cjsq", spec.qid);
        } catch (e) {
          finish(null);
          return;
        }
        msg.qid = spec.qid;
      } else {
        msg.target = spec.target;
      }
      window.postMessage(msg, "*");
      setTimeout(() => finish(null), spec.qid ? 1500 : 1200);
    });
  }

  // MAIN-world data is controlled by the inspected website. Treat it as text.
  function cleanListeners(payload) {
    const list = (value) => Array.isArray(value) ? value.slice(0, 300) : [];
    const text = (value, cap = 60000) => typeof value === "string" ? value.slice(0, cap) : "";
    const safe = (value) => {
      const item = value && typeof value === "object" ? value : {};
      return {
        type: text(item.type, 80), source: text(item.source), capture: !!item.capture,
        once: !!item.once, passive: !!item.passive, attr: text(item.attr, 80),
        code: text(item.code), namespace: text(item.namespace, 100), selector: text(item.selector, 2000),
        frames: list(item.frames).slice(0, 6).map((frame) => ({
          url: text(frame?.url, 2048), raw: text(frame?.raw, 1000),
          line: Number.isSafeInteger(frame?.line) ? frame.line : 0,
          col: Number.isSafeInteger(frame?.col) ? frame.col : 0,
        })),
      };
    };
    return {
      registered: list(payload?.registered).map(safe),
      inline: list(payload?.inline).map(safe),
      jquery: list(payload?.jquery).map(safe),
    };
  }

  function mainWorldListeners(el) {
    const qid = "q" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    return queryRegistered({ qid, el });
  }

  /* kendi iç dinleyicilerimiz kayda girmesin */
  function markInternal(fn) {
    fn.__cjsInternal = true;
    return fn;
  }

  /* ================================================================
     Öğe verisi paketleme
  ================================================================ */
  async function buildElementData(el) {
    const rect = el.getBoundingClientRect();
    const [listeners, delDoc, delBody, delWin] = await Promise.all([
      mainWorldListeners(el),
      queryRegistered({ target: "document" }),
      queryRegistered({ target: "body" }),
      queryRegistered({ target: "window" }),
    ]);
    const { rules, restricted, capHit } = await collectRules(el);

    return {
      basic: {
        tag: (el.tagName || "?").toLowerCase(),
        id: el.id || "",
        classes: el.classList ? Array.from(el.classList) : [],
        attrs: el.attributes
          ? Array.from(el.attributes).map((a) => [a.name, a.value])
          : [],
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        breadcrumb: breadcrumb(el),
      },
      html: (() => {
        let html = "";
        try {
          html = el.outerHTML || "";
        } catch (e) {}
        if (html.length > 12000) return html.slice(0, 12000) + "\n<!-- … kesildi -->";
        return html;
      })(),
      inlineStyle: el.getAttribute("style") || "",
      rules,
      restricted,
      capHit,
      pseudo: { before: pseudoInfo(el, "::before"), after: pseudoInfo(el, "::after") },
      computed: computedListOf(getComputedStyle(el)),
      listeners: {
        registered: listeners.registered || [],
        inline: listeners.inline || [],
        jquery: listeners.jquery || [],
        delegated: { doc: delDoc.registered, body: delBody.registered, win: delWin.registered },
      },
      url: location.href,
    };
  }

  /* ================================================================
     Seçim modu arayüzü
  ================================================================ */
  function ensurePickUi() {
    if (overlay) return;
    const root = document.documentElement || document.body;
    overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed", zIndex: String(PICK_Z), pointerEvents: "none",
      border: "2px solid #4f8cff", background: "rgba(79,140,255,.14)",
      display: "none", boxSizing: "border-box",
    });
    overlayLabel = document.createElement("div");
    Object.assign(overlayLabel.style, {
      position: "fixed", zIndex: String(PICK_Z), pointerEvents: "none",
      display: "none", background: "#1d4ed8", color: "#fff",
      font: "11px/1.4 ui-monospace, Consolas, Menlo, monospace",
      padding: "2px 6px", borderRadius: "4px", whiteSpace: "nowrap",
    });
    hint = document.createElement("div");
    Object.assign(hint.style, {
      position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "18px",
      zIndex: String(PICK_Z), pointerEvents: "none",
      background: "rgba(15,17,23,.92)", color: "#e5e7eb",
      font: "12px/1.5 system-ui, sans-serif", padding: "8px 14px",
      borderRadius: "8px", boxShadow: "0 4px 18px rgba(0,0,0,.35)", display: "none",
    });
    hint.textContent = "İncelemek için bir öğeye tıklayın  •  Çıkmak için ESC";
    root.appendChild(overlay);
    root.appendChild(overlayLabel);
    root.appendChild(hint);
  }

  let rafId = 0;
  let lastXY = [0, 0];

  function hoverAt(x, y) {
    if (!pickMode || !overlay) return;
    let el = null;
    try {
      el = document.elementFromPoint(x, y);
    } catch (e) {}
    if (!el) return;
    const r = el.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = r.left + "px";
    overlay.style.top = r.top + "px";
    overlay.style.width = Math.max(r.width, 2) + "px";
    overlay.style.height = Math.max(r.height, 2) + "px";
    overlayLabel.style.display = "block";
    overlayLabel.textContent =
      describeEl(el) + "   " + Math.round(r.width) + "×" + Math.round(r.height);
    const lw = overlayLabel.offsetWidth || 120;
    const lh = overlayLabel.offsetHeight || 18;
    let lx = r.left;
    let ly = r.top - lh - 4;
    if (ly < 2) ly = r.top + r.height + 4;
    if (lx + lw > window.innerWidth - 4) lx = window.innerWidth - lw - 4;
    overlayLabel.style.left = Math.max(2, lx) + "px";
    overlayLabel.style.top = ly + "px";
  }

  function onMove(e) {
    lastXY = [e.clientX, e.clientY];
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        hoverAt(lastXY[0], lastXY[1]);
      });
    }
  }
  markInternal(onMove);

  function onKey(e) {
    if (pickMode && (e.key === "Escape" || e.key === "Esc")) stopPick(true);
  }
  markInternal(onKey);

  function blockPickEvent(event) {
    if (!pickMode || !event.isTrusted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  markInternal(blockPickEvent);

  function onPickClick(event) {
    if (!pickMode || !event.isTrusted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const el = event.target instanceof Element ? event.target : event.target?.parentElement;
    stopPick(true);
    if (el) selectElement(el);
  }
  markInternal(onPickClick);

  function startPick() {
    if (pickMode) return;
    window.postMessage({ __cjs: 1, kind: "resume" }, "*");
    pickMode = true;
    ensurePickUi();
    overlay.style.display = "none";
    overlayLabel.style.display = "none";
    hint.style.display = "block";
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("click", onPickClick, true);
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, blockPickEvent, { capture: true, passive: false });
    notify({ type: "cjs:pickState", on: true });
  }

  function stopPick(reportState) {
    if (!pickMode) return;
    pickMode = false;
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("keydown", onKey, true);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (overlay) {
      overlay.style.display = "none";
      overlayLabel.style.display = "none";
      hint.style.display = "none";
    }
    window.removeEventListener("click", onPickClick, true);
    for (const type of BLOCKED_EVENTS) window.removeEventListener(type, blockPickEvent, true);
    if (reportState) notify({ type: "cjs:pickState", on: false });
  }

  async function selectElement(el) {
    const seq = ++selectionSeq;
    currentEl = el;
    try {
      const data = await buildElementData(el);
      if (seq === selectionSeq) notify({ type: "cjs:selection", data });
    } catch (e) {
      if (seq === selectionSeq) notify({ type: "cjs:selectionError", error: String(e) });
    }
  }

  /* ================================================================
     Dosya listesi
  ================================================================ */
  async function collectFiles() {
    const css = [];
    const js = [];
    const seenCss = new Set();
    const seenJs = new Set();

    for (const sheet of document.styleSheets) {
      const href = sheet.href || "";
      let readable = true;
      let count = 0;
      try {
        count = sheet.cssRules.length;
      } catch (e) {
        readable = false;
      }
      if (href) {
        if (seenCss.has(href)) continue;
        seenCss.add(href);
        css.push({
          kind: "css",
          url: href,
          name: shortName(href),
          media: sheet.media && sheet.media.mediaText && sheet.media.mediaText !== "all"
            ? sheet.media.mediaText : "",
          readable,
          rules: count,
        });
      } else if (sheet.ownerNode) {
        const tag = sheet.ownerNode.tagName === "STYLE" ? "style" : sheet.ownerNode.tagName.toLowerCase();
        css.push({
          kind: "css",
          url: null,
          name: "sayfa içi <" + tag + ">",
          media: sheet.media && sheet.media.mediaText && sheet.media.mediaText !== "all"
            ? sheet.media.mediaText : "",
          readable,
          rules: count,
          text: (sheet.ownerNode.textContent || "").slice(0, 400000),
        });
      }
    }

    // @import ile çekilen alt stylesheet'ler
    for (const sheet of Array.from(document.styleSheets)) {
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch (e) {}
      if (!rules) continue;
      for (const rule of rules) {
        if (rule && rule.href && rule.styleSheet) {
          if (seenCss.has(rule.href)) continue;
          seenCss.add(rule.href);
          let readable = true;
          let count = 0;
          try {
            count = rule.styleSheet.cssRules.length;
          } catch (e) {
            readable = false;
          }
          css.push({
            kind: "css",
            url: rule.href,
            name: shortName(rule.href),
            media: "",
            imported: true,
            readable,
            rules: count,
          });
        }
      }
    }

    for (const s of document.scripts) {
      if (s.src) {
        if (seenJs.has(s.src)) continue;
        seenJs.add(s.src);
        js.push({
          kind: "js",
          url: s.src,
          name: shortName(s.src),
          type: s.type || "",
          async: !!s.async,
          defer: !!s.defer,
          module: (s.type || "") === "module",
        });
      } else {
        const t = s.textContent || "";
        if (!t.trim()) continue;
        js.push({
          kind: "js",
          url: null,
          name: "sayfa içi <script>",
          type: s.type || "",
          text: t.slice(0, 400000),
        });
      }
    }

    return { css, js, url: location.href };
  }

  async function getFileText(msg) {
    if (!msg || !msg.url) return { ok: false, error: "url yok" };
    const res = await fetchViaBg(msg.url, msg.kind);
    const entry = {
      ok: !!res.ok,
      status: res.status || 0,
      text: res.text || "",
      error: res.error || "",
      needsPermission: !!res.needsPermission,
      finalUrl: res.finalUrl || msg.url,
    };
    return entry;
  }

  /* ================================================================
     Mesaj yönetimi
  ================================================================ */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.url !== PANEL_URL || sender.tab) return;
    if (!msg || typeof msg.type !== "string" || msg.type.indexOf("cjs:") !== 0) return;

    switch (msg.type) {
      case "cjs:ping":
        sendResponse({ ok: true, url: location.href });
        break;

      case "cjs:clear":
        ++selectionSeq;
        currentEl = null;
        textCache.clear();
        stopPick(false);
        window.postMessage({ __cjs: 1, kind: "clear" }, "*");
        sendResponse({ ok: true });
        break;

      case "cjs:pick":
        if (msg.on) startPick();
        else stopPick(true);
        sendResponse({ ok: true, on: pickMode });
        break;

      case "cjs:getElement":
        if (currentEl && currentEl.isConnected) {
          buildElementData(currentEl)
            .then((data) => sendResponse({ ok: true, data }))
            .catch((e) => sendResponse({ ok: false, error: String(e) }));
          return true;
        }
        sendResponse({ ok: false });
        break;

      case "cjs:selectBreadcrumb":
        if (currentEl) {
          let n = currentEl;
          const level = Number.isInteger(msg.level) ? Math.min(32, Math.max(0, msg.level)) : 0;
          for (let i = 0; i < level && n; i++) n = n.parentElement;
          if (n && n.nodeType === 1) selectElement(n);
        }
        sendResponse({ ok: true });
        break;

      case "cjs:getFiles":
        collectFiles()
          .then((f) => sendResponse({ ok: true, files: f }))
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;

      case "cjs:getFileText":
        getFileText(msg)
          .then((t) => sendResponse({ ok: true, file: t }))
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;
    }
  });

})();
