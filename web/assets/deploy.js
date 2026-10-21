(async function () {
  await Store.ready;
  const $ = (s) => document.querySelector(s),
    id = new URLSearchParams(location.search).get("id") || "lot_yield_equip";
  let w = await Store.request("/api/workflows/" + encodeURIComponent(id)),
    tab = "openapi",
    api = true,
    valid = w.validatedRevision === w.revision;
  document.querySelector(".c1y").textContent = w.id;
  document.querySelector(".c1z").textContent = "revision " + w.revision;
  const latest = w.versions.at(-1);
  if (latest) api = latest.api;
  const input = (value, id) => {
    const x = document.createElement("input");
    x.className = "live-input";
    x.value = value;
    x.id = id;
    return x;
  };
  const name = input(
      latest?.toolName ||
        (id === "lot_yield_equip" ? "get_lot_yield_by_equipment" : "get_" + id),
      "deploy-tool-name",
    ),
    desc = input(latest?.description || w.desc, "deploy-description");
  function value(label, text) {
    document.querySelectorAll(".c52").forEach((row) => {
      if (row.querySelector(".c53")?.textContent === label) {
        const cell = row.querySelector(".c54");
        cell.replaceChildren(
          typeof text === "string" ? document.createTextNode(text) : text,
        );
      }
    });
  }
  value("호출 경로", "POST /api/workflow/" + id);
  value("api_id", id);
  value("인증", "로컬 전용 · 사내 인증 연동 전");
  value("Swagger UI 공개", "OpenAPI JSON 제공 · Swagger UI 미연결");
  value("타임아웃", "동기 fixture 실행 · 강제 취소 미구현");
  value("호출 제한", "미적용 · 운영 연동 전");
  value("툴 이름", name);
  value("툴 설명", desc);
  value("MCP 서버", "내부 도구 카탈로그");
  value("접근 권한", "로컬 Playground · 외부 MCP 연결 전");
  $(".c4p").href = "editor.html?id=" + encodeURIComponent(id);
  $(".c5p").href = "tool-playground.html";
  $(".c5p").textContent = "Tool Playground에서 배포 결과 확인";
  const mcp = $('[data-action="toggleMcp"]');
  mcp.disabled = true;
  mcp.querySelector(".c4x").textContent = "Playground 도구 등록";
  mcp.querySelector(".c5a").textContent = "내부 실행";
  mcp.querySelector(".c4z").textContent =
    "배포한 버전을 Tool과 Agent에서 실행합니다. 외부 MCP 전송은 다음 단계입니다.";
  const job = $('[data-action="setAsync"]');
  job.disabled = true;
  job.title = "Job 실행은 다음 단계입니다.";
  job.append(document.createTextNode(" · 준비 중"));
  const checks = [...document.querySelectorAll(".c5m .c2l")];
  const deploy = $(".c5o button");
  deploy.id = "publish";
  const validate = document.createElement("button");
  validate.className = "c20";
  validate.id = "validate";
  validate.textContent = "저장된 초안 테스트";
  $(".c5o").prepend(validate);
  const status = document.createElement("div");
  status.className = "runtime-status";
  status.id = "deploy-status";
  $(".c5o").append(status);
  function render() {
    const v = {
      isAsync: false,
      apiOn: api,
      mcpOn: true,
      apiBorder: api ? "#4f46e5" : "#d6dae1",
      apiBg: api ? "#f5f6ff" : "#fff",
      apiCheck: api ? "#4f46e5" : "#fff",
      apiMark: api ? 1 : 0,
      mcpBorder: "#4f46e5",
      mcpBg: "#f5f6ff",
      mcpCheck: "#4f46e5",
      mcpMark: 1,
      syncBorder: "#4f46e5",
      syncBg: "#f5f6ff",
      asyncBorder: "#d6dae1",
      asyncBg: "#fff",
      tabOpenapiBg: tab === "openapi" ? "#eef2ff" : "transparent",
      tabOpenapiFg: tab === "openapi" ? "#4338ca" : "#475569",
      tabMcpBg: tab === "mcp" ? "#eef2ff" : "transparent",
      tabMcpFg: tab === "mcp" ? "#4338ca" : "#475569",
      deployBg: valid ? "#4f46e5" : "#64748b",
      deployLabel: api ? "API + 내부 도구 배포하기" : "내부 도구 배포하기",
      preview: JSON.stringify(
        tab === "openapi"
          ? openapi
          : { name: name.value, description: desc.value, inputSchema: schema },
        null,
        2,
      ),
    };
    document
      .querySelectorAll("[data-if]")
      .forEach((x) => (x.hidden = !v[x.dataset.if]));
    document.querySelectorAll("[data-style-tpl]").forEach((x) =>
      x.setAttribute(
        "style",
        x.dataset.styleTpl.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k]),
      ),
    );
    document
      .querySelectorAll("[data-text]")
      .forEach((x) => (x.textContent = v[x.dataset.text]));
    checks[0].textContent = valid
      ? "저장된 초안 테스트 통과 · revision " + w.revision
      : "저장된 초안 테스트 필요";
    checks[1].textContent = "START 입력 스키마 · 필수 3개 / 선택 1개";
    checks[2].textContent = "합성 수율·공정 이력 API 연결";
    document.querySelector(".c5n").style.background = valid
      ? "#10b981"
      : "#94a3b8";
    deploy.disabled = !valid;
  }
  const schema = MOCK.inputSchema;
  let openapi = await Store.request("/api/workflows/" + id + "/openapi");
  name.oninput = desc.oninput = render;
  document.querySelectorAll("[data-action]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.action === "toggleApi") api = !api;
        if (b.dataset.action === "showOpenapi") tab = "openapi";
        if (b.dataset.action === "showMcp") tab = "mcp";
        render();
      }),
  );
  validate.onclick = async () => {
    validate.disabled = true;
    try {
      const r = await Store.request("/api/workflows/" + id + "/test", "POST", {
        revision: w.revision,
        input: {
          lot_id: "LOT-1199",
          wafer_id: "ALL",
          start_time: "2026-10-19T14:00",
          end_time: "2026-10-20T14:00",
        },
      });
      valid = true;
      status.textContent =
        "테스트 성공 · " + r.rows + "행 · " + r.elapsed_ms + "ms";
      render();
    } catch (e) {
      valid = false;
      status.textContent = e.message;
      render();
    } finally {
      validate.disabled = false;
    }
  };
  deploy.onclick = async () => {
    deploy.disabled = true;
    try {
      const v = await Store.request(
        "/api/workflows/" + id + "/publish",
        "POST",
        {
          revision: w.revision,
          toolName: name.value.trim(),
          description: desc.value,
          api,
          mode: "sync",
        },
      );
      status.textContent = "v" + v.version + " 배포 완료 · " + v.toolName;
      openapi = await Store.request("/api/workflows/" + id + "/openapi");
      render();
      $(".c5p").href =
        "tool-playground.html?tool=" + encodeURIComponent(v.toolName);
    } catch (e) {
      status.textContent = e.message;
    } finally {
      deploy.disabled = !valid;
    }
  };
  render();
})().catch((e) => alert(e.message));
