const { test } = require("node:test"),
  a = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const E = require("../lib/engine"),
  { createService } = require("../lib/service");
const input = Object.fromEntries(E.fields.map((f) => [f.name, f.def]));
test("fixture engine filters input, groups, boundaries, history and budgets", () => {
  const c = structuredClone(E.defaults),
    r = E.run(c, input);
  a.equal(r.rows, 4);
  a.equal(
    r.data.reduce((n, r) => n + r[2], 0),
    10,
  );
  a.ok(!r.data.some((r) => r[0] === "EQ-UNMATCHED"));
  const single = E.run(c, { ...input, wafer_id: "W001" });
  a.deepEqual(single.data, [["EQ-201", 0.88, 1]]);
  a.notDeepEqual(E.run(c, { ...input, lot_id: "LOT-1200" }).data, r.data);
  a.equal(E.run(c, { ...input, lot_id: "LOT-9999" }).rows, 0);
  a.equal(
    E.run(c, {
      ...input,
      start_time: "2026-10-21T00:00",
      end_time: "2026-10-22T00:00",
    }).rows,
    0,
  );
  a.equal(
    E.run(c, {
      ...input,
      start_time: "2026-10-20T08:00",
      end_time: "2026-10-20T09:00",
    }).rows,
    0,
  );
  a.ok(
    E.run(c, {
      ...input,
      start_time: "2026-10-20T09:00",
      end_time: "2026-10-20T10:00",
    }).rows > 0,
  );
  a.throws(
    () => E.run(c, { ...input, end_time: input.start_time }),
    /시작 시간/,
  );
  a.throws(() => E.run({ ...c, rowLimit: 1 }, input), /한도/);
  const f = E.fixtures();
  f.yields.push({ ...f.yields[0] });
  a.throws(() => E.run(c, input, f), /중복/);
  a.equal(
    E.run({ ...c, filter: { ...c.filter, val: 0.88 } }, input).data.reduce(
      (n, r) => n + r[2],
      0,
    ),
    2,
  );
  for (const join of ["LEFT", "RIGHT", "FULL"])
    a.ok(E.run({ ...c, join }, input).rows > 0);
  a.throws(
    () => E.run({ ...c, filter: { ...c.filter, col: "yield" } }, input),
    /컬럼/,
  );
});
test("saved drafts, snapshots, catalog, agent persistence and conflict", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dac-test-"));
  let s = createService(dir);
  const id = "lot_yield_equip",
    w = s.get(id);
  a.equal(s.catalog().length, 0);
  a.throws(
    () => s.publish(id, { revision: 1, toolName: "get_yield", mode: "sync" }),
    /테스트/,
  );
  s.test(id, { revision: 1, input });
  const v = s.publish(id, { revision: 1, toolName: "get_yield", mode: "sync" });
  a.equal(v.version, 1);
  const r = s.call("get_yield", input);
  s.save(id, {
    revision: 1,
    config: { ...w.config, filter: { ...w.config.filter, val: 0.89 } },
  });
  a.deepEqual(s.call("get_yield", input).data, r.data);
  a.throws(() => s.save(id, { revision: 1, config: w.config }), /다른 곳/);
  a.throws(
    () => s.publish(id, { revision: 2, toolName: "get_yield", mode: "sync" }),
    /테스트/,
  );
  s.test(id, { revision: 2, input });
  s.publish(id, { revision: 2, toolName: "get_yield", mode: "sync" });
  a.notDeepEqual(s.call("get_yield", input).data, r.data);
  s.create({ id: "second_yield" });
  s.test("second_yield", { revision: 1, input });
  a.throws(
    () =>
      s.publish("second_yield", {
        revision: 1,
        toolName: "get_yield",
        mode: "sync",
      }),
    /사용 중/,
  );
  s.publish("second_yield", {
    revision: 1,
    toolName: "second_tool",
    mode: "sync",
  });
  const agent = s.saveAgent(null, {
    name: "test",
    prompt: "test",
    tools: ["get_yield"],
  });
  const answer = s.chat(agent.id, {
    question: "LOT-1199 W001 수율",
    tool: "get_yield",
    start_time: input.start_time,
    end_time: input.end_time,
  });
  a.deepEqual(
    answer.result.data,
    s.call("get_yield", { ...input, wafer_id: "W001" }).data,
  );
  a.equal(answer.result.version, 2);
  a.throws(
    () => s.chat(agent.id, { question: "LOT-1199", tool: "second_tool" }),
    /선택된 도구/,
  );
  s = createService(dir);
  a.equal(s.get(id).revision, 2);
  a.equal(s.catalog().length, 2);
  a.equal(s.state().agents.find((x) => x.id === agent.id).msgs.length, 3);
  a.equal(s.get(id).versions[0].config.filter.val, 0.95);
  s.clear(agent.id);
  a.equal(
    createService(dir)
      .state()
      .agents.find((x) => x.id === agent.id).msgs.length,
    0,
  );
});
