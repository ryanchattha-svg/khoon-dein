import { store, json, readBody, digits, normUid, authed, log, BG } from "./util.js";

export const config = { path: "/api/register" };

export default async (req) => {
  if (!authed(req)) return json({ error: "unauthorized" }, 401);
  const cards = store("cards");

  if (req.method === "GET") {
    const { blobs } = await cards.list();
    const out = [];
    for (const k of blobs) out.push(await cards.get(k.key, { type: "json" }));
    return json({ cards: out.filter(Boolean) });
  }
  if (req.method === "DELETE") {
    const uid = normUid(new URL(req.url).searchParams.get("uid"));
    await cards.delete(uid); await store("codes").delete(uid);
    await log("card_removed", { uid });
    return json({ ok: true });
  }
  if (req.method === "POST") {
    const b = await readBody(req);
    const uid = normUid(b.uid), cnic = digits(b.cnic), mobile = digits(b.mobile), group = String(b.bloodGroup || "").toUpperCase();
    if (uid.length < 8 || !String(b.name || "").trim() || cnic.length !== 13 || mobile.length < 10 || !BG.includes(group))
      return json({ error: "Invalid fields" }, 400);
    const card = { uid, name: b.name.trim(), cnic, mobile, bloodGroup: group, registeredAt: new Date().toISOString() };
    await cards.setJSON(uid, card);
    await log("card_registered", { uid, name: card.name });
    return json({ ok: true, card });
  }
  return json({ error: "Method not allowed" }, 405);
};
