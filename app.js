const LEGACY_STORAGE_KEY = "archPortfolioState.v1";

let adminAuthenticated = false;
let serverStateExists = false;
let legacyStatePendingMigration = false;
let stateSaveQueue = Promise.resolve();

const imageBank = [
  "assets/project-courtyard.png",
  "assets/project-interior.png",
  "assets/project-gallery.png",
  "assets/project-harbor.png",
  "assets/project-plan.png",
  "assets/project-facade.png"
];

const seedState = {
  settings: {
    siteName: "Atelier Semir",
    heroTitle: "Architecture shaped by light, material, and restraint.",
    tagline: "Architectural design, interiors, planning, and spatial storytelling.",
    intro:
      "I design homes, interiors, and spatial concepts that balance precision with atmosphere. Each project begins with context: the site, the people, the material logic, and the feeling a space should leave behind.",
    philosophy:
      "My work favors clear structure, honest materials, generous daylight, and details that feel inevitable rather than decorative.",
    contactEmail: "hello@ateliersemir.com",
    phone: "+355 00 000 000",
    instagram: "https://instagram.com/",
    linkedin: "https://linkedin.com/",
    accent: "#c65c2e",
    navWork: "Work",
    navAbout: "About",
    navContact: "Contact",
    seoTitle: "Atelier Semir | Architecture Portfolio",
    seoDescription: "A refined architecture portfolio with selected residential, interior, commercial, and urban work."
  },
  services: [
    {
      title: "Architectural Design",
      text: "Concept design, planning, spatial strategy, and full project documentation for thoughtful buildings."
    },
    {
      title: "Interior Architecture",
      text: "Interior layouts, material palettes, joinery direction, lighting logic, and furniture coordination."
    },
    {
      title: "Visualization & Plans",
      text: "Presentations, diagrams, rendered views, construction drawings, and client-ready project narratives."
    }
  ],
  projects: [
    {
      id: "p-01",
      title: "Courtyard House",
      slug: "courtyard-house",
      category: "Residential",
      location: "Tirana, Albania",
      year: "2026",
      status: "Completed",
      role: "Lead Architect",
      area: "280 m2",
      featured: true,
      published: true,
      cover: imageBank[0],
      summary: "A private residence organized around a quiet garden court and layered thresholds.",
      concept: "The house turns inward, using the courtyard as a private source of light, ventilation, and calm.",
      challenge: "The site required privacy from the street while keeping the daily spaces open and bright.",
      solution: "A sequence of masonry planes, sliding glass, and planted voids creates a calm domestic rhythm.",
      materials: "Lime render, oak, limestone flooring, bronze-toned metalwork, and deep shadow reveals.",
      result: "The completed home creates a protected, daylight-rich interior world for everyday living.",
      media: [imageBank[0], imageBank[1], imageBank[4]]
    },
    {
      id: "p-02",
      title: "Stone Apartment",
      slug: "stone-apartment",
      category: "Interior",
      location: "Durres, Albania",
      year: "2025",
      status: "Completed",
      role: "Interior Architect",
      area: "96 m2",
      featured: true,
      published: true,
      cover: imageBank[1],
      summary: "A compact apartment shaped through warm stone, concealed storage, and precise lighting.",
      concept: "The project treats the apartment as a continuous cabinet of rooms, surfaces, and apertures.",
      challenge: "Storage and daily utility had to disappear without making the interior feel sterile.",
      solution: "Integrated joinery, indirect light, and stone thresholds create order while preserving warmth.",
      materials: "Travertine, walnut veneer, linen, smoked glass, and matte plaster.",
      result: "The home feels larger, calmer, and more resolved without losing domestic softness.",
      media: [imageBank[1], imageBank[5], imageBank[2]]
    },
    {
      id: "p-03",
      title: "Civic Gallery",
      slug: "civic-gallery",
      category: "Commercial",
      location: "Prishtina, Kosovo",
      year: "2024",
      status: "Completed",
      role: "Design Architect",
      area: "1,120 m2",
      featured: true,
      published: true,
      cover: imageBank[2],
      summary: "A public gallery and event interior defined by flexible walls and controlled daylight.",
      concept: "The gallery becomes a neutral instrument for exhibitions, gatherings, and shifting cultural use.",
      challenge: "The space needed a strong identity while allowing art and public life to take priority.",
      solution: "Movable partitions, calibrated ceiling light, and a legible circulation spine organize the program.",
      materials: "Polished concrete, white acoustic plaster, blackened steel, and translucent fabric panels.",
      result: "The venue now hosts exhibitions, talks, and installations with a clear operational framework.",
      media: [imageBank[2], imageBank[3], imageBank[4]]
    },
    {
      id: "p-04",
      title: "Harbor Plan",
      slug: "harbor-plan",
      category: "Urban",
      location: "Vlore, Albania",
      year: "2023",
      status: "Proposal",
      role: "Urban Concept",
      area: "4.8 ha",
      featured: false,
      published: true,
      cover: imageBank[3],
      summary: "A waterfront public-realm proposal connecting promenade, shade, market, and civic terrace.",
      concept: "The proposal turns a linear waterfront into a sequence of urban rooms and coastal thresholds.",
      challenge: "Pedestrian comfort, summer heat, and fragmented access weakened the public experience.",
      solution: "Layered canopies, planted edges, and new cross-site paths improve orientation and comfort.",
      materials: "Local stone, timber shade structures, native planting, and robust coastal paving.",
      result: "The plan frames a practical, climate-aware direction for a more generous harbor edge.",
      media: [imageBank[3], imageBank[4], imageBank[0]]
    }
  ],
  mediaItems: []
};

let state = structuredClone(seedState);
let currentAdminTab = "dashboard";
let editingProjectId = null;
let hasRenderedRoute = false;
let routeTimer = null;
let parallaxCleanup = null;
let storyCleanup = null;
let immersiveCleanup = null;

const main = document.querySelector("#main");
const toast = document.querySelector(".toast");
const menuToggle = document.querySelector(".menu-toggle");
const scrollProgress = document.querySelector(".scroll-progress");

async function loadInitialServerState() {
  let legacyState = null;

  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) legacyState = JSON.parse(raw);
  } catch (error) {
    console.warn("Could not read old browser portfolio data.", error);
  }

  try {
    const response = await fetch("/api/state", {
      cache: "no-store"
    });

    if (response.ok) {
      state = normalizeStoredState(await response.json());
      serverStateExists = true;
      legacyStatePendingMigration = false;

      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {}

      return;
    }

    if (response.status !== 404) {
      throw new Error("State API returned HTTP " + response.status);
    }
  } catch (error) {
    console.error("Could not load portfolio state from server.", error);
  }

  if (legacyState) {
    state = normalizeStoredState({
      ...structuredClone(seedState),
      ...legacyState
    });

    legacyStatePendingMigration = true;
  } else {
    state = structuredClone(seedState);
  }
}

async function writeStateToServer(snapshot) {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(snapshot)
  });

  const result = await response.json().catch(() => ({}));

  if (response.status === 401) {
    adminAuthenticated = false;
    throw new Error("Admin session expired. Log in again.");
  }

  if (!response.ok) {
    throw new Error(
      result.error ||
      ("Server rejected save with HTTP " + response.status)
    );
  }

  serverStateExists = true;
  legacyStatePendingMigration = false;

  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {}

  return true;
}

function saveState() {
  try {
    state = normalizeStoredState(state);
    applySettings();

    const snapshot = structuredClone(state);

    stateSaveQueue = stateSaveQueue
      .then(() => writeStateToServer(snapshot))
      .catch((error) => {
        console.error(error);
        showToast(error.message || "Could not save changes to server.");
      });

    return true;
  } catch (error) {
    console.error(error);
    showToast("Could not prepare changes for server storage.");
    return false;
  }
}

async function refreshAdminAuthentication() {
  try {
    const response = await fetch("/api/auth", {
      cache: "no-store"
    });

    if (!response.ok) {
      adminAuthenticated = false;
      return;
    }

    const result = await response.json();
    adminAuthenticated = result.authenticated === true;
  } catch {
    adminAuthenticated = false;
  }
}

function normalizeStoredState(input) {
  const base = structuredClone(seedState);
  const next = {
    ...base,
    ...input,
    settings: { ...base.settings, ...(input.settings || {}) },
    services: Array.isArray(input.services) ? input.services : base.services,
    projects: Array.isArray(input.projects) ? input.projects : base.projects,
    mediaItems: Array.isArray(input.mediaItems) ? input.mediaItems : []
  };

  next.projects = next.projects.map((project, index) => ({
    ...project,
    cover: isBrowserStoredMedia(project.cover) ? imageBank[index % imageBank.length] : project.cover,
    media: (project.media || []).filter((src) => !isBrowserStoredMedia(src))
  }));
  next.mediaItems = next.mediaItems.filter((item) => item && !isBrowserStoredMedia(item.src));
  return next;
}

function applySettings() {
  document.documentElement.style.setProperty("--accent", state.settings.accent || seedState.settings.accent);
  document.title = state.settings.seoTitle || state.settings.siteName;
  const description = document.querySelector("meta[name='description']");
  description.setAttribute("content", state.settings.seoDescription || seedState.settings.seoDescription);
  document.querySelectorAll("[data-bind='siteName']").forEach((node) => {
    node.textContent = state.settings.siteName;
  });
  const navMap = {
    work: state.settings.navWork,
    about: state.settings.navAbout,
    contact: state.settings.navContact
  };
  document.querySelectorAll("[data-nav]").forEach((node) => {
    node.textContent = navMap[node.dataset.nav] || node.textContent;
  });
}

function route() {
  closeMenu();
  const rawHash = window.location.hash.replace("#", "") || "home";
  const [name, param] = rawHash.split("/");
  document.body.dataset.route = name;
  setActiveNav(name);

  const renderRoute = () => {
    if (name === "work") renderWork();
    else if (name === "project") renderProject(param);
    else if (name === "about") renderAbout();
    else if (name === "contact") renderContact();
    else if (name === "admin") renderAdmin();
    else renderHome();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    hasRenderedRoute = true;
    requestAnimationFrame(() => document.body.classList.remove("is-routing"));
  };

  clearTimeout(routeTimer);
  if (hasRenderedRoute && !prefersReducedMotion()) {
    document.body.classList.add("is-routing");
    routeTimer = window.setTimeout(renderRoute, 210);
  } else {
    renderRoute();
  }
}

function setActiveNav(name) {
  document.querySelectorAll(".site-nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${name}`);
  });
}

function page(content) {
  main.innerHTML = `<div class="page">${content}</div>`;
  main.focus({ preventScroll: true });
  bindReveal();
  bindParallax();
  bindTiltCards();
  bindProjectCarousels();
  bindStoryScroll();
  bindImmersiveScene();
  bindContactForm();
}

function publishedProjects() {
  return state.projects.filter((project) => project.published);
}

function renderHome() {
  const projects = publishedProjects();
  const featured = projects.filter((project) => project.featured);
  const heroProject = featured[0] || projects[0] || seedState.projects[0];
  const storyProjects = projects.length ? projects : [heroProject];
  page(`
    <section class="hero container">
      <div class="hero-copy">
        <p class="eyebrow">Architecture Portfolio</p>
        <h1>${escapeHtml(state.settings.heroTitle)}</h1>
        <p class="lede">${escapeHtml(state.settings.tagline)}</p>
        <div class="hero-actions">
          <a class="button accent" href="#work">View Selected Work</a>
          <a class="button ghost" href="#contact">Start a Conversation</a>
        </div>
      </div>
      <figure class="hero-media media-frame">
        <div class="depth-layer depth-grid" data-speed="0.09" aria-hidden="true"></div>
        <div class="depth-layer depth-plan" data-speed="-0.11" aria-hidden="true"></div>
        <div class="depth-layer depth-slab one" data-speed="-0.16" aria-hidden="true"></div>
        <div class="depth-layer depth-slab two" data-speed="0.24" aria-hidden="true"></div>
        <div class="depth-layer depth-measure" data-speed="0.36" aria-hidden="true">01</div>
        <img class="parallax-media hero-image" data-speed="-0.42" src="${heroProject.cover}" alt="${escapeHtml(heroProject.title)} architectural project image">
        <figcaption class="hero-label">
          <p class="eyebrow">Featured Project</p>
          <strong>${escapeHtml(heroProject.title)}</strong>
          <p class="micro">${escapeHtml(heroProject.location)} · ${escapeHtml(heroProject.year)}</p>
        </figcaption>
      </figure>
    </section>
    <section class="stats-strip" aria-label="Portfolio highlights">
      <div class="stat"><strong>${publishedProjects().length}</strong><span>Published projects</span></div>
      <div class="stat"><strong>${state.services.length}</strong><span>Architecture services</span></div>
      <div class="stat"><strong>01</strong><span>Clear editable portfolio system</span></div>
    </section>
    <section class="section container scroll-cinema">
      <div class="cinema-copy">
        <p class="eyebrow">Spatial Scroll</p>
        <h2>The portfolio moves like a model being opened.</h2>
        <p class="lede">Plans, facades, material fields, and project notes shift with the scroll so every case study feels active before it is opened.</p>
      </div>
      <div class="cinema-stage" aria-hidden="true">
        <span class="cinema-plane base" data-speed="-0.12"></span>
        <span class="cinema-plane volume-a" data-speed="0.24"></span>
        <span class="cinema-plane volume-b" data-speed="-0.32"></span>
        <span class="cinema-plane grid-cut" data-speed="0.16"></span>
        <span class="cinema-plane section-mark" data-speed="-0.22"></span>
      </div>
    </section>
    <section class="section container work-story">
      <aside class="story-pin" aria-label="Active project story">
        <p class="eyebrow">Selected Work</p>
        <h2>Scroll through the project sequence.</h2>
        <div class="story-rail" aria-hidden="true"><span data-story-progress></span></div>
        <div class="story-current" aria-live="polite">
          ${storyDetails(storyProjects[0], 0, storyProjects.length)}
        </div>
        <a class="button ghost" href="#work">All Work</a>
      </aside>
      <div class="story-stack">
        ${storyProjects.map((project, index) => projectStoryCard(project, index, storyProjects.length)).join("")}
      </div>
    </section>
    <section class="section container">
      <div class="split">
        <div>
          <p class="eyebrow">Studio</p>
          <h2>Measured spaces for real lives and memorable places.</h2>
        </div>
        <div>
          <p class="lede">${escapeHtml(state.settings.intro)}</p>
          <p>${escapeHtml(state.settings.philosophy)}</p>
          <div class="section-actions"><a class="button ghost" href="#about">Read About</a></div>
        </div>
      </div>
    </section>
    ${servicesSection()}
    ${contactCta()}
  `);
}

function renderWork(filter = "All") {
  const categories = ["All", ...new Set(publishedProjects().map((project) => project.category))];
  const projects = filter === "All" ? publishedProjects() : publishedProjects().filter((project) => project.category === filter);
  page(`
    <section class="page-head container">
      <p class="eyebrow">Work</p>
      <h1>Selected projects and spatial studies.</h1>
      <p class="lede">Filter by project type, then open each case study for process, drawings, materials, and outcomes.</p>
    </section>
    <section class="container">
      <div class="filter-row" aria-label="Project filters">
        ${categories.map((category) => `<button class="filter-button ${category === filter ? "active" : ""}" type="button" data-filter="${category}">${category}</button>`).join("")}
      </div>
    </section>
    <section class="section container">
      <div class="project-grid">${projects.map(projectCard).join("") || emptyState("No published projects match this filter.")}</div>
    </section>
  `);
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => renderWork(button.dataset.filter));
  });
}

function renderProject(slug) {
  const project = publishedProjects().find((item) => item.slug === slug) || publishedProjects()[0];
  if (!project) {
    page(emptyState("No published project is available yet."));
    return;
  }
  const related = publishedProjects().filter((item) => item.id !== project.id).slice(0, 2);
  page(`
    <section class="project-detail-hero media-frame">
      <img class="parallax-media" src="${project.cover}" alt="${escapeHtml(project.title)} hero image">
    </section>
    <section class="container detail-layout">
      <aside class="meta-list" aria-label="Project metadata">
        ${metaRow("Project", project.title)}
        ${metaRow("Location", project.location)}
        ${metaRow("Year", project.year)}
        ${metaRow("Status", project.status)}
        ${metaRow("Category", project.category)}
        ${metaRow("Role", project.role)}
        ${metaRow("Area", project.area)}
        <div><a class="button ghost" href="#work">Back to Work</a></div>
      </aside>
      <article>
        <p class="eyebrow">${escapeHtml(project.category)}</p>
        <h1>${escapeHtml(project.title)}</h1>
        <p class="lede">${escapeHtml(project.summary)}</p>
        ${caseSection("Concept", project.concept)}
        ${caseSection("Challenge", project.challenge)}
        ${caseSection("Solution", project.solution)}
        ${caseSection("Materials", project.materials)}
        ${caseSection("Result", project.result)}
        <div class="gallery" aria-label="Project gallery">
          ${projectGallery(project)}
        </div>
      </article>
    </section>
    <section class="section container">
      <div class="section-header"><h2>Related work</h2><a class="button ghost" href="#work">View all</a></div>
      <div class="project-grid">${related.map(projectCard).join("")}</div>
    </section>
  `);
}

function renderAbout() {
  page(`
    <section class="page-head container">
      <p class="eyebrow">About</p>
      <h1>Architecture with context, restraint, and clarity.</h1>
    </section>
    <section class="section container">
      <div class="split">
        <div><p class="lede">${escapeHtml(state.settings.intro)}</p></div>
        <div>
          <h2>Approach</h2>
          <p class="lede">${escapeHtml(state.settings.philosophy)}</p>
          <div class="services">${state.services.map((service, index) => serviceRow(service, index)).join("")}</div>
        </div>
      </div>
    </section>
    ${contactCta()}
  `);
}

function renderContact() {
  page(`
    <section class="page-head container">
      <p class="eyebrow">Contact</p>
      <h1>Discuss a site, a space, or a project in progress.</h1>
    </section>
    <section class="container section">${contactPanel()}</section>
  `);
}

function renderAdmin() {
  if (!isLoggedIn()) {
    page(`
      <section class="login-card panel">
        <p class="eyebrow">Admin</p>
        <h1>Portfolio Control Room</h1>
        <p class="lede">Sign in to manage the server-backed portfolio.</p>
        <form id="loginForm" novalidate>
          <div class="field"><label for="loginEmail">Email</label><input id="loginEmail" type="email" required autocomplete="username"></div>
          <div class="field"><label for="loginPassword">Password</label><input id="loginPassword" type="password" required autocomplete="current-password"></div>
          <button class="button accent" type="submit">Log In</button>
        </form>
      </section>
    `);
    document.querySelector("#loginForm").addEventListener("submit", handleLogin);
    return;
  }

  page(`
    <section class="admin-shell">
      <aside class="admin-sidebar">
        <p class="eyebrow">Admin</p>
        <h2>${escapeHtml(state.settings.siteName)}</h2>
        ${["dashboard", "projects", "media", "content", "settings"].map((tab) => `<button type="button" data-admin-tab="${tab}" class="${currentAdminTab === tab ? "active" : ""}">${titleCase(tab)}</button>`).join("")}
        <button type="button" data-admin-logout>Log Out</button>
      </aside>
      <section class="admin-main" id="adminMain">${adminTab()}</section>
    </section>
  `);
  bindAdmin();
}

function adminTab() {
  if (currentAdminTab === "projects") return projectsAdmin();
  if (currentAdminTab === "media") return mediaAdmin();
  if (currentAdminTab === "content") return contentAdmin();
  if (currentAdminTab === "settings") return settingsAdmin();
  return dashboardAdmin();
}

function dashboardAdmin() {
  return `
    <p class="eyebrow">Overview</p>
    <h1>Manage the portfolio.</h1>
    <div class="admin-grid">
      <div class="panel"><strong>${state.projects.length}</strong><p>Projects in library</p></div>
      <div class="panel"><strong>${publishedProjects().length}</strong><p>Published projects</p></div>
      <div class="panel"><strong>${state.mediaItems.length}</strong><p>Uploaded media items</p></div>
    </div>
    <div class="panel" style="margin-top:18px">
      <h3>Next useful edits</h3>
      <p>Replace placeholder images, update contact details, and add your strongest completed project first.</p>
      <div class="admin-actions"><button class="button accent" type="button" data-quick-tab="projects">Add Project</button><button class="button ghost" type="button" data-quick-tab="settings">Site Settings</button></div>
    </div>
  `;
}

function projectsAdmin() {
  const editing = state.projects.find((project) => project.id === editingProjectId);
  return `
    <div class="section-header">
      <div><p class="eyebrow">Projects</p><h1>${editing ? "Edit Project" : "Project Library"}</h1></div>
      <button class="button accent" type="button" data-new-project>New Project</button>
    </div>
    ${editing || editingProjectId === "new" ? projectForm(editing) : ""}
    <div class="project-grid">
      ${state.projects.map(adminProjectCard).join("")}
    </div>
  `;
}

function projectForm(project) {
  const data = project || {
    title: "",
    slug: "",
    category: "Residential",
    location: "",
    year: "2026",
    status: "Draft",
    role: "",
    area: "",
    featured: false,
    published: true,
    cover: "",
    summary: "",
    concept: "",
    challenge: "",
    solution: "",
    materials: "",
    result: "",
    media: []
  };
  return `
    <form class="panel admin-form" id="projectForm" novalidate>
      ${input("Title", "title", data.title, true)}
      ${input("Slug", "slug", data.slug, true)}
      ${input("Location", "location", data.location)}
      ${input("Year", "year", data.year)}
      ${select("Category", "category", data.category, ["Residential", "Interior", "Commercial", "Renovation", "Urban", "Concept", "Competition"])}
      ${input("Status", "status", data.status)}
      ${input("Role", "role", data.role)}
      ${input("Area / Size", "area", data.area)}
      ${projectUploadField("Cover Image", "cover", data.cover, false)}
      ${textarea("Short Description", "summary", data.summary, true)}
      ${textarea("Concept", "concept", data.concept)}
      ${textarea("Challenge", "challenge", data.challenge)}
      ${textarea("Solution", "solution", data.solution)}
      ${textarea("Materials", "materials", data.materials)}
      ${textarea("Result", "result", data.result)}
      ${projectUploadField("Project Gallery", "media", (data.media || []).join("\\n"), true)}
      <label class="checkbox-field"><input name="featured" type="checkbox" ${data.featured ? "checked" : ""}> Featured on homepage</label>
      <label class="checkbox-field"><input name="published" type="checkbox" ${data.published ? "checked" : ""}> Published on Work and Scroll sequence</label>
      <div class="admin-actions full">
        <button class="button accent" type="submit">Save Project</button>
        <button class="button ghost" type="button" data-cancel-edit>Cancel</button>
      </div>
    </form>
  `;
}

function mediaAdmin() {
  return `
    <p class="eyebrow">Media</p>
    <h1>Upload and reuse assets.</h1>
    <div class="panel">
      <div class="field">
        <label for="mediaUpload">Add photos, plan images, PDFs, or videos</label>
        <input id="mediaUpload" type="file" multiple accept="image/*,video/*,application/pdf">
      </div>
      <p class="micro">Files and portfolio content are stored on the server and shared across devices.</p>
    </div>
    <div class="media-library">
      ${state.mediaItems.map(mediaTile).join("") || emptyState("No uploaded media yet.")}
    </div>
  `;
}

function contentAdmin() {
  return `
    <p class="eyebrow">Content</p>
    <h1>Edit public copy and services.</h1>
    <form class="panel admin-form" id="contentForm">
      ${textarea("Hero Title", "heroTitle", state.settings.heroTitle, true)}
      ${textarea("Positioning Statement", "tagline", state.settings.tagline, true)}
      ${textarea("Intro / Who I Am", "intro", state.settings.intro, true)}
      ${textarea("Architecture Philosophy", "philosophy", state.settings.philosophy, true)}
      ${textarea("Services, one per line as Title | Description", "services", state.services.map((item) => `${item.title} | ${item.text}`).join("\\n"))}
      <div class="admin-actions full"><button class="button accent" type="submit">Save Content</button></div>
    </form>
  `;
}

function settingsAdmin() {
  return `
    <p class="eyebrow">Settings</p>
    <h1>Identity, SEO, navigation.</h1>
    <form class="panel admin-form" id="settingsForm">
      ${input("Site / Studio Name", "siteName", state.settings.siteName, true)}
      ${input("Contact Email", "contactEmail", state.settings.contactEmail, true)}
      ${input("Phone", "phone", state.settings.phone)}
      ${input("Instagram URL", "instagram", state.settings.instagram)}
      ${input("LinkedIn URL", "linkedin", state.settings.linkedin)}
      ${input("Accent Color", "accent", state.settings.accent, true)}
      ${input("Work Nav Label", "navWork", state.settings.navWork)}
      ${input("About Nav Label", "navAbout", state.settings.navAbout)}
      ${input("Contact Nav Label", "navContact", state.settings.navContact)}
      ${input("SEO Title", "seoTitle", state.settings.seoTitle, true, "full")}
      ${textarea("SEO Description", "seoDescription", state.settings.seoDescription, true)}
      <div class="admin-actions full">
        <button class="button accent" type="submit">Save Settings</button>
        <button class="button danger" type="button" data-reset-site>Reset Demo Content</button>
      </div>
    </form>
  `;
}

function bindAdmin() {
  document.querySelectorAll("[data-admin-tab], [data-quick-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      currentAdminTab = button.dataset.adminTab || button.dataset.quickTab;
      editingProjectId = null;
      renderAdmin();
    });
  });

  const logout = document.querySelector("[data-admin-logout]");
  if (logout) {
    logout.addEventListener("click", async () => {
      try {
        await fetch("/api/logout", {
          method: "POST"
        });
      } catch {}

      adminAuthenticated = false;
      showToast("Logged out.");
      renderAdmin();
    });
  }

  const newProject = document.querySelector("[data-new-project]");
  if (newProject) newProject.addEventListener("click", () => {
    editingProjectId = "new";
    renderAdmin();
  });

  document.querySelectorAll("[data-edit-project]").forEach((button) => {
    button.addEventListener("click", () => {
      editingProjectId = button.dataset.editProject;
      renderAdmin();
    });
  });

  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const project = state.projects.find((item) => item.id === button.dataset.deleteProject);
      askConfirm(`Delete ${project.title}?`, "This removes the project from the server portfolio.", () => {
        state.projects = state.projects.filter((item) => item.id !== project.id);
        if (!saveState()) return;
        showToast("Project deleted.");
        renderAdmin();
      });
    });
  });

  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", () => moveProject(button.dataset.move, Number(button.dataset.direction)));
  });

  const projectFormNode = document.querySelector("#projectForm");
  if (projectFormNode) {
    projectFormNode.addEventListener("submit", saveProjectFromForm);
    bindProjectUploadFields(projectFormNode);
  }
  const cancelEdit = document.querySelector("[data-cancel-edit]");
  if (cancelEdit) cancelEdit.addEventListener("click", () => {
    editingProjectId = null;
    renderAdmin();
  });

  const mediaUpload = document.querySelector("#mediaUpload");
  if (mediaUpload) mediaUpload.addEventListener("change", handleMediaUpload);

  document.querySelectorAll("[data-delete-media]").forEach((button) => {
    button.addEventListener("click", () => {
      askConfirm("Delete media item?", "This removes the item from the server portfolio library.", () => {
        state.mediaItems = state.mediaItems.filter((item) => item.id !== button.dataset.deleteMedia);
        if (!saveState()) return;
        renderAdmin();
      });
    });
  });

  const contentForm = document.querySelector("#contentForm");
  if (contentForm) contentForm.addEventListener("submit", saveContent);
  const settingsForm = document.querySelector("#settingsForm");
  if (settingsForm) settingsForm.addEventListener("submit", saveSettings);

  const resetSite = document.querySelector("[data-reset-site]");
  if (resetSite) {
    resetSite.addEventListener("click", () => {
      askConfirm("Reset demo content?", "This will replace the server portfolio with the seeded content.", () => {
        state = structuredClone(seedState);
        if (!saveState()) return;
        showToast("Demo content restored.");
        renderAdmin();
      });
    });
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.querySelector("#loginEmail").value.trim();
  const password = document.querySelector("#loginPassword").value;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      showToast(result.error || "Invalid admin credentials.");
      return;
    }

    adminAuthenticated = true;

    /*
     * If this browser contains your OLD localStorage portfolio and
     * the server does not have state yet, migrate it automatically.
     */
    if (!serverStateExists || legacyStatePendingMigration) {
      const wasLegacy = legacyStatePendingMigration;

      await writeStateToServer(structuredClone(state));

      showToast(
        wasLegacy
          ? "Your existing browser portfolio was migrated to the server."
          : "Server portfolio initialized."
      );
    } else {
      showToast("Welcome back.");
    }

    renderAdmin();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not contact the server.");
  }
}

function saveProjectFromForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const title = String(form.get("title") || "").trim();
  const slug = slugify(String(form.get("slug") || title));
  const cover = String(form.get("cover") || "").trim();
  const summary = String(form.get("summary") || "").trim();
  if (!title || !slug || !cover || !summary) {
    showToast("Title, slug, cover, and description are required.");
    return;
  }
  const project = {
    id: editingProjectId === "new" ? `p-${Date.now()}` : editingProjectId,
    title,
    slug,
    category: String(form.get("category") || "Residential"),
    location: String(form.get("location") || ""),
    year: String(form.get("year") || ""),
    status: String(form.get("status") || ""),
    role: String(form.get("role") || ""),
    area: String(form.get("area") || ""),
    cover,
    summary,
    concept: String(form.get("concept") || ""),
    challenge: String(form.get("challenge") || ""),
    solution: String(form.get("solution") || ""),
    materials: String(form.get("materials") || ""),
    result: String(form.get("result") || ""),
    featured: form.get("featured") === "on",
    published: form.get("published") === "on",
    media: String(form.get("media") || "").split(/\n+/).map((item) => item.trim()).filter(Boolean)
  };
  if (editingProjectId === "new") state.projects.unshift(project);
  else state.projects = state.projects.map((item) => item.id === project.id ? project : item);
  editingProjectId = null;
  if (!saveState()) return;
  showToast("Project saved.");
  renderAdmin();
}

function handleMediaUpload(event) {
  uploadFilesToAssets([...event.target.files]).then((files) => {
    files.forEach((file) => {
      state.mediaItems.unshift({
        id: `m-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        type: file.type,
        src: file.path
      });
    });
    if (!saveState()) return;
    showToast(`${files.length} media item${files.length === 1 ? "" : "s"} uploaded.`);
    renderAdmin();
  }).catch((error) => showToast(error.message));
}

function bindProjectUploadFields(form) {
  form.querySelectorAll("[data-project-upload]").forEach((inputNode) => {
    inputNode.addEventListener("change", () => handleProjectUpload(inputNode));
  });
  form.querySelectorAll("[data-media-source]").forEach((inputNode) => {
    inputNode.addEventListener("input", () => syncUploadPreview(inputNode));
  });
}

function handleProjectUpload(inputNode) {
  const target = document.querySelector(inputNode.dataset.projectUpload);
  if (!target || !inputNode.files.length) return;
  const files = [...inputNode.files].filter((file) =>
    file.type.startsWith("image/") || file.type.startsWith("video/") || file.type === "application/pdf"
  );
  if (!files.length) {
    showToast("Please choose image or video files.");
    return;
  }

  uploadFilesToAssets(files).then((uploaded) => {
    const sources = uploaded.map((file) => file.path);
    if (inputNode.multiple) {
      const existing = target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
      target.value = [...existing, ...sources].join("\n");
    } else {
      target.value = sources[0];
    }
    syncUploadPreview(target);
    showToast(inputNode.multiple ? "Gallery media added." : "Cover image added.");
  }).catch((error) => showToast(error.message));
}

function syncUploadPreview(inputNode) {
  const preview = document.querySelector(`[data-upload-preview="${inputNode.id}"]`);
  if (!preview) return;
  const sources = inputNode.value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  preview.innerHTML = sources.slice(0, 8).map((src, index) => mediaPreview(src, index)).join("") || `<span>No media selected yet.</span>`;
}

async function uploadFilesToAssets(files) {
  if (!files.length) return [];
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  const response = await fetch("/api/upload", { method: "POST", body });
  if (!response.ok) {
    throw new Error("Start the Node server to save uploads into assets.");
  }
  const data = await response.json();
  if (!data.files || !data.files.length) {
    throw new Error("No supported media files were uploaded.");
  }
  return data.files;
}

function saveContent(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  ["heroTitle", "tagline", "intro", "philosophy"].forEach((key) => {
    state.settings[key] = String(form.get(key) || "");
  });
  state.services = String(form.get("services") || "")
    .split(/\n+/)
    .map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: title.trim(), text: rest.join("|").trim() };
    })
    .filter((item) => item.title && item.text);
  if (!saveState()) return;
  showToast("Content saved.");
}

function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  ["siteName", "contactEmail", "phone", "instagram", "linkedin", "accent", "navWork", "navAbout", "navContact", "seoTitle", "seoDescription"].forEach((key) => {
    state.settings[key] = String(form.get(key) || "");
  });
  if (!saveState()) return;
  showToast("Settings saved.");
  renderAdmin();
}

function moveProject(id, direction) {
  const index = state.projects.findIndex((project) => project.id === id);
  const target = index + direction;
  if (target < 0 || target >= state.projects.length) return;
  const [project] = state.projects.splice(index, 1);
  state.projects.splice(target, 0, project);
  if (!saveState()) return;
  renderAdmin();
}

function projectCard(project, index = 0) {
  const size = index % 3 === 0 ? "wide" : index % 3 === 1 ? "narrow" : "";
  const images = projectImages(project);
  const carouselAttr = images.length > 1 ? " data-carousel" : "";
  return `
    <a class="project-card ${size}" href="#project/${project.slug}" data-title="${escapeAttr(project.title)}" data-summary="${escapeAttr(project.summary)}" data-category="${escapeAttr(project.category)}" data-location="${escapeAttr(project.location)}" data-year="${escapeAttr(project.year)}">
      <figure class="project-cover ${images.length ? "" : "is-placeholder-only"}"${carouselAttr}>
        ${projectImageMarkup(project, images)}
      </figure>
      <div class="project-meta">
        <div>
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.summary)}</p>
        </div>
        <span>${escapeHtml(project.year)}</span>
      </div>
      <div class="tag-row">
        <span class="tag">${escapeHtml(project.category)}</span>
        <span class="tag">${escapeHtml(project.location)}</span>
      </div>
    </a>
  `;
}

function projectStoryCard(project, index, total) {
  const images = projectImages(project);
  const carouselAttr = images.length > 1 ? " data-carousel" : "";
  return `
    <a class="project-card story-card ${index === 0 ? "active" : ""}" href="#project/${project.slug}" data-story-card data-index="${index}" data-total="${total}" data-title="${escapeAttr(project.title)}" data-summary="${escapeAttr(project.summary)}" data-category="${escapeAttr(project.category)}" data-location="${escapeAttr(project.location)}" data-year="${escapeAttr(project.year)}">
      <figure class="project-cover cinematic-cover ${images.length ? "" : "is-placeholder-only"}"${carouselAttr}>
        <span class="story-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        <span class="cover-plate plate-a" data-speed="0.34" aria-hidden="true"></span>
        <span class="cover-plate plate-b" data-speed="-0.26" aria-hidden="true"></span>
        <span class="cover-line line-a" aria-hidden="true"></span>
        <span class="cover-line line-b" aria-hidden="true"></span>
        ${projectImageMarkup(project, images, index % 2 === 0 ? "-0.28" : "-0.38")}
      </figure>
      <div class="project-meta">
        <div>
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.summary)}</p>
        </div>
        <span>${escapeHtml(project.year)}</span>
      </div>
      <div class="tag-row">
        <span class="tag">${escapeHtml(project.category)}</span>
        <span class="tag">${escapeHtml(project.location)}</span>
      </div>
    </a>
  `;
}

function storyDetails(project, index, total) {
  if (!project) return "";
  return `
    <span class="story-count">${String(index + 1).padStart(2, "0")} / ${String(total || 1).padStart(2, "0")}</span>
    <h3>${escapeHtml(project.title)}</h3>
    <p>${escapeHtml(project.summary)}</p>
    <dl>
      <div><dt>Type</dt><dd>${escapeHtml(project.category)}</dd></div>
      <div><dt>Place</dt><dd>${escapeHtml(project.location)}</dd></div>
      <div><dt>Year</dt><dd>${escapeHtml(project.year)}</dd></div>
    </dl>
  `;
}

function adminProjectCard(project, index) {
  return `
    <article class="admin-card project-card">
      <img src="${project.cover}" alt="${escapeHtml(project.title)} thumbnail">
      <div>
        <h3>${escapeHtml(project.title)}</h3>
        <p class="micro">${escapeHtml(project.category)} · ${project.published ? "Published" : "Draft"} · ${project.featured ? "Featured" : "Not featured"}</p>
      </div>
      <div class="admin-actions">
        <button class="button ghost" type="button" data-edit-project="${project.id}">Edit</button>
        <button class="button ghost" type="button" data-move="${project.id}" data-direction="-1" ${index === 0 ? "disabled" : ""}>Move Up</button>
        <button class="button ghost" type="button" data-move="${project.id}" data-direction="1" ${index === state.projects.length - 1 ? "disabled" : ""}>Move Down</button>
        <button class="button danger" type="button" data-delete-project="${project.id}">Delete</button>
      </div>
    </article>
  `;
}

function mediaTile(item) {
  const preview = item.type.startsWith("image/")
    ? `<img src="${item.src}" alt="${escapeHtml(item.name)}">`
    : item.type.startsWith("video/")
      ? `<video src="${escapeAttr(item.src)}" muted playsinline controls></video>`
      : `<a class="media-file" href="${escapeAttr(item.src)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.type || "file")}</span></a>`;
  return `<article><div class="media-tile">${preview}</div><button class="button danger" type="button" data-delete-media="${item.id}">Delete</button></article>`;
}

function projectUploadField(label, name, value, multiple) {
  const inputType = multiple ? "textarea" : "input";
  const field = inputType === "textarea"
    ? `<textarea id="${name}" name="${name}" data-media-source>${escapeHtml(value)}</textarea>`
    : `<input id="${name}" name="${name}" data-media-source value="${escapeAttr(value)}" required>`;
  return `
    <div class="field media-field full">
      <label for="${name}">${label}</label>
      <div class="upload-shell">
        <div class="upload-preview" data-upload-preview="${name}">
          ${(multiple ? String(value).split(/\n+/).filter(Boolean) : [value].filter(Boolean)).slice(0, 8).map((src, index) => mediaPreview(src, index)).join("") || `<span>No media selected yet.</span>`}
        </div>
        <label class="upload-button">
          <span>${multiple ? "Upload Gallery Images / Videos" : "Upload Cover Image"}</span>
          <input type="file" ${multiple ? "multiple" : ""} accept="${multiple ? "image/*,video/*,application/pdf" : "image/*"}" data-project-upload="#${name}">
        </label>
        <details>
          <summary>${multiple ? "Paste media URLs manually" : "Paste cover URL manually"}</summary>
          ${field}
        </details>
      </div>
    </div>
  `;
}

function mediaPreview(src, index = 0) {
  if (isVideoSrc(src)) return `<video src="${escapeAttr(src)}" muted playsinline></video>`;
  if (isImageSrc(src)) return `<img src="${escapeAttr(src)}" alt="Selected media ${index + 1}">`;
  if (isPdfSrc(src)) return `<span>PDF ${index + 1}</span>`;
  return `<span>${escapeHtml(src.slice(0, 80))}</span>`;
}

function projectImageMarkup(project, images, speed = "") {
  if (!images.length) return `<span class="cover-placeholder" aria-hidden="true"></span>`;
  return images.map((src, imageIndex) => {
    const speedAttr = speed ? ` data-speed="${speed}"` : "";
    const loading = imageIndex === 0 ? "eager" : "lazy";
    return `<img class="carousel-image ${imageIndex === 0 ? "active" : ""}"${speedAttr} src="${escapeAttr(src)}" alt="${escapeHtml(project.title)} project thumbnail ${imageIndex + 1}" loading="${loading}" decoding="async">`;
  }).join("");
}

function projectImages(project) {
  const seen = new Set();
  const images = [project.cover, ...(project.media || [])]
    .filter((src) => src && isImageSrc(src))
    .filter((src) => {
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    });
  return images;
}

function projectGallery(project) {
  const media = project.media && project.media.length ? project.media : [project.cover];
  return media.map((src, index) => {
    if (isVideoSrc(src)) {
      return `<figure class="gallery-item"><video src="${escapeAttr(src)}" controls muted playsinline aria-label="${escapeHtml(project.title)} video ${index + 1}"></video></figure>`;
    }
    if (isImageSrc(src)) {
      return `<figure class="gallery-item"><img src="${escapeAttr(src)}" alt="${escapeHtml(project.title)} gallery image ${index + 1}"></figure>`;
    }
    return `<figure class="gallery-item gallery-file"><a class="button ghost" href="${escapeAttr(src)}" target="_blank" rel="noreferrer">Open media ${index + 1}</a></figure>`;
  }).join("");
}

function isImageSrc(src = "") {
  return /^data:image\//.test(src) || /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(src);
}

function isVideoSrc(src = "") {
  return /^data:video\//.test(src) || /\.(mp4|mov|ogg|webm)(\?.*)?$/i.test(src);
}

function isPdfSrc(src = "") {
  return /^data:application\/pdf/.test(src) || /\.pdf(\?.*)?$/i.test(src);
}

function isBrowserStoredMedia(src = "") {
  return /^data:(image|video|application\/pdf)\//.test(src);
}

function servicesSection() {
  return `
    <section class="section container">
      <div class="section-header">
        <div><p class="eyebrow">Services</p><h2>From first sketch to finished atmosphere.</h2></div>
      </div>
      <div class="services">${state.services.map((service, index) => serviceRow(service, index)).join("")}</div>
    </section>
  `;
}

function serviceRow(service, index) {
  return `<article class="service"><span class="service-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(service.title)}</h3><p>${escapeHtml(service.text)}</p></div></article>`;
}

function contactCta() {
  return `<section class="container section">${contactPanel()}</section>`;
}

function contactPanel() {
  return `
    <div class="contact-panel">
      <div>
        <p class="eyebrow">Contact</p>
        <h2>Have a project, site, or interior in mind?</h2>
        <p class="lede">Send a short note and I will follow up with the next practical step.</p>
        <p class="micro">${escapeHtml(state.settings.contactEmail)} · ${escapeHtml(state.settings.phone)}</p>
      </div>
      <form id="contactForm" novalidate>
        <div class="field"><label for="name">Name</label><input id="name" name="name" required autocomplete="name"><span class="error-text">Please enter your name.</span></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email"><span class="error-text">Please enter a valid email.</span></div>
        <div class="field"><label for="message">Project Message</label><textarea id="message" name="message" required></textarea><span class="error-text">Please add a short message.</span></div>
        <button class="button accent" type="submit">Send Inquiry</button>
      </form>
    </div>
  `;
}

function bindContactForm() {
  const contactForm = document.querySelector("#contactForm");
  if (!contactForm) return;
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = [...contactForm.querySelectorAll("input, textarea")];
    let valid = true;
    fields.forEach((field) => {
      const invalid = !field.checkValidity();
      field.closest(".field").classList.toggle("invalid", invalid);
      if (invalid) valid = false;
    });
    if (!valid) {
      fields.find((field) => !field.checkValidity())?.focus();
      return;
    }
    contactForm.reset();
    showToast("Inquiry captured locally. Connect a form service before production.");
  });
}

function bindReveal() {
  const cards = document.querySelectorAll(".project-card, .stat, .service, .case-section, .gallery-item, .section-header");
  if (prefersReducedMotion()) {
    cards.forEach((card) => card.classList.add("revealed"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });
  cards.forEach((card) => observer.observe(card));
}

function bindParallax() {
  if (parallaxCleanup) parallaxCleanup();
  const elements = document.querySelectorAll(".parallax-media, .depth-layer, .project-cover img, .gallery-item img, .cover-plate, .cinema-plane");
  if (prefersReducedMotion()) {
    if (scrollProgress) scrollProgress.style.transform = "scaleX(0)";
    return;
  }
  let ticking = false;
  const update = () => {
    ticking = false;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    if (scrollProgress) {
      scrollProgress.style.transform = `scaleX(${Math.min(1, window.scrollY / maxScroll)})`;
    }
    elements.forEach((element) => {
      const parent = element.closest(".media-frame, .project-cover, .gallery-item, .hero-media");
      const rect = element.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const progress = (center - window.innerHeight / 2) / window.innerHeight;
      const defaultSpeed = element.classList.contains("cover-plate") ? "0.28" : parent?.classList.contains("project-cover") ? "-0.2" : "-0.32";
      const speed = Number(element.dataset.speed || defaultSpeed);
      const distance = Math.max(-130, Math.min(130, progress * window.innerHeight * speed));
      if (element.classList.contains("cinema-plane")) {
        element.style.setProperty("--parallax-y", `${distance}px`);
        return;
      }
      const scale = element.classList.contains("depth-layer") || element.classList.contains("cover-plate") ? 1 : 1.11;
      element.style.transform = `translate3d(0, ${distance}px, 0) scale(${scale})`;
    });
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  parallaxCleanup = () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    parallaxCleanup = null;
  };
}

function bindImmersiveScene() {
  if (immersiveCleanup) immersiveCleanup();
  const scene = document.querySelector(".ambient-scene");
  const label = document.querySelector("[data-scene-label]");
  const storyCards = [...document.querySelectorAll("[data-story-card]")];
  const projectCards = [...document.querySelectorAll(".project-card")];
  const sceneTargets = storyCards.length ? storyCards : projectCards;
  if (!scene || prefersReducedMotion()) {
    if (scene) scene.style.opacity = "0";
    return;
  }

  const palette = {
    Residential: ["#f06a2a", "#b7c6b3"],
    Interior: ["#d3b28b", "#f06a2a"],
    Commercial: ["#d7e1de", "#7c8d86"],
    Urban: ["#8fb9b4", "#f06a2a"]
  };

  let ticking = false;
  const update = () => {
    ticking = false;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const pageProgress = Math.min(1, window.scrollY / maxScroll);
    const activeTarget = sceneTargets
      .map((item) => {
        const rect = item.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height * 0.5 - window.innerHeight * 0.52);
        return { item, distance };
      })
      .sort((a, b) => a.distance - b.distance)[0]?.item;
    const category = activeTarget?.dataset.category || "Residential";
    const [accent, glow] = palette[category] || palette.Residential;
    const title = activeTarget?.dataset.title || state.settings.siteName;

    document.documentElement.style.setProperty("--scene-tilt", `${-17 + pageProgress * 34}deg`);
    document.documentElement.style.setProperty("--scene-spin", `${-24 + pageProgress * 78}deg`);
    document.documentElement.style.setProperty("--scene-lift", `${-80 + pageProgress * 190}px`);
    document.documentElement.style.setProperty("--scene-scale", `${0.86 + pageProgress * 0.2}`);
    document.documentElement.style.setProperty("--scene-accent", accent);
    document.documentElement.style.setProperty("--scene-glow", glow);
    scene.style.opacity = window.location.hash.includes("admin") ? "0.16" : "0.72";
    if (label) label.textContent = title;
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  immersiveCleanup = () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    immersiveCleanup = null;
  };
}

function bindStoryScroll() {
  if (storyCleanup) storyCleanup();
  const story = document.querySelector(".work-story");
  const cards = [...document.querySelectorAll("[data-story-card]")];
  const output = document.querySelector(".story-current");
  const progress = document.querySelector("[data-story-progress]");
  if (!story || !cards.length || !output || prefersReducedMotion()) return;

  let active = null;
  let snapLock = false;
  let scrollEndTimer = null;
  let wheelDelta = 0;
  let ticking = false;
  const update = () => {
    ticking = false;
    const targetY = window.innerHeight * 0.52;
    const card = cards
      .map((item) => {
        const rect = item.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height * 0.42 - targetY);
        return { item, distance };
      })
      .sort((a, b) => a.distance - b.distance)[0]?.item;
    if (!card || card === active) return;
    active = card;
    cards.forEach((item) => item.classList.toggle("active", item === card));
    if (progress) {
      const total = Math.max(1, cards.length - 1);
      progress.style.transform = `scaleY(${cards.length === 1 ? 1 : Number(card.dataset.index) / total})`;
    }
    output.classList.add("is-changing");
    window.setTimeout(() => output.classList.remove("is-changing"), 180);
    output.innerHTML = storyDetails({
      title: card.dataset.title,
      summary: card.dataset.summary,
      category: card.dataset.category,
      location: card.dataset.location,
      year: card.dataset.year
    }, Number(card.dataset.index), Number(card.dataset.total));
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
    if (snapLock || window.matchMedia("(max-width: 900px)").matches) return;
    window.clearTimeout(scrollEndTimer);
    scrollEndTimer = window.setTimeout(() => {
      const rect = story.getBoundingClientRect();
      const inStory = rect.top < window.innerHeight * 0.7 && rect.bottom > window.innerHeight * 0.32;
      if (!inStory || snapLock) return;
      const activeIndex = Math.max(0, cards.indexOf(active));
      snapToCard(activeIndex);
    }, 150);
  };

  const snapToCard = (nextIndex) => {
    const card = cards[nextIndex];
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const top = window.scrollY + rect.top - Math.max(84, (window.innerHeight - rect.height) * 0.5);
    snapLock = true;
    window.scrollTo({ top, behavior: "smooth" });
    window.setTimeout(() => {
      snapLock = false;
      wheelDelta = 0;
      update();
    }, 860);
  };

  const onWheel = (event) => {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    const rect = story.getBoundingClientRect();
    const direction = Math.sign(event.deltaY);
    const enteringFromAbove = direction > 0 && rect.top > window.innerHeight * 0.34 && rect.top - event.deltaY < window.innerHeight * 0.7;
    if (enteringFromAbove && !snapLock) {
      event.preventDefault();
      snapToCard(0);
      return;
    }
    const inStory = rect.top < window.innerHeight * 0.72 && rect.bottom > window.innerHeight * 0.28;
    if (!inStory) return;
    if (snapLock) {
      event.preventDefault();
      return;
    }
    const activeIndex = Math.max(0, cards.indexOf(active));
    if ((direction < 0 && activeIndex === 0) || (direction > 0 && activeIndex === cards.length - 1)) return;
    wheelDelta += event.deltaY;
    if (Math.abs(wheelDelta) < 42) return;
    event.preventDefault();
    snapToCard(Math.min(cards.length - 1, Math.max(0, activeIndex + direction)));
  };

  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  window.addEventListener("wheel", onWheel, { passive: false });
  storyCleanup = () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    window.removeEventListener("wheel", onWheel);
    window.clearTimeout(scrollEndTimer);
    storyCleanup = null;
  };
}

function bindTiltCards() {
  if (prefersReducedMotion() || window.matchMedia("(max-width: 900px)").matches) return;
  document.querySelectorAll(".project-card").forEach((card) => {
    const image = card.querySelector(".project-cover img.active") || card.querySelector(".project-cover img");
    if (!image) return;
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.querySelectorAll(".project-cover img.active").forEach((activeImage) => {
        activeImage.style.transform = `translate3d(${x * -18}px, ${y * -16}px, 0) scale(1.13)`;
      });
      card.style.setProperty("--tilt-x", `${y * -2.5}deg`);
      card.style.setProperty("--tilt-y", `${x * 2.5}deg`);
    });
    card.addEventListener("pointerleave", () => {
      card.querySelectorAll(".project-cover img").forEach((item) => {
        item.style.transform = "";
      });
      card.style.removeProperty("--tilt-x");
      card.style.removeProperty("--tilt-y");
    });
  });
}

function bindProjectCarousels() {
  if (prefersReducedMotion()) return;
  const firstSlideDelay = 220;
  const slideDuration = 1600;
  const returnDuration = 900;
  document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const images = [...carousel.querySelectorAll(".carousel-image")];
    if (images.length < 2) return;
    const trigger = carousel.closest(".project-card") || carousel;
    let index = 0;
    let timer = null;
    let firstTimer = null;

    const show = (nextIndex) => {
      index = nextIndex;
      images.forEach((image, imageIndex) => {
        image.classList.toggle("active", imageIndex === index);
        image.style.transform = "";
      });
    };

    const start = () => {
      window.clearInterval(timer);
      window.clearTimeout(firstTimer);
      firstTimer = window.setTimeout(() => {
        show((index + 1) % images.length);
        timer = window.setInterval(() => show((index + 1) % images.length), slideDuration);
      }, firstSlideDelay);
    };

    const reset = () => {
      window.clearInterval(timer);
      window.clearTimeout(firstTimer);
      timer = null;
      firstTimer = null;
      show(0);
      carousel.classList.add("is-returning");
      window.setTimeout(() => carousel.classList.remove("is-returning"), returnDuration);
    };

    trigger.addEventListener("pointerenter", start);
    trigger.addEventListener("pointerleave", reset);
    trigger.addEventListener("focusin", start);
    trigger.addEventListener("focusout", reset);
  });
}

function askConfirm(title, message, onConfirm) {
  const template = document.querySelector("#confirmTemplate");
  const modal = template.content.firstElementChild.cloneNode(true);
  modal.querySelector("#confirmTitle").textContent = title;
  modal.querySelector("[data-confirm-message]").textContent = message;
  document.body.append(modal);
  const cancel = modal.querySelector("[data-confirm-cancel]");
  const ok = modal.querySelector("[data-confirm-ok]");
  cancel.focus();
  cancel.addEventListener("click", () => modal.remove());
  ok.addEventListener("click", () => {
    modal.remove();
    onConfirm();
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function isLoggedIn() {
  return adminAuthenticated;
}

function input(label, name, value = "", required = false, extraClass = "") {
  return `<div class="field ${extraClass}"><label for="${name}">${label}</label><input id="${name}" name="${name}" value="${escapeAttr(value)}" ${required ? "required" : ""}></div>`;
}

function textarea(label, name, value = "", required = false) {
  return `<div class="field full"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" ${required ? "required" : ""}>${escapeHtml(value)}</textarea></div>`;
}

function select(label, name, value, options) {
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">${options.map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${option}</option>`).join("")}</select></div>`;
}

function emptyState(message) {
  return `<div class="panel" style="grid-column:1/-1"><p>${escapeHtml(message)}</p></div>`;
}

function metaRow(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not set")}</strong></div>`;
}

function caseSection(label, value) {
  if (!value) return "";
  return `<section class="case-section"><p class="eyebrow">${label}</p><p class="lede">${escapeHtml(value)}</p></section>`;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

menuToggle.addEventListener("click", () => {
  const open = !document.body.classList.contains("menu-open");
  document.body.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
});

window.addEventListener("hashchange", route);

async function initializeApp() {
  await loadInitialServerState();
  await refreshAdminAuthentication();

  applySettings();
  route();

  window.setTimeout(
    () => document.body.classList.add("intro-complete"),
    4500
  );
}

initializeApp().catch((error) => {
  console.error("Application initialization failed.", error);

  state = structuredClone(seedState);

  applySettings();
  route();
});
