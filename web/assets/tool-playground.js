(async function () {
  await Store.ready;
  var tools = MOCK.tools,
    cur = null,
    vals = {},
    errs = {},
    tab = "res",
    busy = false;
  var hist = MOCK.runs
      .filter((r) => r.source === "tool" && tools.some((t) => t.id === r.tool))
      .map((r) => ({
        tool: r.tool,
        status: r.status === "succeeded" ? 200 : 400,
        ms: r.result?.elapsed_ms || 0,
        req: r.input,
        body: r.result || { error: r.error },
        kind: r.status === "succeeded" ? "ok" : "err",
      })),
    last = null;
  var q = "";

  var ui = Shell.mount({
    active: "tool",
    title: "Tool Playground",
    desc: "배포된 운영 버전의 도구를 실행합니다 · 합성 데이터",
  });
  ui.main.classList.add("pg-main");
  var listEl = h("div", { class: "card col pg-list" });
  var centerEl = h("div", { class: "pg-center" });
  var histEl = h("div", { class: "card col hist" });
  ui.main.append(listEl, centerEl, histEl);

  function select(t) {
    if (t.disabled) return;
    cur = t;
    vals = {};
    errs = {};
    t.fields.forEach(function (f) {
      vals[f.name] = f.def;
    });
    last = null;
    tab = "res";
    render();
  }

  function renderList() {
    listEl.innerHTML = "";
    var inp = h("input", {
      placeholder: "도구 검색",
      value: q,
      oninput: function (e) {
        q = e.target.value;
        fillList();
      },
    });
    listEl.append(
      h("div", { class: "top" }, [
        h("div", { style: "font-weight:600", text: "도구" }),
        h("label", { class: "search" }, [inp]),
      ]),
    );
    listEl.append(h("div", { class: "lbody", id: "tl" }));
    fillList();
  }
  function fillList() {
    var body = listEl.querySelector("#tl");
    body.innerHTML = "";
    MOCK.groups.forEach(function (g) {
      var items = tools.filter(function (t) {
        return (
          t.group === g.id &&
          (!q || (t.id + t.desc).toLowerCase().indexOf(q.toLowerCase()) >= 0)
        );
      });
      if (!items.length) return;
      body.appendChild(
        h("div", { class: "grp" }, [
          h("span", { text: g.id }),
          h("span", { class: "chip", text: g.tag }),
        ]),
      );
      items.forEach(function (t) {
        body.appendChild(
          h(
            "button",
            {
              class:
                "item" + (cur === t ? " on" : "") + (t.disabled ? " dis" : ""),
              onclick: function () {
                select(t);
              },
            },
            [
              h("div", { class: "t" }, [
                t.id,
                t.job ? h("span", { class: "chip warn", text: "Job" }) : null,
              ]),
              h("div", { class: "s", text: t.disabled ? "준비 중" : t.kind }),
            ],
          ),
        );
      });
    });
  }

  function renderCenter() {
    centerEl.innerHTML = "";
    if (!cur) {
      centerEl.appendChild(
        h("div", {
          class: "card empty",
          style:
            "flex:1;display:flex;align-items:center;justify-content:center",
          text: "왼쪽에서 도구를 선택하세요",
        }),
      );
      return;
    }
    var form = h("div", { class: "card pg-form" });
    form.appendChild(
      h("div", { class: "card-head" }, [
        h("span", { class: "mono", text: cur.id }),
        h("span", {
          class: "chip " + (cur.job ? "warn" : "ok"),
          text: cur.job ? "Job (비동기)" : "동기 호출",
        }),
      ]),
    );
    var sc = h("div", { class: "scroll" });
    sc.appendChild(h("p", { class: "desc", text: cur.desc }));
    if (!cur.fields.length)
      sc.appendChild(
        h("div", { class: "hint", text: "입력 파라미터가 없습니다" }),
      );
    cur.fields.forEach(function (f) {
      var inp = h("input", {
        class: "input" + (errs[f.name] ? " err" : ""),
        value: vals[f.name] || "",
        type: f.type === "datetime" ? "datetime-local" : "text",
        oninput: function (e) {
          vals[f.name] = e.target.value;
          if (errs[f.name]) {
            delete errs[f.name];
            inp.classList.remove("err");
            var m = inp.parentNode.querySelector(".msg");
            if (m) m.remove();
          }
        },
      });
      sc.appendChild(
        h("div", { class: "field" }, [
          h("div", { class: "label" }, [
            f.name,
            f.required ? h("b", { text: "*" }) : null,
            h("em", { text: f.type }),
          ]),
          inp,
          errs[f.name] ? h("div", { class: "msg", text: errs[f.name] }) : null,
        ]),
      );
    });
    form.appendChild(sc);
    var btn = h("button", { class: "btn primary", onclick: call }, [
      busy ? h("span", { class: "spinner" }) : null,
      busy ? "호출 중…" : "호출",
    ]);
    if (busy) btn.disabled = true;
    form.appendChild(
      h("div", { class: "foot" }, [
        h("span", { class: "hint mono", text: "POST " + path() }),
        btn,
      ]),
    );
    centerEl.append(form, renderResp());
  }
  function path() {
    return cur.route;
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }
  function pretty(o) {
    // 행 배열은 한 줄로 접어서 보여준다
    var s = JSON.stringify(
      o,
      function (k, v) {
        return k === "data" ? "__ROWS__" : v;
      },
      2,
    );
    var rows =
      o && o.data
        ? "[\n" +
          o.data
            .map(function (r) {
              return "    " + JSON.stringify(r);
            })
            .join(",\n") +
          "\n  ]"
        : "";
    s = s.replace('"__ROWS__"', rows);
    return esc(s)
      .replace(/"([^"]+)":/g, '<span class="json-k">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="json-s">"$1"</span>')
      .replace(/: (-?\d[\d.]*)/g, ': <span class="json-n">$1</span>');
  }

  function renderResp() {
    var box = h("div", { class: "card resp" });
    var bar = h("div", { class: "bar" });
    var tabs = h(
      "div",
      { class: "tabs" },
      [
        ["res", "응답"],
        ["req", "요청"],
      ].map(function (t) {
        return h(
          "button",
          {
            class: "tab" + (tab === t[0] ? " on" : ""),
            onclick: function () {
              tab = t[0];
              render();
            },
          },
          [t[1]],
        );
      }),
    );
    var meta = last
      ? h("div", { style: "display:flex;gap:8px;align-items:center" }, [
          h("span", {
            class:
              "chip " +
              (last.status < 300 ? "ok" : last.status === 202 ? "warn" : "err"),
            text: String(last.status),
          }),
          h("span", { class: "hint mono", text: last.ms + " ms" }),
        ])
      : null;
    bar.append(tabs);
    if (meta) bar.append(meta);
    box.appendChild(bar);
    if (!last) {
      box.appendChild(
        h("div", { class: "empty", text: "호출하면 응답이 여기에 표시됩니다" }),
      );
      return box;
    }
    box.appendChild(
      h("div", { class: "out" }, [
        h("pre", {
          class: "pre",
          html: pretty(
            tab === "req"
              ? { method: "POST", path: path(), body: last.req }
              : last.body,
          ),
        }),
      ]),
    );
    return box;
  }

  async function call() {
    if (busy || !cur) return;
    errs = {};
    cur.fields.forEach((f) => {
      if (f.required && !String(vals[f.name] || "").trim())
        errs[f.name] = "필수 값입니다";
    });
    if (Object.keys(errs).length) {
      render();
      return;
    }
    const t = cur,
      snapshot = JSON.parse(JSON.stringify(vals)),
      started = performance.now();
    busy = true;
    render();
    let entry;
    try {
      const body = await Store.request(t.route, "POST", snapshot);
      entry = {
        tool: t.id,
        status: 200,
        ms: Math.round(performance.now() - started),
        req: snapshot,
        body,
        kind: "ok",
      };
    } catch (e) {
      entry = {
        tool: t.id,
        status: 400,
        ms: Math.round(performance.now() - started),
        req: snapshot,
        body: { error: e.message },
        kind: "err",
      };
    }
    hist.unshift(entry);
    busy = false;
    if (cur.id === t.id) {
      last = entry;
      tab = "res";
    }
    render();
  }

  function renderHist() {
    histEl.innerHTML = "";
    histEl.appendChild(h("div", { class: "card-head", text: "최근 호출" }));
    var sc = h("div", { class: "scroll", style: "flex:1" });
    hist.forEach(function (x) {
      sc.appendChild(
        h(
          "button",
          {
            class: "row" + (x === last ? " on" : ""),
            onclick: function () {
              var t = tools.filter(function (y) {
                return y.id === x.tool;
              })[0];
              cur = t;
              vals = JSON.parse(JSON.stringify(x.req));
              errs = {};
              last = x;
              tab = "res";
              render();
            },
          },
          [
            h("div", { class: "n", text: x.tool }),
            h("div", { class: "m" }, [
              h("span", {
                class:
                  "chip " +
                  (x.status < 300 ? (x.status === 202 ? "warn" : "ok") : "err"),
                text: String(x.status),
              }),
              x.ms + " ms",
            ]),
          ],
        ),
      );
    });
    histEl.appendChild(sc);
  }
  function render() {
    fillList();
    renderCenter();
    renderHist();
  }
  ui.actions.appendChild(
    h("button", {
      class: "btn",
      text: "목록 새로고침",
      onclick: () => location.reload(),
    }),
  );
  renderList();
  if (tools.length)
    select(
      tools.find(
        (t) => t.id === new URLSearchParams(location.search).get("tool"),
      ) || tools[0],
    );
  else {
    render();
    centerEl.textContent =
      "아직 배포된 도구가 없습니다. 워크플로우를 테스트하고 배포하세요.";
  }
})().catch((e) => Shell.toast(e.message));
