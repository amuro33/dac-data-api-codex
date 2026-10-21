"use strict";
const { performance } = require("node:perf_hooks");
const fields = [
  { name: "lot_id", type: "string", required: true, def: "LOT-1199" },
  { name: "wafer_id", type: "string", required: false, def: "ALL" },
  {
    name: "start_time",
    type: "datetime",
    required: true,
    def: "2026-10-19T14:00",
  },
  {
    name: "end_time",
    type: "datetime",
    required: true,
    def: "2026-10-20T14:00",
  },
];
const defaults = {
  dac1: "wafer_yield_summary",
  dac2: "lot_process_history",
  join: "INNER",
  filter: { col: "yield_rate", op: "<", val: 0.95 },
  group: "equip_id",
  aggs: ["AVG(yield_rate)", "COUNT(*)"],
  rowLimit: 100000,
};
function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
const assert = (ok, msg) => {
  if (!ok) fail(msg);
};
function validate(c) {
  assert(
    c && c.dac1 === defaults.dac1 && c.dac2 === defaults.dac2,
    "현재 실행기는 수율·공정 이력 API 조합만 지원합니다.",
  );
  assert(["INNER", "LEFT", "RIGHT", "FULL"].includes(c.join), "잘못된 JOIN");
  assert(
    ["yield_rate", "defect_cnt"].includes(c.filter?.col),
    "필터 컬럼은 yield_rate 또는 defect_cnt여야 합니다.",
  );
  assert(
    ["<", "<=", "=", ">=", ">", "<>"].includes(c.filter.op),
    "잘못된 필터 연산자",
  );
  assert(
    typeof c.filter.val === "number" && Number.isFinite(c.filter.val),
    "필터 값은 숫자여야 합니다.",
  );
  assert(
    ["equip_id", "lot_id", "step", "wafer_id"].includes(c.group),
    "잘못된 그룹 컬럼",
  );
  assert(
    Array.isArray(c.aggs) &&
      c.aggs.length > 0 &&
      new Set(c.aggs).size === c.aggs.length &&
      c.aggs.every((x) =>
        [
          "AVG(yield_rate)",
          "COUNT(*)",
          "SUM(defect_cnt)",
          "MIN(yield_rate)",
        ].includes(x),
      ),
    "잘못된 집계",
  );
  assert(
    Number.isInteger(c.rowLimit) && c.rowLimit >= 1 && c.rowLimit <= 100000,
    "행 한도는 1~100000",
  );
  return c;
}
function date(s) {
  assert(
    typeof s === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.test(
        s,
      ),
    "날짜 형식을 확인하세요.",
  );
  const [year, month, day] = s.slice(0, 10).split("-").map(Number);
  assert(
    month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= new Date(Date.UTC(year, month, 0)).getUTCDate(),
    "유효하지 않은 날짜",
  );
  const n = Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(s) ? s : s + "+09:00");
  assert(Number.isFinite(n), "유효하지 않은 날짜");
  return n;
}
function input(x) {
  assert(
    x && typeof x.lot_id === "string" && /^LOT-[A-Z0-9_-]+$/i.test(x.lot_id),
    "lot_id 형식을 확인하세요.",
  );
  const wafer = x.wafer_id || "ALL";
  assert(
    typeof wafer === "string" && /^(ALL|W\d+)$/i.test(wafer),
    "wafer_id는 ALL 또는 W001 형식입니다.",
  );
  const start = date(x.start_time),
    end = date(x.end_time);
  assert(start < end, "시작 시간은 종료 시간보다 빨라야 합니다.");
  return {
    ...x,
    lot_id: x.lot_id.toUpperCase(),
    wafer_id: wafer.toUpperCase(),
    start,
    end,
  };
}
function fixtures() {
  const yields = [],
    history = [];
  for (const [lot, offset] of [
    ["LOT-1199", 0],
    ["LOT-1200", 0.04],
  ])
    for (let i = 1; i <= 12; i++) {
      const wafer = "W" + String(i).padStart(3, "0"),
        time = `2026-10-20T${i <= 6 ? "09" : "12"}:00:00+09:00`,
        row = {
          lot_id: lot,
          wafer_id: wafer,
          yield_rate: Math.min(1, 0.86 + (i % 6) * 0.02 + offset),
          defect_cnt: (i % 5) + 1,
        };
      yields.push(row);
      history.push({
        lot_id: lot,
        wafer_id: wafer,
        step: "FINAL_TEST",
        equip_id: "EQ-OLD",
        move_time: "2026-10-19T16:00:00+09:00",
        event_id: i,
      });
      if (i !== 12)
        history.push({
          lot_id: lot,
          wafer_id: wafer,
          step: "FINAL_TEST",
          equip_id: i <= 4 ? "EQ-201" : i <= 8 ? "EQ-207" : "EQ-114",
          move_time: time,
          event_id: 100 + i,
        });
    }
  history.push({
    lot_id: "LOT-1199",
    wafer_id: "W099",
    step: "FINAL_TEST",
    equip_id: "EQ-UNMATCHED",
    move_time: "2026-10-20T09:00:00+09:00",
    event_id: 999,
  });
  return { yields, history };
}
const schema = (c) => [
  c.group,
  ...c.aggs.map(
    (a) =>
      ({
        "AVG(yield_rate)": "avg_yield",
        "COUNT(*)": "wafer_cnt",
        "SUM(defect_cnt)": "defect_cnt",
        "MIN(yield_rate)": "min_yield",
      })[a],
  ),
];
function run(c, args, fixture = fixtures()) {
  validate(c);
  const x = input(args),
    started = performance.now(),
    nodes = [];
  const note = (id, rows) => {
    assert(rows.length <= c.rowLimit, id + " 행 한도 초과");
    nodes.push({ id, rows: rows.length });
    return rows;
  };
  note("START", [x]);
  const ys = note(
    "DAC 수율",
    fixture.yields.filter(
      (r) =>
        r.lot_id === x.lot_id &&
        (x.wafer_id === "ALL" || r.wafer_id === x.wafer_id),
    ),
  );
  const hs = note(
    "DAC 공정 이력",
    fixture.history.filter(
      (r) =>
        r.lot_id === x.lot_id &&
        (x.wafer_id === "ALL" || r.wafer_id === x.wafer_id) &&
        Date.parse(r.move_time) >= x.start &&
        Date.parse(r.move_time) < x.end,
    ),
  );
  const key = (r) => r.lot_id + "|" + r.wafer_id,
    latest = new Map(),
    seen = new Set();
  for (const r of ys) {
    assert(!seen.has(key(r)), "수율 API 중복 키: " + key(r));
    seen.add(key(r));
  }
  for (const r of hs) {
    const old = latest.get(key(r));
    if (
      !old ||
      Date.parse(r.move_time) > Date.parse(old.move_time) ||
      (r.move_time === old.move_time && r.event_id > old.event_id)
    )
      latest.set(key(r), r);
  }
  let joined = [];
  for (const r of ys) {
    const h = latest.get(key(r));
    if (h || ["LEFT", "FULL"].includes(c.join))
      joined.push({
        ...r,
        equip_id: h?.equip_id ?? null,
        step: h?.step ?? null,
      });
  }
  if (["RIGHT", "FULL"].includes(c.join))
    for (const h of latest.values())
      if (!seen.has(key(h)))
        joined.push({ ...h, yield_rate: null, defect_cnt: null });
  note("JOIN", joined);
  const cmp = {
    "<": (a, b) => a < b,
    "<=": (a, b) => a <= b,
    "=": (a, b) => a === b,
    ">=": (a, b) => a >= b,
    ">": (a, b) => a > b,
    "<>": (a, b) => a !== b,
  };
  const rows = note(
    "Filter",
    joined.filter(
      (r) =>
        r[c.filter.col] != null &&
        cmp[c.filter.op](r[c.filter.col], c.filter.val),
    ),
  );
  const groups = new Map();
  for (const r of rows) {
    const k = r[c.group];
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const output = [...groups]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([k, rs]) => [
      k,
      ...c.aggs.map((a) => {
        const vals = rs.map((r) => r.yield_rate).filter((v) => v != null);
        if (a === "COUNT(*)") return rs.length;
        if (a === "SUM(defect_cnt)")
          return rs.reduce((n, r) => n + (r.defect_cnt || 0), 0);
        if (!vals.length) return null;
        return Number(
          (a === "AVG(yield_rate)"
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : Math.min(...vals)
          ).toFixed(6),
        );
      }),
    ]);
  note("Group By", output);
  note("END", output);
  return {
    columns: schema(c),
    data: output,
    rows: output.length,
    nodes,
    elapsed_ms: Number((performance.now() - started).toFixed(3)),
    input: {
      lot_id: x.lot_id,
      wafer_id: x.wafer_id,
      start_time: x.start_time,
      end_time: x.end_time,
    },
  };
}
module.exports = {
  fields,
  defaults,
  fail,
  assert,
  validate,
  date,
  input,
  fixtures,
  schema,
  run,
};
