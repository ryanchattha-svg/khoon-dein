// Admin only: list (GET), add/update (POST), remove (DELETE ?uid=) NFC cards.
import { db, json, clean, digits, cleanUid, adminOk, getCards, BLOODS } from "./lib/util.js";

export default async (req) => {
  if (!adminOk(req)) return json({ error: "Wrong admin key." }, 401);
  const d = db();
  const cards = await getCards(d);

  if (req.method === "GET") {
    const lastUnknown = await d.get("lastunknown", { type: "json" });
    const log = (await d.get("log", { type: "json" })) || [];
    return json({ cards: Object.values(cards), lastUnknown, log });
  }
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const uid = cleanUid(b.uid);
    const name = clean(b.name);
    const cnic = digits(b.cnic);
    const phone = digits(b.phone);
    if (uid.length < 8) return json({ error: "UID must be at least 8 hex characters." }, 400);
    if (name.length < 3) return json({ error: "Enter the full name." }, 400);
    if (cnic.length !== 13) return json({ error: "CNIC must be 13 digits." }, 400);
    if (!/^03\d{9}$/.test(phone)) return json({ error: "Phone must look like 03001234567." }, 400);
    if (!BLOODS.includes(b.blood)) return json({ error: "Choose a blood group." }, 400);
    cards[uid] = { uid, name, cnic, phone, blood: b.blood, added: Date.now() };
    await d.setJSON("cards", cards);
    return json({ ok: true });
  }
  if (req.method === "DELETE") {
    const uid = cleanUid(new URL(req.url).searchParams.get("uid"));
    if (!cards[uid]) return json({ error: "Card not found." }, 404);
    delete cards[uid];
    await d.setJSON("cards", cards);
    await d.delete("code:" + uid);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
};
