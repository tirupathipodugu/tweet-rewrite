const $ = id => document.getElementById(id);

chrome.storage.sync.get(["mode", "apiKey", "model", "tones"]).then(({ mode, apiKey, model, tones }) => {
  $("mode").value = mode || "grok";
  $("apiKey").value = apiKey || "";
  $("model").value = model || "claude-opus-5-5";
  $("tones").value = (tones || []).join(", ");
});

$("save").onclick = async () => {
  const tones = $("tones").value.split(",").map(s => s.trim()).filter(Boolean);
  await chrome.storage.sync.set({ mode: $("mode").value, apiKey: $("apiKey").value.trim(), model: $("model").value, tones });
  $("status").textContent = "Saved ✓";
  setTimeout(() => ($("status").textContent = ""), 1500);
};
