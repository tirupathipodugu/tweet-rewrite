// Runs in the page's JS world. Replaces the text of the composer marked data-tr-target
// with a real-looking paste, which X's Draft.js editor accepts with line breaks intact.
document.addEventListener("tr-set-draft", async e => {
  const text = String(e.detail ?? "");
  const editor = document.querySelector("[data-tr-target]");
  if (!editor) return;
  editor.focus();
  document.execCommand("selectAll");
  await new Promise(r => setTimeout(r, 50));
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  const notHandled = editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  if (notHandled) document.execCommand("insertText", false, text);
});
