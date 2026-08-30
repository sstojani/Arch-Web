const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const root = __dirname;
const serverState = require("./server-state.cjs");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const uploadDir = path.join(root, "assets", "uploads");
const maxUploadBytes = 80 * 1024 * 1024;

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf"
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

function sendJson(response, status, data) {
  send(response, status, JSON.stringify(data), { "content-type": "application/json; charset=utf-8" });
}

function safeName(name) {
  const ext = path.extname(name || "").toLowerCase();
  const base = path.basename(name || "upload", ext).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "upload"}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext || ".bin"}`;
}

function splitBuffer(buffer, separator) {
  const chunks = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);
  while (index !== -1) {
    chunks.push(buffer.subarray(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  chunks.push(buffer.subarray(start));
  return chunks;
}

function parseMultipart(buffer, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  return splitBuffer(buffer, marker)
    .map((part) => {
      let chunk = part;
      if (chunk.subarray(0, 2).toString() === "\r\n") chunk = chunk.subarray(2);
      if (chunk.subarray(-2).toString() === "\r\n") chunk = chunk.subarray(0, -2);
      if (chunk.toString() === "--") return null;

      const separator = Buffer.from("\r\n\r\n");
      const headerEnd = chunk.indexOf(separator);
      if (headerEnd < 0) return null;

      const rawHeaders = chunk.subarray(0, headerEnd).toString("utf8");
      let body = chunk.subarray(headerEnd + separator.length);
      if (body.subarray(-2).toString() === "\r\n") body = body.subarray(0, -2);

      const disposition = rawHeaders.match(/content-disposition:([^\r\n]+)/i)?.[1] || "";
      const type = rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
      const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
      if (!filename || !body.length) return null;
      return { filename, type, body };
    })
    .filter(Boolean);
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxUploadBytes) throw new Error("Upload is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handleUpload(request, response) {
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
  if (!boundary) {
    sendJson(response, 400, { error: "Missing multipart boundary." });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const parts = parseMultipart(body, boundary);
    await fs.mkdir(uploadDir, { recursive: true });

    const files = [];
    for (const part of parts) {
      if (!/^(image|video)\//.test(part.type) && part.type !== "application/pdf") continue;
      const filename = safeName(part.filename);
      const destination = path.join(uploadDir, filename);
      await fs.writeFile(destination, part.body);
      files.push({
        name: part.filename,
        type: part.type,
        size: part.body.length,
        path: `assets/uploads/${filename}`
      });
    }

    sendJson(response, 200, { files });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

function uploadedFilePath(uploadPath) {
  if (typeof uploadPath !== "string" || !uploadPath.startsWith("assets/uploads/")) {
    return null;
  }

  const filePath = path.resolve(root, uploadPath);
  const relative = path.relative(uploadDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

async function handleDeleteUploads(request, response) {
  try {
    const raw = (await readRequestBody(request)).toString("utf8");
    const body = raw ? JSON.parse(raw) : {};
    const paths = Array.isArray(body.paths) ? body.paths : [];
    const deleted = [];

    for (const uploadPath of [...new Set(paths)]) {
      const filePath = uploadedFilePath(uploadPath);
      if (!filePath) continue;
      await fs.rm(filePath, { force: true });
      deleted.push(uploadPath);
    }

    sendJson(response, 200, { deleted });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);

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

  const filePath = path.resolve(root, `.${requestedPath}`);
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    send(response, 403, "Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const type = types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    send(
      response,
      200,
      request.method === "HEAD" ? Buffer.alloc(0) : data,
      {
        "content-type": type,
        "cache-control": "no-store"
      }
    );
  } catch {
    send(response, 404, "Not found");
  }
}

const server = http.createServer((request, response) => {
  if (serverState.handle(request, response)) {
    return;
  }

  if ((request.method === "POST" || request.method === "DELETE") && request.url?.startsWith("/api/upload")) {
    if (!serverState.isAuthenticated(request)) {
      sendJson(response, 401, {
        error: "Admin authentication required."
      });
      return;
    }

    if (request.method === "POST") handleUpload(request, response);
    else handleDeleteUploads(request, response);
    return;
  }
  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }
  send(response, 405, "Method not allowed");
});

server.listen(port, host, () => {
  console.log(`Architecture portfolio running at http://${host}:${port}`);
  console.log(`Uploads will be saved to ${uploadDir}`);
});
