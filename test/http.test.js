const { test } = require("node:test"),
  a = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const { fields } = require("../lib/engine");
const input = Object.fromEntries(fields.map((f) => [f.name, f.def]));
test("HTTP root assets, CRUD, real deploy and call, restart, errors", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dac-http-"));
  let child;
  async function start() {
    child = spawn(process.execPath, ["server.js"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, PORT: "0", MES_DATA_DIR: dir },
    });
    return new Promise((resolve, reject) => {
      child.stdout.on("data", (b) => {
        const m = b.toString().match(/http:\/\/127.0.0.1:\d+/);
        if (m) resolve(m[0]);
      });
      child.on("error", reject);
      child.on("exit", (c) => {
        if (c) reject(Error("Server " + c));
      });
    });
  }
  async function stop() {
    const c = child;
    await new Promise((r) => {
      c.once("exit", r);
      c.kill();
    });
  }
  let base = await start();
  const req = async (p, method = "GET", body) => {
    const r = await fetch(base + p, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    for (const file of [
      "",
      "editor.html",
      "deploy.html",
      "workflows.html",
      "tool-playground.html",
      "agent-playground.html",
    ]) {
      const r = await fetch(base + "/" + file);
      a.equal(r.status, 200);
      const html = await r.text();
      for (const m of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) {
        const asset = await fetch(base + "/" + m[1]);
        a.equal(asset.status, 200, m[1]);
        a.match(asset.headers.get("content-type"), /css|javascript/);
      }
    }
    a.equal((await req("/api/catalog")).body.length, 0);
    let w = (await req("/api/workflows/lot_yield_equip")).body;
    a.equal(
      (
        await req("/api/workflows/lot_yield_equip/test", "POST", {
          revision: w.revision,
          input,
        })
      ).status,
      200,
    );
    a.equal(
      (
        await req("/api/workflows/lot_yield_equip/publish", "POST", {
          revision: 1,
          toolName: "yield_tool",
          mode: "sync",
        })
      ).status,
      200,
    );
    const direct = await req("/api/workflow/lot_yield_equip", "POST", {
      ...input,
      wafer_id: "W001",
    });
    a.equal(direct.status, 200);
    a.deepEqual(direct.body.data, [["EQ-201", 0.88, 1]]);
    a.deepEqual(
      (
        await req("/api/tools/yield_tool/call", "POST", {
          ...input,
          wafer_id: "W001",
        })
      ).body.data,
      direct.body.data,
    );
    a.equal(
      (
        await req("/api/workflows/lot_yield_equip", "PUT", {
          revision: 0,
          config: w.config,
        })
      ).status,
      409,
    );
    a.equal(
      (
        await req("/api/tools/yield_tool/call", "POST", {
          ...input,
          start_time: "bad",
        })
      ).status,
      400,
    );
    const malformed = await fetch(base + "/api/workflows", {
      method: "POST",
      body: "{",
    });
    a.equal(malformed.status, 400);
    a.equal(
      (
        await fetch(base + "/api/workflows", {
          method: "POST",
          headers: { Origin: "https://evil.example" },
          body: "{}",
        })
      ).status,
      403,
    );
    await stop();
    base = await start();
    a.equal((await req("/api/catalog")).body[0].id, "yield_tool");
    a.equal(
      (await req("/api/tools/yield_tool/call", "POST", input)).body.version,
      1,
    );
  } finally {
    await stop();
  }
});
