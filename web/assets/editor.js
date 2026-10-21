// 에디터 인터랙션: 노드 선택 → 오른쪽 설정 패널 전환, 노드 설정 변경 → 캔버스 노드 반영
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };

  var APIS = {
    wafer_yield_summary: { title: '수율 요약 조회', desc: '웨이퍼 수율 집계', ver: 'v3', db: 'MESDB_F02', params: [['lot_id', '필수', 'start.lot_id'], ['wafer_id', '필수', 'start.wafer_id'], ['factory_id', '선택', 'F02']], cols: ['lot_id', 'wafer_id', 'yield_rate', 'defect_cnt', 'process_step'], time: '0.8s',
      sql: 'SELECT lot_id, wafer_id,\n       yield_rate, defect_cnt\n  FROM WAFER_YIELD\n WHERE lot_id   = :lot_id\n   AND wafer_id = :wafer_id\n   AND factory_id = :factory_id' },
    lot_process_history: { title: '공정 이력 조회', desc: 'Lot 공정 이력', ver: 'v2', db: 'MESDB_F02', params: [['start_time', '필수', 'start.start_time'], ['end_time', '필수', 'start.end_time']], cols: ['lot_id', 'step', 'equip_id', 'move_time'], time: '0.6s',
      sql: 'SELECT lot_id, step, equip_id,\n       move_time\n  FROM LOT_HISTORY\n WHERE move_time BETWEEN :start_time\n                     AND :end_time' },
    equip_status_now: { title: '설비 현재 상태', desc: '설비 현재 상태', ver: 'v5', db: 'MESDB_F02', params: [['equip_id', '선택', '—']], cols: ['equip_id', 'state', 'alarm_cnt'], time: '0.4s',
      sql: 'SELECT equip_id, state, alarm_cnt\n  FROM EQUIP_STATE\n WHERE equip_id = NVL(:equip_id, equip_id)' },
    defect_pareto: { title: '불량 유형 파레토', desc: '불량 유형 파레토', ver: 'v1', db: 'MESDB_F02', params: [['start_date', '필수', 'start.start_time']], cols: ['defect_type', 'cnt', 'ratio'], time: '1.1s',
      sql: 'SELECT defect_type, COUNT(*) cnt\n  FROM DEFECT\n WHERE found_at >= :start_date\n GROUP BY defect_type' },
    fab_wip_summary: { title: '재공 현황 요약', desc: '공정별 재공 현황', ver: 'v4', db: 'MESDB_F02', params: [], cols: ['step', 'wip_qty'], time: '0.5s',
      sql: 'SELECT step, SUM(qty) wip_qty\n  FROM WIP\n GROUP BY step' }
  };
  var DEPLOYED = Object.keys(APIS);
  var NOTDEP = { recipe_param_diff: '레시피 파라미터 비교' };

  var nodes = {
    start: { type: 'START', node: $('.c2e'), params: [['lot_id', 'string'], ['wafer_id', 'string'], ['start_time', 'datetime'], ['end_time', 'datetime']] },
    dac1: { type: 'DAC', node: $('.c2n'), api: 'wafer_yield_summary', open: false },
    dac2: { type: 'DAC', node: $('.c2u'), api: 'lot_process_history', open: false },
    join: { type: 'JOIN', node: $('.c2v'), kind: 'INNER', key: 'lot_id' },
    filter: { type: 'Filter', node: $('.c2z'), col: 'yield', op: '<', val: '0.95' },
    group: { type: 'Group By', node: $('.c30'), by: 'equip_id', aggs: ['AVG(yield)', 'COUNT(*)'] },
    end: { type: 'END', node: $('.c31'), cols: ['equip_id', 'lot_cnt', 'avg_yield', 'out_lot'] }
  };
  var sel = 'dac1', aside = $('.c3h');

  Object.keys(nodes).forEach(function (id) {
    var n = nodes[id].node;
    n.style.cursor = 'pointer'; n.style.transition = 'box-shadow .12s, border-color .12s'; n.dataset.node = id;
    n.addEventListener('click', function (e) { e.stopPropagation(); select(id); });
  });
  var canvas = $('.c24'); if (canvas) canvas.addEventListener('click', function () { /* 빈 곳 클릭: 선택 유지 */ });

  function paintSel() {
    Object.keys(nodes).forEach(function (id) {
      var s = nodes[id].node.style, on = id === sel;
      s.border = on ? '2px solid #6366f1' : '1px solid #d6dae1';
      s.boxShadow = on ? '0 0 0 4px rgba(99,102,241,0.22), 0 8px 24px rgba(15,23,42,0.08)' : '0 1px 2px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.04)';
      s.zIndex = on ? 2 : '';
    });
  }
  function select(id) { sel = id; paintSel(); renderPanel(); }

  // ── 캔버스 노드 텍스트 갱신 ─────────────────────────
  function syncNode(id) {
    var d = nodes[id], n = d.node;
    if (d.type === 'DAC') {
      var a = APIS[d.api];
      $('.c2r', n).textContent = a.title; $('.c2s', n).textContent = d.api;
      $('.c2t', n).innerHTML = a.params.map(function (p) { return p[0] + (p[2].indexOf('start.') === 0 ? ' ← START' : p[2] === '—' ? ' (선택)' : ' = ' + esc(p[2])); }).join('<br>') || '파라미터 없음';
      var q = $('.c2q', n); if (q) q.textContent = a.time;
    } else if (d.type === 'JOIN') {
      $('.c2y', n).textContent = 'DuckDB · ' + d.kind; $('.c2t', n).innerHTML = 'ON ' + esc(d.key) + '<br>= ' + esc(d.key);
    } else if (d.type === 'Filter') {
      $('.c2t', n).textContent = d.col + ' ' + d.op + ' ' + d.val;
    } else if (d.type === 'Group By') {
      $('.c2t', n).textContent = 'BY ' + d.by;
    } else if (d.type === 'END') {
      $('.c2y', n).textContent = '출력 ' + d.cols.length + '열';
    }
  }

  // ── 패널 조각 ─────────────────────────────────────────
  function header(badge, badgeStyle, title, sub) {
    return '<div class="c3i"><div class="c3j" style="' + badgeStyle + '">' + badge + '</div><div class="ch"><div class="c3k">' + title + '</div><div class="cj">' + sub + '</div></div></div>';
  }
  function section(title, right, body) {
    return '<div class="c3m"><div class="c3n"><div class="c3o">' + title + '</div>' + (right || '') + '</div>' + body + '</div>';
  }
  function pills(list, on, attr) {
    return '<div class="c4h" style="gap:6px">' + list.map(function (x) {
      return '<button data-' + attr + '="' + esc(x) + '" style="font:500 12px \'Geist Mono\',monospace;padding:6px 12px;border-radius:8px;cursor:pointer;border:1px solid ' + (x === on ? '#6366f1;background:#eef2ff;color:#4338ca' : '#e6e8ec;background:#fff;color:#475569') + '">' + esc(x) + '</button>';
    }).join('') + '</div>';
  }
  var INP = 'style="width:100%;box-sizing:border-box;height:36px;border:1px solid #e6e8ec;border-radius:10px;background:#f4f6f8;padding:0 10px;font:13px \'Geist Mono\',monospace"';

  function dacPanel(id) {
    var d = nodes[id], a = APIS[d.api], list = '';
    DEPLOYED.forEach(function (k) {
      var on = k === d.api;
      list += '<div class="' + (on ? 'c3w' : 'c40') + '" data-api="' + k + '" style="cursor:pointer"><div class="c3x"><div class="' + (on ? 'c3y' : 'c41') + '">' + k + '</div><div class="c2y">' + APIS[k].desc + '</div></div><span class="' + (on ? 'c3z' : 'c42') + '">' + APIS[k].ver + (on ? ' · 선택됨' : ' · 배포됨') + '</span></div>';
    });
    Object.keys(NOTDEP).forEach(function (k) { list += '<div class="c43"><div class="c3x"><div class="c41">' + k + '</div><div class="c2y">' + NOTDEP[k] + '</div></div><span class="c44">미배포</span></div>'; });
    var combo = d.open
      ? '<div class="c3q"><div class="c3r" data-toggle style="cursor:pointer"><div class="c3s">' + d.api + '</div><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 9l4-4 4 4" fill="none" stroke="#475569" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="c3v">' + list + '</div><div class="c45">배포된 API만 선택할 수 있어요 · 내 워크스페이스 6개</div></div>'
      : '<div class="c3r" data-toggle style="cursor:pointer;border:1px solid #d6dae1;border-radius:12px"><div class="c3s">' + d.api + '</div><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 5l4 4 4-4" fill="none" stroke="#475569" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
    var params = a.params.map(function (p) {
      return '<div class="c4a"><div class="c4b"><div class="c4c">' + p[0] + '</div><div class="c2y">string · ' + p[1] + '</div></div><span class="' + (p[2].indexOf('start.') === 0 ? 'c4d' : 'c4e') + '">' + esc(p[2]) + '</span></div>';
    }).join('') || '<div class="cj">연결할 파라미터가 없어요</div>';
    return header('DAC', '', a.title, 'Data API 노드') + '<div class="c3l">' +
      section('API 선택', '<span class="c3p">MFG Analytics</span>', combo) +
      section('API 정보', '<span class="c46">Oracle 19c</span>', '<div class="c47"><span class="c2m">DB</span><span class="c48">' + a.db + '</span></div><pre class="c49">' + esc(a.sql) + '</pre>') +
      section('파라미터 연결', '', params) +
      section('출력 컬럼', '', '<div class="c4f">' + a.cols.map(function (c) { return '<span class="c4g">' + c + '</span>'; }).join('') + '</div>') +
      section('실행 옵션', '', '<div class="c4h"><div class="c4i"><div class="c2y">타임아웃</div><div class="c4j">30s</div></div><div class="c4i"><div class="c2y">DuckDB 적재 한도</div><div class="c4j">100,000행</div></div></div>') + '</div>';
  }
  var DUCK = 'background:#fef3c7;color:#92400e';
  function panelHtml() {
    var d = nodes[sel];
    if (d.type === 'DAC') return dacPanel(sel);
    if (d.type === 'START') return header('START', 'background:#eef2ff;color:#4338ca', '입력 노드', '요청 body로 받는 값') + '<div class="c3l">' +
      section('입력 파라미터', '<span class="c3p">' + d.params.length + '개</span>', d.params.map(function (p) { return '<div class="c4a"><div class="c4b"><div class="c4c">' + p[0] + '</div><div class="c2y">' + p[1] + ' · 필수</div></div><span class="c4e">body</span></div>'; }).join('')) +
      section('호출 예시', '', '<pre class="c49">POST /api/workflow/lot_yield_equip\n{\n  "lot_id": "LOT-1199",\n  "wafer_id": "ALL",\n  "start_time": "2026-10-19T14:00",\n  "end_time": "2026-10-20T14:00"\n}</pre>') + '</div>';
    if (d.type === 'JOIN') return header('JOIN', DUCK, 'DuckDB JOIN', '두 노드의 결과를 합칩니다') + '<div class="c3l">' +
      section('조인 방식', '', pills(['INNER', 'LEFT', 'RIGHT', 'FULL'], d.kind, 'kind')) +
      section('조인 키', '', '<div class="c4a"><div class="c4b"><div class="c4c">' + nodes.dac1.api + '</div><div class="c2y">왼쪽</div></div><span class="c4d">' + d.key + '</span></div><div class="c4a"><div class="c4b"><div class="c4c">' + nodes.dac2.api + '</div><div class="c2y">오른쪽</div></div><span class="c4d">' + d.key + '</span></div>') +
      section('생성 SQL', '', '<pre class="c49">SELECT *\n  FROM a\n ' + d.kind + ' JOIN b\n    ON a.' + d.key + ' = b.' + d.key + '</pre>') + '</div>';
    if (d.type === 'Filter') return header('Filter', DUCK, 'DuckDB Filter', '조건에 맞는 행만 남깁니다') + '<div class="c3l">' +
      section('조건', '', '<div style="display:flex;gap:6px"><input data-f="col" value="' + esc(d.col) + '" ' + INP + '><select data-f="op" ' + INP.replace('width:100%', 'width:72px') + '>' + ['<', '<=', '=', '>=', '>', '<>'].map(function (o) { return '<option' + (o === d.op ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select><input data-f="val" value="' + esc(d.val) + '" ' + INP.replace('width:100%', 'width:90px') + '></div>') +
      section('생성 SQL', '', '<pre class="c49" id="fsql">WHERE ' + esc(d.col) + ' ' + esc(d.op) + ' ' + esc(d.val) + '</pre>') + '</div>';
    if (d.type === 'Group By') return header('GROUP', DUCK, 'DuckDB Group By', '컬럼별로 묶어 집계합니다') + '<div class="c3l">' +
      section('그룹 기준', '', pills(['equip_id', 'lot_id', 'step', 'wafer_id'], d.by, 'by')) +
      section('집계', '', pills(['AVG(yield)', 'COUNT(*)', 'SUM(defect_cnt)', 'MIN(yield)'], '', 'agg').replace(/data-agg="([^"]+)"/g, function (m, v) { return m + (d.aggs.indexOf(v) >= 0 ? ' data-on="1"' : ''); })) +
      section('생성 SQL', '', '<pre class="c49">SELECT ' + d.by + ', ' + d.aggs.join(', ') + '\n  FROM t\n GROUP BY ' + d.by + '</pre>') + '</div>';
    return header('END', 'background:#e2e8f0;color:#334155', '출력 노드', 'API · MCP 응답 컬럼') + '<div class="c3l">' +
      section('출력 컬럼', '<span class="c3p">' + d.cols.length + '개</span>', '<div class="c4f">' + d.cols.map(function (c) { return '<span class="c4g">' + c + '</span>'; }).join('') + '</div>') +
      section('응답 형태', '', '<pre class="c49">{ "columns": [...],\n  "rows": [[...], ...] }</pre>') + '</div>';
  }

  function renderPanel() {
    aside.innerHTML = panelHtml();
    var d = nodes[sel];
    aside.querySelectorAll('[data-toggle]').forEach(function (b) { b.onclick = function () { d.open = !d.open; renderPanel(); }; });
    aside.querySelectorAll('[data-api]').forEach(function (r) { r.onclick = function () { d.api = r.dataset.api; d.open = false; syncNode(sel); renderPanel(); }; });
    aside.querySelectorAll('[data-kind]').forEach(function (b) { b.onclick = function () { d.kind = b.dataset.kind; syncNode(sel); renderPanel(); }; });
    aside.querySelectorAll('[data-by]').forEach(function (b) { b.onclick = function () { d.by = b.dataset.by; syncNode(sel); renderPanel(); }; });
    aside.querySelectorAll('[data-agg]').forEach(function (b) { b.onclick = function () { var i = d.aggs.indexOf(b.dataset.agg); if (i >= 0) { if (d.aggs.length > 1) d.aggs.splice(i, 1); } else d.aggs.push(b.dataset.agg); renderPanel(); }; });
    aside.querySelectorAll('[data-agg][data-on]').forEach(function (b) { b.style.border = '1px solid #6366f1'; b.style.background = '#eef2ff'; b.style.color = '#4338ca'; });
    aside.querySelectorAll('[data-f]').forEach(function (i) {
      i.addEventListener('input', function () { d[i.dataset.f] = i.value; syncNode(sel); var s = $('#fsql'); if (s) s.textContent = 'WHERE ' + d.col + ' ' + d.op + ' ' + d.val; });
    });
  }

  // 헤더의 제목 칩이 선택 노드 이름을 보여주도록 최초 동기화
  Object.keys(nodes).forEach(syncNode);
  paintSel(); renderPanel();
})();
