import { store, json, readBody, digits, authed, log } from "./util.js";
import { randomBytes } from "node:crypto";

export const config = { path: "/api/vouchers" };

// Demo rewards catalog (simulated vouchers, PKR).
const CATALOG = [
  { id: "kfc-zinger", brand: "KFC", logo: "/logos/kfc.svg", color: "#e4002b", title: "Zinger Burger", value: 800 },
  { id: "kfc-meal", brand: "KFC", logo: "/logos/kfc.svg", color: "#e4002b", title: "Mighty Zinger Meal", value: 1400 },
  { id: "mcd-bigmac", brand: "McDonald's", logo: "/logos/mcdonalds.svg", color: "#da291c", title: "Big Mac Meal", value: 1300 },
  { id: "mcd-mcflurry", brand: "McDonald's", logo: "/logos/mcdonalds.svg", color: "#da291c", title: "McFlurry + Fries", value: 600 },
  { id: "chz-medium", brand: "Cheezious", logo: "/logos/cheezious.png", color: "#f7a600", title: "Medium Pizza", value: 1500 },
  { id: "chz-crown", brand: "Cheezious", logo: "/logos/cheezious.png", color: "#f7a600", title: "Crown Crust Large", value: 2200 },
  { id: "rx-1000", brand: "Pharmacy", logo: "/logos/pharmacy.svg", color: "#0a8f4e", title: "Medicine Voucher", value: 1000 },
  { id: "rx-2500", brand: "Pharmacy", logo: "/logos/pharmacy.svg", color: "#0a8f4e", title: "Medicine Voucher", value: 2500 },
];
const VALID_DAYS = 30;
const PREFIX = { KFC: "KFC", "McDonald's": "MCD", Cheezious: "CHZ", Pharmacy: "RX" };
const newCode = (brand) => `BP-${PREFIX[brand]}-${randomBytes(3).toString("hex").toUpperCase()}`;

const status = (v) => (v.redeemedAt ? "redeemed" : Date.now() > v.expiresAt ? "expired" : "active");
const view = (v) => ({ code: v.code, brand: v.brand, logo: v.logo, color: v.color, title: v.title, value: v.value,
  claimedAt: v.claimedAt, expiresAt: v.expiresAt, redeemedAt: v.redeemedAt || null, status: status(v) });

export default async (req) => {
  if (req.method === "GET") return json({ catalog: CATALOG });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const b = await readBody(req), donors = store("donors"), vs = store("vouchers");

  // Merchant: look up / redeem a code.
  if (b.action === "check" || b.action === "redeem") {
    const code = String(b.code || "").trim().toUpperCase();
    const v = code && (await vs.get(code, { type: "json" }));
    if (!v) return json({ error: "Invalid voucher code" }, 404);
    if (b.action === "check") return json({ voucher: view(v) });
    const s = status(v);
    if (s !== "active") return json({ error: `Voucher already ${s}`, voucher: view(v) }, 409);
    v.redeemedAt = Date.now(); v.merchant = String(b.merchant || "").slice(0, 60);
    await vs.setJSON(code, v);
    await log("voucher_redeemed", { id: code, name: v.brand });
    return json({ ok: true, voucher: view(v) });
  }

  const cnic = digits(b.cnic);
  if (cnic.length !== 13) return json({ error: "CNIC must be 13 digits" }, 400);
  const donor = await donors.get(cnic, { type: "json" });

  // Staff: grant credit manually.
  if (b.action === "grant") {
    if (!authed(req)) return json({ error: "unauthorized" }, 401);
    if (!donor) return json({ error: "Donor not found" }, 404);
    const amount = parseInt(b.amount) || 0;
    if (amount < 1 || amount > 50000) return json({ error: "Amount must be 1–50,000" }, 400);
    donor.credits = (donor.credits || 0) + amount;
    (donor.creditLog ||= []).push({ ts: Date.now(), amount, reason: String(b.reason || "Bonus from staff").slice(0, 80) });
    await donors.setJSON(cnic, donor);
    await log("credit_granted", { name: donor.name, amount });
    return json({ ok: true, credits: donor.credits });
  }

  if (!donor || digits(donor.mobile) !== digits(b.mobile)) return json({ error: "Donor not found or mobile mismatch" }, 403);

  if (b.action === "wallet") {
    const mine = [];
    for (const code of donor.vouchers || []) { const v = await vs.get(code, { type: "json" }); if (v) mine.push(view(v)); }
    return json({ name: donor.name, credits: donor.credits || 0, donations: (donor.donations || []).length,
      creditLog: (donor.creditLog || []).slice(-10).reverse(), vouchers: mine.reverse() });
  }

  if (b.action === "claim") {
    const item = CATALOG.find((c) => c.id === b.itemId);
    if (!item) return json({ error: "Unknown voucher" }, 400);
    const bal = donor.credits || 0;
    if (bal < item.value) return json({ error: `Not enough credit (need PKR ${item.value}, have PKR ${bal})` }, 402);
    const now = Date.now();
    const v = { code: newCode(item.brand), itemId: item.id, brand: item.brand, logo: item.logo, color: item.color, title: item.title,
      value: item.value, cnic, claimedAt: now, expiresAt: now + VALID_DAYS * 864e5 };
    await vs.setJSON(v.code, v);
    donor.credits = bal - item.value;
    (donor.vouchers ||= []).push(v.code);
    (donor.creditLog ||= []).push({ ts: now, amount: -item.value, reason: `${item.brand} — ${item.title}` });
    await donors.setJSON(cnic, donor);
    await log("voucher_claimed", { id: v.code, name: donor.name });
    return json({ ok: true, voucher: view(v), credits: donor.credits });
  }
  return json({ error: "Unknown action" }, 400);
};
