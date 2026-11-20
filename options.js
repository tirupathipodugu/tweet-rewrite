const $ = id => document.getElementById(id);

chrome.storage.sync.get(["tones"]).then(({ tones }) => {
  $("tones").value = (tones || []).join(", ");
});

$("save").onclick = async () => {
  const tones = $("tones").value.split(",").map(s => s.trim()).filter(Boolean);
  await chrome.storage.sync.set({ tones });
  $("status").textContent = "Saved ✓";
  setTimeout(() => ($("status").textContent = ""), 1500);
};
