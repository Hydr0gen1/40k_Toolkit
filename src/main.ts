import { Store } from "./store.js";
import { createApp } from "./server.js";
import { refresh, refreshResearch } from "./sources.js";

const store = new Store(process.env.DATA_PATH ?? "data/toolkit.sqlite");
const { app } = createApp(store, {
  baseUrl: process.env.PUBLIC_URL ?? "http://localhost:8787",
  ownerPasswordHash: process.env.OWNER_PASSWORD_HASH ?? "",
  callbackOrigins: (
    process.env.CALLBACK_ORIGINS ??
    "https://chatgpt.com,https://claude.ai,https://claude.com"
  ).split(","),
  trustProxy: process.env.TRUST_PROXY === "true",
});
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const http = app.listen(port, process.env.BIND_ADDRESS ?? "0.0.0.0", () =>
  console.log(`Black Templars Toolkit listening on port ${port}`),
);
http.requestTimeout = 60000;
http.headersTimeout = 15000;
let busy = false;
async function scheduledRefresh() {
  if (busy) return;
  busy = true;
  try {
    const s = await refresh(store);
    console.log(`Refreshed ${s.id}`);
  } catch (e) {
    console.error(
      "Rules refresh failed; keeping previous snapshot:",
      String(e),
    );
  }
  try {
    console.log(`Discovered ${await refreshResearch(store)} research leads`);
  } catch (e) {
    store.recordRefresh(false, "Tournament discovery: " + String(e));
    console.error("Tournament discovery failed:", String(e));
  } finally {
    store.cleanup();
    busy = false;
  }
}
const timer = setInterval(() => {
  if (process.env.AUTO_REFRESH !== "false") void scheduledRefresh();
}, 24 * 3600000);
if (
  process.env.AUTO_REFRESH !== "false" &&
  (!store.active() ||
    Date.now() - Date.parse(store.active()!.createdAt) > 24 * 3600000)
)
  void scheduledRefresh();
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    clearInterval(timer);
    http.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
