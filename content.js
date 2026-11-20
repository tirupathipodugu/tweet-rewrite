// Tweet Rewrite: adds a "Rewrite" button to every X composer toolbar.
// - Click Rewrite        → fix spelling & grammar (3 versions)
// - Hover Rewrite        → pick a mood → 3 versions in that mood
// Versions appear right below the post box; click one to replace the draft.
// Engine "grok" (default): X's own Grok, driven through a hidden Private Chat (not saved to history).
// Engine "claude": Claude API with the key from Settings.
(() => {
  const BTN_CLASS = "tr-rewrite-btn";
  const POST_CLASS = "tr-post-btn";
  const FIX = "Fix grammar";
  const DEFAULT_TONES = ["Professional", "Casual", "Witty", "Bold", "Friendly", "Concise"];
  const COUNT = 3;
  let busy = false;
  let lastEditor = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, timeout = 8000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(150);
    }
    return null;
  }
  const getSettings = () => chrome.storage.sync.get(["mode", "tones"]);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function findEditor(toolbar) {
    let node = toolbar;
    for (let i = 0; i < 15 && node; i++) {
      const eds = node.querySelectorAll('[data-testid^="tweetTextarea_"][contenteditable="true"]');
      if (eds.length) return eds[eds.length - 1];
      node = node.parentElement;
    }
    return null;
  }

  // Runs in the page's own JS world (mainworld.js) so X's editor keeps line breaks.
  async function setDraft(editor, text) {
    document.querySelectorAll("[data-tr-target]").forEach(e => e.removeAttribute("data-tr-target"));
    editor.setAttribute("data-tr-target", "1");
    document.dispatchEvent(new CustomEvent("tr-set-draft", { detail: text }));
    await sleep(100);
  }

  // ---------- Prompt ----------
  function buildPrompt(draft, mood) {
    const task = mood === FIX
      ? `Give ${COUNT} versions. Version 1: only spelling, grammar and punctuation fixed, same wording and tone. ` +
        `Versions 2-${COUNT}: lightly polished for clarity, same tone and meaning.`
      : `Give ${COUNT} different rewrites in a ${mood} tone, all with spelling and grammar fixed. Make them clearly different from each other.`;
    return (
      "Rewrite my X post draft.\n" + task + "\n" +
      "Return ONLY one ```json code block with an array of objects {\"label\": string, \"text\": string} " +
      "(label = 2-4 word description of that version).\n" +
      "Keep my formatting: every line break and blank line in the draft must stay in each text (use \\n). " +
      "Keep my meaning, links, @handles and #hashtags. " +
      `Max ${Math.max(280, draft.length)} characters each. Sound like a real person: no corporate filler, no em dashes, ` +
      "no new hashtags or emojis.\n\nDraft:\n" + draft
    );
  }

  // ---------- Grok engine (hidden private chat) ----------
  function parseVersions(root) {
    const codes = [...root.querySelectorAll('[data-testid="markdown-code-block"] code')];
    for (const c of codes) {
      try {
        const arr = JSON.parse(c.textContent);
        if (Array.isArray(arr)) {
          const v = arr.filter(x => x && typeof x.text === "string" && x.text.trim())
                       .map((x, i) => ({ label: String(x.label || x.tone || `Version ${i + 1}`), text: x.text.trim() }));
          if (v.length) return v;
        }
      } catch {}
    }
    return codes.map((c, i) => ({ label: `Version ${i + 1}`, text: c.textContent.trim() })).filter(v => v.text);
  }

  async function grokVersions(draft, mood) {
    const grokBtn = await waitFor(() => document.querySelector('[data-testid="GrokDrawerHeader"]'), 3000);
    if (!grokBtn) throw new Error("Grok isn't available on this page. Open x.com/home and try again.");
    const D = () => document.querySelector('[data-testid="GrokDrawer"]');
    const q = sel => D()?.querySelector(sel);

    document.documentElement.classList.add("tr-grok-busy"); // hide the Grok box while we use it
    const wasOpen = !!q("textarea");
    try {
      if (!wasOpen) {
        grokBtn.click();
        if (!await waitFor(() => q("textarea"))) throw new Error("Grok didn't open. Click X's Grok button once by hand (accept any prompt), then try again.");
      }
      q('button[aria-label="New Chat"]')?.click();
      const priv = await waitFor(() => q('button[aria-label="Private Chat"]'), 4000);
      if (!priv) throw new Error("Couldn't switch Grok to Private Chat, so nothing was sent.");
      priv.click();
      if (!await waitFor(() => /won.t appear in your history/i.test(D()?.innerText || ""), 4000))
        throw new Error("Couldn't confirm Grok Private Chat, so nothing was sent.");

      const ta = q("textarea");
      ta.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, buildPrompt(draft, mood));
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      const send = await waitFor(() => { const b = q('button[aria-label="Grok something"]'); return b && !b.disabled ? b : null; }, 4000);
      if (!send) throw new Error("Couldn't find Grok's send button.");
      send.click();

      if (!await waitFor(() => q('button[aria-label="Copy text"]'), 90000)) throw new Error("Grok took too long. Try again.");
      await sleep(300);
      const v = parseVersions(D());
      if (!v.length) throw new Error("Grok's answer had no versions. Try again.");
      return v;
    } finally {
      q('button[aria-label="New Chat"]')?.click(); // discard the private chat
      if (!wasOpen) { await sleep(200); q('button[aria-label="Collapse"]')?.click(); await sleep(300); }
      document.documentElement.classList.remove("tr-grok-busy");
    }
  }

  // ---------- Claude engine ----------
  async function claudeVersions(draft, mood) {
    const resp = await chrome.runtime.sendMessage({ type: "rewrite", draft, mood, count: COUNT, fix: mood === FIX });
    if (!resp?.ok) throw new Error(resp?.error || "Unknown error");
    return resp.result.variants.map(v => ({ label: v.label, text: v.text }));
  }

  // ---------- Inline results under the post box ----------
  function resultsBox(toolbar) {
    let box = toolbar.parentElement.querySelector(":scope > .tr-inline");
    if (!box) {
      box = el("div", "tr-inline");
      toolbar.after(box);
    }
    box.replaceChildren();
    return box;
  }

  function boxHeader(box, title) {
    const h = el("div", "tr-inline-head");
    h.append(el("span", null, title));
    const x = el("button", "tr-close", "✕");
    x.type = "button";
    x.title = "Close";
    x.onclick = () => box.remove();
    h.append(x);
    box.append(h);
  }

  async function run(btn, toolbar, mood) {
    if (busy) return;
    closeMoods();
    const editor = findEditor(toolbar);
    const draft = editor?.innerText.trim();
    const box = resultsBox(toolbar);
    if (!draft) { boxHeader(box, "Write a draft first."); return; }
    lastEditor = editor;
    busy = true;
    btn.disabled = true;
    btn.textContent = "Rewriting…";
    boxHeader(box, mood === FIX ? "Fixing grammar…" : `Rewriting as ${mood}…`);
    box.append(el("div", "tr-loading"));
    try {
      const { mode } = await getSettings();
      const versions = mode === "claude" ? await claudeVersions(draft, mood) : await grokVersions(draft, mood);
      box.replaceChildren();
      boxHeader(box, mood === FIX ? "Pick a version" : `${mood} — pick a version`);
      versions.slice(0, COUNT).forEach(v => {
        const c = el("button", "tr-card");
        c.type = "button";
        c.append(el("div", "tr-label", `${v.label} · ${v.text.length}`), el("div", "tr-text", v.text));
        c.onclick = async () => { await setDraft(editor, v.text); box.remove(); };
        box.append(c);
      });
    } catch (e) {
      box.replaceChildren();
      boxHeader(box, "Rewrite failed");
      box.append(el("div", "tr-err", e.message));
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = "Rewrite";
    }
  }

  // ---------- Mood menu on hover ----------
  let moodsMenu = null, hideTimer = null;
  function closeMoods() { clearTimeout(hideTimer); moodsMenu?.remove(); moodsMenu = null; }
  function scheduleClose() { clearTimeout(hideTimer); hideTimer = setTimeout(closeMoods, 250); }

  async function openMoods(btn, toolbar) {
    if (busy) return;
    clearTimeout(hideTimer);
    if (moodsMenu && moodsMenu.__btn === btn) return;
    closeMoods();
    const { tones } = await getSettings();
    const moods = [FIX, ...(tones && tones.length ? tones : DEFAULT_TONES)];
    const m = el("div", "tr-moods");
    m.__btn = btn;
    moods.forEach(name => {
      const chip = el("button", "tr-mood" + (name === FIX ? " tr-mood-fix" : ""), name);
      chip.type = "button";
      chip.onclick = e => { e.preventDefault(); e.stopPropagation(); run(btn, toolbar, name); };
      m.append(chip);
    });
    m.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    m.addEventListener("mouseleave", scheduleClose);
    document.body.append(m);
    const r = btn.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + "px";
    m.style.top = (r.bottom + 6 + mh < window.innerHeight ? r.bottom + 6 : r.top - mh - 6) + "px";
    moodsMenu = m;
  }

  function injectRewriteButtons() {
    document.querySelectorAll('[data-testid="toolBar"]').forEach(toolbar => {
      if (toolbar.querySelector("." + BTN_CLASS)) return;
      if (toolbar.closest('[data-testid="GrokDrawer"]')) return;
      const btn = el("button", BTN_CLASS, "Rewrite");
      btn.type = "button";
      btn.title = "Click: fix grammar · Hover: pick a mood";
      btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); run(btn, toolbar, FIX); });
      btn.addEventListener("mouseenter", () => openMoods(btn, toolbar));
      btn.addEventListener("mouseleave", scheduleClose);
      const icons = toolbar.querySelector('[data-testid="ScrollSnap-List"]') || toolbar.querySelector('[role="tablist"]');
      const row = icons?.closest('[data-testid="toolBar"] > div') || toolbar.firstElementChild;
      if (row && row.parentElement === toolbar) row.after(btn);
      else toolbar.prepend(btn);
    });
  }

  // ---------- Small "Post this" icon next to Share in normal Grok chats ----------
  const POST_PATH = "M23 3c-6.62-.1-10.38 2.42-13.05 6.03C7.29 12.61 6 17.33 6 22h2c0-1.01.07-2.01.19-3H12c4.15 0 7.16-2.25 8.7-5.4l.38-.79-1.07-.53C21.1 11.38 22 9.69 22 8V4.6L23 3zM12 17H8.6c.34-1.37.82-2.69 1.48-3.89l.06-.11H16v-2h-4.6c2.04-2.34 4.97-3.84 8.6-3.99V8c0 1.44-.89 2.81-2.09 3.32l-.89.38.38.88C18.53 15.06 16.11 17 12 17z";
  const inGrok = node => location.pathname.startsWith("/i/grok") || !!node.closest('[data-testid="GrokDrawer"]');

  function replyFor(shareBtn) {
    let n = shareBtn;
    for (let i = 0; i < 15 && n; i++) {
      if (n.innerText && n.innerText.trim()) return n;
      n = n.parentElement;
    }
    return null;
  }

  function cleanText(node) {
    const c = node.cloneNode(true);
    c.querySelectorAll("button, svg").forEach(x => x.remove());
    const host = el("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:600px";
    host.append(c);
    document.body.append(host);
    const t = c.innerText.trim();
    host.remove();
    return t;
  }

  async function postText(text) {
    if (lastEditor && lastEditor.isConnected) {
      lastEditor.scrollIntoView({ block: "center", behavior: "smooth" });
      return setDraft(lastEditor, text);
    }
    document.querySelector('[data-testid="SideNav_NewTweet_Button"]')?.click();
    const ed = await waitFor(() => document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"][contenteditable="true"]'));
    if (ed) { lastEditor = ed; return setDraft(ed, text); }
    location.href = "https://x.com/intent/post?text=" + encodeURIComponent(text);
  }

  let iconPanel = null;
  function injectPostIcons() {
    if (document.documentElement.classList.contains("tr-grok-busy")) return;
    document.querySelectorAll('button[aria-label="Share"]').forEach(share => {
      if (!inGrok(share) || share.nextElementSibling?.classList.contains(POST_CLASS)) return;
      const icon = share.cloneNode(true);
      icon.classList.add(POST_CLASS);
      icon.setAttribute("aria-label", "Post this");
      icon.title = "Put this text in the post box";
      icon.querySelector("svg path")?.setAttribute("d", POST_PATH);
      icon.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        const reply = replyFor(share);
        if (!reply) return;
        const codes = [...reply.querySelectorAll('[data-testid="markdown-code-block"] code')].map(c => c.textContent.trim()).filter(Boolean);
        const versions = codes.length ? codes : [cleanText(reply)];
        if (versions.length === 1) return void postText(versions[0]);
        iconPanel?.remove();
        iconPanel = el("div", "tr-panel");
        const r = icon.getBoundingClientRect();
        iconPanel.style.right = Math.max(8, window.innerWidth - r.right) + "px";
        iconPanel.style.bottom = (window.innerHeight - r.top + 8) + "px";
        const h = el("div", "tr-inline-head");
        const x = el("button", "tr-close", "✕");
        x.onclick = () => { iconPanel.remove(); iconPanel = null; };
        h.append(el("span", null, "Post which version?"), x);
        iconPanel.append(h);
        versions.forEach((t, i) => {
          const c = el("button", "tr-card");
          c.append(el("div", "tr-label", `Version ${i + 1} · ${t.length}`), el("div", "tr-text", t));
          c.onclick = () => { iconPanel.remove(); iconPanel = null; postText(t); };
          iconPanel.append(c);
        });
        document.body.append(iconPanel);
      });
      share.after(icon);
    });
  }

  // Match X's own light/dark theme (it doesn't follow the OS setting).
  function syncTheme() {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    const dark = m && (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3 < 128;
    document.documentElement.classList.toggle("tr-dark", !!dark);
  }

  function inject() { syncTheme(); injectRewriteButtons(); injectPostIcons(); }
  new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
  inject();
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeMoods(); iconPanel?.remove(); iconPanel = null; } });
})();
