/**
 * LovableGG Pool Token Refresher — lightweight version
 * No puppeteer. Calls Cloudflare Worker /refresh-token for each account.
 * Worker does the supabase password login and stores token in KV.
 */

const WORKER_URL = "https://spring-salad-fdbb.abdul10mani20.workers.dev";

const POOL_ACCOUNTS = [
  "muzabzab01@gmail.com",
  "muzabzabali02@gmail.com",
  "mujaheedibrahim222@gmail.com",
  "muktarsalisu583@gmail.com",
];

function log(msg) {
  console.log("[" + new Date().toISOString().slice(11, 19) + "] " + msg);
}

async function refreshAccount(email) {
  try {
    const resp = await fetch(WORKER_URL + "/refresh-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await resp.json();
    if (data.ok) {
      log("  ✓ " + email + " — token refreshed (len=" + (data.token || "").length + ")");
      return true;
    } else {
      log("  ✗ " + email + " — " + (data.reason || JSON.stringify(data)));
      return false;
    }
  } catch (e) {
    log("  ✗ " + email + " — fetch error: " + e.message);
    return false;
  }
}

async function main() {
  log("=== LovableGG Token Refresher ===");
  log("Worker: " + WORKER_URL);

  let success = 0, fail = 0;
  for (const email of POOL_ACCOUNTS) {
    log("Refreshing: " + email);
    const ok = await refreshAccount(email);
    if (ok) success++; else fail++;
  }

  log("=== Done: " + success + " ok / " + fail + " failed ===");

  // verify tokens landed in KV
  try {
    const dbg = await fetch(WORKER_URL + "/debug");
    const data = await dbg.json();
    log("KV state: " + JSON.stringify(data.stored_tokens));
  } catch (_) {}

  if (success === 0) process.exit(1);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
