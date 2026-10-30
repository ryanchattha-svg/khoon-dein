// Called by the ESP32: is this 4-digit code valid for the tapped card?
import { db, json, cleanUid, digits, deviceOk, getCards, addLog } from "./lib/util.js";

const MAX_TRIES = 5;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!deviceOk(req)) return json({ ok: false, error: "bad device key" }, 401);
  const b = await req.json().catch(() => ({}));
  const uid = cleanUid(b.uid);
  const code = digits(b.code).slice(0, 4);

  const d = db();
  const card = (await getCards(d))[uid];
  if (!card) return json({ ok: false, reason: "card" });

  const key = "code:" + uid;
  const rec = await d.get(key, { type: "json" });
  if (!rec) return json({ ok: false, reason: "none" });
  if (rec.exp < Date.now()) {
    await d.delete(key);
    return json({ ok: false, reason: "expired" });
  }
  if (rec.code !== code) {
    rec.tries = (rec.tries || 0) + 1;
    if (rec.tries >= MAX_TRIES) {
      await d.delete(key);
      await addLog(d, { uid, name: card.name, result: "code cancelled after wrong tries" });
      return json({ ok: false, reason: "locked" });
    }
    await d.setJSON(key, rec);
    return json({ ok: false, reason: "wrong", left: MAX_TRIES - rec.tries });
  }
  await d.delete(key);                                          // single use
  await addLog(d, { uid, name: card.name, result: "door opened" });
  return json({ ok: true, name: card.name });
};
