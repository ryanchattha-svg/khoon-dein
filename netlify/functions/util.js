import { getStore } from "@netlify/blobs";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";

export const store = (name) => getStore({ name, consistency: "strong" });
export const BG = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
export const SAFE_DIGITS = [1, 2, 4, 5, 7, 8]; // keypad columns 3 & 4 are dead
export const PIN_TTL_MS = 10 * 60 * 1000;
export const MAX_TRIES = 3;

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
export const readBody = async (req) => { try { return await req.json(); } catch { return {}; } };
export const digits = (s) => String(s ?? "").replace(/\D/g, "");
export const normUid = (s) => String(s ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
export const normName = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// DEVICE_KEY guards the ESP32 and all admin/staff endpoints.
export function authed(req) {
  const key = process.env.DEVICE_KEY;
  if (!key) return false;
  const got = req.headers.get("x-device-key") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const genPin = () =>
  Array.from({ length: 4 }, () => SAFE_DIGITS[randomInt(SAFE_DIGITS.length)]).join("");

export async function log(event, data = {}) {
  const ts = Date.now();
  await store("logs").setJSON(`${String(ts).padStart(13, "0")}-${randomUUID().slice(0, 6)}`, { ts, event, ...data });
}

export const LEADS = [
  { uid: "04C96696DE2A81", name: "Muhammad Ryan Chattha", cnic: "3840391406461", mobile: "03285130730", bloodGroup: "B+", role: "Lead Developer" },
  { uid: "04B96896DE2A81", name: "Usman Hussain Shah", cnic: "3730128426687", mobile: "03329649832", bloodGroup: "B+", role: "Project Partner / Hardware Lead" },
];

export async function ensureSeed() {
  const cards = store("cards");
  for (const l of LEADS) {
    if (!(await cards.get(l.uid))) await cards.setJSON(l.uid, { ...l, registeredAt: new Date().toISOString() });
  }
}

export async function findCardByCnic(cnic) {
  const cards = store("cards");
  const { blobs } = await cards.list();
  for (const b of blobs) {
    const c = await cards.get(b.key, { type: "json" });
    if (c && c.cnic === cnic) return c;
  }
  return null;
}

// Remove up to n unexpired bags of a group from a hospital, earliest expiry first.
export async function takeBags(hospitalId, group, n = 1) {
  const inv = store("inventory");
  const h = await inv.get(hospitalId, { type: "json" });
  if (!h) return [];
  const today = new Date().toISOString().slice(0, 10);
  const picked = h.bags.filter((b) => b.group === group && b.expires >= today)
    .sort((a, b) => a.expires.localeCompare(b.expires)).slice(0, n);
  const ids = new Set(picked.map((b) => b.id));
  h.bags = h.bags.filter((b) => !ids.has(b.id));
  await inv.setJSON(hospitalId, h);
  return picked;
}
