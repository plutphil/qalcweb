import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = normalize(new URL(".", import.meta.url).pathname);
const port = Number(process.env.PORT || 8080);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".data": "application/octet-stream",
  ".wasm": "application/wasm"
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "web/index.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(root, relative));

  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  if (!file.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Content-Length": stat.size
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
