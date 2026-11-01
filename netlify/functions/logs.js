import { store, json, authed } from "./util.js";

export const config = { path: "/api/logs" };

export default async (req) => {
  if (!authed(req)) return json({ error: "unauthorized" }, 401);
  const logs = store("logs");
  const { blobs } = await logs.list();
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 100);
  const out = [];
  for (const k of keys) out.push(await logs.get(k, { type: "json" }));
  return json({ logs: out.filter(Boolean) });
};
