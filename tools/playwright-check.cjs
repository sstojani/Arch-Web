const fs = require("fs/promises");
const os = require("os");
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
const outDir = process.env.PORTFOLIO_SCREENSHOT_DIR || path.join(os.tmpdir(), "arch-web-playwright");

const results = [];
const uploadedFilesToClean = new Set();

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: "passed" });
  } catch (error) {
    results.push({ name, status: "failed", message: error.message });
  }
}

async function visibleText(page, text) {
  await page.waitForFunction((needle) => {
    return [...document.body.querySelectorAll("*")].some((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return node.textContent.includes(needle) && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    });
  }, text, { timeout: 5000 });
}

async function waitForApp(page) {
  await page.waitForFunction(() => document.body.classList.contains("intro-complete"), null, { timeout: 5000 });
}

async function hasNoHorizontalScroll(page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  if (!ok) throw new Error("Page has horizontal scrolling.");
}

async function assertNoBrokenImages(page) {
  await page.waitForTimeout(900);
  const broken = await page.evaluate(() => [...document.querySelectorAll("img")].filter((img) => !img.complete || img.naturalWidth === 0).length);
  if (broken) throw new Error(`${broken} image(s) failed to render.`);
}

async function assertMinimalShell(page) {
  const shell = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    intro: document.querySelector(".intro-loader") ? getComputedStyle(document.querySelector(".intro-loader")).display : "missing",
    ambient: document.querySelector(".ambient-scene") ? getComputedStyle(document.querySelector(".ambient-scene")).display : "missing",
    oldHero: document.querySelectorAll(".hero-media, .scroll-cinema, .work-story").length,
    brandMark: document.querySelectorAll(".brand-mark").length
  }));
  if (shell.background !== "rgb(255, 255, 255)") throw new Error(`Expected pure white background, got ${shell.background}.`);
  if (shell.intro !== "none" && shell.intro !== "missing") throw new Error("Intro loader should be disabled in the minimal redesign.");
  if (shell.ambient !== "none" && shell.ambient !== "missing") throw new Error("Ambient 3D scene should be disabled in the minimal redesign.");
  if (shell.oldHero) throw new Error("Old cinematic homepage sections should not render.");
  if (shell.brandMark) throw new Error("Navbar logo mark should not render.");
}

async function assertFixedTransparentHeader(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(80);
  const before = await page.evaluate(() => {
    const header = document.querySelector(".site-header");
    const brand = document.querySelector(".brand");
    const navLink = document.querySelector(".site-nav a");
    return {
      top: Math.round(header.getBoundingClientRect().top),
      position: getComputedStyle(header).position,
      background: getComputedStyle(header).backgroundColor,
      backdropFilter: getComputedStyle(header).backdropFilter || "none",
      webkitBackdropFilter: getComputedStyle(header).webkitBackdropFilter || "none",
      boxShadow: getComputedStyle(header).boxShadow,
      brandColor: getComputedStyle(brand).color,
      navColor: getComputedStyle(navLink).color
    };
  });
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(80);
  const after = await page.evaluate(() => {
    const header = document.querySelector(".site-header");
    return {
      top: Math.round(header.getBoundingClientRect().top),
      background: getComputedStyle(header).backgroundColor,
      backdropFilter: getComputedStyle(header).backdropFilter || "none",
      webkitBackdropFilter: getComputedStyle(header).webkitBackdropFilter || "none",
      boxShadow: getComputedStyle(header).boxShadow
    };
  });
  if (before.position !== "fixed" || before.top !== 0 || after.top !== 0) {
    throw new Error(`Header should stay fixed during scroll: ${JSON.stringify({ before, after })}.`);
  }
  if (before.background !== "rgba(0, 0, 0, 0)" || after.background !== "rgba(0, 0, 0, 0)") {
    throw new Error(`Header should remain transparent: ${JSON.stringify({ before, after })}.`);
  }
  if (before.backdropFilter !== "none" || before.webkitBackdropFilter !== "none" || after.backdropFilter !== "none" || after.webkitBackdropFilter !== "none") {
    throw new Error(`Header should not blur page content: ${JSON.stringify({ before, after })}.`);
  }
  if (before.boxShadow !== "none" || after.boxShadow !== "none") {
    throw new Error(`Header should not cast a visible overlay shadow: ${JSON.stringify({ before, after })}.`);
  }
  if (before.brandColor !== "rgb(0, 0, 0)" || before.navColor !== "rgb(0, 0, 0)") {
    throw new Error(`Header text should stay black: ${JSON.stringify(before)}.`);
  }
}

async function assertMinimalGrid(page, expectedColumns) {
  const grid = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".project-grid .project-card")];
    const covers = cards.map((card) => {
      const rect = card.querySelector(".project-cover")?.getBoundingClientRect();
      return rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null;
    }).filter(Boolean);
    return {
      cardCount: cards.length,
      carouselCount: document.querySelectorAll("[data-carousel]").length,
      columns: getComputedStyle(document.querySelector(".project-grid")).gridTemplateColumns.split(" ").length,
      gap: getComputedStyle(document.querySelector(".project-grid")).gap,
      covers
    };
  });
  if (grid.cardCount < 1) throw new Error("Expected project cards in the minimal gallery.");
  if (grid.carouselCount) throw new Error(`Expected carousel behavior to be removed, found ${grid.carouselCount} carousel trigger(s).`);
  if (expectedColumns && grid.columns !== expectedColumns) throw new Error(`Expected ${expectedColumns} gallery columns, got ${grid.columns}.`);
  if (parseFloat(grid.gap) < 15) throw new Error(`Project image separators should be at least 15px, got ${grid.gap}.`);
  const [first, second] = grid.covers;
  if (first && second && (Math.abs(first.width - second.width) > 1 || Math.abs(first.height - second.height) > 1)) {
    throw new Error(`Project covers are uneven: ${JSON.stringify(grid.covers.slice(0, 2))}.`);
  }
}

async function assertProjectHoverTitle(page) {
  const card = page.locator(".project-card").first();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error("Could not locate first project card for hover check.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(220);
  const hover = await page.evaluate(() => {
    const firstCard = document.querySelector(".project-card");
    const meta = firstCard?.querySelector(".project-meta");
    const title = meta?.querySelector("h3");
    if (!meta || !title) return null;
    return {
      opacity: Number(getComputedStyle(meta).opacity),
      title: title.textContent.trim(),
      color: getComputedStyle(title).color
    };
  });
  if (!hover || hover.opacity < 0.9 || !hover.title || hover.color !== "rgb(255, 255, 255)") {
    throw new Error(`Project hover title is not visible: ${JSON.stringify(hover)}.`);
  }
}

async function assertImageLightbox(page) {
  const trigger = page.locator(".project-image-flow img[data-lightbox-src]").first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.locator(".image-lightbox").waitFor({ state: "visible", timeout: 5000 });

  const opened = await page.evaluate(() => {
    const modal = document.querySelector(".image-lightbox");
    const image = modal?.querySelector(".image-lightbox-stage img");
    const controls = modal?.querySelectorAll(".image-lightbox-controls button");
    const arrows = modal ? [...modal.querySelectorAll(".image-lightbox-arrow")] : [];
    const close = modal?.querySelector(".image-lightbox-close");
    const caption = modal?.querySelector(".image-lightbox-caption");
    const rect = modal?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    return {
      role: modal?.getAttribute("role"),
      modal: rect ? {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      } : null,
      image: imageRect ? {
        width: Math.round(imageRect.width),
        height: Math.round(imageRect.height)
      } : null,
      imageSrc: image?.getAttribute("src") || "",
      bodyLocked: document.body.classList.contains("lightbox-open"),
      imageComplete: Boolean(image?.complete && image?.naturalWidth),
      controls: controls?.length || 0,
      arrows: arrows.filter((button) => !button.hidden).length,
      closeSize: close ? Math.round(close.getBoundingClientRect().width) : 0,
      captionExists: Boolean(caption),
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  });

  if (opened.role !== "dialog" || !opened.bodyLocked || !opened.imageComplete || opened.controls !== 0 || opened.closeSize < 44) {
    throw new Error(`Image lightbox did not open correctly: ${JSON.stringify(opened)}.`);
  }
  if (opened.captionExists || opened.arrows !== 2 || opened.horizontalScroll) {
    throw new Error(`Image lightbox details/layout are not correct: ${JSON.stringify(opened)}.`);
  }
  if (opened.modal.top !== 0 || opened.modal.left !== 0 || opened.modal.width < 360 || opened.modal.height < 700) {
    throw new Error(`Image lightbox should fill the viewport: ${JSON.stringify(opened)}.`);
  }
  if (!opened.image || opened.image.width < opened.modal.width * 0.28 || opened.image.height < opened.modal.height * 0.45) {
    throw new Error(`Image lightbox should show a large full-quality image: ${JSON.stringify(opened)}.`);
  }

  await page.locator("[data-lightbox-next]").click();
  await page.waitForTimeout(520);
  const afterNext = await page.evaluate(() => document.querySelector(".image-lightbox-stage img")?.getAttribute("src") || "");
  if (afterNext === opened.imageSrc) {
    throw new Error("Image lightbox next arrow did not advance to another project image.");
  }

  await page.evaluate(() => {
    const stage = document.querySelector(".image-lightbox-stage");
    const rect = stage.getBoundingClientRect();
    stage.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: rect.left + rect.width * 0.75,
      clientY: rect.top + rect.height * 0.5,
      pointerId: 1,
      pointerType: "touch"
    }));
    stage.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      clientX: rect.left + rect.width * 0.2,
      clientY: rect.top + rect.height * 0.5,
      pointerId: 1,
      pointerType: "touch"
    }));
  });
  await page.waitForTimeout(520);
  const afterSwipe = await page.evaluate(() => document.querySelector(".image-lightbox-stage img")?.getAttribute("src") || "");
  if (afterSwipe === afterNext) {
    throw new Error("Image lightbox swipe did not advance to another project image.");
  }

  await page.locator(".image-lightbox-close").click();
  await page.locator(".image-lightbox").waitFor({ state: "detached", timeout: 5000 });
  const closed = await page.evaluate(() => document.body.classList.contains("lightbox-open"));
  if (closed) throw new Error("Image lightbox did not release the page after closing.");
}

async function assertWorkIntroFixedUnderGallery(page) {
  await page.goto(`${baseUrl}/#work`, { waitUntil: "networkidle" });
  await waitForApp(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  const before = await page.evaluate(() => ({
    introTop: Math.round(document.querySelector(".minimal-intro").getBoundingClientRect().top),
    coverTop: Math.round(document.querySelector(".project-cover").getBoundingClientRect().top),
    introPosition: getComputedStyle(document.querySelector(".minimal-intro")).position,
    introTextOpacity: Number(getComputedStyle(document.querySelector(".minimal-intro h1")).opacity),
    introTextTop: Math.round(document.querySelector(".minimal-intro h1").getBoundingClientRect().top),
    introTextTransform: getComputedStyle(document.querySelector(".minimal-intro h1")).transform
  }));
  const scrollGalleryTo = async (targetY, minimumScrollY = 0) => {
    await page.evaluate(({ targetY, minimumScrollY }) => {
      const gallery = document.querySelector(".minimal-gallery");
      const galleryTop = gallery.getBoundingClientRect().top;
      window.scrollTo(0, Math.max(minimumScrollY, window.scrollY + galleryTop - targetY));
    }, { targetY, minimumScrollY });
    await page.waitForTimeout(140);
  };
  const readFadeState = () => page.evaluate(() => {
    const intro = document.querySelector(".minimal-intro");
    const textNodes = [...intro.querySelectorAll("h1, p")];
    const textBounds = textNodes.reduce((bounds, node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: Math.min(bounds.top, rect.top),
        bottom: Math.max(bounds.bottom, rect.bottom)
      };
    }, { top: Number.POSITIVE_INFINITY, bottom: 0 });
    return {
      scrollY: Math.round(window.scrollY),
      introTop: Math.round(intro.getBoundingClientRect().top),
      coverTop: Math.round(document.querySelector(".project-cover").getBoundingClientRect().top),
      introTextOpacity: Number(getComputedStyle(document.querySelector(".minimal-intro h1")).opacity),
      introTextTop: Math.round(document.querySelector(".minimal-intro h1").getBoundingClientRect().top),
      introTextTransform: getComputedStyle(document.querySelector(".minimal-intro h1")).transform,
      textTop: Math.round(textBounds.top),
      textBottom: Math.round(textBounds.bottom),
      galleryTop: Math.round(document.querySelector(".minimal-gallery").getBoundingClientRect().top),
      galleryBackground: getComputedStyle(document.querySelector(".minimal-gallery")).backgroundColor,
      galleryMaskBackground: getComputedStyle(document.querySelector(".minimal-gallery"), "::before").backgroundColor,
      galleryMaskWidth: Math.round(parseFloat(getComputedStyle(document.querySelector(".minimal-gallery"), "::before").width)),
      viewportWidth: Math.round(window.innerWidth),
      gridBackground: getComputedStyle(document.querySelector(".project-grid")).backgroundColor
    };
  });
  const startBounds = await readFadeState();
  await scrollGalleryTo(startBounds.textBottom + 120, 96);
  const approach = await readFadeState();
  await scrollGalleryTo(approach.textBottom - 8, 160);
  const touch = await readFadeState();
  await scrollGalleryTo(touch.textTop + 18, 260);
  const after = await readFadeState();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  const returned = await page.evaluate(() => ({
    introTextOpacity: Number(getComputedStyle(document.querySelector(".minimal-intro h1")).opacity),
    introTextTop: Math.round(document.querySelector(".minimal-intro h1").getBoundingClientRect().top),
    introTextTransform: getComputedStyle(document.querySelector(".minimal-intro h1")).transform
  }));
  if (before.introPosition !== "fixed") throw new Error(`Expected Work intro to be fixed, got ${before.introPosition}.`);
  if (before.introTextOpacity < 0.98) throw new Error(`Work intro should start fully visible: ${JSON.stringify(before)}.`);
  if (Math.abs(approach.introTop - before.introTop) > 1 || Math.abs(touch.introTop - before.introTop) > 1 || Math.abs(after.introTop - before.introTop) > 1) {
    throw new Error(`Work intro moved during scroll: ${JSON.stringify({ before, approach, touch, after })}.`);
  }
  if (Math.abs(after.introTextTop - before.introTextTop) > 1 || approach.introTextTransform !== "none" || touch.introTextTransform !== "none" || after.introTextTransform !== "none") {
    throw new Error(`Work intro text should fade in place without sliding: ${JSON.stringify({ before, approach, touch, after })}.`);
  }
  if (after.coverTop >= before.coverTop) throw new Error(`Work gallery did not move upward on scroll: before ${before.coverTop}, after ${after.coverTop}.`);
  if (approach.introTextOpacity < 0.62) throw new Error(`Work intro fades too early while images approach: ${JSON.stringify(approach)}.`);
  if (touch.introTextOpacity < 0.28 || touch.introTextOpacity > 0.78) throw new Error(`Work intro should be partially faded when images touch the text: ${JSON.stringify(touch)}.`);
  if (after.galleryTop > after.textTop + 24) throw new Error(`Test did not reach the end fade point: ${JSON.stringify(after)}.`);
  if (after.introTextOpacity > 0.04) {
    throw new Error(`Work intro should fade out during scroll: ${JSON.stringify(after)}.`);
  }
  if (returned.introTextOpacity < 0.98 || Math.abs(returned.introTextTop - before.introTextTop) > 1 || returned.introTextTransform !== "none") {
    throw new Error(`Work intro should restore when scrolling back up: ${JSON.stringify(returned)}.`);
  }
  if (after.galleryBackground !== "rgb(255, 255, 255)" || after.gridBackground !== "rgb(255, 255, 255)") {
    throw new Error(`Work gallery should mask the fixed intro with white layers: ${JSON.stringify(after)}.`);
  }
  if (after.galleryMaskBackground !== "rgb(255, 255, 255)" || after.galleryMaskWidth < after.viewportWidth) {
    throw new Error(`Work gallery mask should span the full viewport: ${JSON.stringify(after)}.`);
  }
}

async function assertAdminCardsDoNotOverlap(page) {
  const layout = await page.evaluate(() => {
    const card = document.querySelector(".admin-card.project-card");
    if (!card) return null;
    const image = card.querySelector("img");
    const title = card.querySelector("h3");
    const actions = card.querySelector(".admin-actions");
    const rect = (node) => {
      const bounds = node.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
    };
    return {
      image: rect(image),
      title: rect(title),
      actions: rect(actions),
      imagePosition: getComputedStyle(image).position,
      cardOverflow: getComputedStyle(card).overflow
    };
  });
  if (!layout) throw new Error("Expected admin project cards to render.");
  if (layout.imagePosition === "absolute") throw new Error("Admin project image is still using public absolute card positioning.");
  if (layout.cardOverflow === "hidden") throw new Error("Admin project card should not hide its text/actions.");
  if (layout.image.bottom > layout.title.top || layout.title.bottom > layout.actions.top) {
    throw new Error(`Admin project card content overlaps: ${JSON.stringify(layout)}.`);
  }
}

async function hasMobileGutters(page, selectors, minimum = 16) {
  const failures = await page.evaluate(({ selectors, minimum }) => selectors.flatMap((selector) => {
    const node = document.querySelector(selector);
    if (!node) return [`${selector} not found`];
    const rect = node.getBoundingClientRect();
    if (rect.left < minimum || rect.right > window.innerWidth - minimum) {
      return [`${selector} has weak gutter: left ${Math.round(rect.left)}, right ${Math.round(rect.right)}, width ${window.innerWidth}`];
    }
    return [];
  }), { selectors, minimum });
  if (failures.length) throw new Error(failures.join("; "));
}

async function assertMobileNavigation(page) {
  const closed = await page.evaluate(() => {
    const lines = [...document.querySelectorAll(".menu-toggle span:not(.sr-only)")];
    return {
      lineCount: lines.length,
      visibleLines: lines.filter((line) => getComputedStyle(line).display !== "none").length
    };
  });
  if (closed.lineCount !== 3 || closed.visibleLines !== 3) {
    throw new Error(`Mobile menu should show a three-line burger icon: ${JSON.stringify(closed)}.`);
  }

  await page.locator(".menu-toggle").click();
  await page.waitForTimeout(120);
  const open = await page.evaluate(() => {
    const nav = document.querySelector(".site-nav");
    const links = [...document.querySelectorAll(".site-nav a")];
    const navRect = nav.getBoundingClientRect();
    const linkCenters = links.map((link) => {
      const rect = link.getBoundingClientRect();
      return Math.round(rect.left + rect.width / 2);
    });
    return {
      display: getComputedStyle(nav).display,
      position: getComputedStyle(nav).position,
      navCenterX: Math.round(navRect.left + navRect.width / 2),
      linkCenters,
      viewportCenterX: Math.round(window.innerWidth / 2)
    };
  });
  if (open.display !== "grid" || open.position !== "fixed") {
    throw new Error(`Mobile nav should open as a centered fixed panel: ${JSON.stringify(open)}.`);
  }
  if (open.linkCenters.some((center) => Math.abs(center - open.viewportCenterX) > 2)) {
    throw new Error(`Mobile nav links should be centered: ${JSON.stringify(open)}.`);
  }
  await page.locator(".menu-toggle").click();
}

async function assertMobileGridIsImageOnly(page) {
  const grid = await page.evaluate(() => {
    const meta = [...document.querySelectorAll(".project-card .project-meta")].map((node) => ({
      display: getComputedStyle(node).display,
      height: Math.round(node.getBoundingClientRect().height)
    }));
    return {
      gap: getComputedStyle(document.querySelector(".project-grid")).gap,
      meta,
      cards: document.querySelectorAll(".project-card").length
    };
  });
  if (grid.cards < 1) throw new Error("Expected mobile project cards to render.");
  if (parseFloat(grid.gap) < 15) throw new Error(`Mobile project images should have at least 15px background separators, got ${grid.gap}.`);
  if (grid.meta.some((item) => item.display !== "none" || item.height !== 0)) {
    throw new Error(`Mobile project captions should be hidden in the image grid: ${JSON.stringify(grid)}.`);
  }
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

async function portfolioState(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/state");
    if (!response.ok) throw new Error(`State API returned ${response.status}.`);
    return response.json();
  });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForPathsRemoved(paths) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const existing = [];
    for (const src of paths) {
      const absolute = path.join(process.cwd(), src);
      if (await pathExists(absolute)) existing.push(src);
    }
    if (!existing.length) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Uploaded files were not deleted from disk: ${paths.join(", ")}.`);
}

async function createTestVideoFile(page) {
  const result = await page.evaluate(async () => {
    if (!("MediaRecorder" in window)) throw new Error("MediaRecorder is not available in this browser.");
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 54;
    const context = canvas.getContext("2d");
    const stream = canvas.captureStream(12);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    const stopped = new Promise((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = resolve;
    });
    let frame = 0;
    const drawFrame = () => {
      context.fillStyle = frame % 2 ? "#11130f" : "#f7f7f4";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#c65c2e";
      context.fillRect(14 + frame * 3, 18, 24, 18);
      frame += 1;
    };
    recorder.start();
    const timer = setInterval(drawFrame, 80);
    await new Promise((resolve) => setTimeout(resolve, 720));
    clearInterval(timer);
    drawFrame();
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const buffer = await new Blob(chunks, { type: "video/webm" }).arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  });
  return {
    name: "playwright-test-video.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(result)
  };
}

function isVideoPath(src = "") {
  return /\.(m4v|mov|mp4|ogg|ogv|webm)(\?.*)?$/i.test(src);
}

(async () => {
  await fs.rm(path.join(process.cwd(), "debug.log"), { force: true });
  await fs.mkdir(outDir, { recursive: true });
  const originalState = await readServerState();
  const browser = await chromium.launch({ headless: true });

  await check("minimal home renders on desktop", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
    await waitForApp(page);
    await page.locator(".brand [data-bind='siteName']").filter({ hasText: "V2 XHES" }).waitFor({ state: "visible", timeout: 5000 });
    await visibleText(page, "I design homes");
    await assertMinimalShell(page);
    await assertFixedTransparentHeader(page);
    await assertMinimalGrid(page, 3);
    await assertProjectHoverTitle(page);
    const workLightboxImages = await page.locator(".project-grid img[data-lightbox-src]").count();
    if (workLightboxImages) throw new Error("Work thumbnails should navigate to projects instead of opening the image viewer.");
    await hasNoHorizontalScroll(page);
    await assertNoBrokenImages(page);
    await page.close();
  });

  await check("minimal home renders on mobile", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
    await waitForApp(page);
    await assertMinimalShell(page);
    await assertFixedTransparentHeader(page);
    await assertMinimalGrid(page, 1);
    await assertMobileNavigation(page);
    await assertMobileGridIsImageOnly(page);
    const workLightboxImages = await page.locator(".project-grid img[data-lightbox-src]").count();
    if (workLightboxImages) throw new Error("Mobile work thumbnails should not open the image viewer directly.");
    await hasMobileGutters(page, [".brand", ".minimal-intro h1"]);
    await hasNoHorizontalScroll(page);
    await assertNoBrokenImages(page);
    await page.close();
  });

  await check("mobile work archive is image-only", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(`${baseUrl}/#work`, { waitUntil: "networkidle" });
    await waitForApp(page);
    await assertMinimalGrid(page, 1);
    await assertMobileGridIsImageOnly(page);
    await hasNoHorizontalScroll(page);
    await assertNoBrokenImages(page);
    await page.close();
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await check("work archive keeps equal gallery tiles", async () => {
    await page.goto(`${baseUrl}/#work`, { waitUntil: "networkidle" });
    await waitForApp(page);
    await assertMinimalGrid(page, 3);
    await assertFixedTransparentHeader(page);
    await assertWorkIntroFixedUnderGallery(page);
    await hasNoHorizontalScroll(page);
    await assertNoBrokenImages(page);
  });

  await check("project detail renders minimal image-led case study", async () => {
    await page.goto(`${baseUrl}/#project/courtyard-house`, { waitUntil: "networkidle" });
    await waitForApp(page);
    await visibleText(page, "Courtyard House");
    await visibleText(page, "Concept");
    await page.locator(".project-facts").waitFor({ state: "visible", timeout: 5000 });
    await page.locator(".project-image-flow").waitFor({ state: "visible", timeout: 5000 });
    await assertImageLightbox(page);
    await hasNoHorizontalScroll(page);
    await assertNoBrokenImages(page);
  });

  await check("about and contact are mobile friendly", async () => {
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
    await mobile.goto(`${baseUrl}/#about`, { waitUntil: "networkidle" });
    await waitForApp(mobile);
    await mobile.locator(".about-copy").waitFor({ state: "visible", timeout: 5000 });
    await visibleText(mobile, "I design");
    if (await mobile.locator("#contactForm").count()) throw new Error("About page should not render the contact form.");
    await hasMobileGutters(mobile, [".brand", ".about-copy", ".about-services"]);
    await hasNoHorizontalScroll(mobile);
    await mobile.goto(`${baseUrl}/#contact`, { waitUntil: "networkidle" });
    await waitForApp(mobile);
    await visibleText(mobile, "Contact");
    await mobile.getByRole("button", { name: "Send Inquiry" }).click();
    const invalidCount = await mobile.locator(".field.invalid").count();
    if (invalidCount < 1) throw new Error("Expected validation errors after empty submit.");
    await hasNoHorizontalScroll(mobile);
    await mobile.close();
  });

  await check("admin settings and project uploads still work", async () => {
    await page.goto(`${baseUrl}/#admin`, { waitUntil: "networkidle" });
    await waitForApp(page);
    await page.locator("#loginEmail, [data-admin-tab='projects']").first().waitFor({ state: "visible", timeout: 7000 });
    if (!await page.locator("[data-admin-tab='projects']").count()) {
      await page.locator("#loginEmail").fill("studio@example.com");
      await page.locator("#loginPassword").fill("architect2026");
      await page.getByRole("button", { name: "Log In" }).click();
      await visibleText(page, "Manage the portfolio");
    }
    if (await page.locator("[data-admin-tab='media']").count()) throw new Error("Admin should not expose a separate Media tab.");

    await page.locator("[data-admin-tab='settings']").click();
    await page.locator("#siteName").fill("Atelier Test");
    await page.locator("#contactEmail").fill("test@example.com");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await visibleText(page, "Settings saved");
    await page.locator(".brand [data-bind='siteName']").filter({ hasText: "Atelier Test" }).waitFor({ state: "visible", timeout: 5000 });

    await page.locator("[data-admin-tab='projects']").click();
    await assertAdminCardsDoNotOverlap(page);
    const expectedProjects = (await portfolioState(page)).projects.filter((item) => item.published).length + 1;
    await page.getByRole("button", { name: "New Project" }).click();
    await page.locator("#title").fill("Playwright Test House");
    await page.locator("#slug").fill("playwright-test-house");
    await page.locator("#location").fill("Test City");
    await page.locator("[data-project-upload='#cover']").setInputFiles(path.join(process.cwd(), "assets", "project-courtyard.png"));
    await page.waitForFunction(() => document.querySelector("#cover")?.value.startsWith("assets/uploads/"));
    const backgroundVideo = await createTestVideoFile(page);
    await page.locator("[data-project-upload='#backgroundMedia']").setInputFiles(backgroundVideo);
    await page.waitForFunction(() => document.querySelector("#backgroundMedia")?.value.startsWith("assets/uploads/"));
    await page.locator("#summary").fill("A temporary project created during automated validation.");
    await page.locator("input[name='published']").check();
    await page.getByRole("button", { name: "Save Project" }).click();
    await visibleText(page, "Project saved");
    const uploadedPaths = await page.evaluate(async () => {
      const stored = await fetch("/api/state").then((response) => response.json());
      const project = stored.projects.find((item) => item.title === "Playwright Test House");
      return [project.cover, project.backgroundMedia, ...project.media].filter(Boolean);
    });
    if (uploadedPaths.some((src) => !src.startsWith("assets/uploads/"))) throw new Error("Uploaded project media was not saved as asset paths.");
    const uploadedVideo = uploadedPaths.find(isVideoPath);
    if (!uploadedVideo) throw new Error("Uploaded video was not saved with the project.");
    const rangeResponse = await fetch(`${baseUrl}/${uploadedVideo}`, { headers: { range: "bytes=0-31" } });
    if (rangeResponse.status !== 206) throw new Error(`Video uploads should support range playback, got HTTP ${rangeResponse.status}.`);
    for (const src of uploadedPaths) uploadedFilesToClean.add(path.join(process.cwd(), src));

    await page.goto(`${baseUrl}/#project/playwright-test-house`, { waitUntil: "networkidle" });
    await waitForApp(page);
    const optionalProjectText = await page.locator(".project-facts, .meta-list").allTextContents();
    const joinedProjectText = optionalProjectText.join("\n");
    for (const hiddenLabel of ["Scope of work:", "Year", "Status", "Category", "Role", "Area"]) {
      if (joinedProjectText.includes(hiddenLabel)) {
        throw new Error(`Optional empty project value should not be visible: ${hiddenLabel}`);
      }
    }

    await page.goto(`${baseUrl}/#home`, { waitUntil: "networkidle" });
    await waitForApp(page);
    await visibleText(page, "Playwright Test House");
    const cards = await page.locator(".project-card").count();
    if (cards !== expectedProjects) throw new Error(`Expected ${expectedProjects} project cards, found ${cards}.`);

    await page.goto(`${baseUrl}/#admin`, { waitUntil: "networkidle" });
    await waitForApp(page);
    await page.locator("[data-admin-tab='projects']").click();
    await page.locator("[data-delete-project]").first().click();
    await visibleText(page, "Confirm Action");
    await page.locator(".confirm-dialog [data-confirm-ok]").click();
    await visibleText(page, "Project deleted");
    await waitForPathsRemoved(uploadedPaths);
  });

  await page.close();

  if (uploadedFilesToClean.size) {
    await Promise.all([...uploadedFilesToClean].map((filePath) => fs.rm(filePath, { force: true })));
  }
  await restoreServerState(originalState);
  await browser.close();

  console.table(results);
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length) process.exitCode = 1;
})().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
