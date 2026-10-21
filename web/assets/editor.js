// 에디터 인터랙션: 노드 선택 → 오른쪽 설정 패널 전환, 노드 설정 변경 → 캔버스 노드 반영
(async function () {
  await Store.ready;
  var workflowId =
    new URLSearchParams(location.search).get("id") || "lot_yield_equip";
  var saved = await Store.request(
    "/api/workflows/" + encodeURIComponent(workflowId),
  );
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var el = function (tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  var esc = function (s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  var APIS = {
    wafer_yield_summary: {
      title: "수율 요약 조회",
      desc: "웨이퍼 수율 집계",
      ver: "v3",
      db: "MESDB_F02",
      params: [
        ["lot_id", "필수", "start.lot_id"],
        ["wafer_id", "선택", "start.wafer_id"],
        ["factory_id", "선택", "F02"],
      ],
      cols: ["lot_id", "wafer_id", "yield_rate", "defect_cnt"],
      time: "0.8s",
      sql: "SELECT lot_id, wafer_id,\n       yield_rate, defect_cnt\n  FROM WAFER_YIELD\n WHERE lot_id   = :lot_id\n   AND (:wafer_id = 'ALL' OR wafer_id = :wafer_id)\n   AND factory_id = :factory_id",
    },
    lot_process_history: {
      title: "공정 이력 조회",
      desc: "Lot 공정 이력",
      ver: "v2",
      db: "MESDB_F02",
      params: [
        ["start_time", "필수", "start.start_time"],
        ["end_time", "필수", "start.end_time"],
      ],
      cols: ["lot_id", "wafer_id", "step", "equip_id", "move_time"],
      time: "0.6s",
      sql: "SELECT lot_id, wafer_id, step, equip_id,\n       move_time\n  FROM LOT_HISTORY\n WHERE move_time BETWEEN :start_time\n                     AND :end_time",
    },
    equip_status_now: {
      title: "설비 현재 상태",
      desc: "설비 현재 상태",
      ver: "v5",
      db: "MESDB_F02",
      params: [["equip_id", "선택", "—"]],
      cols: ["equip_id", "state", "alarm_cnt"],
      time: "0.4s",
      sql: "SELECT equip_id, state, alarm_cnt\n  FROM EQUIP_STATE\n WHERE equip_id = NVL(:equip_id, equip_id)",
    },
    defect_pareto: {
      title: "불량 유형 파레토",
      desc: "불량 유형 파레토",
      ver: "v1",
      db: "MESDB_F02",
      params: [["start_date", "필수", "start.start_time"]],
      cols: ["defect_type", "cnt", "ratio"],
      time: "1.1s",
      sql: "SELECT defect_type, COUNT(*) cnt\n  FROM DEFECT\n WHERE found_at >= :start_date\n GROUP BY defect_type",
    },
    fab_wip_summary: {
      title: "재공 현황 요약",
      desc: "공정별 재공 현황",
      ver: "v4",
      db: "MESDB_F02",
      params: [],
      cols: ["step", "wip_qty"],
      time: "0.5s",
      sql: "SELECT step, SUM(qty) wip_qty\n  FROM WIP\n GROUP BY step",
    },
  };
  var DEPLOYED = ["wafer_yield_summary", "lot_process_history"];
  var NOTDEP = {
    equip_status_now: "준비 중 · 설비 현황",
    defect_pareto: "준비 중 · 불량",
    fab_wip_summary: "준비 중 · 재공",
    recipe_param_diff: "준비 중 · 레시피",
  };

  var nodes = {
    start: {
      type: "START",
      node: $(".c2e"),
      params: [
        ["lot_id", "string"],
        ["wafer_id", "string"],
        ["start_time", "datetime"],
        ["end_time", "datetime"],
      ],
    },
    dac1: {
      type: "DAC",
      node: $(".c2n"),
      api: "wafer_yield_summary",
      open: false,
    },
    dac2: {
      type: "DAC",
      node: $(".c2u"),
      api: "lot_process_history",
      open: false,
    },
    join: {
      type: "JOIN",
      node: $(".c2v"),
      kind: "INNER",
      key: "lot_id + wafer_id",
    },
    filter: {
      type: "Filter",
      node: $(".c2z"),
      col: "yield_rate",
      op: "<",
      val: "0.95",
    },
    group: {
      type: "Group By",
      node: $(".c30"),
      by: "equip_id",
      aggs: ["AVG(yield_rate)", "COUNT(*)"],
    },
    end: {
      type: "END",
      node: $(".c31"),
      cols: ["equip_id", "avg_yield", "wafer_cnt"],
    },
  };
  var sel = "dac1",
    aside = $(".c3h"),
    dirty = false,
    result = null;
  nodes.dac1.api = saved.config.dac1;
  nodes.dac2.api = saved.config.dac2;
  nodes.join.kind = saved.config.join;
  Object.assign(nodes.filter, {
    col: saved.config.filter.col,
    op: saved.config.filter.op,
    val: String(saved.config.filter.val),
  });
  nodes.group.by = saved.config.group;
  nodes.group.aggs = saved.config.aggs.slice();
  function config() {
    return {
      dac1: nodes.dac1.api,
      dac2: nodes.dac2.api,
      join: nodes.join.kind,
      filter: {
        col: nodes.filter.col,
        op: nodes.filter.op,
        val: nodes.filter.val.trim() === "" ? NaN : Number(nodes.filter.val),
      },
      group: nodes.group.by,
      aggs: nodes.group.aggs.slice(),
      rowLimit: saved.config.rowLimit,
    };
  }
  function outputCols() {
    return [
      nodes.group.by,
      ...nodes.group.aggs.map(
        (x) =>
          ({
            "AVG(yield_rate)": "avg_yield",
            "COUNT(*)": "wafer_cnt",
            "SUM(defect_cnt)": "defect_cnt",
            "MIN(yield_rate)": "min_yield",
          })[x],
      ),
    ];
  }
  function mark() {
    dirty = JSON.stringify(config()) !== JSON.stringify(saved.config);
    $(".c1x .cj").textContent = dirty
      ? "저장하지 않은 변경"
      : "revision " + saved.revision + " · 저장됨";
    nodes.end.cols = outputCols();
    syncNode("end");
    result = null;
    $(".c4m").textContent = "미실행";
    $(".c4n").textContent = "설정 변경 후 다시 실행";
  }
  aside.addEventListener("input", () => setTimeout(mark, 0));
  aside.addEventListener("click", (e) => {
    if (e.target.closest("[data-api],[data-kind],[data-by],[data-agg]"))
      setTimeout(mark, 0);
  });

  Object.keys(nodes).forEach(function (id) {
    var n = nodes[id].node;
    n.style.cursor = "pointer";
    n.style.transition = "box-shadow .12s, border-color .12s";
    n.dataset.node = id;
    n.addEventListener("click", function (e) {
      e.stopPropagation();
      select(id);
    });
  });
  var canvas = $(".c24");
  if (canvas)
    canvas.addEventListener("click", function () {
      /* 빈 곳 클릭: 선택 유지 */
    });

  function paintSel() {
    Object.keys(nodes).forEach(function (id) {
      var s = nodes[id].node.style,
        on = id === sel;
      s.border = on ? "2px solid #6366f1" : "1px solid #d6dae1";
      s.boxShadow = on
        ? "0 0 0 4px rgba(99,102,241,0.22), 0 8px 24px rgba(15,23,42,0.08)"
        : "0 1px 2px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.04)";
      s.zIndex = on ? 2 : "";
    });
  }
  function select(id) {
    sel = id;
    paintSel();
    renderPanel();
  }

  // ── 캔버스 노드 텍스트 갱신 ─────────────────────────
  function syncNode(id) {
    var d = nodes[id],
      n = d.node;
    if (d.type === "DAC") {
      var a = APIS[d.api];
      $(".c2r", n).textContent = a.title;
      $(".c2s", n).textContent = d.api;
      $(".c2t", n).innerHTML =
        a.params
          .map(function (p) {
            return (
              p[0] +
              (p[2].indexOf("start.") === 0
                ? " ← START"
                : p[2] === "—"
                  ? " (선택)"
                  : " = " + esc(p[2]))
            );
          })
          .join("<br>") || "파라미터 없음";
      var q = $(".c2q", n);
      if (q) q.textContent = "미실행";
    } else if (d.type === "JOIN") {
      $(".c2y", n).textContent = "집계 엔진 · " + d.kind;
      $(".c2t", n).innerHTML = "lot_id + wafer_id<br>기간 내 최신 이력 1건";
    } else if (d.type === "Filter") {
      $(".c2t", n).textContent = d.col + " " + d.op + " " + d.val;
    } else if (d.type === "Group By") {
      $(".c2t", n).textContent = "BY " + d.by;
    } else if (d.type === "END") {
      $(".c2y", n).textContent = "출력 " + d.cols.length + "열";
    }
  }

  // ── 패널 조각 ─────────────────────────────────────────
  function header(badge, badgeStyle, title, sub) {
    return (
      '<div class="c3i"><div class="c3j" style="' +
      badgeStyle +
      '">' +
      badge +
      '</div><div class="ch"><div class="c3k">' +
      title +
      '</div><div class="cj">' +
      sub +
      "</div></div></div>"
    );
  }
  function section(title, right, body) {
    return (
      '<div class="c3m"><div class="c3n"><div class="c3o">' +
      title +
      "</div>" +
      (right || "") +
      "</div>" +
      body +
      "</div>"
    );
  }
  function pills(list, on, attr) {
    return (
      '<div class="c4h" style="gap:6px">' +
      list
        .map(function (x) {
          return (
            '<button type="button" data-' +
            attr +
            '="' +
            esc(x) +
            "\" style=\"font:500 12px 'Geist Mono',monospace;padding:6px 12px;border-radius:8px;cursor:pointer;border:1px solid " +
            (x === on
              ? "#6366f1;background:#eef2ff;color:#4338ca"
              : "#e6e8ec;background:#fff;color:#475569") +
            '">' +
            esc(x) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  var INP =
    "style=\"width:100%;box-sizing:border-box;height:36px;border:1px solid #e6e8ec;border-radius:10px;background:#f4f6f8;padding:0 10px;font:13px 'Geist Mono',monospace\"";

  function dacPanel(id) {
    var d = nodes[id],
      a = APIS[d.api],
      list = "";
    DEPLOYED.forEach(function (k) {
      var on = k === d.api;
      list +=
        '<div class="' +
        (on ? "c3w" : "c40") +
        '" data-api="' +
        k +
        '" style="cursor:pointer"><div class="c3x"><div class="' +
        (on ? "c3y" : "c41") +
        '">' +
        k +
        '</div><div class="c2y">' +
        APIS[k].desc +
        '</div></div><span class="' +
        (on ? "c3z" : "c42") +
        '">' +
        APIS[k].ver +
        (on ? " · 선택됨" : " · 배포됨") +
        "</span></div>";
    });
    Object.keys(NOTDEP).forEach(function (k) {
      list +=
        '<div class="c43"><div class="c3x"><div class="c41">' +
        k +
        '</div><div class="c2y">' +
        NOTDEP[k] +
        '</div></div><span class="c44">미배포</span></div>';
    });
    var combo = d.open
      ? '<div class="c3q"><div class="c3r" data-toggle style="cursor:pointer"><div class="c3s">' +
        d.api +
        '</div><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 9l4-4 4 4" fill="none" stroke="#475569" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="c3v">' +
        list +
        '</div><div class="c45">배포된 API만 선택할 수 있어요 · 내 워크스페이스 6개</div></div>'
      : '<div class="c3r" data-toggle style="cursor:pointer;border:1px solid #d6dae1;border-radius:12px"><div class="c3s">' +
        d.api +
        '</div><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 5l4 4 4-4" fill="none" stroke="#475569" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
    var params =
      a.params
        .map(function (p) {
          return (
            '<div class="c4a"><div class="c4b"><div class="c4c">' +
            p[0] +
            '</div><div class="c2y">string · ' +
            p[1] +
            '</div></div><span class="' +
            (p[2].indexOf("start.") === 0 ? "c4d" : "c4e") +
            '">' +
            esc(p[2]) +
            "</span></div>"
          );
        })
        .join("") || '<div class="cj">연결할 파라미터가 없어요</div>';
    return (
      header("DAC", "", a.title, "Data API 노드") +
      '<div class="c3l">' +
      section("API 선택", '<span class="c3p">MFG Analytics</span>', combo) +
      section(
        "API 정보",
        '<span class="c46">Oracle 19c</span>',
        '<div class="c47"><span class="c2m">DB</span><span class="c48">' +
          a.db +
          '</span></div><pre class="c49">' +
          esc(a.sql) +
          "</pre>",
      ) +
      section("파라미터 연결", "", params) +
      section(
        "출력 컬럼",
        "",
        '<div class="c4f">' +
          a.cols
            .map(function (c) {
              return '<span class="c4g">' + c + "</span>";
            })
            .join("") +
          "</div>",
      ) +
      section(
        "실행 옵션",
        "",
        '<div class="c4h"><div class="c4i"><div class="c2y">실행 방식</div><div class="c4j">동기 실행</div></div><div class="c4i"><div class="c2y">입력·중간 행 한도</div><div class="c4j">100,000행</div></div></div>',
      ) +
      "</div>"
    );
  }
  var DUCK = "background:#fef3c7;color:#92400e";
  function panelHtml() {
    var d = nodes[sel];
    if (d.type === "DAC") return dacPanel(sel);
    if (d.type === "START")
      return (
        header(
          "START",
          "background:#eef2ff;color:#4338ca",
          "입력 노드",
          "요청 body로 받는 값",
        ) +
        '<div class="c3l">' +
        section(
          "입력 파라미터",
          '<span class="c3p">' + d.params.length + "개</span>",
          d.params
            .map(function (p) {
              return (
                '<div class="c4a"><div class="c4b"><div class="c4c">' +
                p[0] +
                '</div><div class="c2y">' +
                p[1] +
                (p[0] === "wafer_id" ? " · 선택 (ALL)" : " · 필수") +
                '</div></div><span class="c4e">body</span></div>'
              );
            })
            .join(""),
        ) +
        section(
          "호출 예시",
          "",
          '<pre class="c49">POST /api/workflow/lot_yield_equip\n{\n  "lot_id": "LOT-1199",\n  "wafer_id": "ALL",\n  "start_time": "2026-10-19T14:00",\n  "end_time": "2026-10-20T14:00"\n}</pre>',
        ) +
        "</div>"
      );
    if (d.type === "JOIN")
      return (
        header("JOIN", DUCK, "JOIN", "두 노드의 결과를 합칩니다") +
        '<div class="c3l">' +
        section(
          "조인 방식",
          "",
          pills(["INNER", "LEFT", "RIGHT", "FULL"], d.kind, "kind"),
        ) +
        section(
          "조인 키",
          "",
          '<div class="c4a"><div class="c4b"><div class="c4c">' +
            nodes.dac1.api +
            '</div><div class="c2y">왼쪽</div></div><span class="c4d">' +
            d.key +
            '</span></div><div class="c4a"><div class="c4b"><div class="c4c">' +
            nodes.dac2.api +
            '</div><div class="c2y">오른쪽</div></div><span class="c4d">' +
            d.key +
            "</span></div>",
        ) +
        section(
          "생성 SQL",
          "",
          '<pre class="c49">SELECT *\n  FROM a\n ' +
            d.kind +
            " JOIN b\n    ON a." +
            "lot_id = b.lot_id AND a.wafer_id = b.wafer_id" +
            "</pre>",
        ) +
        "</div>"
      );
    if (d.type === "Filter")
      return (
        header("Filter", DUCK, "Filter", "조건에 맞는 행만 남깁니다") +
        '<div class="c3l">' +
        section(
          "조건",
          "",
          '<div style="display:flex;gap:6px"><input data-f="col" value="' +
            esc(d.col) +
            '" ' +
            INP +
            '><select data-f="op" ' +
            INP.replace("width:100%", "width:72px") +
            ">" +
            ["<", "<=", "=", ">=", ">", "<>"]
              .map(function (o) {
                return (
                  "<option" +
                  (o === d.op ? " selected" : "") +
                  ">" +
                  esc(o) +
                  "</option>"
                );
              })
              .join("") +
            '</select><input data-f="val" value="' +
            esc(d.val) +
            '" ' +
            INP.replace("width:100%", "width:90px") +
            "></div>",
        ) +
        section(
          "생성 SQL",
          "",
          '<pre class="c49" id="fsql">WHERE ' +
            esc(d.col) +
            " " +
            esc(d.op) +
            " " +
            esc(d.val) +
            "</pre>",
        ) +
        "</div>"
      );
    if (d.type === "Group By")
      return (
        header("GROUP", DUCK, "Group By", "컬럼별로 묶어 집계합니다") +
        '<div class="c3l">' +
        section(
          "그룹 기준",
          "",
          pills(["equip_id", "lot_id", "step", "wafer_id"], d.by, "by"),
        ) +
        section(
          "집계",
          "",
          pills(
            [
              "AVG(yield_rate)",
              "COUNT(*)",
              "SUM(defect_cnt)",
              "MIN(yield_rate)",
            ],
            "",
            "agg",
          ).replace(/data-agg="([^"]+)"/g, function (m, v) {
            return m + (d.aggs.indexOf(v) >= 0 ? ' data-on="1"' : "");
          }),
        ) +
        section(
          "생성 SQL",
          "",
          '<pre class="c49">SELECT ' +
            d.by +
            ", " +
            d.aggs.join(", ") +
            "\n  FROM t\n GROUP BY " +
            d.by +
            "</pre>",
        ) +
        "</div>"
      );
    return (
      header(
        "END",
        "background:#e2e8f0;color:#334155",
        "출력 노드",
        "API · MCP 응답 컬럼",
      ) +
      '<div class="c3l">' +
      section(
        "출력 컬럼",
        '<span class="c3p">' + d.cols.length + "개</span>",
        '<div class="c4f">' +
          d.cols
            .map(function (c) {
              return '<span class="c4g">' + c + "</span>";
            })
            .join("") +
          "</div>",
      ) +
      section(
        "응답 형태",
        "",
        '<pre class="c49">{ "columns": [...],\n  "rows": [[...], ...] }</pre>',
      ) +
      "</div>"
    );
  }

  function renderPanel() {
    aside.innerHTML = panelHtml();
    var d = nodes[sel];
    aside.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.onclick = function () {
        d.open = !d.open;
        renderPanel();
      };
    });
    aside.querySelectorAll("[data-api]").forEach(function (r) {
      r.onclick = function () {
        d.api = r.dataset.api;
        d.open = false;
        syncNode(sel);
        renderPanel();
      };
    });
    aside.querySelectorAll("[data-kind]").forEach(function (b) {
      b.onclick = function () {
        d.kind = b.dataset.kind;
        syncNode(sel);
        renderPanel();
      };
    });
    aside.querySelectorAll("[data-by]").forEach(function (b) {
      b.onclick = function () {
        d.by = b.dataset.by;
        syncNode(sel);
        renderPanel();
      };
    });
    aside.querySelectorAll("[data-agg]").forEach(function (b) {
      b.onclick = function () {
        var i = d.aggs.indexOf(b.dataset.agg);
        if (i >= 0) {
          if (d.aggs.length > 1) d.aggs.splice(i, 1);
        } else d.aggs.push(b.dataset.agg);
        renderPanel();
      };
    });
    aside.querySelectorAll("[data-agg][data-on]").forEach(function (b) {
      b.style.border = "1px solid #6366f1";
      b.style.background = "#eef2ff";
      b.style.color = "#4338ca";
    });
    aside.querySelectorAll("[data-f]").forEach(function (i) {
      i.addEventListener("input", function () {
        d[i.dataset.f] = i.value;
        syncNode(sel);
        var s = $("#fsql");
        if (s) s.textContent = "WHERE " + d.col + " " + d.op + " " + d.val;
      });
    });
  }

  $(".c1y").textContent = saved.id;
  $(".c1x .cj").textContent = "revision " + saved.revision + " · 저장됨";
  $(".c25").textContent = "합성 데이터 · 노드 선택으로 설정 · 고정 수율 흐름";
  $(".c1v .c4").style.cursor = "pointer";
  $(".c1v .c4").onclick = () => (location.href = "workflows.html");
  document.querySelector('a[href="deploy.html"]').href =
    "deploy.html?id=" + encodeURIComponent(workflowId);
  document.querySelector('a[href^="deploy.html"]').onclick = (e) => {
    if (dirty) {
      e.preventDefault();
      alert("먼저 변경 내용을 저장하세요.");
    }
  };
  var drawer = document.createElement("section");
  drawer.className = "runtime-drawer";
  drawer.hidden = true;
  document.querySelector(".c4k").before(drawer);
  var args = Object.fromEntries(MOCK.inputFields.map((f) => [f.name, f.def]));
  var tab = "result";
  function draw() {
    drawer.replaceChildren();
    var head = document.createElement("div");
    head.className = "runtime-row";
    head.innerHTML =
      "<strong>" +
      {
        result: "실행 결과",
        input: "입력값 · 시간대 KST",
        nodes: "노드별 실행",
      }[tab] +
      "</strong>";
    var close = document.createElement("button");
    close.textContent = "닫기";
    close.onclick = () => (drawer.hidden = true);
    head.append(close);
    drawer.append(head);
    if (tab === "input") {
      Object.entries(args).forEach(([k, v]) => {
        var label = document.createElement("label");
        label.textContent = k;
        var inp = document.createElement("input");
        inp.value = v;
        inp.dataset.param = k;
        inp.oninput = () => (args[k] = inp.value);
        label.append(inp);
        drawer.append(label);
      });
      return;
    }
    if (!result) {
      var empty = document.createElement("p");
      empty.textContent = "테스트 실행 후 결과가 표시됩니다.";
      drawer.append(empty);
      return;
    }
    var pre = document.createElement("pre");
    pre.id = "execution-result";
    pre.textContent = JSON.stringify(
      tab === "nodes" ? result.nodes : result,
      null,
      2,
    );
    drawer.append(pre);
  }
  document.querySelectorAll(".c4k .cr span").forEach((el, i) => {
    el.style.cursor = "pointer";
    el.onclick = () => {
      tab = ["result", "input", "nodes"][i];
      drawer.hidden = false;
      draw();
    };
  });
  $(".c4o").onclick = () => {
    drawer.hidden = !drawer.hidden;
    draw();
  };
  $(".c4o").style.cursor = "pointer";
  $(".c4m").textContent = "미실행";
  $(".c4n").textContent = "저장된 초안을 테스트하세요";
  $(".c21").onclick = async function () {
    this.disabled = true;
    try {
      saved = await Store.request("/api/workflows/" + workflowId, "PUT", {
        revision: saved.revision,
        config: config(),
      });
      mark();
      alert("저장했습니다.");
    } catch (e) {
      alert(e.message);
    } finally {
      this.disabled = false;
    }
  };
  $(".c20").onclick = async function () {
    this.disabled = true;
    try {
      result = await Store.request(
        "/api/workflows/" + workflowId + "/test",
        "POST",
        { revision: saved.revision, config: config(), input: args },
      );
      $(".c4m").textContent = "성공";
      $(".c4n").textContent =
        result.nodes.length +
        "개 노드 · " +
        result.elapsed_ms +
        "ms · " +
        result.rows +
        "행" +
        (dirty ? " · 미저장 설정" : "");
      document.querySelectorAll(".c2q").forEach((x) => (x.textContent = ""));
      document
        .querySelectorAll(".c2i")
        .forEach((x) => (x.style.background = "#16a34a"));
      tab = "result";
      drawer.hidden = false;
      draw();
    } catch (e) {
      result = { error: e.message };
      $(".c4m").textContent = "실패";
      $(".c4n").textContent = "오류를 확인하세요";
      drawer.hidden = false;
      draw();
    } finally {
      this.disabled = false;
    }
  };
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  nodes.end.cols = outputCols();
  // 헤더의 제목 칩이 선택 노드 이름을 보여주도록 최초 동기화
  Object.keys(nodes).forEach(syncNode);
  document.querySelectorAll(".c2y").forEach((x) => {
    if (x.textContent === "DuckDB") x.textContent = "집계 엔진";
  });
  document
    .querySelectorAll(".c2i")
    .forEach((x) => (x.style.background = "#94a3b8"));
  paintSel();
  renderPanel();
})().catch((e) => {
  alert(e.message);
});
