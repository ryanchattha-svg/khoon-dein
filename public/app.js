const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BG = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
async function api(path, opts = {}, auth = false) {
  const headers = { "content-type": "application/json" };
  if (auth) headers["x-device-key"] = sessionStorage.getItem("key") || "";
  const r = await fetch(path, { ...opts, headers });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Error " + r.status);
  return d;
}
const post = (path, body, auth) => api(path, { method: "POST", body: JSON.stringify(body) }, auth);
const form = (id) => Object.fromEntries(new FormData($(id)).entries());
function say(el, text, ok) { el.textContent = text; el.className = "msg " + (ok ? "ok" : "err"); }
function bgOptions() { return BG.map((g) => `<option>${g}</option>`).join(""); }
function keyBox() {
  const k = $("#key"); if (!k) return;
  k.value = sessionStorage.getItem("key") || "";
  k.addEventListener("change", () => { sessionStorage.setItem("key", k.value); if (window.onKey) window.onKey(); });
}
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("select.bg").forEach((s) => (s.innerHTML = bgOptions()));
  keyBox(); if (window.onKey && sessionStorage.getItem("key")) window.onKey();
});
