import { store, json, authed, ensureSeed, log } from "./util.js";

export const config = { path: "/api/seed" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!authed(req)) return json({ error: "unauthorized" }, 401);
  await ensureSeed();
  const inv = store("inventory");
  const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const demo = [["h-central", "Central Hospital Blood Bank"], ["h-lab1", "City Diagnostic Laboratory"]];
  for (const [id, name] of demo) {
    if (await inv.get(id)) continue;
    const bags = [];
    ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].forEach((g, i) => {
      for (let n = 0; n < 3; n++) bags.push({ id: `${id}-${g}-${n}`, group: g, expires: d(3 + i * 4 + n * 5), added: d(0) });
    });
    await inv.setJSON(id, { id, name, bags });
  }
  await log("seeded");
  return json({ ok: true });
};
