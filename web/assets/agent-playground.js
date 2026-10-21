(function () {
  var agents = JSON.parse(JSON.stringify(MOCK.agents)), toolsById = {};
  MOCK.tools.forEach(function (t) { toolsById[t.id] = t; });
  var usable = MOCK.tools.filter(function (t) { return !t.disabled; });
  var cur = 0, dirty = {}, pending = false;
  agents.forEach(function (a) {
    a._saved = JSON.stringify(pick(a));
    a.msgs = a.messages === 'seed' ? [
      { r: 'user', t: 'LOT-1199 수율이 낮은 장비가 어디야?' },
      { r: 'call', tool: 'get_lot_yield_by_equipment', args: { lot_id: 'LOT-1199', wafer_id: 'ALL' } },
      { r: 'bot', t: 'LOT-1199 기준 평균 수율이 가장 낮은 장비는 EQ-201(0.921)입니다. 이어서 EQ-207(0.934), EQ-114(0.941) 순입니다. 상위 2대에서 수율 0.95 미만 Lot이 11건 나왔어요.' }
    ] : [];
  });
  function pick(a) { return { name: a.name, model: a.model, prompt: a.prompt, tools: a.tools.slice().sort(), schedule: a.schedule }; }
  function isDirty(a) { return JSON.stringify(pick(a)) !== a._saved; }

  var ui = Shell.mount({ active: 'bot', title: 'Agent Playground', desc: '도구를 골라 간단한 에이전트를 만들고 바로 대화해 봅니다' });
  ui.main.classList.add('pg-main');
  var listEl = h('div', { class: 'card col pg-list' }), setEl = h('div', { class: 'card col ag-set' }), chatEl = h('div', { class: 'card col ag-chat' });
  ui.main.append(listEl, setEl, chatEl);

  function renderList() {
    listEl.innerHTML = '';
    listEl.appendChild(h('div', { class: 'card-head' }, ['내 Agent', h('button', { class: 'btn sm primary', onclick: newAgent, text: '+ 새 Agent' })]));
    var b = h('div', { class: 'lbody' });
    agents.forEach(function (a, i) {
      b.appendChild(h('button', { class: 'agent-card' + (i === cur ? ' on' : ''), onclick: function () { cur = i; render(); } }, [
        h('div', { class: 't' }, [a.name, isDirty(a) ? h('span', { class: 'chip warn', text: '수정됨' }) : null]),
        h('div', { class: 's', text: a.desc || '설명 없음' }),
        h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, [h('span', { class: 'chip', text: '도구 ' + a.tools.length }), a.schedule ? h('span', { class: 'chip accent', text: '스케줄' }) : null, i === cur ? h('span', { class: 'chip ok', text: '사용 중' }) : null])
      ]));
    });
    listEl.appendChild(b);
  }
  function newAgent() {
    var n = 1; while (agents.some(function (a) { return a.name === 'new-agent-' + n; })) n++;
    var a = { name: 'new-agent-' + n, desc: '새로 만든 Agent', model: 'claude-sonnet', schedule: false, prompt: '', tools: [], msgs: [] };
    a._saved = JSON.stringify(pick(a)); agents.push(a); cur = agents.length - 1; render();
  }

  function renderSet() {
    var a = agents[cur]; setEl.innerHTML = '';
    var save = h('button', { class: 'btn sm primary', text: isDirty(a) ? '저장' : '저장됨', onclick: function () { a._saved = JSON.stringify(pick(a)); Shell.toast('저장했습니다'); render(); } });
    save.disabled = !isDirty(a);
    setEl.appendChild(h('div', { class: 'card-head' }, ['설정', h('div', { style: 'display:flex;gap:8px;align-items:center' }, [isDirty(a) ? h('span', { class: 'chip warn', text: '수정됨' }) : null, save])]));
    var sc = h('div', { class: 'scroll' });
    sc.appendChild(h('div', {}, [h('div', { class: 'label', style: 'margin-bottom:6px', text: '에이전트명' }), h('input', { class: 'input', value: a.name, oninput: function (e) { a.name = e.target.value; softRefresh(); } })]));
    var sel = h('select', { class: 'select', onchange: function (e) { a.model = e.target.value; softRefresh(); } }, ['claude-sonnet', 'claude-opus', 'claude-haiku'].map(function (m) { return h('option', { value: m, text: m, selected: m === a.model }); }));
    sc.appendChild(h('div', {}, [h('div', { class: 'label', style: 'margin-bottom:6px', text: '모델' }), sel]));
    sc.appendChild(h('div', {}, [h('div', { class: 'label', style: 'margin-bottom:6px', text: '프롬프트' }), h('textarea', { class: 'textarea', rows: '6', oninput: function (e) { a.prompt = e.target.value; softRefresh(); } }, [a.prompt])]));
    var tl = h('div', { style: 'display:flex;flex-direction:column;gap:6px' });
    usable.forEach(function (t) {
      var on = a.tools.indexOf(t.id) >= 0;
      tl.appendChild(h('button', { class: 'tool-opt' + (on ? ' on' : ''), onclick: function () {
        if (on) a.tools = a.tools.filter(function (x) { return x !== t.id; }); else a.tools.push(t.id);
        render();
      } }, [h('span', { class: 'check' + (on ? ' on' : ''), html: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2l2.2 2.2L8 3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
        h('span', { style: 'min-width:0' }, [h('div', { class: 'n', text: t.id }), h('div', { class: 's', text: t.kind + (t.job ? ' · Job' : '') })])]));
    });
    sc.appendChild(h('div', {}, [h('div', { class: 'row2', style: 'margin-bottom:6px' }, [h('span', { class: 'label', text: '사용할 도구' }), h('span', { class: 'chip accent', text: a.tools.length + '개 선택' })]), tl]));
    sc.appendChild(h('div', { class: 'row2' }, [h('div', {}, [h('div', { class: 'label', text: '스케줄 실행' }), h('div', { class: 'hint', text: '정해진 시간에 자동으로 실행' })]), h('button', { class: 'switch' + (a.schedule ? ' on' : ''), onclick: function () { a.schedule = !a.schedule; render(); } })]));
    sc.appendChild(h('div', { class: 'row2' }, [h('div', {}, [h('div', { class: 'label', text: '메신저 연동' }), h('div', { class: 'hint', text: '결과를 메신저로 전송' })]), h('span', { class: 'chip', text: '준비 중' })]));
    setEl.appendChild(sc);
  }
  // 입력 중에는 포커스를 유지하기 위해 목록·저장 버튼만 갱신
  function softRefresh() {
    renderList();
    var a = agents[cur], head = setEl.querySelector('.card-head');
    var btn = head.querySelector('button'); btn.textContent = isDirty(a) ? '저장' : '저장됨'; btn.disabled = !isDirty(a);
    head.firstChild.nextSibling.querySelectorAll('.chip').forEach(function (c) { c.remove(); });
    if (isDirty(a)) head.lastChild.insertBefore(h('span', { class: 'chip warn', text: '수정됨' }), btn);
    chatEl.querySelector('.card-head .mono').textContent = a.name;
  }

  function renderChat() {
    var a = agents[cur]; chatEl.innerHTML = '';
    chatEl.appendChild(h('div', { class: 'card-head' }, [h('span', { class: 'mono', text: a.name }), h('div', { style: 'display:flex;gap:8px;align-items:center' }, [h('span', { class: 'chip', text: a.model }), h('button', { class: 'btn sm', text: '대화 지우기', onclick: function () { a.msgs = []; renderChat(); } })])]));
    var box = h('div', { class: 'msgs', id: 'msgs' });
    if (!a.msgs.length) box.appendChild(h('div', { class: 'empty', text: '메시지를 보내 이 에이전트와 대화해 보세요. 예) “LOT-1199 수율 알려줘”' }));
    a.msgs.forEach(function (m) { box.appendChild(bubble(m)); });
    if (pending) box.appendChild(h('div', { class: 'bub bot dots', html: '<span></span><span></span><span></span>' }));
    chatEl.appendChild(box);
    var ta = h('textarea', { id: 'inp', placeholder: '메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)', onkeydown: function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } } });
    var btn = h('button', { class: 'btn primary', text: '보내기', onclick: send }); btn.disabled = pending;
    chatEl.appendChild(h('div', { class: 'composer' }, [ta, btn]));
    box.scrollTop = box.scrollHeight;
  }
  function bubble(m) {
    if (m.r === 'call') return h('div', { class: 'toolcall' }, [h('div', { class: 'h' }, ['🔧 도구 호출 ', h('code', { text: m.tool }), h('span', { class: 'chip ok', text: '완료' })]), h('pre', { text: JSON.stringify(m.args, null, 2) })]);
    return h('div', { class: 'bub ' + m.r, text: m.t });
  }

  var RULES = [
    [/수율|장비/, 'get_lot_yield_by_equipment'], [/불량|파레토/, 'get_equip_defect_pareto'],
    [/경로|이동|이력/, 'trace_lot_route'], [/사이클|시간/, 'get_cycle_time'], [/웨이퍼|요약/, 'get_wafer_yield_summary']
  ];
  function send() {
    var a = agents[cur], ta = document.getElementById('inp'), text = (ta.value || '').trim();
    if (!text || pending) return;
    a.msgs.push({ r: 'user', t: text }); pending = true; renderChat();
    var target = cur;
    setTimeout(function () {
      var ag = agents[target], hit = null;
      RULES.forEach(function (r) { if (!hit && r[0].test(text)) hit = r[1]; });
      if (!ag.tools.length) ag.msgs.push({ r: 'bot', t: '선택된 도구가 없어요. 설정에서 사용할 도구를 하나 이상 골라 주세요.' });
      else if (!hit) ag.msgs.push({ r: 'bot', t: '조회가 필요한 질문이 아니라면 프롬프트 범위 안에서 답할게요. 수율·불량·이동 경로·사이클 타임 같은 질문을 해 보세요.' });
      else if (ag.tools.indexOf(hit) < 0) ag.msgs.push({ r: 'bot', t: '이 질문에는 ' + hit + ' 도구가 필요한데 선택되지 않았어요. 설정에서 추가해 주세요.' });
      else {
        var lot = (text.match(/LOT-\d+/i) || ['LOT-1199'])[0].toUpperCase(), t = toolsById[hit], res = t.result();
        ag.msgs.push({ r: 'call', tool: hit, args: t.fields.length ? Object.fromEntries(t.fields.filter(function (f) { return f.required; }).map(function (f) { return [f.name, f.name === 'lot_id' ? lot : f.def]; })) : {} });
        var top = res.rows[0];
        ag.msgs.push({ r: 'bot', t: (t.job ? '(Job 결과) ' : '') + res.rows.length + '건을 조회했어요. 가장 위 항목은 ' + res.columns.map(function (c, i) { return c + ' ' + top[i]; }).join(', ') + ' 입니다.' });
      }
      pending = false; if (target === cur) renderChat();
    }, 900);
  }

  function render() { renderList(); renderSet(); renderChat(); }
  render();
})();
