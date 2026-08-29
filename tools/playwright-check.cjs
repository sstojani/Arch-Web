const fs = require("fs/promises");
const path = require("path");

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const home = process.env.USERPROFILE || process.env.HOME;
    if (!home) throw new Error("Cannot resolve bundled Playwright path without USERPROFILE/HOME.");
    return require(path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright"));
  }
}

const { chromium } = loadPlaywright();
const baseUrl = process.env.PORTFOLIO_URL || "http://127.0.0.1:4173";
const outDir = path.join(process.cwd(), "output", "playwright");
const results = [];

async function removeChromiumDebugLog() {
  await fs.rm(path.join(process.cwd(), "debug.log"), { force: true });
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: "passed" });
  } catch (error) {
    results.push({ name, status: "failed", message: error.message });
  }
}

async function visibleText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
}

async function hasNoHorizontalScroll(page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  if (!ok) throw new Error("Page has horizontal scrolling.");
}

async function resetLocalState(page) {
  await page.evaluate(() => {
    localStorage.removeItem("archPortfolioState.v1");
    sessionStorage.removeItem("archPortfolioAdminSession");
  });
}

async function waitForIntro(page) {
  await page.waitForFunction(() => document.body.classList.contains("intro-complete"), null, { timeout: 3000 });
}

(async () => {
  await removeChromiumDebugLog();
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1100 },
    { name: "tablet", width: 768, height: 1000 },
    { name: "mobile", width: 375, height: 900 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await check(`${viewport.name} homepage renders`, async () => {
      await page.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
      await resetLocalState(page);
      await page.reload({ waitUntil: "networkidle" });
      await waitForIntro(page);
      await visibleText(page, "Architecture shaped by light");
      await visibleText(page, "Selected Work");
      await hasNoHorizontalScroll(page);
      await page.screenshot({ path: path.join(outDir, `${viewport.name}-home.png`), fullPage: true });
    });
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
  await waitForIntro(page);
  await resetLocalState(page);

  await check("work page filters", async () => {
    await page.goto(`${baseUrl}/#work`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    await visibleText(page, "Selected projects and spatial studies");
    await page.getByRole("button", { name: "Interior" }).click();
    await visibleText(page, "Stone Apartment");
    await hasNoHorizontalScroll(page);
    await page.screenshot({ path: path.join(outDir, "work-filter-interior.png"), fullPage: true });
  });

  await check("project detail route", async () => {
    await page.goto(`${baseUrl}/#project/courtyard-house`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    await visibleText(page, "Courtyard House");
    await visibleText(page, "Concept");
    await page.locator(".gallery").waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("link", { name: "Back to Work" }).click();
    await visibleText(page, "Selected projects and spatial studies");
  });

  await check("contact validation", async () => {
    await page.goto(`${baseUrl}/#contact`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    await page.getByRole("button", { name: "Send Inquiry" }).click();
    const invalidCount = await page.locator(".field.invalid").count();
    if (invalidCount < 1) throw new Error("Expected validation errors after empty submit.");
  });

  await check("admin login and edit settings", async () => {
    await page.goto(`${baseUrl}/#admin`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    await page.locator("#loginEmail").fill("studio@example.com");
    await page.locator("#loginPassword").fill("architect2026");
  await page.getByRole("button", { name: "Log In" }).click();
  await visibleText(page, "Manage the portfolio");
  await page.locator("[data-admin-tab='settings']").click();
    await page.locator("#siteName").fill("Atelier Test");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await visibleText(page, "Settings saved");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(outDir, "admin-settings.png"), fullPage: true });
  });

  await check("admin create and delete project", async () => {
    await page.getByRole("button", { name: "Projects" }).click();
    await page.getByRole("button", { name: "New Project" }).click();
    await page.locator("#title").fill("Playwright Test House");
    await page.locator("#slug").fill("playwright-test-house");
    await page.locator("#location").fill("Test City");
    await page.locator("#cover").fill("assets/project-courtyard.png");
    await page.locator("#summary").fill("A temporary project created during automated validation.");
    await page.locator("input[name='published']").check();
    await page.getByRole("button", { name: "Save Project" }).click();
    await visibleText(page, "Project saved");
    await visibleText(page, "Playwright Test House");
  await page.locator("[data-delete-project]").first().click();
  await visibleText(page, "Confirm Action");
  await page.locator(".confirm-dialog [data-confirm-ok]").click();
    await visibleText(page, "Project deleted");
  });

  await check("keyboard focus visible", async () => {
    await page.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => Boolean(document.activeElement && document.activeElement.matches(":focus-visible")));
    if (!focused) throw new Error("Expected visible keyboard focus.");
  });
  await page.close();

  const reducePage = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: "reduce" });
  await check("reduced motion renders", async () => {
    await reducePage.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
    await resetLocalState(reducePage);
    await reducePage.reload({ waitUntil: "networkidle" });
    await waitForIntro(reducePage);
    await visibleText(reducePage, "Architecture shaped by light");
    await hasNoHorizontalScroll(reducePage);
    await reducePage.screenshot({ path: path.join(outDir, "mobile-reduced-motion.png"), fullPage: true });
  });
  await reducePage.close();

  await browser.close();
  console.table(results);
  await removeChromiumDebugLog();
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length) process.exit(1);
})();
