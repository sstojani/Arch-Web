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
const uploadedFilesToClean = new Set();

async function removeChromiumDebugLog() {
  await fs.rm(path.join(process.cwd(), "debug.log"), { force: true });
}

async function readServerState() {
  const response = await fetch(`${baseUrl}/api/state`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read initial state: ${response.status}.`);
  return response.json();
}

async function restoreServerState(originalState) {
  if (!originalState) return;

  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.ARCH_ADMIN_EMAIL || "studio@example.com",
      password: process.env.ARCH_ADMIN_PASSWORD || "architect2026"
    })
  });
  if (!login.ok) throw new Error(`Could not log in to restore state: ${login.status}.`);

  const cookie = login.headers.get("set-cookie");
  const restore = await fetch(`${baseUrl}/api/state`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(originalState)
  });
  if (!restore.ok) throw new Error(`Could not restore original state: ${restore.status}.`);
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

async function hasPureWhiteTheme(page) {
  const theme = await page.evaluate(() => {
    const background = getComputedStyle(document.body).backgroundColor;
    const before = getComputedStyle(document.body, "::before");
    return {
      background,
      beforeDisplay: before.display,
      beforeOpacity: before.opacity,
      backgroundTextCount: document.querySelectorAll("[data-scene-label], .scene-label").length,
      statsCount: document.querySelectorAll(".stats-strip").length
    };
  });
  if (theme.background !== "rgb(255, 255, 255)") throw new Error(`Homepage background is not pure white: ${theme.background}.`);
  if (theme.beforeDisplay !== "none" && Number(theme.beforeOpacity) > 0) throw new Error("Body pseudo-background is still visible.");
  if (theme.backgroundTextCount !== 0) throw new Error("Decorative background text should be removed.");
  if (theme.statsCount !== 0) throw new Error("Stats strip should be removed from the homepage.");
}

async function resetLocalState(page) {
  await page.evaluate(() => {
    localStorage.removeItem("archPortfolioState.v1");
    sessionStorage.removeItem("archPortfolioAdminSession");
  });
}

async function portfolioState(page) {
  return page.evaluate(async () => {
    const localState = localStorage.getItem("archPortfolioState.v1");
    if (localState) return JSON.parse(localState);

    const response = await fetch("/api/state");
    if (!response.ok) throw new Error(`State API returned ${response.status}.`);
    return response.json();
  });
}

async function ensureAdmin(page) {
  await page.locator("#loginEmail, [data-admin-tab='projects']").first().waitFor({ state: "visible", timeout: 7000 });
  if (await page.locator("[data-admin-tab='projects']").count()) return;

  await page.locator("#loginEmail").fill("studio@example.com");
  await page.locator("#loginPassword").fill("architect2026");
  await page.getByRole("button", { name: "Log In" }).click();
  await visibleText(page, "Manage the portfolio");
}

async function waitForIntro(page) {
  await page.waitForFunction(() => document.body.classList.contains("intro-complete"), null, { timeout: 8000 });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

(async () => {
  await removeChromiumDebugLog();
  await fs.mkdir(outDir, { recursive: true });
  const originalState = await readServerState();
  const browser = await chromium.launch({ headless: true });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1100 },
    { name: "tablet", width: 768, height: 1000 },
    { name: "mobile", width: 375, height: 900 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await check(`${viewport.name} homepage renders`, async () => {
      await page.goto(`${baseUrl}/#home`, { waitUntil: "domcontentloaded" });
      await resetLocalState(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForIntro(page);
      await visibleText(page, "Architecture shaped by light");
      await visibleText(page, "Selected Work");
      await hasNoHorizontalScroll(page);
      await hasPureWhiteTheme(page);
      await page.screenshot({ path: path.join(outDir, `${viewport.name}-home.png`), fullPage: true });
    });
    await page.close();
  }

  const heroFitPage = await browser.newPage({ viewport: { width: 1707, height: 900 } });
  await check("wide desktop hero fits first viewport", async () => {
    await heroFitPage.goto(`${baseUrl}/#home`, { waitUntil: "domcontentloaded" });
    await resetLocalState(heroFitPage);
    await heroFitPage.reload({ waitUntil: "domcontentloaded" });
    await waitForIntro(heroFitPage);
    const fit = await heroFitPage.evaluate(() => {
      const viewportHeight = window.innerHeight;
      const copy = document.querySelector(".hero-copy").getBoundingClientRect();
      const media = document.querySelector(".hero-media").getBoundingClientRect();
      const actions = document.querySelector(".hero-actions").getBoundingClientRect();
      return {
        copyBottom: copy.bottom,
        mediaBottom: media.bottom,
        actionsBottom: actions.bottom,
        viewportHeight
      };
    });
    if (fit.copyBottom > fit.viewportHeight || fit.mediaBottom > fit.viewportHeight || fit.actionsBottom > fit.viewportHeight) {
      throw new Error("Hero content does not fit inside the first desktop viewport.");
    }
    await heroFitPage.screenshot({ path: path.join(outDir, "hero-fit-wide.png"), fullPage: false });
  });
  await heroFitPage.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${baseUrl}/#home`, { waitUntil: "domcontentloaded" });
  await waitForIntro(page);
  await resetLocalState(page);

  await check("work page filters", async () => {
    await page.goto(`${baseUrl}/#work`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await visibleText(page, "Selected projects and spatial studies");
    await page.getByRole("button", { name: "Interior" }).click();
    await visibleText(page, "Stone Apartment");
    await hasNoHorizontalScroll(page);
    await page.screenshot({ path: path.join(outDir, "work-filter-interior.png"), fullPage: true });
  });

  await check("project detail route", async () => {
    await page.goto(`${baseUrl}/#project/courtyard-house`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await visibleText(page, "Courtyard House");
    await visibleText(page, "Concept");
    await page.locator(".gallery").waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("link", { name: "Back to Work" }).click();
    await visibleText(page, "Selected projects and spatial studies");
  });

  await check("contact validation", async () => {
    await page.goto(`${baseUrl}/#contact`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    const panelBackground = await page.locator(".contact-panel").evaluate((node) => getComputedStyle(node).backgroundColor);
    if (panelBackground === "rgb(255, 255, 255)") throw new Error("Contact panel should be visually separated from the white page background.");
    await page.getByRole("button", { name: "Send Inquiry" }).click();
    const invalidCount = await page.locator(".field.invalid").count();
    if (invalidCount < 1) throw new Error("Expected validation errors after empty submit.");
  });

  await check("admin login and edit settings", async () => {
    await page.goto(`${baseUrl}/#admin`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await page.locator("#loginEmail").fill("studio@example.com");
    await page.locator("#loginPassword").fill("architect2026");
  await page.getByRole("button", { name: "Log In" }).click();
    await visibleText(page, "Manage the portfolio");
    await page.locator("[data-admin-tab='settings']").click();
    await page.locator("#siteName").fill("Atelier Test");
    await page.locator("#contactEmail").fill("test@example.com");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await visibleText(page, "Settings saved");
    await page.locator(".brand [data-bind='siteName']").filter({ hasText: "Atelier Test" }).waitFor({ state: "visible", timeout: 5000 });
    const introName = await page.locator(".intro-loader [data-bind='siteName']").textContent();
    if (introName !== "Atelier Test") throw new Error("Intro title did not update with the site name.");
    const stored = await portfolioState(page);
    if (stored.settings.siteName !== "Atelier Test") throw new Error("Settings were not saved.");
    if (stored.settings.contactEmail !== "test@example.com") throw new Error("Contact email was not saved.");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(outDir, "admin-settings.png"), fullPage: true });
  });

  await check("admin create and delete project", async () => {
    await page.getByRole("button", { name: "Projects" }).click();
    const expectedStoryCards = (await portfolioState(page)).projects.filter((item) => item.published).length + 1;
    await page.getByRole("button", { name: "New Project" }).click();
    await page.locator("#title").fill("Playwright Test House");
    await page.locator("#slug").fill("playwright-test-house");
    await page.locator("#location").fill("Test City");
    await page.locator("[data-project-upload='#cover']").setInputFiles(path.join(process.cwd(), "assets", "project-courtyard.png"));
    await page.waitForFunction(() => document.querySelector("#cover")?.value.startsWith("assets/uploads/"));
    await page.locator("[data-project-upload='#media']").setInputFiles([
      path.join(process.cwd(), "assets", "project-interior.png"),
      path.join(process.cwd(), "assets", "project-plan.png")
    ]);
    await page.waitForFunction(() => {
      const value = document.querySelector("#media")?.value || "";
      return value.split(/\n+/).filter((item) => item.startsWith("assets/uploads/")).length >= 2;
    });
    await page.locator("#summary").fill("A temporary project created during automated validation.");
    await page.locator("input[name='published']").check();
    await page.getByRole("button", { name: "Save Project" }).click();
    await visibleText(page, "Project saved");
    await visibleText(page, "Playwright Test House");
    const uploadedPaths = await page.evaluate(async () => {
      const localState = localStorage.getItem("archPortfolioState.v1");
      const stored = localState ? JSON.parse(localState) : await fetch("/api/state").then((response) => response.json());
      const project = stored.projects.find((item) => item.title === "Playwright Test House");
      return [project.cover, ...project.media];
    });
    if (uploadedPaths.some((src) => !src.startsWith("assets/uploads/"))) {
      throw new Error("Uploaded project media was not saved as asset paths.");
    }
    if (JSON.stringify(uploadedPaths).includes("data:image")) {
      throw new Error("Uploaded project media was saved in browser storage.");
    }
    for (const src of uploadedPaths) {
      const absolute = path.join(process.cwd(), src);
      if (!await pathExists(absolute)) throw new Error(`Uploaded file missing on disk: ${src}`);
      uploadedFilesToClean.add(absolute);
    }
    await page.goto(`${baseUrl}/#home`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await visibleText(page, "Playwright Test House");
    await page.locator("[data-story-card]").first().waitFor({ state: "attached", timeout: 5000 });
    const storyCards = await page.locator("[data-story-card]").count();
    if (storyCards !== expectedStoryCards) throw new Error(`Expected ${expectedStoryCards} story cards after creating a project, found ${storyCards}.`);
    await page.goto(`${baseUrl}/#admin`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await page.locator("[data-admin-tab='projects']").click();
    await page.locator("[data-delete-project]").first().click();
    await visibleText(page, "Confirm Action");
    await page.locator(".confirm-dialog [data-confirm-ok]").click();
    await visibleText(page, "Project deleted");
  });

  await check("project hover carousel cycles and returns", async () => {
    await page.goto(`${baseUrl}/#work`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await visibleText(page, "Selected projects and spatial studies");
    const card = page.locator(".project-card").first();
    const firstSrc = await card.locator(".carousel-image").first().getAttribute("src");
    await card.hover();
    await page.waitForTimeout(2200);
    const activeSrc = await card.locator(".carousel-image.active").first().getAttribute("src");
    if (activeSrc === firstSrc) throw new Error("Carousel did not change image on hover.");
    await page.mouse.move(10, 10);
    await page.waitForTimeout(1100);
    const returnedSrc = await card.locator(".carousel-image.active").first().getAttribute("src");
    if (returnedSrc !== firstSrc) throw new Error("Carousel did not return to cover image.");
  });

  await check("story sequence snaps one project at a time", async () => {
    await page.setViewportSize({ width: 1707, height: 900 });
    await page.goto(`${baseUrl}/#home`, { waitUntil: "domcontentloaded" });
    await resetLocalState(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(900, 450);
    await page.mouse.wheel(0, 2600);
    await page.waitForTimeout(1200);
    const entry = await page.evaluate(() => {
      const active = document.querySelector(".story-card.active");
      const rect = active.getBoundingClientRect();
      return {
        active: Number(active.dataset.index || 0),
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight
      };
    });
    if (entry.active !== 0) throw new Error(`Expected fast entry scroll to land on first project, landed on ${entry.active + 1}.`);
    if (entry.top < 80 || entry.bottom > entry.viewportHeight) throw new Error("First story card is not fully visible after entry snap.");
    await page.mouse.wheel(0, 2600);
    await page.waitForTimeout(1100);
    const next = await page.evaluate(() => {
      const active = document.querySelector(".story-card.active");
      const rect = active.getBoundingClientRect();
      return {
        active: Number(active.dataset.index || 0),
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight
      };
    });
    if (next.active !== 1) throw new Error(`Expected second wheel to land on second project, landed on ${next.active + 1}.`);
    if (next.top < 80 || next.bottom > next.viewportHeight) throw new Error("Second story card is not fully visible after snap.");
    await page.screenshot({ path: path.join(outDir, "story-entry-snap.png"), fullPage: false });
  });

  await check("single image projects do not start carousel", async () => {
    await page.goto(`${baseUrl}/#admin`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await ensureAdmin(page);
    await page.locator("[data-admin-tab='projects']").click();
    await page.getByRole("button", { name: "New Project" }).click();
    await page.locator("#title").fill("Single Image House");
    await page.locator("#slug").fill("single-image-house");
    await page.locator("#category").selectOption("Residential");
    await page.locator("#location").fill("Test City");
    await page.locator("#year").fill("2026");
    await page.locator("[data-project-upload='#cover']").setInputFiles(path.join(process.cwd(), "assets", "project-courtyard.png"));
    await page.waitForFunction(() => document.querySelector("#cover")?.value.startsWith("assets/uploads/"));
    await page.locator("#summary").fill("A single cover image should not become a carousel.");
    await page.getByRole("button", { name: "Save Project" }).click();
    await visibleText(page, "Project saved");
    const uploadedCover = await page.evaluate(async () => {
      const localState = localStorage.getItem("archPortfolioState.v1");
      const stored = localState ? JSON.parse(localState) : await fetch("/api/state").then((response) => response.json());
      return stored.projects.find((item) => item.title === "Single Image House")?.cover;
    });
    if (uploadedCover?.startsWith("assets/uploads/")) uploadedFilesToClean.add(path.join(process.cwd(), uploadedCover));
    await page.goto(`${baseUrl}/#work`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await visibleText(page, "Selected projects and spatial studies");
    await visibleText(page, "Single Image House");
    const singleCard = page.locator(".project-card", { hasText: "Single Image House" }).first();
    const imageCount = await singleCard.locator(".carousel-image").count();
    const hasCarousel = await singleCard.locator("[data-carousel]").count();
    if (imageCount !== 1) throw new Error(`Expected one image, found ${imageCount}.`);
    if (hasCarousel !== 0) throw new Error("Single-image project still has carousel behavior.");
    await page.goto(`${baseUrl}/#admin`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await page.locator("[data-admin-tab='projects']").click();
    await page.locator("[data-delete-project]").first().click();
    await visibleText(page, "Confirm Action");
    await page.locator(".confirm-dialog [data-confirm-ok]").click();
    await visibleText(page, "Project deleted");
  });

  await check("keyboard focus visible", async () => {
    await page.goto(`${baseUrl}/#home`, { waitUntil: "domcontentloaded" });
    await waitForIntro(page);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => Boolean(document.activeElement && document.activeElement.matches(":focus-visible")));
    if (!focused) throw new Error("Expected visible keyboard focus.");
  });
  await page.close();

  const reducePage = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: "reduce" });
  await check("reduced motion renders", async () => {
    await reducePage.goto(`${baseUrl}/#home`, { waitUntil: "domcontentloaded" });
    await resetLocalState(reducePage);
    await reducePage.reload({ waitUntil: "domcontentloaded" });
    await waitForIntro(reducePage);
    await visibleText(reducePage, "Architecture shaped by light");
    await hasNoHorizontalScroll(reducePage);
    await reducePage.screenshot({ path: path.join(outDir, "mobile-reduced-motion.png"), fullPage: true });
  });
  await reducePage.close();

  await browser.close();
  for (const filePath of uploadedFilesToClean) {
    await fs.rm(filePath, { force: true });
  }
  await restoreServerState(originalState);
  console.table(results);
  await removeChromiumDebugLog();
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length) process.exit(1);
})();
