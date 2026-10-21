(function () {
  var tools = MOCK.tools, cur = null, vals = {}, errs = {}, tab = 'res', busy = false;
  var hist = [
    { tool: 'get_cycle_time', status: 200, ms: 214, req: { process_step: '', start_date: '2026-10-13', end_date: '2026-10-20' }, kind: 'ok' },
    { tool: 'get_lot_yield_by_equipment', status: 200, ms: 342, req: { lot_id: 'LOT-1199', wafer_id: 'ALL', start_time: '2026-10-19T14:00', end_time: '2026-10-20T14:00' }, kind: 'ok' },
    { tool: 'trace_lot_route', status: 202, ms: 88, req: { lot_id: 'LOT-1042' }, kind: 'job' }
  ];
  hist.forEach(function (x) { x.body = x.kind === 'job' ? { job_id: 'job_8f3a21', status: 'queued' } : wrap(tools.filter(function (t) { return t.id === x.tool; })[0].result()); });
  var last = hist[0], jobs = {};
  var q = '';

  var ui = Shell.mount({ active: 'tool', title: 'Tool Playground', desc: '배포한 Data API · Data Workflow · MCP 도구를 직접 호출해 봅니다' });
  ui.main.classList.add('pg-main');
  var listEl = h('div', { class: 'card col pg-list' });
  var centerEl = h('div', { class: 'pg-center' });
  var histEl = h('div', { class: 'card col hist' });
  ui.main.append(listEl, centerEl, histEl);

  function wrap(r) { return { rows: r.rows.length, columns: r.columns, data: r.rows }; }
  function select(t) { if (t.disabled) return; cur = t; vals = {}; errs = {}; t.fields.forEach(function (f) { vals[f.name] = f.def; }); last = null; tab = 'res'; render(); }

  function renderList() {
    listEl.innerHTML = '';
    var inp = h('input', { placeholder: '도구 검색', value: q, oninput: function (e) { q = e.target.value; fillList(); } });
    listEl.append(h('div', { class: 'top' }, [h('div', { style: 'font-weight:600', text: '도구' }), h('label', { class: 'search' }, [inp])]));
    listEl.append(h('div', { class: 'lbody', id: 'tl' }));
    fillList();
  }
  function fillList() {
    var body = listEl.querySelector('#tl'); body.innerHTML = '';
    MOCK.groups.forEach(function (g) {
      var items = tools.filter(function (t) { return t.group === g.id && (!q || (t.id + t.desc).toLowerCase().indexOf(q.toLowerCase()) >= 0); });
      if (!items.length) return;
      body.appendChild(h('div', { class: 'grp' }, [h('span', { text: g.id }), h('span', { class: 'chip', text: g.tag })]));
      items.forEach(function (t) {
        body.appendChild(h('button', { class: 'item' + (cur === t ? ' on' : '') + (t.disabled ? ' dis' : ''), onclick: function () { select(t); } }, [
          h('div', { class: 't' }, [t.id, t.job ? h('span', { class: 'chip warn', text: 'Job' }) : null]),
          h('div', { class: 's', text: t.disabled ? '준비 중' : t.kind })
        ]));
      });
    });
  }

  function renderCenter() {
    centerEl.innerHTML = '';
    if (!cur) { centerEl.appendChild(h('div', { class: 'card empty', style: 'flex:1;display:flex;align-items:center;justify-content:center', text: '왼쪽에서 도구를 선택하세요' })); return; }
    var form = h('div', { class: 'card pg-form' });
    form.appendChild(h('div', { class: 'card-head' }, [h('span', { class: 'mono', text: cur.id }), h('span', { class: 'chip ' + (cur.job ? 'warn' : 'ok'), text: cur.job ? 'Job (비동기)' : '동기 호출' })]));
    var sc = h('div', { class: 'scroll' });
    sc.appendChild(h('p', { class: 'desc', text: cur.desc }));
    if (!cur.fields.length) sc.appendChild(h('div', { class: 'hint', text: '입력 파라미터가 없습니다' }));
    cur.fields.forEach(function (f) {
      var inp = h('input', { class: 'input' + (errs[f.name] ? ' err' : ''), value: vals[f.name] || '', type: f.type === 'datetime' ? 'datetime-local' : 'text', oninput: function (e) { vals[f.name] = e.target.value; if (errs[f.name]) { delete errs[f.name]; inp.classList.remove('err'); var m = inp.parentNode.querySelector('.msg'); if (m) m.remove(); } } });
      sc.appendChild(h('div', { class: 'field' }, [h('div', { class: 'label' }, [f.name, f.required ? h('b', { text: '*' }) : null, h('em', { text: f.type })]), inp, errs[f.name] ? h('div', { class: 'msg', text: errs[f.name] }) : null]));
    });
    form.appendChild(sc);
    var btn = h('button', { class: 'btn primary', onclick: call }, [busy ? h('span', { class: 'spinner' }) : null, busy ? '호출 중…' : '호출']);
    if (busy) btn.disabled = true;
    form.appendChild(h('div', { class: 'foot' }, [h('span', { class: 'hint mono', text: 'POST ' + path() }), btn]));
    centerEl.append(form, renderResp());
  }
  function path() { return cur.kind === 'Data API' ? '/api/dac/select/' + cur.id : '/mcp/tools/call · ' + cur.id; }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function pretty(o) {
    // 행 배열은 한 줄로 접어서 보여준다
    var s = JSON.stringify(o, function (k, v) { return k === 'data' ? '__ROWS__' : v; }, 2);
    var rows = o && o.data ? '[\n' + o.data.map(function (r) { return '    ' + JSON.stringify(r); }).join(',\n') + '\n  ]' : '';
    s = s.replace('"__ROWS__"', rows);
    return esc(s).replace(/"([^"]+)":/g, '<span class="json-k">"$1"</span>:').replace(/: "([^"]*)"/g, ': <span class="json-s">"$1"</span>').replace(/: (-?\d[\d.]*)/g, ': <span class="json-n">$1</span>');
  }

  function renderResp() {
    var box = h('div', { class: 'card resp' });
    var bar = h('div', { class: 'bar' });
    var tabs = h('div', { class: 'tabs' }, [['res', '응답'], ['req', '요청']].map(function (t) { return h('button', { class: 'tab' + (tab === t[0] ? ' on' : ''), onclick: function () { tab = t[0]; render(); } }, [t[1]]); }));
    var meta = last ? h('div', { style: 'display:flex;gap:8px;align-items:center' }, [h('span', { class: 'chip ' + (last.status < 300 ? 'ok' : last.status === 202 ? 'warn' : 'err'), text: String(last.status) }), h('span', { class: 'hint mono', text: last.ms + ' ms' })]) : null;
    bar.append(tabs); if (meta) bar.append(meta);
    box.appendChild(bar);
    if (!last) { box.appendChild(h('div', { class: 'empty', text: '호출하면 응답이 여기에 표시됩니다' })); return box; }
    if (last.kind === 'job' && tab === 'res') {
      var j = jobs[last.body.job_id] || { status: 'queued' };
      box.appendChild(h('div', { class: 'jobbox' }, [h('div', {}, ['Job 등록됨 · ', h('code', { text: last.body.job_id }), ' · 상태 ', h('b', { text: j.status })]),
        h('button', { class: 'btn sm', onclick: function () { poll(last); } }, ['결과 조회'])]));
    }
    box.appendChild(h('div', { class: 'out' }, [h('pre', { class: 'pre', html: pretty(tab === 'req' ? { method: 'POST', path: path(), body: last.req } : last.body) })]));
    return box;
  }

  function poll(entry) {
    var id = entry.body.job_id, j = jobs[id] = jobs[id] || { status: 'queued', n: 0 };
    j.n++;
    if (j.n === 1) j.status = 'running';
    else {
      j.status = 'succeeded';
      var t = tools.filter(function (x) { return x.id === entry.tool; })[0];
      entry.body = { job_id: id, status: 'succeeded', result: wrap(t.result()) };
      entry.status = 200; entry.kind = 'ok'; Shell.toast('Job 완료');
    }
    if (j.status === 'running') { entry.body = { job_id: id, status: 'running', progress: 0.6 }; Shell.toast('실행 중 — 다시 조회해 보세요'); }
    render();
  }

  function call() {
    errs = {};
    cur.fields.forEach(function (f) { if (f.required && !String(vals[f.name] || '').trim()) errs[f.name] = '필수 값입니다'; });
    if (Object.keys(errs).length) {
      last = { tool: cur.id, status: 400, ms: 12, req: vals, body: { error: 'invalid_params', fields: Object.keys(errs) }, kind: 'err' };
      hist.unshift(last); tab = 'res'; render(); return;
    }
    busy = true; render();
    var started = Date.now(), snapshot = JSON.parse(JSON.stringify(vals)), t = cur;
    setTimeout(function () {
      busy = false;
      var ms = 180 + Math.round(Math.random() * 260);
      if (t.job) { var id = 'job_' + Math.random().toString(16).slice(2, 8); last = { tool: t.id, status: 202, ms: 90, req: snapshot, body: { job_id: id, status: 'queued', status_url: '/api/workflow/jobs/' + id }, kind: 'job' }; }
      else last = { tool: t.id, status: 200, ms: ms, req: snapshot, body: wrap(t.result()), kind: 'ok' };
      hist.unshift(last); tab = 'res'; render();
    }, 500 + Math.random() * 400);
  }

  function renderHist() {
    histEl.innerHTML = '';
    histEl.appendChild(h('div', { class: 'card-head', text: '최근 호출' }));
    var sc = h('div', { class: 'scroll', style: 'flex:1' });
    hist.forEach(function (x) {
      sc.appendChild(h('button', { class: 'row' + (x === last ? ' on' : ''), onclick: function () {
        var t = tools.filter(function (y) { return y.id === x.tool; })[0];
        if (t !== cur) { cur = t; vals = JSON.parse(JSON.stringify(x.req)); errs = {}; }
        last = x; tab = 'res'; render();
      } }, [h('div', { class: 'n', text: x.tool }), h('div', { class: 'm' }, [h('span', { class: 'chip ' + (x.status < 300 ? (x.status === 202 ? 'warn' : 'ok') : 'err'), text: String(x.status) }), x.ms + ' ms'])]));
    });
    histEl.appendChild(sc);
  }
  function render() { fillList(); renderCenter(); renderHist(); }
  renderList(); render();
})();
