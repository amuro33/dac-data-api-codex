(async function () {
  await Store.ready;
  var agents = JSON.parse(JSON.stringify(MOCK.agents)),
    toolsById = {};
  MOCK.tools.forEach(function (t) {
    toolsById[t.id] = t;
  });
  var usable = MOCK.tools.filter(function (t) {
    return !t.disabled;
  });
  var cur = 0,
    dirty = {},
    pending = false;
  agents.forEach(function (a) {
    a._saved = JSON.stringify(pick(a));
    a.msgs = a.msgs || [];
  });
  function pick(a) {
    return {
      name: a.name,
      model: a.model,
      prompt: a.prompt,
      contextTokens: a.contextTokens ?? 8192,
      tools: a.tools.slice().sort(),
      schedule: a.schedule,
    };
  }
  function isDirty(a) {
    return JSON.stringify(pick(a)) !== a._saved;
  }

  var ui = Shell.mount({
    active: "bot",
    title: "Agent Playground",
    desc: "저장된 도구의 운영 버전으로 답합니다 · 규칙 기반 테스트, LLM 미연결",
  });
  ui.main.classList.add("pg-main");
  var listEl = h("div", { class: "card col pg-list" }),
    setEl = h("div", { class: "card col ag-set" }),
    chatEl = h("div", { class: "card col ag-chat" });
  ui.main.append(listEl, setEl, chatEl);

  function renderList() {
    listEl.innerHTML = "";
    listEl.appendChild(
      h("div", { class: "card-head" }, [
        "내 Agent",
        h("button", {
          class: "btn sm primary",
          onclick: newAgent,
          text: "+ 새 Agent",
        }),
      ]),
    );
    var b = h("div", { class: "lbody" });
    agents.forEach(function (a, i) {
      b.appendChild(
        h(
          "button",
          {
            class: "agent-card" + (i === cur ? " on" : ""),
            onclick: function () {
              cur = i;
              render();
            },
          },
          [
            h("div", { class: "t" }, [
              a.name,
              isDirty(a)
                ? h("span", { class: "chip warn", text: "수정됨" })
                : null,
            ]),
            h("div", { class: "s", text: a.desc || "설명 없음" }),
            h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" }, [
              h("span", { class: "chip", text: "도구 " + a.tools.length }),
              a.schedule
                ? h("span", { class: "chip accent", text: "스케줄" })
                : null,
              i === cur
                ? h("span", { class: "chip ok", text: "사용 중" })
                : null,
            ]),
          ],
        ),
      );
    });
    listEl.appendChild(b);
  }
  async function newAgent() {
    var n = 1;
    while (agents.some((a) => a.name === "new-agent-" + n)) n++;
    try {
      const a = await Store.request("/api/agents", "POST", {
        name: "new-agent-" + n,
        prompt: MOCK.defaultAgentPrompt,
        contextTokens: 8192,
        tools: [],
      });
      a._saved = JSON.stringify(pick(a));
      agents.push(a);
      cur = agents.length - 1;
      render();
    } catch (e) {
      Shell.toast(e.message);
    }
  }

  function renderSet() {
    var a = agents[cur];
    setEl.innerHTML = "";
    var save = h("button", {
      class: "btn sm primary",
      text: isDirty(a) ? "저장" : "저장됨",
      onclick: async function () {
        save.disabled = true;
        try {
          const updated = await Store.request("/api/agents/" + a.id, "PUT", {
            ...pick(a),
            revision: a.revision,
          });
          Object.assign(a, updated);
          a._saved = JSON.stringify(pick(a));
          Shell.toast("서버에 저장했습니다");
          render();
        } catch (e) {
          Shell.toast(e.message);
          save.disabled = false;
        }
      },
    });
    save.disabled = !isDirty(a);
    setEl.appendChild(
      h("div", { class: "card-head" }, [
        "설정",
        h("div", { style: "display:flex;gap:8px;align-items:center" }, [
          isDirty(a) ? h("span", { class: "chip warn", text: "수정됨" }) : null,
          save,
        ]),
      ]),
    );
    var sc = h("div", { class: "scroll" });
    sc.appendChild(
      h("div", {}, [
        h("div", {
          class: "label",
          style: "margin-bottom:6px",
          text: "에이전트명",
        }),
        h("input", {
          class: "input",
          value: a.name,
          oninput: function (e) {
            a.name = e.target.value;
            softRefresh();
          },
        }),
      ]),
    );
    sc.appendChild(
      h("label", { class: "label" }, [
        "대화 컨텍스트 크기 (추정 토큰)",
        h(
          "select",
          {
            class: "select",
            id: "agent-context-tokens",
            onchange: (e) => {
              a.contextTokens = Number(e.target.value);
              softRefresh();
            },
          },
          [
            1024,
            4096,
            8192,
            16384,
            32768,
            65536,
            ...(![1024, 4096, 8192, 16384, 32768, 65536].includes(
              a.contextTokens,
            )
              ? [a.contextTokens]
              : []),
          ].map((n) =>
            h("option", {
              value: n,
              text: n.toLocaleString() + " tokens",
              selected: n === a.contextTokens,
            }),
          ),
        ),
      ]),
    );
    sc.appendChild(
      h("div", {
        class: "hint",
        text: "기본 8,192 · 프롬프트와 현재 질문을 우선 포함하고 최근 대화부터 참조합니다. 초과한 과거 대화는 저장된 채로 참조에서만 제외됩니다. LLM 미연결: 실제 모델 토큰 수와 다릅니다.",
      }),
    );
    var sel = h(
      "select",
      {
        class: "select",
        onchange: function (e) {
          a.model = e.target.value;
          softRefresh();
        },
      },
      ["fixture-rules"].map(function (m) {
        return h("option", { value: m, text: m, selected: m === a.model });
      }),
    );
    sc.appendChild(
      h("div", {}, [
        h("div", { class: "label", style: "margin-bottom:6px", text: "모델" }),
        sel,
      ]),
    );
    sc.appendChild(
      h("div", {}, [
        h("div", {
          class: "label",
          style: "margin-bottom:6px",
          text: "프롬프트 (저장용 · LLM 연결 전)",
        }),
        h(
          "textarea",
          {
            class: "textarea",
            rows: "6",
            oninput: function (e) {
              a.prompt = e.target.value;
              softRefresh();
            },
          },
          [a.prompt],
        ),
      ]),
    );
    var tl = h("div", { style: "display:flex;flex-direction:column;gap:6px" });
    usable.forEach(function (t) {
      var on = a.tools.indexOf(t.id) >= 0;
      tl.appendChild(
        h(
          "button",
          {
            class: "tool-opt" + (on ? " on" : ""),
            onclick: function () {
              if (on)
                a.tools = a.tools.filter(function (x) {
                  return x !== t.id;
                });
              else a.tools.push(t.id);
              render();
            },
          },
          [
            h("span", {
              class: "check" + (on ? " on" : ""),
              html: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2l2.2 2.2L8 3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            }),
            h("span", { style: "min-width:0" }, [
              h("div", { class: "n", text: t.id }),
              h("div", { class: "s", text: t.kind + (t.job ? " · Job" : "") }),
            ]),
          ],
        ),
      );
    });
    sc.appendChild(
      h("div", {}, [
        h("div", { class: "row2", style: "margin-bottom:6px" }, [
          h("span", { class: "label", text: "사용할 도구" }),
          h("span", { class: "chip accent", text: a.tools.length + "개 선택" }),
        ]),
        tl,
      ]),
    );
    sc.appendChild(
      h("div", { class: "row2" }, [
        h("div", {}, [
          h("div", { class: "label", text: "스케줄 실행" }),
          h("div", {
            class: "hint",
            text: "준비 중 · 이번 단계에서는 실행되지 않음",
          }),
        ]),
        h("button", { class: "switch", disabled: true }),
      ]),
    );
    sc.appendChild(
      h("div", { class: "row2" }, [
        h("div", {}, [
          h("div", { class: "label", text: "메신저 연동" }),
          h("div", { class: "hint", text: "결과를 메신저로 전송" }),
        ]),
        h("span", { class: "chip", text: "준비 중" }),
      ]),
    );
    sc.appendChild(
      h("div", {
        class: "hint",
        text: "메시지를 보내면 채팅에 조회 조건 입력 폼이 나타납니다. 기본값은 목업 데이터 기준이며 실행 전에 수정할 수 있습니다.",
      }),
    );
    sc.appendChild(
      h("label", { class: "label" }, [
        "디버그: 도구 직접 실행",
        h(
          "select",
          { class: "select", id: "agent-tool" },
          a.tools.map((id) => h("option", { value: id, text: id })),
        ),
      ]),
    );
    setEl.appendChild(sc);
  }
  // 입력 중에는 포커스를 유지하기 위해 목록·저장 버튼만 갱신
  function softRefresh() {
    renderList();
    var a = agents[cur],
      head = setEl.querySelector(".card-head");
    var btn = head.querySelector("button");
    btn.textContent = isDirty(a) ? "저장" : "저장됨";
    btn.disabled = !isDirty(a);
    head.firstChild.nextSibling.querySelectorAll(".chip").forEach(function (c) {
      c.remove();
    });
    if (isDirty(a))
      head.lastChild.insertBefore(
        h("span", { class: "chip warn", text: "수정됨" }),
        btn,
      );
    chatEl.querySelector(".card-head .mono").textContent = a.name;
  }

  function renderChat() {
    var a = agents[cur];
    chatEl.innerHTML = "";
    chatEl.appendChild(
      h("div", { class: "card-head" }, [
        h("span", { class: "mono", text: a.name }),
        h("div", { style: "display:flex;gap:8px;align-items:center" }, [
          h("span", { class: "chip", text: a.model }),
          h("button", {
            class: "btn sm",
            text: "대화 지우기",
            onclick: async function () {
              if (pending) return;
              try {
                await Store.request(
                  "/api/agents/" + a.id + "/clear",
                  "POST",
                  {},
                );
                a.msgs = [];
                delete a._request;
                renderChat();
              } catch (e) {
                Shell.toast(e.message);
              }
            },
          }),
        ]),
      ]),
    );
    var box = h("div", { class: "msgs", id: "msgs" });
    if (!a.msgs.length && !a._request)
      box.appendChild(
        h("div", {
          class: "empty",
          text: "메시지를 보내 이 에이전트와 대화해 보세요. 예) “LOT-1199 수율 알려줘”",
        }),
      );
    a.msgs.forEach(function (m, i) {
      const previous = a.msgs[i - 1];
      box.appendChild(
        m.r === "bot" && previous?.r === "call" && previous.result
          ? resultGrid(previous.result)
          : bubble(m),
      );
    });
    if (a._request) {
      box.appendChild(bubble({ r: "user", t: a._request.question }));
      box.appendChild(inputCard(a));
    }
    if (pending)
      box.appendChild(
        h("div", {
          class: "bub bot dots",
          html: "<span></span><span></span><span></span>",
        }),
      );
    chatEl.appendChild(box);
    var ta = h("textarea", {
      id: "inp",
      placeholder: "메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)",
      onkeydown: function (e) {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          send();
        }
      },
    });
    var btn = h("button", {
      class: "btn primary",
      text: "보내기",
      onclick: send,
    });
    btn.disabled = pending || !!a._request;
    ta.disabled = pending || !!a._request;
    chatEl.appendChild(h("div", { class: "composer" }, [ta, btn]));
    box.scrollTop = box.scrollHeight;
  }
  function resultGrid(result) {
    const card = h("div", {
      class: "bub bot agent-result",
      style: "min-width:0;max-width:100%;width:100%;box-sizing:border-box",
    });
    card.appendChild(
      h("div", {
        style: "font-weight:600;margin-bottom:12px",
        text: `${result.input.lot_id} · ${result.rows}개 그룹 조회 (운영 v${result.version})`,
      }),
    );
    const wrap = h("div", {
      style: "overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px",
    });
    const table = h("table", {
      class: "agent-result-grid",
      "aria-label": "조회 결과",
      style:
        "width:100%;border-collapse:collapse;text-align:left;font-size:13px;white-space:nowrap",
    });
    table.appendChild(
      h("thead", {}, [
        h(
          "tr",
          {},
          result.columns.map((c) =>
            h("th", {
              scope: "col",
              style:
                "padding:10px 12px;background:#f6f8fa;border-bottom:1px solid #e2e8f0;font-weight:600",
              text: c,
            }),
          ),
        ),
      ]),
    );
    table.appendChild(
      h(
        "tbody",
        {},
        result.data.map((row) =>
          h(
            "tr",
            {},
            row.map((value) =>
              h("td", {
                style:
                  "padding:10px 12px;border-bottom:1px solid #eef1f5;font-variant-numeric:tabular-nums;text-align:" +
                  (typeof value === "number" ? "right" : "left"),
                text: value == null ? "—" : String(value),
              }),
            ),
          ),
        ),
      ),
    );
    wrap.appendChild(table);
    card.appendChild(wrap);
    if (!result.rows)
      card.appendChild(
        h("div", {
          class: "hint",
          style: "padding-top:12px",
          text: "조회 조건에 맞는 결과가 없습니다.",
        }),
      );
    return card;
  }

  function bubble(m) {
    if (m.r === "call")
      return h("div", { class: "toolcall" }, [
        h("div", { class: "h" }, [
          "🔧 도구 호출 ",
          h("code", { text: m.tool }),
          h("span", { class: "chip ok", text: "완료" }),
        ]),
        h("pre", { text: JSON.stringify(m.args, null, 2) }),
        m.context
          ? h("div", {
              class: "hint",
              text:
                "입력 컨텍스트 약 " +
                m.context.estimatedTokens +
                " / " +
                m.context.budget +
                " tokens · 이전 " +
                m.context.retainedTurns +
                "턴 참조 · " +
                m.context.excludedTurns +
                "턴 제외",
            })
          : null,
        h("details", {}, [
          h("summary", { text: "운영 v" + m.version + " · 실행 결과" }),
          h("pre", { text: JSON.stringify(m.result, null, 2) }),
        ]),
      ]);
    return h("div", { class: "bub " + m.r, text: m.t });
  }

  async function send() {
    const a = agents[cur],
      text = (document.getElementById("inp").value || "").trim();
    if (!text || pending) return;
    if (isDirty(a)) {
      Shell.toast("설정을 먼저 저장하세요.");
      return;
    }
    if (!a.tools.length) {
      Shell.toast("사용할 도구를 선택하고 저장하세요.");
      return;
    }
    const tool = document.getElementById("agent-tool").value;
    const fields = toolsById[tool]?.fields;
    if (!fields) return Shell.toast("도구 목록을 새로고침하세요.");
    a._request = {
      question: text,
      tool,
      fields,
      values: Object.fromEntries(fields.map((f) => [f.name, f.def ?? ""])),
    };
    renderChat();
  }

  function inputCard(a) {
    const request = a._request;
    const form = h("form", {
      class: "bub bot agent-input-form",
      style: "width:100%;max-width:460px;display:grid;gap:12px",
    });
    form.appendChild(h("strong", { text: "필요한 데이터를 입력해주세요" }));
    form.appendChild(
      h("div", {
        class: "hint",
        text: request.tool + " · 목업 기본값 · 실행 전 수정 가능",
      }),
    );
    request.fields.forEach((f) => {
      const label =
        {
          lot_id: "Lot ID",
          wafer_id: "Wafer ID",
          start_time: "조회 시작 시간 (KST)",
          end_time: "조회 종료 시간 (KST)",
        }[f.name] || f.name;
      form.appendChild(
        h("label", { class: "label" }, [
          label + (f.required ? " *" : ""),
          h("input", {
            class: "input",
            name: f.name,
            type: f.type === "datetime" ? "datetime-local" : "text",
            required: !!f.required,
            value: request.values[f.name],
            disabled: pending,
            oninput: (e) => (request.values[f.name] = e.target.value),
          }),
        ]),
      );
    });
    if (request.error)
      form.appendChild(h("div", { role: "alert", text: request.error }));
    form.appendChild(
      h("div", { style: "display:flex;gap:8px" }, [
        h("button", {
          class: "btn primary",
          type: "submit",
          text: pending ? "실행 중…" : "실행",
          disabled: pending,
        }),
        h("button", {
          class: "btn",
          type: "button",
          text: "취소",
          disabled: pending,
          onclick: () => {
            delete a._request;
            renderChat();
          },
        }),
      ]),
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      execute(a);
    };
    return form;
  }

  async function execute(a) {
    if (pending || !a._request) return;
    if (isDirty(a)) return Shell.toast("설정을 먼저 저장하세요.");
    const request = a._request;
    const body = {
      question: request.question,
      tool: request.tool,
      input: request.values,
    };
    pending = true;
    renderChat();
    try {
      const r = await Store.request(
        "/api/agents/" + a.id + "/chat",
        "POST",
        body,
      );
      a.msgs = r.messages;
      delete a._request;
    } catch (e) {
      request.error = e.message;
    } finally {
      pending = false;
      renderChat();
    }
  }

  function render() {
    renderList();
    renderSet();
    renderChat();
  }
  render();
})().catch((e) => Shell.toast(e.message));
