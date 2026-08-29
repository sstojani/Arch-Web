const fs = require("fs");
const path = require("path");

const root = __dirname;
const appPath = path.join(root, "app.js");
const serverPath = path.join(root, "server.cjs");
const stateModulePath = path.join(root, "server-state.cjs");
const gitignorePath = path.join(root, ".gitignore");
const backupDir = path.join(root, ".migration-backup");

function die(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

function replaceRequired(source, search, replacement, name) {
  if (!source.includes(search)) {
    die(`Could not find ${name}. Nothing has been changed.`);
  }
  return source.replace(search, replacement);
}

function replaceRegex(source, regex, replacement, name) {
  if (!regex.test(source)) {
    die(`Could not find ${name}. Nothing has been changed.`);
  }
  return source.replace(regex, replacement);
}

if (!fs.existsSync(appPath) || !fs.existsSync(serverPath)) {
  die("app.js or server.cjs was not found. Run this from the Arch-Web folder.");
}

const oldApp = fs.readFileSync(appPath, "utf8");
const oldServer = fs.readFileSync(serverPath, "utf8");
const oldIgnore = fs.existsSync(gitignorePath)
  ? fs.readFileSync(gitignorePath, "utf8")
  : "";

if (oldApp.includes("loadInitialServerState")) {
  die("This project already appears to have been migrated.");
}

let app = oldApp;
let server = oldServer;
let gitignore = oldIgnore;

/*
 * ------------------------------------------------------------
 * CLIENT: app.js
 * ------------------------------------------------------------
 */

app = replaceRequired(
  app,
`const STORAGE_KEY = "archPortfolioState.v1";
const SESSION_KEY = "archPortfolioAdminSession";
const adminCredentials = {
  email: "studio@example.com",
  password: "architect2026"
};`,
`const LEGACY_STORAGE_KEY = "archPortfolioState.v1";

let adminAuthenticated = false;
let serverStateExists = false;
let legacyStatePendingMigration = false;
let stateSaveQueue = Promise.resolve();`,
  "old browser-storage configuration"
);

app = replaceRequired(
  app,
  "let state = loadState();",
  "let state = structuredClone(seedState);",
  "old state initialization"
);

app = replaceRegex(
  app,
  /function loadState\(\) \{[\s\S]*?\n\}\n\nfunction saveState\(\) \{[\s\S]*?\n\}\n\nfunction normalizeStoredState/,
`async function loadInitialServerState() {
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

function normalizeStoredState`,
  "loadState/saveState"
);

app = replaceRegex(
  app,
  /<p class="lede">Use the seeded local credentials to enter: \$\{adminCredentials\.email\} \/ \$\{adminCredentials\.password\}<\/p>/,
  `<p class="lede">Sign in to manage the server-backed portfolio.</p>`,
  "old visible admin credentials"
);

app = replaceRegex(
  app,
  /function handleLogin\(event\) \{[\s\S]*?\n\}\n\nfunction saveProjectFromForm/,
`async function handleLogin(event) {
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

function saveProjectFromForm`,
  "client-side login handler"
);

app = replaceRequired(
  app,
`function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}`,
`function isLoggedIn() {
  return adminAuthenticated;
}`,
  "old sessionStorage authentication"
);

app = replaceRequired(
  app,
`  const logout = document.querySelector("[data-admin-logout]");
  if (logout) {
    logout.addEventListener("click", () => {
      sessionStorage.removeItem(SESSION_KEY);
      showToast("Logged out.");
      renderAdmin();
    });
  }`,
`  const logout = document.querySelector("[data-admin-logout]");
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
  }`,
  "old logout handler"
);

app = replaceRequired(
  app,
`window.addEventListener("hashchange", route);
applySettings();
route();
window.setTimeout(() => document.body.classList.add("intro-complete"), 4500);`,
`window.addEventListener("hashchange", route);

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
});`,
  "old application startup"
);

app = app
  .replace(
    "Files are stored in this browser for the local prototype. For production, connect durable storage.",
    "Files and portfolio content are stored on the server and shared across devices."
  )
  .replace(
    "This removes the project from the local portfolio.",
    "This removes the project from the server portfolio."
  )
  .replace(
    "This removes the uploaded item from this browser.",
    "This removes the item from the server portfolio library."
  )
  .replace(
    "This will replace all local edits with the seeded portfolio.",
    "This will replace the server portfolio with the seeded content."
  );

/*
 * ------------------------------------------------------------
 * SERVER STATE + AUTH MODULE
 * ------------------------------------------------------------
 */

const stateModule = String.raw`const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const root = __dirname;

const dataDir = path.join(root, "data");
const stateFile = path.join(dataDir, "portfolio.json");

const adminEmail = process.env.ARCH_ADMIN_EMAIL || "";
const adminPassword = process.env.ARCH_ADMIN_PASSWORD || "";

const cookieName = "arch_admin_session";

const sessions = new Map();

const sessionLifetime =
  8 * 60 * 60 * 1000;

const maxJsonBytes =
  5 * 1024 * 1024;

function sendJson(response, status, object, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });

  response.end(JSON.stringify(object));
}

function cookies(request) {
  const result = {};

  const raw = request.headers.cookie || "";

  raw.split(";").forEach((part) => {
    const index = part.indexOf("=");

    if (index < 0) return;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      result[decodeURIComponent(key)] =
        decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  });

  return result;
}

function tokenFromRequest(request) {
  return cookies(request)[cookieName] || "";
}

function isAuthenticated(request) {
  const token = tokenFromRequest(request);

  if (!token) return false;

  const session = sessions.get(token);

  if (!session) return false;

  if (session.expires <= Date.now()) {
    sessions.delete(token);
    return false;
  }

  session.expires =
    Date.now() + sessionLifetime;

  return true;
}

function secureEqual(a, b) {
  const one = Buffer.from(String(a));
  const two = Buffer.from(String(b));

  if (one.length !== two.length) {
    return false;
  }

  return crypto.timingSafeEqual(one, two);
}

async function readJson(request) {
  const chunks = [];

  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > maxJsonBytes) {
      throw new Error("JSON request too large.");
    }

    chunks.push(chunk);
  }

  const raw =
    Buffer.concat(chunks).toString("utf8");

  return raw ? JSON.parse(raw) : {};
}

async function readState() {
  try {
    return JSON.parse(
      await fs.readFile(stateFile, "utf8")
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function saveState(state) {
  await fs.mkdir(dataDir, {
    recursive: true
  });

  const temporary =
    path.join(
      dataDir,
      "portfolio." +
        process.pid +
        "." +
        Date.now() +
        ".tmp"
    );

  await fs.writeFile(
    temporary,
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );

  await fs.rename(
    temporary,
    stateFile
  );
}

async function getState(request, response) {
  try {
    const state = await readState();

    if (!state) {
      sendJson(response, 404, {
        error: "Portfolio state is not initialized."
      });

      return;
    }

    sendJson(response, 200, state);
  } catch (error) {
    sendJson(response, 500, {
      error: error.message
    });
  }
}

async function putState(request, response) {
  if (!isAuthenticated(request)) {
    sendJson(response, 401, {
      error: "Admin authentication required."
    });

    return;
  }

  try {
    const state = await readJson(request);

    const valid =
      state &&
      typeof state === "object" &&
      !Array.isArray(state) &&
      state.settings &&
      typeof state.settings === "object" &&
      Array.isArray(state.projects) &&
      Array.isArray(state.services) &&
      Array.isArray(state.mediaItems);

    if (!valid) {
      sendJson(response, 400, {
        error: "Invalid portfolio state."
      });

      return;
    }

    await saveState(state);

    sendJson(response, 200, {
      ok: true
    });
  } catch (error) {
    sendJson(response, 400, {
      error: error.message
    });
  }
}

async function login(request, response) {
  if (!adminEmail || !adminPassword) {
    sendJson(response, 503, {
      error:
        "Admin credentials are not configured on the server."
    });

    return;
  }

  try {
    const body = await readJson(request);

    const validEmail =
      secureEqual(
        body.email || "",
        adminEmail
      );

    const validPassword =
      secureEqual(
        body.password || "",
        adminPassword
      );

    if (!validEmail || !validPassword) {
      sendJson(response, 401, {
        error: "Invalid admin credentials."
      });

      return;
    }

    const token =
      crypto.randomBytes(32).toString("hex");

    sessions.set(token, {
      expires:
        Date.now() + sessionLifetime
    });

    sendJson(
      response,
      200,
      {
        ok: true
      },
      {
        "set-cookie":
          cookieName +
          "=" +
          token +
          "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800"
      }
    );
  } catch (error) {
    sendJson(response, 400, {
      error: error.message
    });
  }
}

function logout(request, response) {
  const token = tokenFromRequest(request);

  if (token) {
    sessions.delete(token);
  }

  sendJson(
    response,
    200,
    {
      ok: true
    },
    {
      "set-cookie":
        cookieName +
        "=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
    }
  );
}

function auth(request, response) {
  sendJson(response, 200, {
    authenticated:
      isAuthenticated(request)
  });
}

/*
 * Return true when this module handled the request.
 */
function handle(request, response) {
  const url =
    new URL(
      request.url || "/",
      "http://" +
        (request.headers.host || "localhost")
    );

  const pathname = url.pathname;

  if (
    request.method === "GET" &&
    pathname === "/api/state"
  ) {
    getState(request, response);
    return true;
  }

  if (
    request.method === "PUT" &&
    pathname === "/api/state"
  ) {
    putState(request, response);
    return true;
  }

  if (
    request.method === "POST" &&
    pathname === "/api/login"
  ) {
    login(request, response);
    return true;
  }

  if (
    request.method === "POST" &&
    pathname === "/api/logout"
  ) {
    logout(request, response);
    return true;
  }

  if (
    request.method === "GET" &&
    pathname === "/api/auth"
  ) {
    auth(request, response);
    return true;
  }

  return false;
}

module.exports = {
  handle,
  isAuthenticated
};
`;

fs.writeFileSync(
  stateModulePath,
  stateModule,
  "utf8"
);

/*
 * ------------------------------------------------------------
 * EXISTING server.cjs integration
 * ------------------------------------------------------------
 */

server = replaceRequired(
  server,
  `const root = __dirname;`,
  `const root = __dirname;
const serverState = require("./server-state.cjs");`,
  "server root declaration"
);

/*
 * Protect upload API.
 */
server = replaceRequired(
  server,
`  if (request.method === "POST" && request.url?.startsWith("/api/upload")) {
    handleUpload(request, response);
    return;
  }`,
`  if (serverState.handle(request, response)) {
    return;
  }

  if (request.method === "POST" && request.url?.startsWith("/api/upload")) {
    if (!serverState.isAuthenticated(request)) {
      sendJson(response, 401, {
        error: "Admin authentication required."
      });
      return;
    }

    handleUpload(request, response);
    return;
  }`,
  "upload request handler"
);

/*
 * Prevent direct access to sensitive server/runtime files.
 */
server = replaceRequired(
  server,
`  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(root, \`.\${requestedPath}\`);`,
`  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);

  const blocked =
    requestedPath === "/server.cjs" ||
    requestedPath === "/server-state.cjs" ||
    requestedPath === "/.gitignore" ||
    requestedPath.startsWith("/data/") ||
    requestedPath.startsWith("/.git/") ||
    requestedPath.startsWith("/tools/");

  if (blocked) {
    send(response, 404, "Not found", {
      "cache-control": "no-store"
    });
    return;
  }

  const filePath = path.resolve(root, \`.\${requestedPath}\`);`,
  "static file handler"
);

/*
 * During development/testing, never serve stale app.js/styles.css/etc.
 */
server = replaceRequired(
  server,
`    send(response, 200, data, { "content-type": type });`,
`    send(
      response,
      200,
      request.method === "HEAD" ? Buffer.alloc(0) : data,
      {
        "content-type": type,
        "cache-control": "no-store"
      }
    );`,
  "static response"
);

/*
 * ------------------------------------------------------------
 * Git ignores
 * ------------------------------------------------------------
 */

const ignores = [
  ".migration-backup/",
  "data/portfolio.json",
  "data/*.tmp",
  "assets/uploads/"
];

for (const ignore of ignores) {
  const exists =
    gitignore
      .split(/\r?\n/)
      .some(
        (line) =>
          line.trim() === ignore
      );

  if (!exists) {
    if (
      gitignore &&
      !gitignore.endsWith("\n")
    ) {
      gitignore += "\n";
    }

    gitignore += ignore + "\n";
  }
}

/*
 * ------------------------------------------------------------
 * Backups + save
 * ------------------------------------------------------------
 */

fs.mkdirSync(
  backupDir,
  {
    recursive: true
  }
);

fs.writeFileSync(
  path.join(
    backupDir,
    "app.js.before-server-storage.bak"
  ),
  oldApp,
  "utf8"
);

fs.writeFileSync(
  path.join(
    backupDir,
    "server.cjs.before-server-storage.bak"
  ),
  oldServer,
  "utf8"
);

fs.writeFileSync(
  appPath,
  app,
  "utf8"
);

fs.writeFileSync(
  serverPath,
  server,
  "utf8"
);

fs.writeFileSync(
  gitignorePath,
  gitignore,
  "utf8"
);

console.log("");
console.log("===========================================");
console.log(" Arch-Web server-storage migration DONE");
console.log("===========================================");
console.log("");
console.log("Portfolio state will now live in:");
console.log("  data/portfolio.json");
console.log("");
console.log("Uploaded files remain in:");
console.log("  assets/uploads/");
console.log("");
console.log("Old files were backed up in:");
console.log("  .migration-backup/");
console.log("");
console.log("Next run:");
console.log("  node --check app.js");
console.log("  node --check server.cjs");
console.log("  node --check server-state.cjs");
console.log("  git diff");
console.log("");