const crypto = require("crypto");
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
