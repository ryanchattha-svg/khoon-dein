import { getStore } from "@netlify/blobs";

const GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const HOSPITALS = [
  { n: "PIMS", c: "Islamabad", a: "G-8/3", p: "051-9260500", q: "PIMS Hospital Islamabad" },
  { n: "Shifa International Hospital", c: "Islamabad", a: "H-8/4", p: "051-8464646", q: "Shifa International Hospital Islamabad" },
  { n: "Kulsum International Hospital", c: "Islamabad", a: "Blue Area", p: "051-8446666", q: "Kulsum International Hospital Islamabad" },
  { n: "Maroof International Hospital", c: "Islamabad", a: "F-10 Markaz", p: "051-2222920", q: "Maroof International Hospital Islamabad" },
  { n: "Quaid-e-Azam International Hospital", c: "Islamabad", a: "H-13", p: "051-8449100", q: "Quaid-e-Azam International Hospital Islamabad" },
  { n: "CMH Rawalpindi", c: "Rawalpindi", a: "Saddar", p: "", q: "Combined Military Hospital Rawalpindi" },
  { n: "Holy Family Hospital", c: "Rawalpindi", a: "Satellite Town", p: "051-9290359", q: "Holy Family Hospital Rawalpindi" },
  { n: "Benazir Bhutto Hospital", c: "Rawalpindi", a: "Murree Road", p: "", q: "Benazir Bhutto Hospital Rawalpindi" },
  { n: "DHQ Hospital Rawalpindi", c: "Rawalpindi", a: "Kashmiri Bazaar", p: "051-5774225", q: "District Headquarters Hospital Rawalpindi" },
  { n: "Bahria International Hospital", c: "Rawalpindi", a: "Bahria Town", p: "", q: "Bahria International Hospital Rawalpindi" },
  { n: "Fauji Foundation Hospital", c: "Rawalpindi", a: "", p: "", q: "Fauji Foundation Hospital Rawalpindi" },
  { n: "AFIC / NIHD", c: "Rawalpindi", a: "", p: "", q: "Armed Forces Institute of Cardiology Rawalpindi" },
  { n: "Rawalpindi Institute of Cardiology", c: "Rawalpindi", a: "", p: "", q: "Rawalpindi Institute of Cardiology" },
  { n: "Polyclinic Hospital", c: "Islamabad", a: "G-6", p: "", q: "Federal Government Polyclinic Hospital Islamabad" },
  { n: "Ali Medical Centre", c: "Islamabad", a: "F-8", p: "", q: "Ali Medical Centre Islamabad" },
  { n: "Akbar Niazi Teaching Hospital", c: "Islamabad", a: "", p: "", q: "Akbar Niazi Teaching Hospital Islamabad" }
];
const LABS = [
  { n: "Chughtai Lab (Islamabad)", q: "Chughtai Lab Islamabad" },
  { n: "Chughtai Lab (Rawalpindi)", q: "Chughtai Lab Rawalpindi" },
  { n: "Excel Labs", q: "Excel Labs Islamabad" },
  { n: "Islamabad Diagnostic Centre (IDC)", q: "Islamabad Diagnostic Centre" }
];
// Demo identities for the NFC cards (Ryan and Usman)
const CARDS = {
  "04C96696DE2A81": { name: "Rayan Chattha", cnic: "35202-1111111-1", phone: "03001234567", group: "O+" },
  "04B96896DE2A81": { name: "Usman Hussain Shah", cnic: "35202-2222222-2", phone: "03007654321", group: "A+" },
  "04B96B96DE2A81": { name: "Usman Hussain Shah", cnic: "35202-2222222-2", phone: "03007654321", group: "A+" }
};

const OFFERS = [
  { id: "mcd", type: "Restaurant", title: "McDonald's - 1 Person Deal", cost: 100 },
  { id: "kfc", type: "Restaurant", title: "KFC - 1 Person Deal", cost: 100 },
  { id: "hardees", type: "Restaurant", title: "Hardee's - 1 Person Deal", cost: 100 },
  { id: "pizzahut", type: "Restaurant", title: "Pizza Hut - Personal Pizza Deal", cost: 100 },
  { id: "cheezious", type: "Restaurant", title: "Cheezious - 1 Person Deal", cost: 100 },
  { id: "pharm500", type: "Pharmacy", title: "Pharmacy - Rs 500 off medicines", cost: 100 },
  { id: "pharm1000", type: "Pharmacy", title: "Pharmacy - Rs 1000 off medicines", cost: 200 }
];
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = (s, n = 60) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);
const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const sha = async (t) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

async function getStock(db) {
  const s = (await db.get("stock", { type: "json" })) || {};
  let changed = false;
  HOSPITALS.forEach((h, i) => {
    if (!s[h.n]) {
      changed = true;
      s[h.n] = {};
      GROUPS.forEach((g, j) => { s[h.n][g] = ((i * 7 + j * 11 + 3) * 5) % 17 + (j === 5 ? 0 : 1); });
    }
  });
  if (changed) await db.setJSON("stock", s);
  return s;
}
async function adjust(db, hosp, group, delta) {
  const s = await getStock(db);
  if (s[hosp] && group in s[hosp]) {
    s[hosp][group] = Math.max(0, s[hosp][group] + delta);
    await db.setJSON("stock", s);
  }
}
async function freeCode(db) {
  for (let i = 0; i < 40; i++) {
    const c = String(1000 + rnd(9000));
    const old = await db.get("code:" + c, { type: "json" });
    if (!old || old.exp < Date.now()) return c;
  }
  return null;
}
function person(b) {
  const name = clean(b.name);
  const cnic = String(b.cnic || "").replace(/\D/g, "");
  const phone = String(b.phone || "").replace(/\D/g, "");
  if (name.length < 3) return { error: "Enter your full name." };
  if (cnic.length !== 13) return { error: "CNIC must be 13 digits." };
  if (!/^03\d{9}$/.test(phone)) return { error: "Phone must look like 03001234567." };
  if (!GROUPS.includes(b.group)) return { error: "Choose a blood group." };
  const h = HOSPITALS.find((x) => x.n === b.hospital);
  if (!h) return { error: "Choose a hospital." };
  return { name, cnic, phone, group: b.group, hospital: h.n };
}
async function upsertDonor(db, p) {
  const hash = await sha(p.cnic + ":" + p.phone);
  const key = "donor:" + p.phone;
  const d = (await db.get(key, { type: "json" })) || { points: 0, count: 0, vouchers: [], cnicHash: hash };
  if (d.cnicHash !== hash) return "This phone is registered with a different CNIC.";
  Object.assign(d, { name: p.name, phone: p.phone, group: p.group, hospital: p.hospital, share: true });
  await db.setJSON(key, d);
  return null;
}
async function award(db, phone, hospital, group) {
  const key = "donor:" + phone;
  const d = await db.get(key, { type: "json" });
  if (!d) return null;
  d.points += 100; d.count += 1;
  await db.setJSON(key, d);
  await adjust(db, hospital, group, 1);
  return true;
}
async function pickups(db) {
  const { blobs } = await db.list({ prefix: "pickup:" });
  const rows = [];
  for (const b of blobs) { const r = await db.get(b.key, { type: "json" }); if (r) rows.push(r); }
  return rows.sort((a, c) => c.created - a.created);
}

export default async (req) => {
  const db = getStore("locker");
  const path = new URL(req.url).pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const isGet = req.method === "GET";

  if (isGet && path === "hospitals") return json({ hospitals: HOSPITALS, stock: await getStock(db), labs: LABS });
  if (isGet && path === "donors") {
    const { blobs } = await db.list({ prefix: "donor:" });
    const rows = [];
    for (const b of blobs) {
      const d = await db.get(b.key, { type: "json" });
      if (d && d.count > 0 && d.share) rows.push({ name: d.name, phone: d.phone, group: d.group, hospital: d.hospital, count: d.count });
    }
    return json(rows);
  }
  if (isGet && path === "offers") return json(OFFERS);
  if (isGet && path === "scan") {
    const s = await db.get("scan", { type: "json" });
    if (!s || s.exp < Date.now()) return json({ state: "idle" });
    if (s.state === "done") { await db.delete("scan"); return json({ state: "done", card: s.card }); }
    return json({ state: "waiting" });
  }
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  const b = await req.json().catch(() => ({}));
  const deviceOk = process.env.DEVICE_KEY && req.headers.get("x-device-key") === process.env.DEVICE_KEY;

  // ---------- fridge (ESP32) ----------
  if (path === "verify") {
    if (!deviceOk) return json({ ok: false }, 401);
    const code = clean(b.code, 4);
    const rec = await db.get("code:" + code, { type: "json" });
    if (!rec || rec.exp < Date.now()) return json({ ok: false });
    await db.delete("code:" + code);
    if (rec.kind === "donate") await award(db, rec.phone, rec.hospital, rec.group);
    else await adjust(db, rec.hospital, rec.group, -1);
    return json({ ok: true, kind: rec.kind });
  }
  if (path === "card") {
    if (!deviceOk) return json({ ok: false }, 401);
    const uid = clean(b.uid, 20).toUpperCase();
    const card = CARDS[uid];
    if (!card) return json({ ok: false, known: false });
    const s = await db.get("scan", { type: "json" });
    if (s && s.state === "waiting" && s.exp > Date.now()) {
      await db.setJSON("scan", { state: "done", card, exp: Date.now() + 60000 });
      return json({ ok: true, known: true, matched: true, name: card.name });
    }
    return json({ ok: true, known: true, matched: false, name: card.name });
  }

  // ---------- website ----------
  if (path === "scan/start") {
    await db.setJSON("scan", { state: "waiting", exp: Date.now() + 60000 });
    return json({ ok: true });
  }
  if (path === "donate" || path === "receive" || path === "pickup") {
    const p = person(b);
    if (p.error) return json({ error: p.error }, 400);
    if (path !== "receive" && !(b.fit && b.share)) return json({ error: "Please tick both confirmations." }, 400);
    if (path === "receive") {
      const st = await getStock(db);
      if ((st[p.hospital][p.group] || 0) < 1)
        return json({ error: "No " + p.group + " units at " + p.hospital + " right now. Try another hospital." }, 400);
    } else {
      const e = await upsertDonor(db, p);
      if (e) return json({ error: e }, 400);
    }
    if (path === "pickup") {
      const address = clean(b.address, 120);
      const when = clean(b.when, 40);
      if (address.length < 8) return json({ error: "Enter your full address." }, 400);
      if (!when) return json({ error: "Choose a pickup time." }, 400);
      const id = "PK" + (1000 + rnd(9000));
      await db.setJSON("pickup:" + id, { id, name: p.name, phone: p.phone, group: p.group, hospital: p.hospital, address, when, status: "booked", created: Date.now() });
      return json({ id, when });
    }
    const code = await freeCode(db);
    if (!code) return json({ error: "Try again in a minute." }, 503);
    await db.setJSON("code:" + code, { kind: path, phone: p.phone, group: p.group, hospital: p.hospital, exp: Date.now() + 10 * 60 * 1000 });
    return json({ code, minutes: 10 });
  }
  if (path === "me") {
    const phone = String(b.phone || "").replace(/\D/g, "");
    const cnic = String(b.cnic || "").replace(/\D/g, "");
    const d = await db.get("donor:" + phone, { type: "json" });
    if (!d || d.cnicHash !== (await sha(cnic + ":" + phone))) return json({ error: "No donor found with those details." }, 404);
    const mine = (await pickups(db)).filter((r) => r.phone === phone).map((r) => ({ id: r.id, status: r.status, when: r.when, hospital: r.hospital }));
    return json({ name: d.name, points: d.points, count: d.count, vouchers: d.vouchers, pickups: mine });
  }

  if (path === "redeem") {
    const phone = String(b.phone || "").replace(/\D/g, "");
    const cnic = String(b.cnic || "").replace(/\D/g, "");
    const d = await db.get("donor:" + phone, { type: "json" });
    if (!d || d.cnicHash !== (await sha(cnic + ":" + phone))) return json({ error: "No donor found with those details." }, 404);
    const o = OFFERS.find((x) => x.id === b.offer);
    if (!o) return json({ error: "Offer not found." }, 404);
    if (d.points < o.cost) return json({ error: "You need " + o.cost + " points. You have " + d.points + "." }, 400);
    d.points -= o.cost;
    d.vouchers.push({ code: "BL-" + (100000 + rnd(900000)), title: o.title, date: new Date().toISOString().slice(0, 10) });
    await db.setJSON("donor:" + phone, d);
    return json({ ok: true, points: d.points });
  }

  // ---------- admin (password = DEVICE_KEY) ----------
  if (path.startsWith("admin/")) {
    if (!deviceOk && !(process.env.DEVICE_KEY && b.key === process.env.DEVICE_KEY)) return json({ error: "Wrong key." }, 401);
    if (path === "admin/list") return json({ pickups: await pickups(db) });
    if (path === "admin/pickup") {
      const r = await db.get("pickup:" + clean(b.id, 8), { type: "json" });
      if (!r || r.status !== "booked") return json({ error: "Booking not found or already closed." }, 404);
      if (b.action === "collected") {
        r.status = "collected";
        await award(db, r.phone, r.hospital, r.group);
      } else r.status = "cancelled";
      await db.setJSON("pickup:" + r.id, r);
      return json({ ok: true, status: r.status });
    }
  }
  return json({ error: "Not found" }, 404);
};

export const config = { path: "/api/*" };
