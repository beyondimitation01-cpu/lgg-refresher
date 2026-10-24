/**
 * LovableGG Pool Token Refresher — GitHub Actions version (test build)
 * Hardcoded accounts for quick setup — swap to secrets before going public
 */

const puppeteer = require("puppeteer");

// ── CONFIG ─────────────────────────────────────────────────────────────────
const WORKER_URL = "https://spring-salad-fdbb.abdul10mani20.workers.dev";

const POOL_ACCOUNTS = [
  { email: "muzabzab01@gmail.com",         password: "Abdulmani15" },
  { email: "muzabzabali02@gmail.com",      password: "Abdulmani15" },
  { email: "mujaheedibrahim222@gmail.com", password: "Abdulmani15" },
  { email: "muktarsalisu583@gmail.com",    password: "Abdulmani15" },
  // yahoo excluded — OAuth only
];

// ── HELPERS ────────────────────────────────────────────────────────────────
function log(msg) {
  console.log("[" + new Date().toISOString().slice(11, 19) + "] " + msg);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function pushTokenToWorker(email, token) {
  try {
    const resp = await fetch(WORKER_URL + "/store-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token }),
    });
    const data = await resp.json();
    if (data.ok) log("✓ pushed token for " + email + " (len=" + token.length + ")");
    else log("✗ worker rejected for " + email + ": " + JSON.stringify(data));
    return data.ok;
  } catch (e) {
    log("✗ push failed for " + email + ": " + e.message);
    return false;
  }
}

async function extractTokenFromPage(page) {
  // localStorage — supabase stores session as "sb-<project>-auth-token"
  const lsToken = await page.evaluate(() => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.includes("auth-token") || key.includes("supabase")) {
          const val = JSON.parse(localStorage.getItem(key) || "{}");
          if (val.access_token) return val.access_token;
          if (val.data && val.data.session && val.data.session.access_token)
            return val.data.session.access_token;
        }
      }
    } catch (_) {}
    return null;
  });
  if (lsToken) return lsToken;

  // window globals fallback
  const winToken = await page.evaluate(() => {
    try {
      for (const k of Object.keys(window)) {
        const v = window[k];
        if (v && v.auth && v.auth._session && v.auth._session.access_token)
          return v.auth._session.access_token;
      }
    } catch (_) {}
    return null;
  });
  if (winToken) return winToken;

  // cookie fallback
  const cookies = await page.cookies();
  for (const c of cookies) {
    if ((c.name.includes("access-token") || c.name.includes("auth-token"))
        && c.value && c.value.split(".").length === 3) return c.value;
  }

  return null;
}

async function loginAndGetToken(browser, email, password) {
  const page = await browser.newPage();
  page.on("console", () => {});
  page.on("pageerror", () => {});
  try {
    log("  → " + email + " | logging in...");
    await page.goto("https://lovable.dev/auth/login", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(1500);

    // email field
    let emailInput = null;
    for (const sel of ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]']) {
      try { emailInput = await page.$(sel); if (emailInput) break; } catch (_) {}
    }
    if (!emailInput) throw new Error("email input not found");
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 35 });

    // password field
    let passInput = null;
    for (const sel of ['input[type="password"]', 'input[name="password"]']) {
      try { passInput = await page.$(sel); if (passInput) break; } catch (_) {}
    }
    if (!passInput) throw new Error("password input not found");
    await passInput.click({ clickCount: 3 });
    await passInput.type(password, { delay: 35 });

    // submit
    let submitBtn = null;
    try { submitBtn = await page.$('button[type="submit"]'); } catch (_) {}
    if (submitBtn) await submitBtn.click();
    else await passInput.press("Enter");

    log("  → " + email + " | waiting for redirect...");
    try { await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }); } catch (_) {}
    await sleep(2000);

    const currentUrl = page.url();
    log("  → " + email + " | landed: " + currentUrl);

    if (currentUrl.includes("/auth/login") || currentUrl.includes("/auth/signup")) {
      throw new Error("still on login page — check credentials or google verification needed");
    }

    // navigate to /projects to fully trigger session load
    if (!currentUrl.includes("/projects") && !currentUrl.includes("/dashboard")) {
      await page.goto("https://lovable.dev/projects", { waitUntil: "networkidle2", timeout: 15000 });
      await sleep(1500);
    }

    const token = await extractTokenFromPage(page);
    if (!token) throw new Error("token not found in localStorage after login");

    log("  → " + email + " | ✓ got token (len=" + token.length + ")");
    return token;
  } finally {
    await page.close();
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  log("=== LovableGG Token Refresher starting ===");
  log("Worker: " + WORKER_URL);
  log("Accounts: " + POOL_ACCOUNTS.length);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", "--disable-gpu",
      "--no-first-run", "--no-zygote", "--single-process",
    ],
  });

  let success = 0, fail = 0;

  for (const account of POOL_ACCOUNTS) {
    log("Processing: " + account.email);
    try {
      const token = await loginAndGetToken(browser, account.email, account.password);
      const pushed = await pushTokenToWorker(account.email, token);
      if (pushed) success++;
      else { log("  ✗ push failed"); fail++; }
    } catch (e) {
      log("  ✗ " + account.email + " — " + e.message);
      fail++;
    }
    await sleep(2000);
  }

  await browser.close();
  log("=== Done: " + success + " ok / " + fail + " failed ===");
  if (success === 0) process.exit(1);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
