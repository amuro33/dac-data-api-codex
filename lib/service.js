"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  E = require("./engine");
const { DEFAULT_PROMPT, context } = require("./agent-context");
const copy = (x) => structuredClone(x),
  now = () => new Date().toISOString();
function createService(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "state.json");
  let db;
  if (fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file));
    if (db.schema !== 1) throw Error("지원하지 않는 저장 형식");
  } else {
    db = {
      schema: 1,
      workflows: [
        {
          id: "lot_yield_equip",
          desc: "장비별 웨이퍼 수율 분석",
          revision: 1,
          config: copy(E.defaults),
          versions: [],
          updatedAt: now(),
        },
      ],
      agents: [
        {
          id: "agent-yield",
          revision: 1,
          name: "lot-yield-assistant",
          desc: "Lot 수율 분석",
          model: "fixture-rules",
          prompt: DEFAULT_PROMPT,
          contextTokens: 8192,
          tools: [],
          schedule: false,
          msgs: [],
        },
      ],
      runs: [],
    };
    persist();
  }
  let migrated = false;
  for (const a of db.agents) {
    if (a.contextTokens === undefined) {
      a.contextTokens = 8192;
      migrated = true;
    }
    if (a.prompt === "조회 결과만 근거로 답합니다.") {
      a.prompt = DEFAULT_PROMPT;
      migrated = true;
    }
  }
  if (migrated) persist();
  function persist() {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  }
  function workflow(id) {
    const w = db.workflows.find((w) => w.id === id);
    if (!w) E.fail("워크플로우를 찾을 수 없습니다.", 404);
    return w;
  }
  function catalog() {
    return db.workflows
      .filter((w) => w.versions.length)
      .map((w) => {
        const v = w.versions.at(-1);
        return {
          id: v.toolName,
          title: w.id,
          workflowId: w.id,
          group: "mes-analytics",
          kind: "Data Workflow",
          desc: v.description,
          job: false,
          version: v.version,
          fields: copy(E.fields),
          route: "/api/tools/" + v.toolName + "/call",
          inputSchema: inputSchema(),
        };
      });
  }
  function inputSchema() {
    return {
      type: "object",
      required: E.fields.filter((f) => f.required).map((f) => f.name),
      properties: Object.fromEntries(
        E.fields.map((f) => [
          f.name,
          {
            type: "string",
            ...(f.type === "datetime" ? { format: "date-time" } : {}),
          },
        ]),
      ),
    };
  }
  function state() {
    return {
      workflows: db.workflows.map((w) => {
        const v = w.versions.at(-1);
        return {
          ...copy(w),
          status: v ? "dep" : "draft",
          api: !!v?.api,
          mcp: false,
          tool: v?.toolName || "",
          ver: v ? "v" + v.version : "—",
          calls: db.runs.filter(
            (r) =>
              r.workflowId === w.id &&
              r.version &&
              Date.now() - Date.parse(r.at) < 86400000,
          ).length,
          who: "로컬 사용자",
          when: w.updatedAt,
          dirty: !!v && v.revision !== w.revision,
        };
      }),
      defaultAgentPrompt: DEFAULT_PROMPT,
      inputFields: copy(E.fields),
      inputSchema: inputSchema(),
      agents: copy(db.agents),
      tools: catalog(),
      groups: [{ id: "mes-analytics", tag: "내부 도구 · 운영 버전" }],
      runs: copy(db.runs),
    };
  }
  function execute(w, c, args, version, source) {
    let result;
    const record = {
      id: crypto.randomUUID(),
      workflowId: w.id,
      at: now(),
      version,
      source,
      tool: version
        ? w.versions.find((v) => v.version === version)?.toolName
        : null,
      input: copy(args),
    };
    try {
      result = E.run(c, args);
      db.runs.unshift({
        ...record,
        status: "succeeded",
        rows: result.rows,
        result: { ...result, version, workflowId: w.id, status: "succeeded" },
      });
      db.runs = db.runs.slice(0, 200);
      persist();
      return {
        ...result,
        run_id: record.id,
        workflowId: w.id,
        version,
        status: "succeeded",
      };
    } catch (err) {
      db.runs.unshift({ ...record, status: "failed", error: err.message });
      db.runs = db.runs.slice(0, 200);
      persist();
      throw err;
    }
  }
  return {
    state,
    catalog,
    create(body) {
      E.assert(
        typeof body.id === "string" && /^[a-z][a-z0-9_]{2,63}$/.test(body.id),
        "ID는 영문 소문자로 시작하는 3~64자 영문·숫자·밑줄입니다.",
      );
      E.assert(
        !db.workflows.some((w) => w.id === body.id),
        "이미 존재하는 ID입니다.",
      );
      const w = {
        id: body.id,
        desc: String(body.desc || "수율 워크플로우"),
        revision: 1,
        config: copy(E.defaults),
        versions: [],
        updatedAt: now(),
      };
      db.workflows.push(w);
      persist();
      return copy(w);
    },
    get: (id) => copy(workflow(id)),
    save(id, b) {
      const w = workflow(id);
      if (b.revision !== w.revision)
        E.fail("다른 곳에서 수정되었습니다. 새로고침 후 다시 편집하세요.", 409);
      E.validate(b.config);
      w.config = copy(b.config);
      w.revision++;
      w.updatedAt = now();
      delete w.validatedRevision;
      persist();
      return copy(w);
    },
    test(id, b) {
      const w = workflow(id);
      if (b.revision !== w.revision) E.fail("초안 버전이 바뀌었습니다.", 409);
      const r = execute(w, b.config || w.config, b.input, null, "editor");
      if (JSON.stringify(b.config || w.config) === JSON.stringify(w.config)) {
        w.validatedRevision = w.revision;
        persist();
      }
      return r;
    },
    publish(id, b) {
      const w = workflow(id);
      if (b.revision !== w.revision) E.fail("초안 버전이 바뀌었습니다.", 409);
      E.assert(
        w.validatedRevision === w.revision,
        "저장된 초안의 테스트 실행을 먼저 통과해야 합니다.",
      );
      E.assert(
        typeof b.toolName === "string" &&
          /^[a-z][a-z0-9_]{2,63}$/.test(b.toolName),
        "툴 이름 형식을 확인하세요.",
      );
      E.assert(
        !db.workflows.some(
          (x) => x.id !== id && x.versions.at(-1)?.toolName === b.toolName,
        ),
        "이미 사용 중인 툴 이름입니다.",
      );
      E.assert(b.mode === "sync", "이번 단계는 동기 실행만 지원합니다.");
      const v = {
        version: w.versions.length + 1,
        revision: w.revision,
        config: copy(w.config),
        toolName: b.toolName,
        description: String(b.description || w.desc),
        api: b.api !== false,
        at: now(),
      };
      w.versions.push(v);
      w.updatedAt = now();
      persist();
      return copy(v);
    },
    call(name, args, source = "tool") {
      const t = catalog().find((t) => t.id === name);
      if (!t) E.fail("배포된 도구를 찾을 수 없습니다.", 404);
      const w = workflow(t.workflowId),
        v = w.versions.at(-1);
      return execute(w, v.config, args, v.version, source);
    },
    rest(id, args) {
      const w = workflow(id),
        v = w.versions.at(-1);
      if (!v?.api) E.fail("REST API가 배포되지 않았습니다.", 404);
      return execute(w, v.config, args, v.version, "rest");
    },
    openapi(id) {
      const w = workflow(id),
        v = w.versions.at(-1);
      const props = {
        type: "object",
        properties: {
          columns: { type: "array", items: { type: "string" } },
          data: { type: "array", items: { type: "array", items: {} } },
          rows: { type: "integer" },
          version: { type: "integer" },
        },
      };
      return {
        openapi: "3.1.0",
        info: { title: w.id, version: String(v?.version || "draft") },
        paths: {
          ["/api/workflow/" + w.id]: {
            post: {
              operationId: w.id,
              requestBody: {
                required: true,
                content: { "application/json": { schema: inputSchema() } },
              },
              responses: {
                200: {
                  description: "수율 집계 결과",
                  content: { "application/json": { schema: props } },
                },
                400: { description: "입력 오류" },
                404: { description: "미배포" },
              },
            },
          },
        },
      };
    },
    saveAgent(id, b) {
      let a = db.agents.find((a) => a.id === id);
      if (id && !a) E.fail("Agent를 찾을 수 없습니다.", 404);
      if (a && b.revision !== a.revision)
        E.fail("Agent가 다른 곳에서 수정되었습니다. 새로고침하세요.", 409);
      E.assert(
        typeof b.name === "string" &&
          b.name.trim().length > 0 &&
          b.name.length <= 80,
        "에이전트명을 입력하세요.",
      );
      E.assert(
        typeof b.prompt === "string" && b.prompt.length <= 10000,
        "프롬프트 길이를 확인하세요.",
      );
      E.assert(
        Array.isArray(b.tools) &&
          b.tools.every((t) => catalog().some((c) => c.id === t)),
        "도구 목록을 새로고침하세요.",
      );
      const contextTokens = b.contextTokens ?? a?.contextTokens ?? 8192;
      E.assert(
        Number.isInteger(contextTokens) &&
          contextTokens >= 1024 &&
          contextTokens <= 65536,
        "컨텍스트 크기는 1024~65536 사이 정수입니다.",
      );
      if (!a) {
        a = { id: "agent-" + crypto.randomUUID(), revision: 0, msgs: [] };
        db.agents.push(a);
      }
      Object.assign(a, {
        name: b.name.trim(),
        desc: "수율 분석 Agent",
        prompt: b.prompt,
        contextTokens,
        tools: [...new Set(b.tools)],
        model: "fixture-rules",
        schedule: false,
        revision: a.revision + 1,
      });
      persist();
      return copy(a);
    },
    clear(id) {
      const a = db.agents.find((a) => a.id === id);
      if (!a) E.fail("Agent 없음", 404);
      a.msgs = [];
      persist();
      return copy(a);
    },
    chat(id, b) {
      const a = db.agents.find((a) => a.id === id);
      if (!a) E.fail("Agent 없음", 404);
      E.assert(
        typeof b.question === "string" &&
          b.question.trim() &&
          b.question.length <= 2000,
        "질문을 입력하세요.",
      );
      E.assert(
        a.tools.includes(b.tool),
        "저장된 Agent에 선택된 도구만 실행할 수 있습니다.",
      );
      const ctx = context(a, b.question);
      let lot = b.question.match(/LOT-[A-Z0-9_-]+/i);
      if (!lot && /그|같은|이어서|다시|앞서|이전/.test(b.question)) {
        for (const turn of [...ctx.turns].reverse()) {
          lot = turn.user.match(/LOT-[A-Z0-9_-]+/i);
          if (lot) break;
        }
      }
      E.assert(
        b.input !== undefined || lot,
        "현재 컨텍스트에서 Lot ID를 확인할 수 없습니다. 예: LOT-1199를 지정해주세요.",
      );
      const wafer = b.question.match(/\bW\d+\b/i);
      const args =
        b.input !== undefined
          ? E.input(b.input)
          : {
              lot_id: lot[0].toUpperCase(),
              wafer_id: wafer ? wafer[0].toUpperCase() : "ALL",
              start_time: b.start_time,
              end_time: b.end_time,
            };
      const r = this.call(b.tool, args, "agent");
      let answer = r.rows
        ? `${r.input.lot_id} · ${r.rows}개 그룹 조회 (운영 v${r.version}).\n` +
          r.data
            .map((row) =>
              r.columns
                .map((c, i) => c + ": " + (row[i] ?? "없음"))
                .join(" · "),
            )
            .join("\n")
        : "조회 조건에 맞는 결과가 없습니다.";
      const msgs = [
        { r: "user", t: b.question },
        {
          r: "call",
          tool: b.tool,
          args: r.input,
          result: r,
          context: {
            budget: ctx.budget,
            estimatedTokens: ctx.estimatedTokens,
            retainedTurns: ctx.retainedTurns,
            excludedTurns: ctx.excludedTurns,
          },
          version: r.version,
        },
        { r: "bot", t: answer },
      ];
      a.msgs.push(...msgs);
      a.msgs = a.msgs.slice(-90);
      persist();
      return {
        messages: copy(a.msgs),
        result: r,
        context: {
          budget: ctx.budget,
          estimatedTokens: ctx.estimatedTokens,
          retainedTurns: ctx.retainedTurns,
          excludedTurns: ctx.excludedTurns,
        },
      };
    },
  };
}
module.exports = { createService };
