(function () {
  var all = MOCK.workflows, PAGE = 10;
  var state = { tab: 'all', q: '', page: 1 };
  var ui = Shell.mount({ active: 'wf', title: 'Data Workflow', desc: 'Data API를 엮어 API나 MCP로 배포한 목록입니다' });
  ui.actions.appendChild(h('a', { class: 'btn primary big', href: 'editor.html', html: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>새 Data Workflow' }));
  ui.main.classList.add('wf-main');

  var kpis = h('div', { class: 'kpis' });
  var list = h('div', { class: 'card list' });
  ui.main.append(kpis, list);

  var STATUS = { dep: ['배포됨', 'ok'], draft: ['초안', 'accent'], warn: ['확인 필요', 'warn'] };
  function count(f) { return all.filter(f).length; }
  function matches(w) {
    if (state.tab === 'dep' && w.status !== 'dep') return false;
    if (state.tab === 'draft' && w.status !== 'draft') return false;
    if (state.tab === 'warn' && w.status !== 'warn') return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    return (w.id + ' ' + w.desc + ' ' + w.tool + ' /api/workflow/' + w.id).toLowerCase().indexOf(q) >= 0;
  }
  function fmt(n) { return n == null ? '—' : n.toLocaleString('en-US'); }

  function renderKpis() {
    var dep = all.filter(function (w) { return w.status === 'dep'; });
    var calls = all.reduce(function (s, w) { return s + (w.calls || 0); }, 0);
    var cards = [
      ['전체 Data Workflow', all.length, '내 워크스페이스'],
      ['배포됨', dep.length, 'API ' + dep.filter(function (w) { return w.api; }).length + ' · MCP ' + dep.filter(function (w) { return w.mcp; }).length],
      ['최근 24시간 호출', fmt(calls), '실패 0.4%'],
      ['확인 필요', count(function (w) { return w.status === 'warn'; }), '연결된 Data API 상태']
    ];
    kpis.innerHTML = '';
    cards.forEach(function (c) {
      kpis.appendChild(h('div', { class: 'card kpi' }, [h('div', { class: 'l', text: c[0] }), h('div', { class: 'v', text: String(c[1]) }), h('div', { class: 's', text: c[2] })]));
    });
  }

  var tabsEl, bodyEl, pagerEl, searchInput;
  function build() {
    tabsEl = h('div', { class: 'tabs' });
    searchInput = h('input', { placeholder: '이름, 경로, 툴 이름 검색', oninput: function (e) { state.q = e.target.value; state.page = 1; render(); } });
    list.append(
      h('div', { class: 'list-bar' }, [tabsEl, h('label', { class: 'search', html: '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.2 9.2L12 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' }, [searchInput])]),
      h('div', { class: 'grid thead' }, ['Data Workflow', '상태', '배포 대상', '호출 주소 · 툴', '버전', '24시간 호출', '배포자', '수정'].map(function (t) { return h('div', { text: t }); })),
      bodyEl = h('div', { class: 'scroll', style: 'flex:1' }),
      pagerEl = h('div', { class: 'pager' })
    );
  }

  function renderTabs() {
    var defs = [['all', '전체', all.length], ['dep', '배포됨', count(function (w) { return w.status === 'dep'; })], ['draft', '초안', count(function (w) { return w.status === 'draft'; })], ['warn', '확인 필요', count(function (w) { return w.status === 'warn'; })]];
    tabsEl.innerHTML = '';
    defs.forEach(function (d) {
      tabsEl.appendChild(h('button', { class: 'tab' + (state.tab === d[0] ? ' on' : ''), onclick: function () { state.tab = d[0]; state.page = 1; render(); } }, [d[1], h('small', { text: String(d[2]) })]));
    });
  }

  function row(w) {
    var st = STATUS[w.status];
    var chips = [];
    if (w.api) chips.push(h('span', { class: 'chip mono blue', text: 'API' }));
    if (w.mcp) chips.push(h('span', { class: 'chip mono accent', text: 'MCP' }));
    if (w.job) chips.push(h('span', { class: 'chip mono warn', text: 'Job' }));
    if (!chips.length) chips.push(h('span', { class: 'hint', style: 'font-size:12px', text: '미배포' }));
    var a1 = w.api ? '/api/workflow/' + w.id : (w.tool || '—');
    var a2 = w.api && w.tool ? w.tool : '';
    return h('a', { class: 'grid trow' + (w.status === 'draft' && w.id === 'lot_yield_equip' ? ' cur' : ''), href: 'editor.html' }, [
      h('div', { class: 'name-cell' }, [
        h('span', { class: 'wf-ico', html: '<svg width="13" height="13" viewBox="0 0 18 18"><circle cx="4" cy="9" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="14" cy="4" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="14" cy="14" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 9h2c2 0 2-5 4-5M8 9c2 0 2 5 4 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' }),
        h('div', { style: 'min-width:0;flex:1' }, [h('div', { class: 'id', text: w.id }), h('div', { class: 'd', text: w.desc })])
      ]),
      h('div', {}, [h('span', { class: 'chip ' + st[1], style: 'font-size:12px;padding:3px 10px', text: st[0] + (w.id === 'lot_yield_equip' ? ' · 편집 중' : '') })]),
      h('div', { class: 'chips' }, chips),
      h('div', {}, [h('div', { class: 'addr', text: a1 }), a2 ? h('div', { class: 'addr', text: a2 }) : null]),
      h('div', { class: 'num', text: w.ver }),
      h('div', { class: 'num', text: fmt(w.calls) }),
      h('div', { class: 'who' }, [h('i', { text: w.who[0] }), h('span', { text: w.who })]),
      h('div', { class: 'when', text: w.when })
    ]);
  }

  function render() {
    renderKpis(); renderTabs();
    var rows = all.filter(matches), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page > pages) state.page = pages;
    var from = (state.page - 1) * PAGE, cur = rows.slice(from, from + PAGE);
    bodyEl.innerHTML = '';
    if (!cur.length) bodyEl.appendChild(h('div', { class: 'empty', text: '조건에 맞는 Data Workflow가 없어요' }));
    cur.forEach(function (w) { bodyEl.appendChild(row(w)); });
    pagerEl.innerHTML = '';
    var pg = h('div', { class: 'pg' });
    pg.appendChild(h('button', { text: '‹', disabled: state.page === 1, onclick: function () { state.page--; render(); } }));
    for (var i = 1; i <= pages; i++) (function (n) { pg.appendChild(h('button', { class: n === state.page ? 'on' : '', text: String(n), onclick: function () { state.page = n; render(); } })); })(i);
    pg.appendChild(h('button', { text: '›', disabled: state.page === pages, onclick: function () { state.page++; render(); } }));
    pagerEl.append(h('span', { text: rows.length ? rows.length + '개 중 ' + (from + 1) + '–' + (from + cur.length) : '0개' }), pg);
  }
  build(); render();
})();
