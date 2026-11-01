import { store, json, readBody, authed, takeBags, log, BG } from "./util.js";
import { randomUUID } from "node:crypto";

export const config = { path: "/api/inventory" };
const iso = (d) => d.toISOString().slice(0, 10);

export default async (req) => {
  if (!authed(req)) return json({ error: "unauthorized" }, 401);
  const inv = store("inventory"), tr = store("transfers");
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (url.searchParams.get("view") === "transfers") {
      const { blobs } = await tr.list(); const out = [];
      for (const k of blobs) out.push(await tr.get(k.key, { type: "json" }));
      return json({ transfers: out.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    }
    const today = iso(new Date()), soon = iso(new Date(Date.now() + 7 * 864e5));
    const { blobs } = await inv.list(); const hospitals = [];
    for (const k of blobs) {
      const h = await inv.get(k.key, { type: "json" }); if (!h) continue;
      const counts = Object.fromEntries(BG.map((g) => [g, { total: 0, expiringSoon: 0, expired: 0 }]));
      for (const b of h.bags) {
        const c = counts[b.group]; if (!c) continue;
        if (b.expires < today) c.expired++; else { c.total++; if (b.expires <= soon) c.expiringSoon++; }
      }
      hospitals.push({ id: h.id, name: h.name, counts, bags: h.bags.sort((a, b) => a.expires.localeCompare(b.expires)) });
    }
    return json({ hospitals });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const b = await readBody(req);

  if (b.action === "add_bags") {
    const group = String(b.group || "").toUpperCase(), units = Math.min(parseInt(b.units) || 0, 100);
    if (!b.hospitalId || !BG.includes(group) || units < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(b.expires || ""))
      return json({ error: "Invalid fields" }, 400);
    const h = (await inv.get(b.hospitalId, { type: "json" })) || { id: b.hospitalId, name: b.name || b.hospitalId, bags: [] };
    for (let i = 0; i < units; i++) h.bags.push({ id: randomUUID().slice(0, 8), group, expires: b.expires, added: iso(new Date()) });
    await inv.setJSON(h.id, h);
    await log("stock_added", { hospitalId: h.id, group, units });
    return json({ ok: true });
  }

  if (b.action === "transfer_request") {
    const group = String(b.group || "").toUpperCase(), units = parseInt(b.units) || 0;
    if (!b.from || !b.to || b.from === b.to || !BG.includes(group) || units < 1) return json({ error: "Invalid fields" }, 400);
    const t = { id: randomUUID().slice(0, 8), from: b.from, to: b.to, group, units, note: b.note || "", status: "pending", createdAt: new Date().toISOString() };
    await tr.setJSON(t.id, t);
    await log("transfer_requested", t);
    return json({ ok: true, transfer: t });
  }

  if (b.action === "transfer_resolve") {
    const t = await tr.get(String(b.id), { type: "json" });
    if (!t || t.status !== "pending") return json({ error: "Not pending" }, 404);
    if (!b.approve) { t.status = "rejected"; }
    else {
      const bags = await takeBags(t.from, t.group, t.units);
      if (bags.length < t.units) {
        // not enough stock: put back what was taken
        const src = await inv.get(t.from, { type: "json" }); src.bags.push(...bags); await inv.setJSON(t.from, src);
        return json({ error: `Only ${bags.length} unexpired unit(s) available` }, 409);
      }
      const dst = (await inv.get(t.to, { type: "json" })) || { id: t.to, name: t.to, bags: [] };
      dst.bags.push(...bags); await inv.setJSON(t.to, dst);
      t.status = "completed";
    }
    t.resolvedAt = new Date().toISOString();
    await tr.setJSON(t.id, t); await log("transfer_" + t.status, { id: t.id });
    return json({ ok: true, transfer: t });
  }
  return json({ error: "Unknown action" }, 400);
};
