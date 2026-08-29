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

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const { chromium } = loadPlaywright();
const args = process.argv.slice(2);
const url = args.find((arg) => !arg.startsWith("--")) || "http://127.0.0.1:4173/#home";
const width = Number(argValue("width", "1440"));
const height = Number(argValue("height", "1000"));
const wait = Number(argValue("wait", "600"));
const scroll = Number(argValue("scroll", "0"));
const fullPage = process.argv.includes("--full");
const outDir = path.join(process.cwd(), "output", "playwright");
const outPath = argValue("out", path.join(outDir, "manual-view.png"));

(async () => {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height } });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.querySelector(".intro-loader") || document.body.classList.contains("intro-complete"),
    null,
    { timeout: 8000 }
  ).catch(() => {});

  if (scroll) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), scroll);
    await page.waitForTimeout(wait);
  } else {
    await page.waitForTimeout(wait);
  }

  const info = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    viewport: `${innerWidth}x${innerHeight}`,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    activeStory: document.querySelector(".story-current h3")?.textContent || null,
    bodyRoute: document.body.dataset.route || null
  }));

  await page.screenshot({ path: outPath, fullPage });
  await browser.close();

  console.log(JSON.stringify({ ...info, screenshot: outPath }, null, 2));
})();
