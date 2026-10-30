import { getStore } from "@netlify/blobs";

export const BLOODS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
// Only keys that work on the 2-column keypad. 0 is "Clear" so it is never in a code.
export const SAFE_KEYS = "124578";

export const db = () => getStore("fridge2fa");
export const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
export const clean = (s, n = 60) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);
export const digits = (s) => String(s || "").replace(/\D/g, "");
export const cleanUid = (u) => String(u || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase().slice(0, 20);

function same(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export const deviceOk = (req) => same(req.headers.get("x-device-key"), process.env.DEVICE_KEY);
export const adminOk = (req) => same(req.headers.get("x-admin-key"), process.env.ADMIN_KEY || process.env.DEVICE_KEY);

export async function getCards(d) {
  return (await d.get("cards", { type: "json" })) || {};
}
export async function addLog(d, entry) {
  const log = (await d.get("log", { type: "json" })) || [];
  log.unshift({ t: Date.now(), ...entry });
  await d.setJSON("log", log.slice(0, 30));
}
export function makeCode() {
  const r = new Uint32Array(4);
  crypto.getRandomValues(r);
  return [...r].map((n) => SAFE_KEYS[n % SAFE_KEYS.length]).join("");
}
