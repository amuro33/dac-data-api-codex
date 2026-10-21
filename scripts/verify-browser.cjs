const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  { spawn } = require("node:child_process"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  a = require("node:assert/strict");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dac-browser-")),
    s = spawn(process.execPath, ["server.js"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: "0", MES_DATA_DIR: dir },
    });
  let browser;
  try {
    const base = await new Promise((r, j) => {
      s.stdout.on("data", (b) => {
        const m = b.toString().match(/http:\/\/127.0.0.1:\d+/);
        if (m) r(m[0]);
      });
      s.once("error", j);
    });
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 960 },
      }),
      errors = [];
    page.on("dialog", (d) => d.accept());
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.url().startsWith(base) && r.status() >= 400)
        errors.push(r.status() + " " + r.url());
    });
    fs.mkdirSync("test-artifacts", { recursive: true });
    await page.goto(base + "/");
    await page.locator('a[href="workflows.html"]').first().click();
    await page.locator(".trow").first().waitFor();
    a.equal(await page.locator(".trow").count(), 1);
    await page.locator(".trow").click();
    await page.locator('[data-node="filter"]').waitFor();
    await page
      .getByRole("button", { name: "테스트 실행", exact: true })
      .click();
    await page.locator("#execution-result").waitFor();
    a.equal(
      JSON.parse(await page.locator("#execution-result").innerText()).rows,
      4,
    );
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.locator('[data-node="filter"]').click();
    await page.locator('[data-f="val"]').fill("0.89");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector(".c1x .cj").textContent.includes("revision 2"),
    );
    await page.reload();
    await page.locator('[data-node="filter"]').click();
    a.equal(await page.locator('[data-f="val"]').inputValue(), "0.89");
    await page
      .getByRole("button", { name: "테스트 실행", exact: true })
      .click();
    await page.locator("#execution-result").waitFor();
    const strict = JSON.parse(
      await page.locator("#execution-result").innerText(),
    );
    a.ok(strict.data.reduce((n, r) => n + r[2], 0) < 10);
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.screenshot({ path: "test-artifacts/editor.png" });
    await page.getByRole("link", { name: "배포", exact: true }).click();
    await page.locator("#publish").waitFor();
    await page.locator("#deploy-tool-name").fill("strict_yield");
    await page.locator("#publish").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#deploy-status")
        .textContent.includes("v1 배포 완료"),
    );
    await page.evaluate(() =>
      document.querySelectorAll("*").forEach((x) => {
        if (x.scrollTop) x.scrollTop = 0;
      }),
    );
    await page.screenshot({ path: "test-artifacts/deploy.png" });
    await page.locator(".c5p").click();
    await page.locator(".pg-form").waitFor();
    await page.getByRole("button", { name: "호출", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector(".resp .pre")
        ?.textContent.includes('"version": 1'),
    );
    let text = await page.locator(".resp .pre").innerText();
    a.deepEqual(JSON.parse(text).data, strict.data);
    await page.screenshot({ path: "test-artifacts/tool.png" });
    console.log(
      "PASS root -> editor edit/save/reload/test -> deploy -> Tool same result",
    );
    // Create a second saved/deployed workflow via HTTP, then discover it in UI.
    await page.goto(base + "/workflows.html");
    await page.locator(".trow").first().waitFor();
    page.removeAllListeners("dialog");
    page.on("dialog", (d) =>
      d.accept(d.type() === "prompt" ? "baseline_yield" : undefined),
    );
    await page.getByRole("button", { name: "새 Data Workflow" }).click();
    await page.waitForURL("**/editor.html?id=baseline_yield");
    await page.locator("[data-node=filter]").waitFor();
    const args = {
      lot_id: "LOT-1199",
      wafer_id: "ALL",
      start_time: "2026-10-19T14:00",
      end_time: "2026-10-20T14:00",
    };
    await page.request.post(base + "/api/workflows/baseline_yield/test", {
      data: { revision: 1, input: args },
    });
    await page.request.post(base + "/api/workflows/baseline_yield/publish", {
      data: { revision: 1, toolName: "baseline_tool", mode: "sync" },
    });
    await page.goto(base + "/tool-playground.html");
    await page.locator(".pg-form").waitFor();
    await page.getByRole("button", { name: "목록 새로고침" }).click();
    await page.getByRole("button", { name: "baseline_tool 동기 호출" }).count();
    await page.locator(".item").filter({ hasText: "baseline_tool" }).click();
    await page.getByRole("button", { name: "호출", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector(".resp .pre")
        ?.textContent.includes('"version": 1'),
    );
    a.equal(JSON.parse(await page.locator(".resp .pre").innerText()).rows, 4);
    await page
      .getByRole("link", { name: "Agent Playground", exact: true })
      .click();
    await page.locator(".ag-set").waitFor();
    await page.locator(".tool-opt").filter({ hasText: "strict_yield" }).click();
    await page.locator("#agent-context-tokens").selectOption("4096");
    a.match(await page.locator(".ag-set textarea").inputValue(), /wafer_cnt/);
    await page.locator(".ag-set .card-head button").click();
    await page.waitForFunction(
      () =>
        document.querySelector(".ag-set .card-head button").textContent ===
        "저장됨",
    );
    await page.reload();
    await page.locator(".tool-opt.on").waitFor();
    a.match(await page.locator(".tool-opt.on").innerText(), /strict_yield/);
    a.equal(await page.locator("#agent-context-tokens").inputValue(), "4096");
    await page.locator("#inp").fill("LOT-1199 W001 수율 알려줘");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await page.locator(".toolcall").waitFor();
    a.match(await page.locator(".bub.bot").innerText(), /0.88/);
    await page.locator(".toolcall summary").click();
    a.equal(
      JSON.parse(await page.locator(".toolcall details pre").innerText())
        .version,
      1,
    );
    await page.screenshot({ path: "test-artifacts/agent.png" });
    await page.reload();
    await page.locator(".bub.bot").waitFor();
    await page
      .getByRole("button", { name: "대화 지우기", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".bub").length === 0,
    );
    await page.reload();
    await page.locator("#inp").waitFor();
    a.equal(await page.locator(".bub").count(), 0);
    console.log(
      "PASS multiple deployed tools, Agent persisted selection, real call, reload and clear",
    );
    await page.goto(base + "/workflows.html");
    await page.locator(".trow").first().waitFor();
    a.equal(await page.locator(".trow").count(), 2);
    await page.screenshot({ path: "test-artifacts/workflows.png" });
    for (const name of [
      "editor",
      "deploy",
      "workflows",
      "tool-playground",
      "agent-playground",
    ]) {
      await page.goto(base + "/" + name + ".html");
      await page.waitForLoadState("networkidle");
      a.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        name + " desktop overflow",
      );
    }
    a.deepEqual(errors, []);
    console.log("PASS all pages loaded without asset/runtime errors");
  } finally {
    if (browser) await browser.close();
    s.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
