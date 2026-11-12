/* Yan panel: öğe verisini, CSS/JS sekmelerini ve dosya listesini yönetir. */
(() => {
  const $ = (s) => document.querySelector(s);

  const state = {
    tab: "css",
    data: null,
    pickOn: false,
    filter: "all",
    busy: false,
    tabId: null,
    url: "",
    origin: "",
    generation: 0,
    earlyEnabled: false,
  };

  /* ---------------- küçük yardımcılar ---------------- */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "style") el.setAttribute("style", v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 1600);
  }

  function status(msg) {
    const s = $("#status");
    if (!msg) {
      s.classList.add("hidden");
      s.textContent = "";
    } else {
      s.textContent = msg;
      s.classList.remove("hidden");
    }
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || "Kopyalandı ✓");
    } catch (e) {
      try {
        const ta = h("textarea", { style: "position:fixed;opacity:0" });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        if (!document.execCommand("copy")) throw new Error("Pano erişimi reddedildi.");
        ta.remove();
        toast(okMsg || "Kopyalandı ✓");
      } catch (e2) {
        toast("Kopyalanamadı; dosya yüklendikten sonra tekrar tıklayın.");
      }
    }
  }

  function basename(url) {
    try {
      const u = new URL(url, "https://x.invalid");
      const parts = u.pathname.split("/").filter(Boolean);
      return parts.length ? parts[parts.length - 1] : u.hostname;
    } catch (e) {
      return String(url).slice(0, 50);
    }
  }

  function truncate(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n) + "\n/* … kesildi — kopyalayın */" : s;
  }

  /* ---------------- sekme köprüsü ---------------- */
  function sitePattern(value) {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Yalnızca HTTP/HTTPS sayfaları ve kaynakları desteklenir.");
    }
    return `${url.protocol}//${url.hostname}/*`;
  }

  function clearView() {
    state.data = null;
    state.pickOn = false;
    state.filter = "all";
    $("#elementCard").classList.add("hidden");
    $("#emptyState").classList.remove("hidden");
    $("#elementHtml").textContent = "";
    $("#attrList").textContent = "";
    $("#breadcrumb").textContent = "";
    $("#elementSummary").textContent = "";
    for (const pane of document.querySelectorAll(".tabpane")) pane.textContent = "";
    updatePickBtn();
  }

  async function refreshAccess() {
    const generation = state.generation;
    const origin = state.origin;
    $("#earlyBtn").disabled = !origin;
    if (!origin) {
      state.earlyEnabled = false;
      $("#recordingStatus").textContent = "Bu sekmede araç çubuğundaki eklenti simgesine tıklayın. Yalnızca HTTP/HTTPS desteklenir.";
      return;
    }
    const result = await chrome.runtime.sendMessage({ type: "cjs:getEarly", origin });
    if (generation !== state.generation) return;
    if (!result?.ok) throw new Error(result?.error || "Site erişimi okunamadı.");
    state.earlyEnabled = result.enabled;
    $("#earlyBtn").textContent = result.enabled ? "Bu sitede erken JS kaydını kapat" : "Bu sitede erken JS kaydını aç";
    $("#recordingStatus").textContent = result.enabled
      ? "Bu sitede erken JS kaydı açık. Değişiklikler sonraki sayfa yüklemesinde geçerli olur."
      : "Erken JS kaydı kapalı. Panel açılmadan önce eklenen olaylar görünmeyebilir.";
  }

  async function activeTab() {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = t?.url || "";
    if (t?.id !== state.tabId || url !== state.url) {
      const previous = state.tabId;
      state.tabId = t?.id ?? null;
      state.url = url;
      state.generation++;
      state.origin = "";
      try { state.origin = sitePattern(url); } catch (error) {}
      clearView();
      status("");
      $("#pageUrl").textContent = url ? url.replace(/^https?:\/\//, "") : "Sekme erişimi gerekli";
      $("#pageUrl").title = url;
      if (previous != null) chrome.tabs.sendMessage(previous, { type: "cjs:clear" }).catch(() => {});
      refreshAccess().catch((error) => status(error.message));
    }
    return t;
  }

  async function injectInto(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["inject/main.js"],
        world: "MAIN",
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/content.js"],
      });
    } catch (e) {
      throw new Error(
        "Bu sekmede araç çubuğundaki eklenti simgesine tıklayıp tekrar deneyin. Chrome, mağaza ve diğer korumalı sayfalar desteklenmez."
      );
    }
  }

  async function sendToTab(msg) {
    const t = await activeTab();
    if (!t || !t.id) throw new Error("Aktif sekme bulunamadı.");
    const generation = state.generation;
    let response;
    try {
      response = await chrome.tabs.sendMessage(t.id, msg);
    } catch (e) {
      await injectInto(t.id);
      response = await chrome.tabs.sendMessage(t.id, msg);
    }
    if (generation !== state.generation) throw new Error("Sekme değişti; işlemi yeni sekmede tekrar deneyin.");
    return response;
  }

  /* ---------------- önyükleme ---------------- */
  async function boot() {
    try {
      const res = await sendToTab({ type: "cjs:getElement" });
      if (res && res.ok && res.data) render(res.data);
      else status("Henüz öğe seçilmedi.");
    } catch (e) {
      status(String(e.message || e));
    }
  }

  $("#earlyBtn").addEventListener("click", async () => {
    if (!state.origin || state.busy) return;
    const origin = state.origin;
    const enabled = state.earlyEnabled;
    state.busy = true;
    try {
      // Invoke permission request directly from the click, before any await.
      const granted = enabled || await chrome.permissions.request({ origins: [origin] });
      if (!granted) { status("Site erişimine izin verilmedi; normal seçim modunu kullanabilirsiniz."); return; }
      const result = await chrome.runtime.sendMessage({ type: enabled ? "cjs:disableEarly" : "cjs:enableEarly", origin });
      if (!result?.ok) throw new Error(result?.error || "Erken kayıt ayarlanamadı.");
      await refreshAccess();
      status("Ayar kaydedildi. Bu sitedeki açık sayfaları yenileyin; mevcut sayfa kaydı ancak yenilenince durur veya baştan başlar.");
    } catch (error) {
      status(String(error.message || error));
    } finally { state.busy = false; }
  });

  $("#clearBtn").addEventListener("click", async () => {
    state.generation++;
    const tabId = state.tabId;
    clearView();
    if (tabId != null) await chrome.tabs.sendMessage(tabId, { type: "cjs:clear" }).catch(() => {});
    toast("İnceleme verileri temizlendi.");
  });

  $("#revokeBtn").addEventListener("click", async () => {
    try {
      const permissions = await chrome.permissions.getAll();
      const origins = (permissions.origins || []).filter((origin) => /^https?:\/\//.test(origin));
      if (origins.length && !await chrome.permissions.remove({ origins })) throw new Error("Site izinleri kaldırılamadı.");
      $("#clearBtn").click();
      await refreshAccess();
      status("Kalıcı site izinleri kaldırıldı. Kaydı durdurmak için açık sayfaları yenileyin. Geçici erişim sekme kapanınca veya başka siteye gidince biter.");
    } catch (error) { status(String(error.message || error)); }
  });

  chrome.tabs.onActivated.addListener(() => activeTab().catch(() => {}));
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (tabId === state.tabId && change.status === "loading") {
      state.generation++;
      clearView();
    }
    if (tabId === state.tabId && (change.status === "loading" || change.url)) activeTab().catch(() => {});
  });
  chrome.permissions.onAdded.addListener(() => refreshAccess().catch(() => {}));
  chrome.permissions.onRemoved.addListener(() => refreshAccess().catch(() => {}));
  window.addEventListener("focus", () => activeTab().catch(() => {}));
  window.addEventListener("pagehide", () => {
    if (state.tabId != null) chrome.tabs.sendMessage(state.tabId, { type: "cjs:clear" }).catch(() => {});
  });

  /* ---------------- üst bar ---------------- */
  function updatePickBtn() {
    const b = $("#pickBtn");
    if (state.pickOn) {
      b.textContent = "● Seçim bekleniyor… (ESC)";
      b.classList.add("on");
    } else {
      b.textContent = "◎ Seçim Modu";
      b.classList.remove("on");
    }
  }

  $("#pickBtn").addEventListener("click", async () => {
    if (state.busy) return;
    state.busy = true;
    try {
      const on = !state.pickOn;
      const res = await sendToTab({ type: "cjs:pick", on });
      state.pickOn = !!(res && res.on);
      if (!state.pickOn) status("");
      else status("Sayfada bir öğeye tıklayın.");
    } catch (e) {
      status(String(e.message || e));
    } finally {
      state.busy = false;
      updatePickBtn();
    }
  });

  $("#refreshBtn").addEventListener("click", async () => {
    status("");
    try {
      const res = await sendToTab({ type: "cjs:getElement" });
      if (res && res.ok && res.data) {
        render(res.data);
        toast("Yenilendi ✓");
      } else {
        status("Henüz öğe seçilmedi.");
      }
    } catch (e) {
      status(String(e.message || e));
    }
  });

  $("#copyHtmlBtn").addEventListener("click", () => {
    if (state.data && state.data.html) copyText(state.data.html, "HTML kopyalandı ✓");
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tabpane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      state.tab = btn.dataset.tab;
      $("#tab-" + state.tab).classList.add("active");
    });
  });

  /* ---------------- panel mesajları ---------------- */
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab?.id !== state.tabId || sender.frameId !== 0 || sender.url !== state.url) return;
    if (!msg || !msg.type) return;
    if (msg.type === "cjs:selection" && msg.data) {
      state.pickOn = false;
      updatePickBtn();
      status("");
      render(msg.data);
    } else if (msg.type === "cjs:selectionError") {
      status("Veri toplanamadı: " + msg.error);
    } else if (msg.type === "cjs:pickState") {
      state.pickOn = !!msg.on;
      updatePickBtn();
      if (state.pickOn) status("Sayfada bir öğeye tıklayın.");
      else status("");
    }
  });

  /* ---------------- ana render ---------------- */
  function render(data) {
    if (data.url !== state.url) return;
    state.data = data;
    $("#emptyState").classList.add("hidden");
    $("#elementCard").classList.remove("hidden");

    // breadcrumb
    const cr = $("#breadcrumb");
    cr.textContent = "";
    const crumbs = (data.basic.breadcrumb || []).slice(-8);
    crumbs.forEach((c) => {
      cr.appendChild(
        h("button", {
          class: "crumb" + (c.level === 0 ? " current" : ""),
          text: c.label,
          title: c.level === 0 ? "Seçili öğe" : "Üst öğeye git",
          onclick: () => {
            sendToTab({ type: "cjs:selectBreadcrumb", level: c.level }).catch((e) =>
              status(String(e.message || e))
            );
          },
        })
      );
    });

    // özet
    const b = data.basic;
    let summary = b.tag;
    if (b.id) summary += "#" + b.id;
    if (b.classes.length) summary += "." + b.classes.join(".");
    summary += "  —  " + b.w + "×" + b.h;
    $("#elementSummary").textContent = summary;

    // html + öznitelikler
    $("#elementHtml").textContent = data.html || "";
    const al = $("#attrList");
    al.textContent = "";
    (b.attrs || []).forEach(([k, v]) => {
      al.appendChild(h("span", { class: "k", text: k }));
      al.appendChild(h("span", { class: "v", text: v }));
    });
    $("#attrCount").textContent = String((b.attrs || []).length);

    renderCssTab(data);
    renderJsTab(data);
    renderFilesTabLazy();
  }

  /* ================= CSS SEKMESİ ================= */
  function ruleCategory(r) {
    if (r.pseudoEl === "before") return "before";
    if (r.pseudoEl === "after") return "after";
    if (r.pseudoEl) return "other";
    if (
      /:(hover|active|focus|focus-visible|focus-within|visited|link|target|checked|disabled|enabled|valid|invalid|placeholder-shown|in-range|out-of-range|read-only|read-write|required|optional|default|indeterminate|autofill|fullscreen)\b/i.test(
        r.selector
      )
    ) {
      return "state";
    }
    return "base";
  }

  function ruleText(r) {
    const decls = r.declarations
      .map(([p, v, imp]) => "  " + p + ": " + v + (imp ? " !important" : "") + ";")
      .join("\n");
    let out = r.selector + " {\n" + decls + "\n}";
    if (r.media) out = "@media " + r.media + " {\n" + out.replace(/^/gm, "  ") + "\n}";
    return out;
  }

  function ruleCard(r) {
    const head = h(
      "div",
      { class: "rule-head" },
      h("span", { class: "rule-sel", text: r.selector }),
      h(
        "div",
        { class: "rule-meta" },
        r.pseudoEl ? h("span", { class: "tag pe", text: "::" + r.pseudoEl }) : null,
        r.media ? h("span", { class: "tag media", text: r.media }) : null,
        h("span", { class: "tag", text: basename(r.source || "sayfa içi") })
      )
    );
    const decls = h("div", { class: "decls" });
    r.declarations.forEach(([p, v, imp]) => {
      decls.appendChild(
        h(
          "div",
          { class: "d" },
          h("span", { class: "p", text: p + ":" }),
          h("span", { class: "v", text: v + (imp ? " !important" : "") })
        )
      );
    });
    const body = h("div", { class: "ln-body" }, decls);
    const actions = h(
      "div",
      { class: "ln-actions" },
      h("button", {
        class: "btn small",
        text: "Kuralı kopyala",
        onclick: () => copyText(ruleText(r)),
      }),
      h("button", {
        class: "btn small",
        text: "Özellikleri kopyala",
        onclick: () =>
          copyText(r.declarations.map(([p, v, imp]) => p + ": " + v + (imp ? " !important" : "") + ";").join("\n")),
      })
    );
    return h("div", { class: "rule" }, head, body, actions);
  }

  function renderCssTab(data) {
    const pane = $("#tab-css");
    pane.textContent = "";

    /* inline stil */
    if (data.inlineStyle) {
      const pre = h("pre", { class: "code", text: data.inlineStyle });
      pane.appendChild(
        h(
          "div",
          { class: "section" },
          h(
            "div",
            { class: "section-head" },
            h("h2", { text: "Inline Stil" }),
            h("button", {
              class: "btn small",
              text: "Kopyala",
              onclick: () => copyText(data.inlineStyle),
            })
          ),
          pre
        )
      );
    }

    /* ::before / ::after */
    const peSection = h("div", { class: "section" });
    peSection.appendChild(h("div", { class: "section-head" }, h("h2", { text: "::before / ::after" })));
    let peAny = false;
    ["before", "after"].forEach((name) => {
      const info = data.pseudo && data.pseudo[name];
      if (!info) return;
      const card = h("details", { class: "rule" });
      const head = h(
        "summary",
        { class: "rule-head" },
        h("span", { class: "rule-sel", text: "::" + name }),
        h(
          "div",
          { class: "rule-meta" },
          h("span", {
            class: "tag " + (info.rendered ? "pe" : ""),
            text: info.rendered ? "içerik: " + info.content : "içerik yok",
          })
        )
      );
      card.appendChild(head);
      if (info.rendered && info.props.length) {
        const d = h("div", { class: "decls" });
        info.props.forEach(([p, v]) => {
          d.appendChild(h("div", { class: "d" }, h("span", { class: "p", text: p + ":" }), h("span", { class: "v", text: v })));
        });
        card.appendChild(d);
        card.appendChild(
          h(
            "div",
            { class: "ln-actions" },
            h("button", {
              class: "btn small",
              text: "::" + name + " stillerini kopyala",
              onclick: () =>
                copyText(
                  data.basic.tag + "::" + name + " {\n" +
                    info.props.map(([p, v]) => "  " + p + ": " + v + ";").join("\n") + "\n}"
                ),
            })
          )
        );
        peAny = true;
      }
      peSection.appendChild(card);
    });
    if (peAny) pane.appendChild(peSection);

    /* eşleşen kurallar */
    const rules = data.rules || [];
    const sec = h("div", { class: "section" });
    const chipsWrap = h("div", { class: "chips" });
    const listWrap = h("div");

    const cats = [
      ["all", "Tümü"],
      ["base", "Temel"],
      ["state", "Durum (:hover vb.)"],
      ["before", "::before"],
      ["after", "::after"],
      ["other", "Diğer sözde öğeler"],
    ];
    const counts = { all: rules.length, base: 0, state: 0, before: 0, after: 0, other: 0 };
    rules.forEach((r) => counts[ruleCategory(r)]++);

    function drawRules() {
      listWrap.textContent = "";
      const filtered = rules.filter((r) => state.filter === "all" || ruleCategory(r) === state.filter);
      if (!filtered.length) {
        listWrap.appendChild(h("div", { class: "empty-note", text: "Bu filtrede eşleşen kural yok." }));
        return;
      }
      filtered.forEach((r) => listWrap.appendChild(ruleCard(r)));
    }
    cats.forEach(([key, label]) => {
      const chip = h("button", { class: "chip", text: label + " (" + counts[key] + ")" });
      if (state.filter === key) chip.classList.add("active");
      chip.addEventListener("click", () => {
        state.filter = key;
        chipsWrap.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        drawRules();
      });
      chipsWrap.appendChild(chip);
    });

    sec.appendChild(
      h(
        "div",
        { class: "section-head" },
        h("h2", { text: "Eşleşen Kurallar" }),
        h(
          "div",
          { class: "rule-meta" },
          h("button", {
            class: "btn small",
            text: "Tüm CSS'i kopyala",
            onclick: () => copyText(buildAllCss(data)),
          })
        )
      )
    );
    if (data.capHit) {
      sec.appendChild(
        h("div", {
          class: "empty-note",
          text: "Kural sayısı çok yüksek olduğu için ilk " + RULE_CAP_TEXT + " kural gösteriliyor.",
        })
      );
    }
    sec.appendChild(chipsWrap);
    sec.appendChild(listWrap);
    pane.appendChild(sec);
    drawRules();

    /* hesaplanan stiller */
    const computed = data.computed || [];
    const grid = h("div", { class: "computed-grid" });
    computed.forEach(([p, v]) => {
      grid.appendChild(h("span", { class: "p", text: p + ":" }));
      grid.appendChild(h("span", { class: "v", text: v }));
    });
    pane.appendChild(
      h(
        "details",
        { class: "computed" },
        h("summary", { text: "Hesaplanan Stiller (" + computed.length + " özellik)" }),
        grid,
        h(
          "div",
          { style: "margin-top:8px" },
          h("button", {
            class: "btn small",
            text: "Hesaplanan stilleri kopyala",
            onclick: () =>
              copyText(computed.map(([p, v]) => p + ": " + v + ";").join("\n"), "Hesaplanan stiller kopyalandı ✓"),
          })
        )
      )
    );

    if (data.restricted && data.restricted.length) {
      const origins = [...new Set(data.restricted.map((url) => {
        try { return sitePattern(url); } catch (error) { return null; }
      }).filter(Boolean))];
      pane.appendChild(
        h("div", {
          class: "empty-note",
          text: "Not: " + data.restricted.length + " CSS kaynağı okunamadı. İzin, dosya boyutu, ağ hatası veya yönlendirme nedeniyle bazı kurallar eksik olabilir.",
        })
      );
      if (origins.length) pane.appendChild(h("button", {
        class: "btn small", text: "Listelenen CSS kaynaklarına erişim ver",
        title: origins.join("\n"),
        onclick: async () => {
          try {
            const granted = await chrome.permissions.request({ origins });
            if (!granted) { status("Kaynak erişimine izin verilmedi."); return; }
            $("#refreshBtn").click();
          } catch (error) { status(String(error.message || error)); }
        },
      }));
    }
  }

  const RULE_CAP_TEXT = "500";

  function buildAllCss(data) {
    const b = data.basic;
    let out = "/* ===== Seçili öğe: " + b.tag + (b.id ? "#" + b.id : "") + " ===== */\n";
    out += "/* Sayfa: " + (data.url || "") + " */\n\n";
    if (data.inlineStyle) {
      out += "/* --- inline style --- */\n";
      out += b.tag + " { " + data.inlineStyle + " }\n\n";
    }
    ["before", "after"].forEach((name) => {
      const info = data.pseudo && data.pseudo[name];
      if (info && info.rendered) {
        out += "/* --- ::" + name + " (hesaplanan) --- */\n";
        out += b.tag + "::" + name + " {\n";
        out += "  content: " + info.content + ";\n";
        out += info.props.map(([p, v]) => "  " + p + ": " + v + ";").join("\n") + "\n}\n\n";
      }
    });
    out += "/* --- eşleşen kurallar --- */\n";
    (data.rules || []).forEach((r) => {
      out += "\n/* " + (r.source || "sayfa içi") + (r.media ? "  |  @media " + r.media : "") + " */\n";
      out += ruleText(r) + "\n";
    });
    return out;
  }

  /* ================= JS SEKMESİ ================= */
  function sourceTag(frames) {
    for (const f of frames || []) {
      if (f && f.url) return basename(f.url) + ":" + f.line + ":" + f.col;
    }
    return "kaynak bilinmiyor";
  }

  function listenerCard(l, prefix) {
    const flags = [];
    if (l.capture) flags.push("capture");
    if (l.passive) flags.push("passive");
    if (l.once) flags.push("once");
    const head = h(
      "div",
      { class: "ln-head" },
      prefix ? h("span", { class: "flag", text: prefix }) : null,
      h("span", { class: "ln-type", text: l.type }),
      flags.map((f) => h("span", { class: "flag", text: f })),
      h("span", { class: "ln-src", text: sourceTag(l.frames) })
    );
    const pre = h("pre", { text: truncate(l.source, 4000) });
    const actions = h(
      "div",
      { class: "ln-actions" },
      h("button", {
        class: "btn small",
        text: "Fonksiyonu kopyala",
        onclick: () => copyText(l.source || ""),
      })
    );
    return h("div", { class: "ln" }, head, h("div", { class: "ln-body" }, pre), actions);
  }

  function renderJsTab(data) {
    const pane = $("#tab-js");
    pane.textContent = "";
    const L = data.listeners || {};

    /* doğrudan dinleyiciler */
    const sec = h("div", { class: "section" });
    sec.appendChild(
      h(
        "div",
        { class: "section-head" },
        h("h2", { text: "Bu öğedeki dinleyiciler" }),
        h("span", { class: "count", text: String((L.registered || []).length) })
      )
    );
    if ((L.registered || []).length) {
      L.registered.forEach((l) => sec.appendChild(listenerCard(l)));
    } else {
      sec.appendChild(
        h("div", {
          class: "empty-note",
          text: "Bu öğeye doğrudan eklenmiş dinleyici yok. Olay üst elementlere bağlanmış olabilir — aşağıdaki delegasyon listesine bakın.",
        })
      );
    }
    pane.appendChild(sec);

    /* inline handler'lar */
    if ((L.inline || []).length) {
      const s2 = h("div", { class: "section" });
      s2.appendChild(
        h("div", { class: "section-head" }, h("h2", { text: "Inline handler'lar" }), h("span", { class: "count", text: String(L.inline.length) }))
      );
      L.inline.forEach((x) => {
        s2.appendChild(
          h(
            "div",
            { class: "ln" },
            h("div", { class: "ln-head" }, h("span", { class: "ln-type", text: x.attr })),
            h("div", { class: "ln-body" }, h("pre", { text: x.code })),
            h(
              "div",
              { class: "ln-actions" },
              h("button", { class: "btn small", text: "Kopyala", onclick: () => copyText(x.attr + '="' + x.code + '"') })
            )
          )
        );
      });
      pane.appendChild(s2);
    }

    /* jQuery */
    if ((L.jquery || []).length) {
      const s3 = h("div", { class: "section" });
      s3.appendChild(
        h("div", { class: "section-head" }, h("h2", { text: "jQuery olayları" }), h("span", { class: "count", text: String(L.jquery.length) }))
      );
      L.jquery.forEach((j) => {
        s3.appendChild(
          h(
            "div",
            { class: "ln" },
            h(
              "div",
              { class: "ln-head" },
              h("span", { class: "ln-type", text: j.type + (j.namespace ? "." + j.namespace : "") }),
              j.selector ? h("span", { class: "flag", text: "delege: " + j.selector }) : null
            ),
            h("div", { class: "ln-body" }, h("pre", { text: truncate(j.source, 4000) })),
            h(
              "div",
              { class: "ln-actions" },
              h("button", { class: "btn small", text: "Kopyala", onclick: () => copyText(j.source || "") })
            )
          )
        );
      });
      pane.appendChild(s3);
    }

    /* delegasyon adayları */
    const del = L.delegated || {};
    const total = (del.doc || []).length + (del.body || []).length + (del.win || []).length;
    if (total) {
      const s4 = h("details", { class: "computed" });
      s4.appendChild(h("summary", { text: "Belge / Gövde / Pencere dinleyicileri (delegasyon adayları — " + total + ")" }));
      const inner = h("div", { style: "margin-top:8px" });
      [["document", del.doc], ["body", del.body], ["window", del.win]].forEach(([name, list]) => {
        (list || []).forEach((l) => inner.appendChild(listenerCard(l, name)));
      });
      s4.appendChild(inner);
      pane.appendChild(s4);
    }
  }

  /* ================= DOSYALAR SEKMESİ ================= */
  async function renderFilesTabLazy() {
    const generation = state.generation;
    // sekme ilk açılışta veri ister
    const pane = $("#tab-files");
    pane.textContent = "";
    pane.appendChild(h("div", { class: "empty-note", text: "Dosyalar yükleniyor…" }));
    try {
      const res = await sendToTab({ type: "cjs:getFiles" });
      if (generation !== state.generation) return;
      if (res && res.ok && res.files) {
        renderFilesTab(res.files);
      } else {
        pane.textContent = "";
        pane.appendChild(h("div", { class: "empty-note", text: "Dosyalar alınamadı." }));
      }
    } catch (e) {
      if (generation !== state.generation) return;
      pane.textContent = "";
      pane.appendChild(h("div", { class: "empty-note", text: String(e.message || e) }));
    }
  }

  function download(name, text) {
    const a = document.createElement("a");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    a.href = URL.createObjectURL(blob);
    a.download = name || "dosya.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function fileRow(entry) {
    const generation = state.generation;
    const body = h("div", { class: "file-body" });
    const pre = h("pre", { text: entry.text != null ? truncate(entry.text, 500000) : "Yükleniyor…" });
    body.appendChild(pre);

    async function ensureText() {
      if (generation !== state.generation) throw new Error("Sekme değişti; dosya listesini yeniden açın.");
      if (entry.text != null) return entry.text;
      // Each external file action explicitly requests only that resource's host.
      const granted = await chrome.permissions.request({ origins: [sitePattern(entry.url)] });
      if (!granted) throw new Error("Bu kaynak için site erişimine izin verilmedi.");
      if (generation !== state.generation) throw new Error("Sekme değişti.");
      const res = await sendToTab({ type: "cjs:getFileText", url: entry.url, kind: entry.kind });
      if (res && res.ok && res.file && res.file.ok) {
        entry.text = res.file.text;
        return entry.text;
      }
      const err = res && res.file && res.file.error ? res.file.error : "indirilemedi";
      throw new Error(err);
    }

    const viewBtn = h("button", {
      class: "btn small",
      text: "Görüntüle",
      onclick: async () => {
        if (body.classList.contains("open")) {
          body.classList.remove("open");
          return;
        }
        body.classList.add("open");
        try {
          const t = await ensureText();
          pre.textContent = truncate(t, 500000);
        } catch (e) {
          pre.textContent = "İçerik alınamadı: " + String(e.message || e);
        }
      },
    });
    const copyBtn = h("button", {
      class: "btn small",
      text: "Kopyala",
      onclick: async () => {
        try {
          const t = await ensureText();
          copyText(t, "Dosya kopyalandı ✓");
        } catch (e) {
          toast("İçerik alınamadı ✗");
        }
      },
    });
    const dlBtn = h("button", {
      class: "btn small",
      text: "İndir",
      onclick: async () => {
        try {
          const t = await ensureText();
          download(entry.name.replace(/[\\/:*?"<>|]/g, "_") || "dosya.txt", t);
        } catch (e) {
          toast("İçerik alınamadı ✗");
        }
      },
    });

    const meta = [];
    if (entry.imported) meta.push("@import");
    if (entry.media) meta.push(entry.media);
    if (entry.rules != null) meta.push(entry.rules + " kural");
    if (entry.type) meta.push(entry.type);
    if (entry.module) meta.push("module");
    if (entry.defer) meta.push("defer");
    if (entry.async) meta.push("async");
    if (entry.readable === false) meta.push("okunamadı");

    const row = h(
      "div",
      { class: "file" },
      h(
        "div",
        { class: "file-head" },
        h("span", {
          class: "file-name" + (entry.url ? "" : " inline"),
          text: entry.url || entry.name,
          title: entry.url || entry.name,
        }),
        h("span", { class: "file-meta", text: meta.join(" · ") }),
        viewBtn,
        copyBtn,
        dlBtn
      ),
      body
    );
    return row;
  }

  function renderFilesTab(files) {
    const pane = $("#tab-files");
    pane.textContent = "";

    const cssSec = h("div", { class: "section" });
    cssSec.appendChild(
      h(
        "div",
        { class: "section-head" },
        h("h2", { text: "CSS Dosyaları" }),
        h("span", { class: "count", text: String((files.css || []).length) })
      )
    );
    if ((files.css || []).length) files.css.forEach((f) => cssSec.appendChild(fileRow(f)));
    else cssSec.appendChild(h("div", { class: "empty-note", text: "CSS dosyası bulunamadı." }));
    pane.appendChild(cssSec);

    const jsSec = h("div", { class: "section" });
    jsSec.appendChild(
      h(
        "div",
        { class: "section-head" },
        h("h2", { text: "JS Dosyaları" }),
        h("span", { class: "count", text: String((files.js || []).length) })
      )
    );
    if ((files.js || []).length) files.js.forEach((f) => jsSec.appendChild(fileRow(f)));
    else jsSec.appendChild(h("div", { class: "empty-note", text: "JS dosyası bulunamadı." }));
    pane.appendChild(jsSec);
  }

  boot();
})();
