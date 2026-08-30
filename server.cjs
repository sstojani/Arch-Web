const crypto = require("crypto");
const fileSystem = require("fs");
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
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".ogg": "video/ogg",
  ".pdf": "application/pdf"
};

const uploadExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".m4v",
  ".mov",
  ".mp4",
  ".ogv",
  ".ogg",
  ".pdf",
  ".png",
  ".svg",
  ".webm",
  ".webp"
]);

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
      if (!isAllowedUpload(part)) continue;
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

function isAllowedUpload(part) {
  const ext = path.extname(part.filename || "").toLowerCase();
  return /^(image|video)\//.test(part.type) || part.type === "application/pdf" || uploadExtensions.has(ext);
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
    const type = types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const stats = await fs.stat(filePath);

    if (request.headers.range && type.startsWith("video/")) {
      serveRange(request, response, filePath, stats.size, type);
      return;
    }

    const data = request.method === "HEAD" ? Buffer.alloc(0) : await fs.readFile(filePath);
    send(
      response,
      200,
      data,
      {
        "content-type": type,
        "content-length": stats.size,
        ...(type.startsWith("video/") ? { "accept-ranges": "bytes" } : {}),
        "cache-control": "no-store"
      }
    );
  } catch {
    send(response, 404, "Not found");
  }
}

function serveRange(request, response, filePath, size, type) {
  const range = String(request.headers.range || "");
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    send(response, 416, "Requested Range Not Satisfiable", {
      "content-range": `bytes */${size}`
    });
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) {
    send(response, 416, "Requested Range Not Satisfiable", {
      "content-range": `bytes */${size}`
    });
    return;
  }

  const boundedEnd = Math.min(end, size - 1);
  response.writeHead(206, {
    "content-type": type,
    "content-length": boundedEnd - start + 1,
    "content-range": `bytes ${start}-${boundedEnd}/${size}`,
    "accept-ranges": "bytes",
    "cache-control": "no-store"
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  fileSystem.createReadStream(filePath, { start, end: boundedEnd }).pipe(response);
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
