import { store, json, readBody, normUid, authed, log, MAX_TRIES, takeBags } from "./util.js";

export const config = { path: "/api/verify" };
const deny = (extra = {}) => json({ ok: false, success: false, ...extra });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!authed(req)) return json({ ok: false, success: false, error: "unauthorized" }, 401);

  const b = await readBody(req);
  const uid = normUid(b.uid), code = String(b.code ?? "").trim();
  if (!uid || !/^\d{4}$/.test(code)) return deny({ error: "bad request" });

  const card = await store("cards").get(uid, { type: "json" });
  if (!card) { await log("verify_unknown_card", { uid }); return deny({ error: "unknown card" }); }

  const codes = store("codes");
  const rec = await codes.get(uid, { type: "json" });
  if (!rec) { await log("verify_no_pin", { uid, name: card.name }); return deny({ error: "no active pin" }); }
  if (Date.now() > rec.expiresAt) {
    await codes.delete(uid); await log("verify_expired", { uid, name: card.name });
    return deny({ error: "pin expired" });
  }

  if (rec.code !== code) {
    rec.tries += 1;
    if (rec.tries >= MAX_TRIES) {
      await codes.delete(uid); await log("verify_lockout", { uid, name: card.name });
      return deny({ error: "locked out" });
    }
    await codes.setJSON(uid, rec);
    await log("verify_wrong_pin", { uid, name: card.name, tries: rec.tries });
    return deny({ error: "wrong pin", triesLeft: MAX_TRIES - rec.tries });
  }

  await codes.delete(uid); // single use
  let withdrawn = null;
  if (rec.hospitalId && rec.takeGroup) {
    const [bag] = await takeBags(rec.hospitalId, rec.takeGroup, 1);
    withdrawn = bag ? { hospitalId: rec.hospitalId, group: rec.takeGroup, bagId: bag.id } : null;
  }
  await log("door_unlocked", { uid, name: card.name, withdrawn });
  return json({ ok: true, success: true, name: card.name });
};
