import { store, json, readBody, digits, authed, log, BG } from "./util.js";
import { randomUUID } from "node:crypto";

export const config = { path: "/api/donors" };

// Public donor actions are scoped by CNIC + mobile. Staff action "complete" needs DEVICE_KEY.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const b = await readBody(req), donors = store("donors");
  const cnic = digits(b.cnic), mobile = digits(b.mobile);
  if (cnic.length !== 13) return json({ error: "CNIC must be 13 digits" }, 400);
  const donor = await donors.get(cnic, { type: "json" });

  if (b.action === "register") {
    const group = String(b.bloodGroup || "").toUpperCase();
    if (!String(b.name || "").trim() || mobile.length < 10 || !BG.includes(group)) return json({ error: "Invalid fields" }, 400);
    if (donor) return json({ error: "Already registered" }, 409);
    const d = { name: b.name.trim(), cnic, mobile, bloodGroup: group, city: b.city || "", appointments: [], donations: [], createdAt: new Date().toISOString() };
    await donors.setJSON(cnic, d); await log("donor_registered", { cnic: cnic.slice(-4) });
    return json({ ok: true });
  }

  if (b.action === "complete") { // staff: mark appointment done and add bag to stock
    if (!authed(req)) return json({ error: "unauthorized" }, 401);
    if (!donor) return json({ error: "Not found" }, 404);
    const a = donor.appointments.find((x) => x.id === b.appointmentId && x.status === "booked");
    if (!a) return json({ error: "No such booked appointment" }, 404);
    a.status = "completed";
    donor.donations.push({ date: new Date().toISOString().slice(0, 10), hospitalId: a.hospitalId, group: donor.bloodGroup });
    await donors.setJSON(cnic, donor);
    const inv = store("inventory");
    const h = (await inv.get(a.hospitalId, { type: "json" })) || { id: a.hospitalId, name: a.hospitalId, bags: [] };
    h.bags.push({ id: randomUUID().slice(0, 8), group: donor.bloodGroup, expires: new Date(Date.now() + 35 * 864e5).toISOString().slice(0, 10), added: new Date().toISOString().slice(0, 10) });
    await inv.setJSON(h.id, h); await log("donation_completed", { hospitalId: a.hospitalId, group: donor.bloodGroup });
    return json({ ok: true });
  }

  if (!donor || digits(donor.mobile) !== mobile) return json({ error: "Donor not found or mobile mismatch" }, 403);

  if (b.action === "appointment") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "") || b.date < new Date().toISOString().slice(0, 10) || !b.hospitalId)
      return json({ error: "Valid future date and hospital required" }, 400);
    const a = { id: randomUUID().slice(0, 8), date: b.date, hospitalId: String(b.hospitalId), status: "booked" };
    donor.appointments.push(a); await donors.setJSON(cnic, donor);
    return json({ ok: true, appointment: a });
  }
  if (b.action === "history") return json({ name: donor.name, bloodGroup: donor.bloodGroup, appointments: donor.appointments, donations: donor.donations });
  return json({ error: "Unknown action" }, 400);
};
