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

const demoMediaPaths = new Set(imageBank);

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
      backgroundMedia: imageBank[1],
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
      backgroundMedia: imageBank[5],
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
      backgroundMedia: imageBank[3],
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
      backgroundMedia: imageBank[4],
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
let pendingProjectUploads = new Set();
let hasRenderedRoute = false;
let routeTimer = null;
let parallaxCleanup = null;
let storyCleanup = null;
let immersiveCleanup = null;
let ambientVideoCleanup = null;
let workIntroFadeCleanup = null;
let imageLightboxCleanup = null;

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
    backgroundMedia: isBrowserStoredMedia(project.backgroundMedia) ? "" : (project.backgroundMedia || ""),
    media: splitMediaSources(project.media || []).filter((src) => !isBrowserStoredMedia(src))
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
  closeImageLightbox();
  main.innerHTML = `<div class="page">${content}</div>`;
  main.focus({ preventScroll: true });
  bindMediaFallbacks(main);
  bindImageLightbox(main);
  bindWorkIntroFade();
  bindAmbientVideos();
  bindContactForm();
}

function publishedProjects() {
  return state.projects.filter((project) => project.published);
}

function projectAssetCount() {
  return new Set(state.projects.flatMap((project) => collectProjectMedia(project)).filter(isUploadedAsset)).size;
}

function renderHome() {
  const projects = publishedProjects();
  page(`
    <section class="minimal-intro container" aria-labelledby="homeIntro">
      <h1 id="homeIntro">${escapeHtml(state.settings.intro)}</h1>
      <p>${escapeHtml(state.settings.tagline)}</p>
    </section>
    <section class="container minimal-gallery" aria-label="Selected architecture work">
      <div class="project-grid">${projects.map(projectCard).join("") || emptyState("No published projects are available yet.")}</div>
    </section>
    <section class="container minimal-footer-note">
      <p>${escapeHtml(state.settings.contactEmail)} · ${escapeHtml(state.settings.phone)}</p>
      <a href="#about">About the practice</a>
    </section>
  `);
}

function renderWork() {
  const projects = publishedProjects();
  page(`
    <section class="minimal-intro container" aria-labelledby="workIntro">
      <h1 id="workIntro">${escapeHtml(state.settings.intro)}</h1>
      <p>${escapeHtml(state.settings.tagline)}</p>
    </section>
    <section class="container minimal-gallery" aria-label="Architecture work archive">
      <div class="project-grid">${projects.map(projectCard).join("") || emptyState("No published projects are available yet.")}</div>
    </section>
  `);
}

function renderProject(slug) {
  const project = publishedProjects().find((item) => item.slug === slug) || publishedProjects()[0];
  if (!project) {
    page(emptyState("No published project is available yet."));
    return;
  }
  const related = publishedProjects().filter((item) => item.id !== project.id).slice(0, 2);
  const projectFacts = projectFactsMarkup(project);
  const projectMeta = projectMetaMarkup(project);
  page(`
    ${projectFacts}
    <section class="container project-image-flow" aria-label="${escapeHtml(project.title)} image sequence">
      ${projectMediaFlow(project)}
    </section>
    <section class="container detail-layout minimal-detail project-notes">
      ${projectMeta}
      <article>
        ${caseSection("Concept", project.concept)}
        ${caseSection("Challenge", project.challenge)}
        ${caseSection("Solution", project.solution)}
        ${caseSection("Materials", project.materials)}
        ${caseSection("Result", project.result)}
      </article>
    </section>
    <section class="container related-work">
      <p class="eyebrow">See more</p>
      <div class="project-grid">${related.map(projectCard).join("")}</div>
    </section>
  `);
}

function renderAbout() {
  page(`
    <section class="container about-copy">
      <p>${escapeHtml(state.settings.intro)}</p>
      <p>${escapeHtml(state.settings.philosophy)}</p>
    </section>
    <section class="container about-services">
      ${state.services.map((service, index) => serviceRow(service, index)).join("")}
    </section>
  `);
}

function renderContact() {
  page(`
    <section class="page-head container minimal-page-head">
      <h1>Contact</h1>
      <p class="lede">Discuss a site, a space, or a project in progress.</p>
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
        ${["dashboard", "projects", "content", "settings"].map((tab) => `<button type="button" data-admin-tab="${tab}" class="${currentAdminTab === tab ? "active" : ""}">${titleCase(tab)}</button>`).join("")}
        <button type="button" data-admin-logout>Log Out</button>
      </aside>
      <section class="admin-main" id="adminMain">${adminTab()}</section>
    </section>
  `);
  bindAdmin();
}

function adminTab() {
  if (currentAdminTab === "projects") return projectsAdmin();
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
      <div class="panel"><strong>${projectAssetCount()}</strong><p>Project media files</p></div>
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
    category: "",
    location: "",
    year: "",
    status: "",
    role: "",
    area: "",
    featured: false,
    published: true,
    cover: "",
    backgroundMedia: "",
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
      ${select("Category", "category", data.category, ["Residential", "Interior", "Commercial", "Renovation", "Urban", "Concept", "Competition"], true)}
      ${input("Status", "status", data.status)}
      ${input("Role", "role", data.role)}
      ${input("Area / Size", "area", data.area)}
      ${projectUploadField("Cover Image", "cover", data.cover, false)}
      ${projectUploadField("Background Image / Video", "backgroundMedia", data.backgroundMedia || "", false, {
        accept: "image/*,video/*",
        buttonLabel: "Upload Background Image / Video",
        required: false,
        summary: "Shown in the large right-side project showcase. Videos autoplay muted and cannot be controlled by visitors."
      })}
      ${textarea("Short Description", "summary", data.summary, true)}
      ${textarea("Concept", "concept", data.concept)}
      ${textarea("Challenge", "challenge", data.challenge)}
      ${textarea("Solution", "solution", data.solution)}
      ${textarea("Materials", "materials", data.materials)}
      ${textarea("Result", "result", data.result)}
      ${projectUploadField("Project Gallery", "media", (data.media || []).join("\n"), true)}
      <label class="checkbox-field"><input name="featured" type="checkbox" ${data.featured ? "checked" : ""}> Featured on homepage</label>
      <label class="checkbox-field"><input name="published" type="checkbox" ${data.published ? "checked" : ""}> Published on Work and Scroll sequence</label>
      <div class="admin-actions full">
        <button class="button accent" type="submit">Save Project</button>
        <button class="button ghost" type="button" data-cancel-edit>Cancel</button>
      </div>
    </form>
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
      ${textarea("Services, one per line as Title | Description", "services", state.services.map((item) => `${item.title} | ${item.text}`).join("\n"))}
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
    discardPendingProjectUploads();
    editingProjectId = "new";
    renderAdmin();
  });

  document.querySelectorAll("[data-edit-project]").forEach((button) => {
    button.addEventListener("click", () => {
      discardPendingProjectUploads();
      editingProjectId = button.dataset.editProject;
      renderAdmin();
    });
  });

  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const project = state.projects.find((item) => item.id === button.dataset.deleteProject);
      if (!project) return;
      askConfirm(`Delete ${project.title}?`, "This removes the project and cleans up uploaded files that are not used anywhere else.", () => {
        const removedMedia = collectProjectMedia(project);
        state.projects = state.projects.filter((item) => item.id !== project.id);
        if (!saveState()) return;
        cleanupUploadedFiles(removedMedia);
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
    discardPendingProjectUploads();
    editingProjectId = null;
    renderAdmin();
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
  const backgroundMedia = String(form.get("backgroundMedia") || "").trim();
  const summary = String(form.get("summary") || "").trim();
  const existingProject = state.projects.find((item) => item.id === editingProjectId);
  const previousMedia = existingProject ? collectProjectMedia(existingProject) : [];
  if (!title || !slug || !cover || !summary) {
    showToast("Title, slug, cover, and description are required.");
    return;
  }
  const project = {
    id: editingProjectId === "new" ? `p-${Date.now()}` : editingProjectId,
    title,
    slug,
    category: cleanOptionalValue(form.get("category")),
    location: cleanOptionalValue(form.get("location")),
    year: cleanOptionalValue(form.get("year")),
    status: cleanOptionalValue(form.get("status")),
    role: cleanOptionalValue(form.get("role")),
    area: cleanOptionalValue(form.get("area")),
    cover,
    backgroundMedia,
    summary,
    concept: String(form.get("concept") || ""),
    challenge: String(form.get("challenge") || ""),
    solution: String(form.get("solution") || ""),
    materials: String(form.get("materials") || ""),
    result: String(form.get("result") || ""),
    featured: form.get("featured") === "on",
    published: form.get("published") === "on",
    media: splitMediaSources(form.get("media"))
  };
  if (editingProjectId === "new") state.projects.unshift(project);
  else state.projects = state.projects.map((item) => item.id === project.id ? project : item);
  editingProjectId = null;
  if (!saveState()) return;
  cleanupUploadedFiles(previousMedia);
  pendingProjectUploads = new Set();
  showToast("Project saved.");
  renderAdmin();
}

function bindProjectUploadFields(form) {
  form.querySelectorAll("[data-project-upload]").forEach((inputNode) => {
    inputNode.addEventListener("change", () => handleProjectUpload(inputNode));
  });
  form.querySelectorAll("[data-media-source]").forEach((inputNode) => {
    inputNode.addEventListener("input", () => syncUploadPreview(inputNode));
  });
  bindUploadPreviewControls(form);
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
    sources.forEach((src) => pendingProjectUploads.add(src));
    if (inputNode.multiple) {
      const existing = splitMediaSources(target.value);
      target.value = uniqueMediaList([...existing.filter((src) => !isDemoMedia(src)), ...sources]).join("\n");
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
  const sources = splitMediaSources(inputNode.value);
  preview.innerHTML = sources.slice(0, 8).map((src, index) => mediaPreview(src, index, inputNode.id)).join("") || `<span class="upload-preview-item">No media selected yet.</span>`;
  bindMediaFallbacks(preview);
  bindUploadPreviewControls(preview);
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

function projectCard(project) {
  const images = project.cover ? [project.cover].filter((src) => isImageSrc(src) || isVideoSrc(src)) : [];
  const tagItems = [project.category, project.location].map(cleanOptionalValue).filter(Boolean);
  return `
    <a class="project-card" href="#project/${project.slug}" data-title="${escapeAttr(project.title)}" data-summary="${escapeAttr(project.summary)}" data-category="${escapeAttr(project.category)}" data-location="${escapeAttr(project.location)}" data-year="${escapeAttr(project.year)}">
      <figure class="project-cover ${images.length ? "" : "is-placeholder-only"}">
        ${projectImageMarkup(project, images)}
      </figure>
      <div class="project-meta">
        <div>
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.summary)}</p>
        </div>
        <span>${escapeHtml(project.year)}</span>
      </div>
      ${tagItems.length ? `<div class="tag-row">${tagItems.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    </a>
  `;
}

function projectStoryCard(project, index, total) {
  const images = project.cover ? [project.cover].filter((src) => isImageSrc(src) || isVideoSrc(src)) : [];
  const tagItems = [project.category, project.location].map(cleanOptionalValue).filter(Boolean);
  return `
    <a class="project-card story-card ${index === 0 ? "active" : ""}" href="#project/${project.slug}" data-story-card data-index="${index}" data-total="${total}" data-title="${escapeAttr(project.title)}" data-summary="${escapeAttr(project.summary)}" data-category="${escapeAttr(project.category)}" data-location="${escapeAttr(project.location)}" data-year="${escapeAttr(project.year)}">
      <figure class="project-cover cinematic-cover ${images.length ? "" : "is-placeholder-only"}">
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
      ${tagItems.length ? `<div class="tag-row">${tagItems.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    </a>
  `;
}

function storyDetails(project, index, total) {
  if (!project) return "";
  const rows = [
    metaDefinition("Type", project.category),
    metaDefinition("Place", project.location),
    metaDefinition("Year", project.year)
  ].filter(Boolean).join("");
  return `
    <span class="story-count">${String(index + 1).padStart(2, "0")} / ${String(total || 1).padStart(2, "0")}</span>
    <h3>${escapeHtml(project.title)}</h3>
    <p>${escapeHtml(project.summary)}</p>
    ${rows ? `<dl>${rows}</dl>` : ""}
  `;
}

function adminProjectCard(project, index) {
  const statusItems = [
    cleanOptionalValue(project.category),
    project.published ? "Published" : "Draft",
    project.featured ? "Featured" : "Not featured"
  ].filter(Boolean);
  return `
    <article class="admin-card project-card">
      <img src="${project.cover}" alt="${escapeHtml(project.title)} thumbnail">
      <div>
        <h3>${escapeHtml(project.title)}</h3>
        <p class="micro">${escapeHtml(statusItems.join(" · "))}</p>
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

function projectUploadField(label, name, value, multiple, options = {}) {
  const previewSources = multiple ? splitMediaSources(value) : uniqueMediaList([value]);
  const inputType = multiple ? "textarea" : "input";
  const field = inputType === "textarea"
    ? `<textarea id="${name}" name="${name}" data-media-source>${escapeHtml(value)}</textarea>`
    : `<input id="${name}" name="${name}" data-media-source value="${escapeAttr(value)}" ${options.required === false ? "" : "required"}>`;
  const accept = options.accept || (multiple ? "image/*,video/*,application/pdf" : "image/*");
  const buttonLabel = options.buttonLabel || (multiple ? "Upload Gallery Images / Videos" : "Upload Cover Image");
  return `
    <div class="field media-field full">
      <label for="${name}">${label}</label>
      <div class="upload-shell">
        ${options.summary ? `<p class="micro upload-guidance">${escapeHtml(options.summary)}</p>` : ""}
        <div class="upload-preview" data-upload-preview="${name}">
          ${previewSources.slice(0, 8).map((src, index) => mediaPreview(src, index, name)).join("") || `<span class="upload-preview-item">No media selected yet.</span>`}
        </div>
        <label class="upload-button">
          <span>${buttonLabel}</span>
          <input type="file" ${multiple ? "multiple" : ""} accept="${escapeAttr(accept)}" data-project-upload="#${name}">
        </label>
        <details>
          <summary>${multiple ? "Paste media URLs manually" : "Paste cover URL manually"}</summary>
          ${field}
        </details>
      </div>
    </div>
  `;
}

function mediaPreview(src, index = 0, sourceName = "") {
  const removeButton = sourceName
    ? `<button class="upload-remove" type="button" data-remove-media-source="${escapeAttr(sourceName)}" data-remove-media-index="${index}" aria-label="Remove media ${index + 1}">&times;</button>`
    : "";
  if (isVideoSrc(src)) return `<span class="upload-preview-item media-preview-frame"><video src="${escapeAttr(src)}" controls muted playsinline preload="metadata"></video>${removeButton}</span>`;
  if (isImageSrc(src)) {
    return `<span class="upload-preview-item media-preview-frame"><img src="${escapeAttr(src)}" alt="Selected media ${index + 1}" data-media-fallback><span class="media-fallback">Media unavailable</span>${removeButton}</span>`;
  }
  if (isPdfSrc(src)) return `<span class="upload-preview-item media-preview-frame">PDF ${index + 1}${removeButton}</span>`;
  return `<span class="upload-preview-item media-preview-frame">${escapeHtml(src.slice(0, 80))}${removeButton}</span>`;
}

function projectImageMarkup(project, images, speed = "") {
  if (!images.length) return `<span class="cover-placeholder" aria-hidden="true"></span>`;
  return images.map((src, imageIndex) => {
    const speedAttr = speed ? ` data-speed="${speed}"` : "";
    const fallbackSrc = imageBank[imageIndex % imageBank.length];
    const loading = imageIndex === 0 ? "eager" : "lazy";
    if (isVideoSrc(src)) {
      return `<video class="carousel-image ${imageIndex === 0 ? "active" : ""}"${speedAttr} src="${escapeAttr(src)}" muted playsinline loop preload="metadata" aria-label="${escapeHtml(project.title)} project video ${imageIndex + 1}"></video>`;
    }
    return `<img class="carousel-image ${imageIndex === 0 ? "active" : ""}"${speedAttr} src="${escapeAttr(src)}" alt="${escapeHtml(project.title)} project thumbnail ${imageIndex + 1}" loading="${loading}" decoding="async" data-fallback-src="${escapeAttr(fallbackSrc)}">`;
  }).join("");
}

function projectImages(project) {
  const seen = new Set();
  const images = [project.cover, ...(project.media || [])]
    .filter((src) => src && (isImageSrc(src) || isVideoSrc(src)))
    .filter((src) => {
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
  });
  return images;
}

function collectProjectMedia(project) {
  if (!project) return [];
  return uniqueMediaList([project.cover, project.backgroundMedia, ...(project.media || [])]);
}

function referencedProjectMedia() {
  return new Set(state.projects.flatMap((project) => collectProjectMedia(project)));
}

function cleanupUploadedFiles(candidates) {
  const stillUsed = referencedProjectMedia();
  const paths = uniqueMediaList(candidates)
    .filter(isUploadedAsset)
    .filter((src) => !stillUsed.has(src));
  if (!paths.length) return;

  stateSaveQueue = stateSaveQueue
    .then(() => deleteUploadedFiles(paths))
    .catch((error) => {
      console.error(error);
      showToast(error.message || "Could not delete unused uploaded files.");
    });
}

function discardPendingProjectUploads() {
  const pending = [...pendingProjectUploads];
  pendingProjectUploads = new Set();
  cleanupUploadedFiles(pending);
}

async function deleteUploadedFiles(paths) {
  const response = await fetch("/api/upload", {
    method: "DELETE",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      paths
    })
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    adminAuthenticated = false;
    throw new Error("Admin session expired. Log in again.");
  }
  if (!response.ok) {
    throw new Error(result.error || "Could not delete uploaded files.");
  }
  return result.deleted || [];
}

function bindUploadPreviewControls(root = document) {
  root.querySelectorAll("[data-remove-media-source]").forEach((button) => {
    if (button.dataset.removeBound) return;
    button.dataset.removeBound = "true";
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.removeMediaSource);
      if (!target) return;
      const sources = splitMediaSources(target.value);
      const index = Number(button.dataset.removeMediaIndex);
      if (!Number.isInteger(index) || index < 0 || index >= sources.length) return;
      const [removed] = sources.splice(index, 1);
      target.value = sources.join("\n");
      syncUploadPreview(target);
      if (pendingProjectUploads.has(removed)) {
        pendingProjectUploads.delete(removed);
        cleanupUploadedFiles([removed]);
      }
      showToast("Media removed. Save the project to apply.");
    });
  });
}

function bindMediaFallbacks(root = document) {
  root.querySelectorAll("img[data-media-fallback], .media-frame img, .project-cover img, .gallery-item img, .project-flow-item img, .admin-card > img").forEach((image) => {
    if (image.dataset.fallbackBound) return;
    image.dataset.fallbackBound = "true";
    image.addEventListener("error", () => {
      if (image.dataset.fallbackSrc && image.dataset.fallbackTried !== "true") {
        image.dataset.fallbackTried = "true";
        image.src = image.dataset.fallbackSrc;
        return;
      }
      image.classList.add("is-broken");
    });
  });
}

function projectMediaFlow(project) {
  const media = uniqueMediaList([project.cover, project.backgroundMedia, ...(project.media || [])])
    .filter((src) => isImageSrc(src) || isVideoSrc(src));
  const items = media.length ? media : [project.cover].filter(Boolean);
  if (!items.length) return `<figure class="project-flow-item"><span class="cover-placeholder" aria-hidden="true"></span></figure>`;

  return items.map((src, index) => {
    const itemClass = (index + 1) % 3 === 0 ? "project-flow-item is-wide" : "project-flow-item";
    const fallbackSrc = imageBank[index % imageBank.length];
    if (isVideoSrc(src)) {
      return `<figure class="${itemClass}"><video src="${escapeAttr(src)}" autoplay muted loop playsinline preload="metadata" tabindex="-1" data-ambient-video aria-label="${escapeHtml(project.title)} video ${index + 1}"></video></figure>`;
    }
    return `<figure class="${itemClass}"><img src="${escapeAttr(src)}" alt="${escapeHtml(project.title)} image ${index + 1}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" data-media-fallback data-fallback-src="${escapeAttr(fallbackSrc)}"${lightboxAttrs(project, src, `image ${index + 1}`)}></figure>`;
  }).join("");
}

function projectGallery(project) {
  const media = project.media && project.media.length ? project.media : [project.cover];
  return media.map((src, index) => {
    const fallbackSrc = imageBank[index % imageBank.length];
    if (isVideoSrc(src)) {
      return `<figure class="gallery-item"><video src="${escapeAttr(src)}" controls muted playsinline preload="metadata" aria-label="${escapeHtml(project.title)} video ${index + 1}"></video></figure>`;
    }
    if (isImageSrc(src)) {
      return `<figure class="gallery-item"><img src="${escapeAttr(src)}" alt="${escapeHtml(project.title)} gallery image ${index + 1}" data-media-fallback data-fallback-src="${escapeAttr(fallbackSrc)}"${lightboxAttrs(project, src, `gallery image ${index + 1}`)}></figure>`;
    }
    return `<figure class="gallery-item gallery-file"><a class="button ghost" href="${escapeAttr(src)}" target="_blank" rel="noreferrer">Open media ${index + 1}</a></figure>`;
  }).join("");
}

function projectCoverMedia(project) {
  const fallback = `<span class="media-fallback detail-fallback">Project media unavailable</span>`;
  if (isVideoSrc(project.cover)) {
    return `<video class="parallax-media" src="${escapeAttr(project.cover)}" controls muted playsinline preload="metadata" aria-label="${escapeHtml(project.title)} hero video"></video>`;
  }
  return `<img class="parallax-media" src="${escapeAttr(project.cover)}" alt="${escapeHtml(project.title)} hero image" data-media-fallback data-fallback-src="${escapeAttr(imageBank[0])}">${fallback}`;
}

function projectShowcaseMedia(project) {
  const fallback = `<span class="media-fallback detail-fallback">Background media unavailable</span>`;
  const src = String(project.backgroundMedia || "").trim();
  if (!src) {
    return "";
  }
  if (isVideoSrc(src)) {
    return `<video class="parallax-media ambient-video" src="${escapeAttr(src)}" autoplay muted loop playsinline preload="metadata" tabindex="-1" data-ambient-video aria-label="${escapeHtml(project.title)} background video"></video>`;
  }
  if (isImageSrc(src)) {
    return `<img class="parallax-media" src="${escapeAttr(src)}" alt="${escapeHtml(project.title)} background media" data-media-fallback>${fallback}`;
  }
  return `<span class="media-fallback detail-fallback is-visible">Background media unavailable</span>`;
}

function lightboxAttrs(project, src, label = "image") {
  const meta = [project.category, project.location, project.year].filter(Boolean).join(" / ");
  return ` data-lightbox-src="${escapeAttr(src)}" data-lightbox-title="${escapeAttr(project.title)}" data-lightbox-details="${escapeAttr(project.summary || "")}" data-lightbox-meta="${escapeAttr(meta)}" role="button" tabindex="0" aria-label="Open ${escapeAttr(project.title)} ${escapeAttr(label)} in image viewer"`;
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

function isDemoMedia(src = "") {
  return demoMediaPaths.has(src);
}

function isUploadedAsset(src = "") {
  return /^assets\/uploads\/[^?#]+/i.test(src);
}

function uniqueMediaList(items) {
  const seen = new Set();
  const output = [];
  items.forEach((item) => {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    output.push(value);
  });
  return output;
}

function splitMediaSources(input) {
  const items = Array.isArray(input) ? input : [input];
  return uniqueMediaList(items.flatMap((item) => String(item || "").split(/(?:\r?\n|\\n)+/)));
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
  const cards = document.querySelectorAll(".project-card, .service, .case-section, .gallery-item, .section-header");
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
  const elements = document.querySelectorAll(".parallax-media, .depth-layer, .project-cover img, .project-cover video, .gallery-item img, .gallery-item video, .cover-plate, .cinema-plane");
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

    document.documentElement.style.setProperty("--scene-tilt", `${-17 + pageProgress * 34}deg`);
    document.documentElement.style.setProperty("--scene-spin", `${-24 + pageProgress * 78}deg`);
    document.documentElement.style.setProperty("--scene-lift", `${-80 + pageProgress * 190}px`);
    document.documentElement.style.setProperty("--scene-scale", `${0.86 + pageProgress * 0.2}`);
    document.documentElement.style.setProperty("--scene-accent", accent);
    document.documentElement.style.setProperty("--scene-glow", glow);
    scene.style.opacity = window.location.hash.includes("admin") ? "0.08" : "0.18";
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
    const image = card.querySelector(".project-cover .carousel-image.active") || card.querySelector(".project-cover .carousel-image");
    if (!image) return;
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.querySelectorAll(".project-cover .carousel-image.active").forEach((activeImage) => {
        activeImage.style.transform = `translate3d(${x * -18}px, ${y * -16}px, 0) scale(1.13)`;
      });
      card.style.setProperty("--tilt-x", `${y * -2.5}deg`);
      card.style.setProperty("--tilt-y", `${x * 2.5}deg`);
    });
    card.addEventListener("pointerleave", () => {
      card.querySelectorAll(".project-cover .carousel-image").forEach((item) => {
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
        if (image.tagName === "VIDEO") {
          if (imageIndex === index) image.play().catch(() => {});
          else image.pause();
        }
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
      images.forEach((image) => {
        if (image.tagName === "VIDEO") {
          image.pause();
          image.currentTime = 0;
        }
      });
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

function bindAmbientVideos() {
  if (ambientVideoCleanup) ambientVideoCleanup();
  const videos = [...document.querySelectorAll("video[data-ambient-video]")];
  videos.forEach((video) => {
    video.muted = true;
    video.controls = false;
    video.disablePictureInPicture = true;
    video.disableRemotePlayback = true;
    video.tabIndex = -1;
  });

  if (!videos.length || prefersReducedMotion()) {
    videos.forEach((video) => video.pause());
    ambientVideoCleanup = null;
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
  }, { threshold: 0.42 });

  videos.forEach((video) => observer.observe(video));
  ambientVideoCleanup = () => {
    observer.disconnect();
    videos.forEach((video) => video.pause());
    ambientVideoCleanup = null;
  };
}

function bindWorkIntroFade() {
  if (workIntroFadeCleanup) workIntroFadeCleanup();

  const intro = document.querySelector(".minimal-intro");
  const shouldBind = document.body.dataset.route === "work" && intro && !prefersReducedMotion();

  if (!intro) {
    workIntroFadeCleanup = null;
    return;
  }

  intro.style.setProperty("--work-intro-opacity", "1");

  if (!shouldBind) {
    workIntroFadeCleanup = null;
    return;
  }

  let ticking = false;

  const update = () => {
    ticking = false;
    const gallery = document.querySelector(".minimal-gallery");
    const textNodes = [...intro.querySelectorAll("h1, p")];

    if (!gallery || !textNodes.length) return;

    const textBounds = textNodes.reduce((bounds, node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: Math.min(bounds.top, rect.top),
        bottom: Math.max(bounds.bottom, rect.bottom)
      };
    }, { top: Number.POSITIVE_INFINITY, bottom: 0 });
    const galleryTop = gallery.getBoundingClientRect().top;
    const fadeDistance = Math.max(260, Math.min(420, window.innerHeight * 0.34));
    const fadeStart = textBounds.bottom + fadeDistance;
    const fadeEnd = textBounds.top + 18;
    const overlapProgress = Math.min(1, Math.max(0, (fadeStart - galleryTop) / (fadeStart - fadeEnd)));
    const scrollProgress = Math.min(1, Math.max(0, window.scrollY / 260));
    const easedScroll = scrollProgress * scrollProgress * (3 - 2 * scrollProgress);
    let opacityProgress = 0;

    if (overlapProgress < 0.45) {
      opacityProgress = overlapProgress * 0.34;
    } else if (overlapProgress < 0.75) {
      opacityProgress = 0.153 + ((overlapProgress - 0.45) / 0.3) * 0.36;
    } else {
      opacityProgress = 0.513 + Math.pow((overlapProgress - 0.75) / 0.25, 0.68) * 0.487;
    }

    const progress = opacityProgress * easedScroll;
    intro.style.setProperty("--work-intro-opacity", (1 - progress).toFixed(3));
  };

  const requestUpdate = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  workIntroFadeCleanup = () => {
    window.removeEventListener("scroll", requestUpdate);
    window.removeEventListener("resize", requestUpdate);
    intro.style.removeProperty("--work-intro-opacity");
    workIntroFadeCleanup = null;
  };
}

function bindImageLightbox(root = document) {
  root.querySelectorAll("img[data-lightbox-src]").forEach((image) => {
    if (image.dataset.lightboxBound) return;
    image.dataset.lightboxBound = "true";

    const open = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const galleryImages = [...document.querySelectorAll(".project-image-flow img[data-lightbox-src]")]
        .map((item) => ({
          src: item.dataset.lightboxSrc || item.src,
          title: item.dataset.lightboxTitle || item.alt || "Project image"
        }))
        .filter((item) => item.src);
      const currentSrc = image.dataset.lightboxSrc || image.src;
      const index = Math.max(0, galleryImages.findIndex((item) => item.src === currentSrc));
      openImageLightbox(galleryImages, index);
    };

    image.addEventListener("click", open);
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open(event);
    });
  });
}

function closeImageLightbox() {
  const existing = document.querySelector(".image-lightbox");
  if (!existing) return;
  if (imageLightboxCleanup) imageLightboxCleanup();
  existing.remove();
  document.body.classList.remove("lightbox-open");
  imageLightboxCleanup = null;
}

function openImageLightbox(images, startIndex = 0) {
  closeImageLightbox();
  const galleryImages = Array.isArray(images) ? images.filter((item) => item && item.src) : [];
  if (!galleryImages.length) return;
  let currentIndex = Math.min(Math.max(startIndex, 0), galleryImages.length - 1);

  const modal = document.createElement("div");
  modal.className = "image-lightbox";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Project image viewer");
  modal.innerHTML = `
    <button class="image-lightbox-close" type="button" aria-label="Close image viewer"></button>
    <button class="image-lightbox-arrow is-prev" type="button" data-lightbox-prev aria-label="Previous image"></button>
    <figure class="image-lightbox-stage">
      <img class="image-lightbox-image" draggable="false">
    </figure>
    <button class="image-lightbox-arrow is-next" type="button" data-lightbox-next aria-label="Next image"></button>
  `;

  const stage = modal.querySelector(".image-lightbox-stage");
  let image = modal.querySelector(".image-lightbox-stage img");
  const closeButton = modal.querySelector(".image-lightbox-close");
  const previousButton = modal.querySelector("[data-lightbox-prev]");
  const nextButton = modal.querySelector("[data-lightbox-next]");
  let isAnimating = false;
  let pointerStart = null;

  const applyImage = (node, item) => {
    node.src = item.src;
    node.alt = `${item.title} full screen image`;
  };

  const showImage = (index, direction = 0) => {
    const nextIndex = (index + galleryImages.length) % galleryImages.length;
    if (!direction || nextIndex === currentIndex) {
      currentIndex = nextIndex;
      applyImage(image, galleryImages[currentIndex]);
      previousButton.hidden = galleryImages.length < 2;
      nextButton.hidden = galleryImages.length < 2;
      return;
    }
    if (isAnimating) return;

    isAnimating = true;
    const outgoing = image;
    const incoming = document.createElement("img");
    incoming.className = "image-lightbox-image is-entering";
    incoming.draggable = false;
    incoming.style.setProperty("--slide-enter", `${direction * 100}%`);
    outgoing.style.setProperty("--slide-exit", `${direction * -100}%`);
    applyImage(incoming, galleryImages[nextIndex]);
    stage.append(incoming);

    requestAnimationFrame(() => {
      outgoing.classList.add("is-leaving");
      incoming.classList.remove("is-entering");
    });

    window.setTimeout(() => {
      outgoing.remove();
      incoming.classList.remove("is-entering", "is-leaving");
      incoming.removeAttribute("style");
      image = incoming;
      currentIndex = nextIndex;
      isAnimating = false;
    }, 430);
    previousButton.hidden = galleryImages.length < 2;
    nextButton.hidden = galleryImages.length < 2;
  };

  const showPrevious = () => showImage(currentIndex - 1, -1);
  const showNext = () => showImage(currentIndex + 1, 1);

  const onKeydown = (event) => {
    if (event.key === "Escape") closeImageLightbox();
    if (event.key === "ArrowLeft") showPrevious();
    if (event.key === "ArrowRight") showNext();
  };

  closeButton.addEventListener("click", closeImageLightbox);
  previousButton.addEventListener("click", showPrevious);
  nextButton.addEventListener("click", showNext);
  stage.addEventListener("pointerdown", (event) => {
    pointerStart = {
      x: event.clientX,
      y: event.clientY
    };
  });
  stage.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    if (dx < 0) showNext();
    else showPrevious();
  });
  stage.addEventListener("pointercancel", () => {
    pointerStart = null;
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeImageLightbox();
  });

  document.addEventListener("keydown", onKeydown);
  imageLightboxCleanup = () => {
    document.removeEventListener("keydown", onKeydown);
  };

  document.body.append(modal);
  document.body.classList.add("lightbox-open");
  showImage(currentIndex);
  closeButton.focus({ preventScroll: true });
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

function select(label, name, value, options, optional = false) {
  const blank = optional ? `<option value="" ${cleanOptionalValue(value) ? "" : "selected"}>None</option>` : "";
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">${blank}${options.map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${option}</option>`).join("")}</select></div>`;
}

function emptyState(message) {
  return `<div class="panel" style="grid-column:1/-1"><p>${escapeHtml(message)}</p></div>`;
}

function metaRow(label, value) {
  const clean = cleanOptionalValue(value);
  if (!clean) return "";
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(clean)}</strong></div>`;
}

function metaDefinition(label, value) {
  const clean = cleanOptionalValue(value);
  if (!clean) return "";
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(clean)}</dd></div>`;
}

function projectFactsMarkup(project) {
  const year = cleanOptionalValue(project.year);
  const title = cleanOptionalValue(project.title);
  const projectLine = title ? `Project: ${title}${year ? ` | ${year}` : ""}` : "";
  const scope = [project.category, project.role].map(cleanOptionalValue).filter(Boolean).join(", ");
  const rows = [
    factRow(projectLine),
    factRow(scope, "Scope of work"),
    factRow(project.location, "Location"),
    factRow(project.status, "Status"),
    factRow(project.area, "Area"),
    cleanOptionalValue(project.summary) ? `<p>${escapeHtml(cleanOptionalValue(project.summary))}</p>` : ""
  ].filter(Boolean).join("");
  if (!rows) return "";
  return `<section class="container project-facts" aria-label="${escapeHtml(project.title)} project information">${rows}</section>`;
}

function projectMetaMarkup(project) {
  const rows = [
    metaRow("Project", project.title),
    metaRow("Location", project.location),
    metaRow("Year", project.year),
    metaRow("Status", project.status),
    metaRow("Category", project.category),
    metaRow("Role", project.role),
    metaRow("Area", project.area)
  ].filter(Boolean).join("");
  if (!rows) return "";
  return `<aside class="meta-list" aria-label="Project metadata">${rows}</aside>`;
}

function factRow(value, label = "") {
  const clean = cleanOptionalValue(value);
  if (!clean) return "";
  return `<p>${label ? `${escapeHtml(label)}: ` : ""}${escapeHtml(clean)}</p>`;
}

function cleanOptionalValue(value) {
  const clean = String(value ?? "").trim();
  if (!clean) return "";
  const normalized = clean.toLowerCase();
  if (["-", "--", "not set", "n/a", "na", "none", "null", "undefined"].includes(normalized)) return "";
  return clean;
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

  document.body.classList.add("intro-complete");
}

initializeApp().catch((error) => {
  console.error("Application initialization failed.", error);

  state = structuredClone(seedState);

  applySettings();
  route();
});
