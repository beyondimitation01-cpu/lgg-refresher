/**
 * LovableGG Pool Token Refresher — GitHub Actions version (test build)
 * Hardcoded accounts for quick setup
 */

const puppeteer = require("puppeteer");

const WORKER_URL = "https://spring-salad-fdbb.abdul10mani20.workers.dev";

const POOL_ACCOUNTS = [
  { email: "muzabzab01@gmail.com",         password: "Abdulmani15" },
  { email: "muzabzabali02@gmail.com",      password: "Abdulmani15" },
  { email: "mujaheedibrahim222@gmail.com", password: "Abdulmani15" },
  { email: "muktarsalisu583@gmail.com",    password: "Abdulmani15" },
];

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
    if (data.ok) log("  ✓ pushed token for " + email + " (len=" + token.length + ")");
    else log("  ✗ worker rejected for " + email + ": " + JSON.stringify(data));
    return data.ok;
  } catch (e) {
    log("  ✗ push failed for " + email + ": " + e.message);
    return false;
  }
}

async function extractTokenFromPage(page) {
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
    log("  → " + email + " | navigating...");
    await page.goto("https://lovable.dev/login", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(2000);

    // ── STEP 1: fill email ──────────────────────────────────────────────────
    let emailInput = null;
    for (const sel of ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]', 'input[placeholder*="mail" i]']) {
      try { const el = await page.$(sel); if (el) { emailInput = el; break; } } catch (_) {}
    }
    if (!emailInput) emailInput = await page.$("input:not([type='hidden'])");
    if (!emailInput) throw new Error("email input not found on " + page.url());

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 40 });
    log("  → " + email + " | email typed");

    // ── STEP 2: click Continue (lovable is multi-step: email → then password) ──
    let continueBtn = await page.$('button[type="submit"]');
    if (continueBtn) {
      await continueBtn.click();
      log("  → " + email + " | clicked continue");
    } else {
      await emailInput.press("Enter");
      log("  → " + email + " | pressed enter on email");
    }

    // ── STEP 3: wait up to 8s for password field ────────────────────────────
    log("  → " + email + " | waiting for password field...");
    let passInput = null;
    for (let i = 0; i < 10; i++) {
      await sleep(800);
      try { passInput = await page.$('input[type="password"]'); } catch (_) {}
      if (passInput) { log("  → " + email + " | password field found (attempt " + (i+1) + ")"); break; }
    }
    if (!passInput) {
      // screenshot for debug
      await page.screenshot({ path: "/tmp/debug-" + email.split("@")[0] + ".png" });
      const inputs = await page.evaluate(() =>
        Array.from(document.querySelectorAll("input")).map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder }))
      );
      log("  → " + email + " | inputs after continue: " + JSON.stringify(inputs));
      throw new Error("password field never appeared");
    }

    // ── STEP 4: fill password and submit ────────────────────────────────────
    await passInput.click({ clickCount: 3 });
    await passInput.type(password, { delay: 40 });
    log("  → " + email + " | password typed");

    let submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    else await passInput.press("Enter");
    log("  → " + email + " | submitted");

    // ── STEP 5: wait for redirect off login page ─────────────────────────────
    try { await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }); } catch (_) {}
    await sleep(2000);

    const currentUrl = page.url();
    log("  → " + email + " | landed: " + currentUrl);

    if (currentUrl.includes("/login") || currentUrl.includes("/signup")) {
      await page.screenshot({ path: "/tmp/debug-fail-" + email.split("@")[0] + ".png" });
      throw new Error("still on login page — wrong credentials or verification required");
    }

    // ── STEP 6: navigate to /projects to fully load session ──────────────────
    if (!currentUrl.includes("/projects") && !currentUrl.includes("/dashboard")) {
      await page.goto("https://lovable.dev/projects", { waitUntil: "networkidle2", timeout: 15000 });
      await sleep(1500);
    }

    const token = await extractTokenFromPage(page);
    if (!token) throw new Error("token not found in localStorage after login");

    log("  → " + email + " | ✓ token extracted (len=" + token.length + ")");
    return token;

  } finally {
    await page.close();
  }
}

async function main() {
  log("=== LovableGG Token Refresher (GitHub Actions) ===");
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
