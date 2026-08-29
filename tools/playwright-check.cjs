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

  const heroFitPage = await browser.newPage({ viewport: { width: 1707, height: 900 } });
  await check("wide desktop hero fits first viewport", async () => {
    await heroFitPage.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
    await resetLocalState(heroFitPage);
    await heroFitPage.reload({ waitUntil: "networkidle" });
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
    await page.locator("#contactEmail").fill("test@example.com");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await visibleText(page, "Settings saved");
    await visibleText(page, "Atelier Test");
    const introName = await page.locator(".intro-loader [data-bind='siteName']").textContent();
    if (introName !== "Atelier Test") throw new Error("Intro title did not update with the site name.");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("archPortfolioState.v1")));
    if (stored.settings.siteName !== "Atelier Test") throw new Error("Settings were not saved.");
    if (stored.settings.contactEmail !== "test@example.com") throw new Error("Contact email was not saved.");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(outDir, "admin-settings.png"), fullPage: true });
  });

  await check("admin create and delete project", async () => {
    await page.getByRole("button", { name: "Projects" }).click();
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
    const uploadedPaths = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("archPortfolioState.v1"));
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
    await page.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    await visibleText(page, "Playwright Test House");
    await visibleText(page, "01 / 05");
    const storyCards = await page.locator("[data-story-card]").count();
    if (storyCards !== 5) throw new Error(`Expected 5 story cards after creating a project, found ${storyCards}.`);
    await page.goto(`${baseUrl}/#admin`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    await page.locator("[data-admin-tab='projects']").click();
    await page.locator("[data-delete-project]").first().click();
    await visibleText(page, "Confirm Action");
    await page.locator(".confirm-dialog [data-confirm-ok]").click();
    await visibleText(page, "Project deleted");
  });

  await check("project hover carousel cycles and returns", async () => {
    await page.goto(`${baseUrl}/#work`, { waitUntil: "networkidle" });
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
    await page.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
    await resetLocalState(page);
    await page.reload({ waitUntil: "networkidle" });
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
    await page.goto(`${baseUrl}/#admin`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    if (await page.locator("[data-admin-tab='projects']").count() === 0) {
      await visibleText(page, "Portfolio Control Room");
      await page.locator("#loginEmail").fill("studio@example.com");
      await page.locator("#loginPassword").fill("architect2026");
      await page.getByRole("button", { name: "Log In" }).click();
      await visibleText(page, "Manage the portfolio");
    }
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
    const uploadedCover = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("archPortfolioState.v1"));
      return stored.projects.find((item) => item.title === "Single Image House")?.cover;
    });
    if (uploadedCover?.startsWith("assets/uploads/")) uploadedFilesToClean.add(path.join(process.cwd(), uploadedCover));
    await page.goto(`${baseUrl}/#work`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    await visibleText(page, "Selected projects and spatial studies");
    await visibleText(page, "Single Image House");
    const singleCard = page.locator(".project-card", { hasText: "Single Image House" }).first();
    const imageCount = await singleCard.locator(".carousel-image").count();
    const hasCarousel = await singleCard.locator("[data-carousel]").count();
    if (imageCount !== 1) throw new Error(`Expected one image, found ${imageCount}.`);
    if (hasCarousel !== 0) throw new Error("Single-image project still has carousel behavior.");
    await page.goto(`${baseUrl}/#admin`, { waitUntil: "networkidle" });
    await waitForIntro(page);
    await page.locator("[data-admin-tab='projects']").click();
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
  for (const filePath of uploadedFilesToClean) {
    await fs.rm(filePath, { force: true });
  }
  console.table(results);
  await removeChromiumDebugLog();
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length) process.exit(1);
})();
