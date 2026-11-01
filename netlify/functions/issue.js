import { store, json, readBody, digits, normName, genPin, PIN_TTL_MS, BG, ensureSeed, findCardByCnic, log } from "./util.js";

export const config = { path: "/api/issue" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const b = await readBody(req);
  const cnic = digits(b.cnic), mobile = digits(b.mobile), group = String(b.bloodGroup || "").toUpperCase();
  if (cnic.length !== 13) return json({ error: "CNIC must be 13 digits" }, 400);
  if (!BG.includes(group)) return json({ error: "Invalid blood group" }, 400);
  if (!normName(b.name) || mobile.length < 10) return json({ error: "Name and mobile required" }, 400);

  await ensureSeed();
  const card = await findCardByCnic(cnic);
  // One generic error so callers can't probe which field was wrong.
  if (!card || normName(card.name) !== normName(b.name) || digits(card.mobile) !== mobile || card.bloodGroup !== group) {
    await log("issue_denied", { cnic: cnic.slice(-4) });
    return json({ error: "Details do not match a registered card" }, 403);
  }

  const pin = genPin();
  const rec = { code: pin, tries: 0, name: card.name, expiresAt: Date.now() + PIN_TTL_MS };
  // Optional: withdraw one unit from a hospital when the door opens.
  if (b.hospitalId && BG.includes(String(b.takeGroup || "").toUpperCase())) {
    rec.hospitalId = String(b.hospitalId); rec.takeGroup = String(b.takeGroup).toUpperCase();
  }
  await store("codes").setJSON(card.uid, rec);
  await log("pin_issued", { uid: card.uid, name: card.name });
  return json({ ok: true, pin, expiresInSeconds: PIN_TTL_MS / 1000 });
};
