import { getStore } from "@netlify/blobs";

const GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const clean = (s, n = 60) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);
const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const sha = async (t) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

async function freeCode(db) {
  for (let i = 0; i < 40; i++) {
    const c = String(1000 + rnd(9000));
    const old = await db.get("code:" + c, { type: "json" });
    if (!old || old.exp < Date.now()) return c;
  }
  return null;
}

export default async (req) => {
  const db = getStore("locker");
  const path = new URL(req.url).pathname.replace(/^\/api\//, "").replace(/\/$/, "");

  if (req.method === "GET" && path === "donors") {
    const { blobs } = await db.list({ prefix: "donor:" });
    const rows = [];
    for (const b of blobs) {
      const d = await db.get(b.key, { type: "json" });
      if (d && d.count > 0 && d.share)
        rows.push({ name: d.name, phone: d.phone, group: d.group, hospital: d.hospital, count: d.count });
    }
    return json(rows);
  }
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  const b = await req.json().catch(() => ({}));

  // Called by the ESP32 fridge only
  if (path === "verify") {
    if (!process.env.DEVICE_KEY || req.headers.get("x-device-key") !== process.env.DEVICE_KEY)
      return json({ ok: false }, 401);
    const code = clean(b.code, 4);
    const rec = await db.get("code:" + code, { type: "json" });
    if (!rec || rec.exp < Date.now()) return json({ ok: false });
    await db.delete("code:" + code);
    if (rec.kind === "donate") {
      const key = "donor:" + rec.phone;
      const d = await db.get(key, { type: "json" });
      if (d) {
        d.points += 100;
        d.count += 1;
        d.vouchers.push({ code: "BL-" + (100000 + rnd(900000)), value: 500, date: new Date().toISOString().slice(0, 10) });
        await db.setJSON(key, d);
      }
    }
    return json({ ok: true, kind: rec.kind });
  }

  if (path === "donate" || path === "receive") {
    const name = clean(b.name);
    const cnic = String(b.cnic || "").replace(/\D/g, "");
    const phone = String(b.phone || "").replace(/\D/g, "");
    if (name.length < 3) return json({ error: "Enter your full name." }, 400);
    if (cnic.length !== 13) return json({ error: "CNIC must be 13 digits." }, 400);
    if (!/^03\d{9}$/.test(phone)) return json({ error: "Phone must look like 03001234567." }, 400);
    if (!GROUPS.includes(b.group)) return json({ error: "Choose a blood group." }, 400);
    const hospital = clean(b.hospital, 80);
    if (path === "donate" && !(b.fit && b.share))
      return json({ error: "Please tick both confirmations." }, 400);

    const cnicHash = await sha(cnic + ":" + phone);
    const key = "donor:" + phone;
    if (path === "donate") {
      const d = (await db.get(key, { type: "json" })) ||
        { points: 0, count: 0, vouchers: [], cnicHash };
      if (d.cnicHash !== cnicHash) return json({ error: "This phone is registered with a different CNIC." }, 400);
      Object.assign(d, { name, phone, group: b.group, hospital, share: true });
      await db.setJSON(key, d);
    }
    const code = await freeCode(db);
    if (!code) return json({ error: "Try again in a minute." }, 503);
    await db.setJSON("code:" + code, { kind: path, phone, group: b.group, hospital, exp: Date.now() + 10 * 60 * 1000 });
    return json({ code, minutes: 10 });
  }

  if (path === "me") {
    const phone = String(b.phone || "").replace(/\D/g, "");
    const cnic = String(b.cnic || "").replace(/\D/g, "");
    const d = await db.get("donor:" + phone, { type: "json" });
    if (!d || d.cnicHash !== (await sha(cnic + ":" + phone))) return json({ error: "No donor found with those details." }, 404);
    return json({ name: d.name, points: d.points, count: d.count, vouchers: d.vouchers });
  }
  return json({ error: "Not found" }, 404);
};

export const config = { path: "/api/*" };
