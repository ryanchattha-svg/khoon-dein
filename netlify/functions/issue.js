// Called by the website: create a single-use 4-digit code bound to a registered card.
import { db, json, clean, digits, cleanUid, getCards, makeCode, BLOODS } from "./lib/util.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const b = await req.json().catch(() => ({}));
  const name = clean(b.name);
  const cnic = digits(b.cnic);
  const phone = digits(b.phone);
  const uid = cleanUid(b.uid);
  if (name.length < 3) return json({ error: "Enter your full name." }, 400);
  if (cnic.length !== 13) return json({ error: "CNIC must be 13 digits." }, 400);
  if (!/^03\d{9}$/.test(phone)) return json({ error: "Phone must look like 03001234567." }, 400);
  if (!BLOODS.includes(b.blood)) return json({ error: "Choose a blood group." }, 400);
  if (uid.length < 8) return json({ error: "Enter your NFC card number (UID)." }, 400);

  const d = db();
  const card = (await getCards(d))[uid];
  if (!card) return json({ error: "This card is not registered. Ask the admin to register it." }, 400);
  if (card.cnic !== cnic) return json({ error: "These details do not match the registered card." }, 400);

  const code = makeCode();
  await d.setJSON("code:" + uid, { code, tries: 0, name, phone, blood: b.blood, at: Date.now(), exp: Date.now() + 10 * 60 * 1000 });
  return json({ code, minutes: 10 });
};
