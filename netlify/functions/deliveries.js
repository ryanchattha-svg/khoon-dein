import { store, json, readBody, digits, authed, log, BG } from "./util.js";
import { randomUUID } from "node:crypto";

export const config = { path: "/api/deliveries" };
const STATUSES = ["requested", "dispatched", "in_transit", "delivered", "cancelled"];

export default async (req) => {
  const dl = store("deliveries"), url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("id");
    if (id) { // public tracking by tracking id
      const d = await dl.get(id, { type: "json" });
      return d ? json({ id: d.id, status: d.status, group: d.group, units: d.units, urgent: d.urgent, updatedAt: d.updatedAt }) : json({ error: "Not found" }, 404);
    }
    if (!authed(req)) return json({ error: "unauthorized" }, 401);
    const { blobs } = await dl.list(); const out = [];
    for (const k of blobs) out.push(await dl.get(k.key, { type: "json" }));
    const rank = (d) => (d.urgent ? 0 : 1);
    return json({ deliveries: out.filter(Boolean).sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt)) });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const b = await readBody(req);

  if (b.action === "status") { // staff dispatch pipeline
    if (!authed(req)) return json({ error: "unauthorized" }, 401);
    const d = await dl.get(String(b.id), { type: "json" });
    if (!d || !STATUSES.includes(b.status)) return json({ error: "Invalid" }, 400);
    d.status = b.status; d.updatedAt = new Date().toISOString();
    await dl.setJSON(d.id, d); await log("delivery_" + d.status, { id: d.id });
    return json({ ok: true });
  }

  // public: create request
  const group = String(b.bloodGroup || "").toUpperCase(), units = parseInt(b.units) || 0;
  if (!String(b.name || "").trim() || digits(b.mobile).length < 10 || digits(b.cnic).length !== 13 ||
      !BG.includes(group) || units < 1 || units > 10 || String(b.address || "").trim().length < 8)
    return json({ error: "Invalid fields" }, 400);
  const now = new Date().toISOString();
  const d = { id: randomUUID().slice(0, 8).toUpperCase(), name: b.name.trim(), cnic: digits(b.cnic), mobile: digits(b.mobile),
    group, units, address: b.address.trim(), urgent: !!b.urgent, status: "requested", createdAt: now, updatedAt: now };
  await dl.setJSON(d.id, d); await log("delivery_requested", { id: d.id, urgent: d.urgent, group });
  return json({ ok: true, trackingId: d.id });
};
