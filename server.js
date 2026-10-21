"use strict";
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const { createService } = require("./lib/service");
const root = path.join(__dirname, "web"),
  service = createService(
    process.env.MES_DATA_DIR || path.join(__dirname, "data"),
  );
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
const server = http.createServer(async (req, res) => {
  const json = (status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, "http://localhost"),
      p = decodeURIComponent(url.pathname);
    if (
      req.method !== "GET" &&
      req.headers.origin &&
      new URL(req.headers.origin).host !== req.headers.host
    )
      return json(403, { error: "다른 출처의 쓰기 요청은 허용하지 않습니다." });
    let b = {};
    if (["POST", "PUT"].includes(req.method)) {
      let bytes = 0,
        chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 100000) {
          const e = Error("요청 크기 초과");
          e.status = 413;
          throw e;
        }
        chunks.push(chunk);
      }
      try {
        b = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        if (!b || Array.isArray(b) || typeof b !== "object")
          throw Error("object required");
      } catch {
        const e = Error("잘못된 JSON");
        e.status = 400;
        throw e;
      }
    }
    if (p === "/api/state" && req.method === "GET")
      return json(200, service.state());
    if (p === "/api/catalog" && req.method === "GET")
      return json(200, service.catalog());
    if (p === "/api/workflows" && req.method === "POST")
      return json(201, service.create(b));
    let m = p.match(
      /^\/api\/workflows\/([a-z0-9_]+)(?:\/(test|publish|openapi))?$/,
    );
    if (m) {
      const [, id, act] = m;
      if (req.method === "GET" && !act) return json(200, service.get(id));
      if (req.method === "PUT" && !act) return json(200, service.save(id, b));
      if (req.method === "POST" && act === "test")
        return json(200, service.test(id, b));
      if (req.method === "POST" && act === "publish")
        return json(200, service.publish(id, b));
      if (req.method === "GET" && act === "openapi")
        return json(200, service.openapi(id));
    }
    m = p.match(/^\/api\/tools\/([a-z0-9_]+)\/call$/);
    if (m && req.method === "POST") return json(200, service.call(m[1], b));
    m = p.match(/^\/api\/workflow\/([a-z0-9_]+)$/);
    if (m && req.method === "POST") return json(200, service.rest(m[1], b));
    if (p === "/api/agents" && req.method === "POST")
      return json(201, service.saveAgent(null, b));
    m = p.match(/^\/api\/agents\/([a-zA-Z0-9-]+)(?:\/(chat|clear))?$/);
    if (m) {
      if (req.method === "PUT" && !m[2])
        return json(200, service.saveAgent(m[1], b));
      if (req.method === "POST" && m[2] === "chat")
        return json(200, service.chat(m[1], b));
      if (req.method === "POST" && m[2] === "clear")
        return json(200, service.clear(m[1]));
    }
    if (p.startsWith("/api/"))
      return json(404, { error: "지원하지 않는 API 경로" });
    if (req.method !== "GET" && req.method !== "HEAD")
      return json(405, { error: "허용하지 않는 메서드" });
    if (p === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    const file = path.resolve(
      root,
      "." + (p.endsWith("/") ? p + "index.html" : p),
    );
    if (!file.startsWith(root + path.sep))
      return json(403, { error: "forbidden" });
    let data;
    try {
      data = fs.readFileSync(file);
    } catch {
      return json(404, { error: "not found" });
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (e) {
    json(e.status || 500, {
      error: e.status ? e.message : "서버 오류",
      detail: e.status ? undefined : e.message,
    });
  }
});
const port = Number(process.env.PORT ?? process.argv[2] ?? 4177);
server.listen(port, "127.0.0.1", () =>
  console.log("http://127.0.0.1:" + server.address().port),
);
