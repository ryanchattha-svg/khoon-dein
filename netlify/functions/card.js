// Called by the ESP32 when a card is tapped: is this card on the whitelist?
import { db, json, cleanUid, deviceOk, getCards } from "./lib/util.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!deviceOk(req)) return json({ ok: false, error: "bad device key" }, 401);
  const b = await req.json().catch(() => ({}));
  const uid = cleanUid(b.uid);
  if (uid.length < 8) return json({ ok: false, error: "bad uid" }, 400);

  const d = db();
  const card = (await getCards(d))[uid];
  if (!card) {
    await d.setJSON("lastunknown", { uid, at: Date.now() });   // shown in the admin panel
    return json({ ok: true, known: false });
  }
  return json({ ok: true, known: true, name: card.name });
};
