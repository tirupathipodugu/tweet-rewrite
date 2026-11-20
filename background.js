// Claude engine: returns `count` versions of the draft, either grammar fixes or rewrites in a mood.
const DEFAULT_MODEL = "claude-opus-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, text: { type: "string" } },
        required: ["label", "text"],
        additionalProperties: false
      }
    }
  },
  required: ["variants"],
  additionalProperties: false
};

async function rewrite(draft, mood, count, fix) {
  const { apiKey, model } = await chrome.storage.sync.get(["apiKey", "model"]);
  if (!apiKey) throw new Error("No API key set. Open the extension's Settings and paste your Anthropic API key.");
  const limit = Math.max(280, draft.length);

  const system =
    "You rewrite drafts of posts for X (Twitter). Keep the author's meaning, facts, links, @handles and #hashtags. " +
    "Fix every spelling and grammar mistake. Sound like a real person, not a brand: no corporate filler, no em dashes, " +
    `no added hashtags or emojis unless the draft already uses them. Each version must be at most ${limit} characters. ` +
    "Keep every line break and blank line from the draft.";

  const task = fix
    ? `Give ${count} versions. Version 1: only spelling, grammar and punctuation fixed, same wording and tone. ` +
      `The rest: lightly polished for clarity, same tone and meaning.`
    : `Give ${count} clearly different rewrites in a ${mood} tone.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 16000,
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system,
      messages: [{
        role: "user",
        content: `Draft:\n"""\n${draft}\n"""\n\n${task} Return them in \`variants\`; label = 2-4 word description of each.`
      }]
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) throw new Error("Invalid API key. Check it in Settings.");
    if (res.status === 429) throw new Error("Rate limited. Try again in a few seconds.");
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  if (data.stop_reason === "refusal") throw new Error("Claude declined to rewrite this draft.");
  if (data.stop_reason === "max_tokens") throw new Error("Response was cut off. Try a shorter draft.");
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return JSON.parse(text);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "rewrite") return;
  rewrite(msg.draft, msg.mood, msg.count || 3, !!msg.fix)
    .then(result => sendResponse({ ok: true, result }))
    .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
  return true;
});
