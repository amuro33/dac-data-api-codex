// 목업용 데이터 (실제 값 아님)
window.MOCK = (function () {
  var equipRows = [['EQ-201', 38, 0.921, 6], ['EQ-207', 41, 0.934, 5], ['EQ-114', 29, 0.941, 3], ['EQ-302', 22, 0.948, 2]];

  // ── 도구 ─────────────────────────────────────────────
  // fields: name, type(string|datetime|integer), required, def
  var tools = [
    { id: 'get_lot_yield_by_equipment', group: 'mes-analytics', kind: 'Data Workflow', job: false,
      desc: 'Lot·웨이퍼의 기간별 수율을 장비(equip_id)별로 집계해 반환합니다. 수율 0.95 미만 Lot만 포함합니다.',
      fields: [
        { name: 'lot_id', type: 'string', required: true, def: 'LOT-1199' },
        { name: 'wafer_id', type: 'string', required: true, def: 'ALL' },
        { name: 'start_time', type: 'datetime', required: true, def: '2026-10-19T14:00' },
        { name: 'end_time', type: 'datetime', required: true, def: '2026-10-20T14:00' }],
      result: function () { return { columns: ['equip_id', 'lot_cnt', 'avg_yield', 'out_lot'], rows: equipRows }; } },
    { id: 'get_equip_defect_pareto', group: 'mes-analytics', kind: 'Data Workflow', job: true,
      desc: '기간별 불량 유형을 건수 순으로 정렬해 상위 N개를 돌려줍니다. 오래 걸려 Job으로 실행됩니다.',
      fields: [
        { name: 'start_date', type: 'string', required: true, def: '2026-10-01' },
        { name: 'end_date', type: 'string', required: true, def: '2026-10-20' },
        { name: 'top_n', type: 'integer', required: false, def: '5' }],
      result: function () { return { columns: ['defect_type', 'cnt', 'ratio'], rows: [['PARTICLE', 412, 0.31], ['SCRATCH', 288, 0.22], ['PATTERN_OPEN', 197, 0.15], ['RESIDUE', 143, 0.11], ['ETC', 276, 0.21]] }; } },
    { id: 'trace_lot_route', group: 'mes-analytics', kind: 'Data Workflow', job: true,
      desc: 'Lot 하나가 거친 공정 이동 이력과 단계별 체류 시간을 돌려줍니다. Job으로 실행됩니다.',
      fields: [{ name: 'lot_id', type: 'string', required: true, def: 'LOT-1199' }],
      result: function () { return { columns: ['seq', 'step', 'equip_id', 'wait_min'], rows: [[1, 'CLEAN', 'EQ-011', 12], [2, 'DEPO', 'EQ-114', 47], [3, 'LITHO', 'EQ-207', 63], [4, 'ETCH', 'EQ-201', 31]] }; } },
    { id: 'get_cycle_time', group: 'mes-analytics', kind: 'Data Workflow', job: false,
      desc: '공정 단계별 평균 처리 시간(분)을 돌려줍니다.',
      fields: [
        { name: 'process_step', type: 'string', required: false, def: '' },
        { name: 'start_date', type: 'string', required: true, def: '2026-10-13' },
        { name: 'end_date', type: 'string', required: true, def: '2026-10-20' }],
      result: function () { return { columns: ['process_step', 'avg_min', 'p95_min'], rows: [['CLEAN', 14.2, 21], ['DEPO', 52.8, 71], ['LITHO', 66.1, 94], ['ETCH', 35.4, 48]] }; } },
    { id: 'get_wafer_yield_summary', group: 'Data API', kind: 'Data API', job: false,
      desc: '웨이퍼 단위 수율을 일자·공정·레시피별로 집계해 양품·불량 비율을 비교합니다.',
      fields: [
        { name: 'lot_id', type: 'string', required: true, def: 'LOT-1199' },
        { name: 'factory_id', type: 'string', required: false, def: 'F02' }],
      result: function () { return { columns: ['wafer_id', 'yield_rate', 'defect_cnt'], rows: [['W01', 0.962, 3], ['W02', 0.951, 5], ['W03', 0.917, 11], ['W04', 0.944, 6]] }; } },
    { id: 'search_sql_candidates', group: 'Data API', kind: 'SQL 추천', job: false,
      desc: '자연어 키워드로 등록된 SQL 후보를 찾아 줍니다.',
      fields: [{ name: 'keyword', type: 'string', required: true, def: '수율' }],
      result: function () { return { columns: ['api_id', 'title', 'score'], rows: [['wafer_yield_summary', '웨이퍼 수율 요약', 0.93], ['lot_process_history', '공정 이력 조회', 0.71]] }; } },
    { id: 'RV 메시지 송수신', group: 'mes-control', kind: '제어 API · 준비 중', job: false, disabled: true, desc: '', fields: [], result: function () { return {}; } }
  ];
  var groups = [
    { id: 'mes-analytics', tag: 'MCP · 연결됨' },
    { id: 'Data API', tag: '배포된 API' },
    { id: 'mes-control', tag: '제어 API · 준비 중' }
  ];

  // ── Agent ────────────────────────────────────────────
  var agents = [
    { name: 'lot-yield-assistant', desc: 'Lot 수율 장비별 분석', status: 'draft', model: 'claude-sonnet', schedule: false,
      prompt: '반도체 공정 수율을 분석하는 도우미입니다. 장비와 Lot에 대한 질문은 툴로 조회한 값만 근거로 답하고, 조회 결과가 없으면 없다고 말하세요.',
      tools: ['get_lot_yield_by_equipment', 'get_equip_defect_pareto', 'get_wafer_yield_summary'], messages: 'seed' },
    { name: 'daily-yield-report', desc: '매일 08:00 전일 수율 요약', status: 'saved', model: 'claude-sonnet', schedule: true,
      prompt: '매일 아침 전일 수율과 불량 상위 유형을 3줄로 요약해 보고하세요. 수치는 반드시 툴 결과를 인용하세요.',
      tools: ['get_wafer_yield_summary', 'get_equip_defect_pareto'], messages: [] },
    { name: 'equip-alarm-helper', desc: '설비 알람 원인 후보 정리', status: 'saved', model: 'claude-opus', schedule: false,
      prompt: '설비 알람이 발생하면 최근 Lot 이동 경로와 공정 시간을 조회해 원인 후보를 정리하세요. 추측은 추측이라고 표시하세요.',
      tools: ['trace_lot_route', 'get_cycle_time'], messages: [] },
    { name: 'wip-qa-bot', desc: '재공 현황 질의응답', status: 'saved', model: 'claude-haiku', schedule: false,
      prompt: '재공(WIP) 현황에 대한 질문에 간단히 답하세요.',
      tools: ['get_cycle_time'], messages: [] },
    { name: 'quality-trend-analyst', desc: '품질 추세 이상 탐지', status: 'saved', model: 'claude-sonnet', schedule: false,
      prompt: '품질 지표의 주간 추세를 비교하고 평소보다 벗어난 항목을 알려주세요.',
      tools: ['get_equip_defect_pareto', 'get_lot_yield_by_equipment'], messages: [] },
    { name: 'shift-handover-note', desc: '교대 인수인계 메모 작성', status: 'saved', model: 'claude-sonnet', schedule: false,
      prompt: '교대 시간에 맞춰 직전 근무조의 주요 이슈를 인수인계 메모로 정리하세요.',
      tools: ['get_equip_defect_pareto', 'get_cycle_time'], messages: [] }
  ];

  // ── 워크플로우 목록 ──────────────────────────────────
  function wf(id, desc, st, t, ver, calls, who, when, tool) {
    return { id: id, desc: desc, status: st, api: t.indexOf('a') >= 0, mcp: t.indexOf('m') >= 0, job: t.indexOf('j') >= 0, tool: tool || '', ver: ver, calls: calls, who: who, when: when };
  }
  var workflows = [
    wf('lot_yield_equip', '장비별 평균 수율과 이상 Lot', 'draft', '', 'v1', null, '강환웅', '14:52'),
    wf('equip_defect_pareto', '기간별 불량 유형 상위 N개', 'dep', 'amj', 'v4', 5284, '김지훈', '어제', 'get_equip_defect_pareto'),
    wf('daily_wip', '공정별 재공 수량 합계', 'dep', 'a', 'v2', 3436, '박서연', '10/17'),
    wf('recipe_change_impact', '레시피 변경 전후 수율 비교', 'dep', 'm', 'v1', 92, '이도현', '10/15', 'compare_recipe_change'),
    wf('equip_status', '설비별 현재 상태와 알람 수', 'warn', 'a', 'v3', 0, '김지훈', '10/12', 'Data API 1개 배포 취소됨'),
    wf('lot_trace', 'Lot별 공정 이동 이력과 체류 시간', 'dep', 'amj', 'v6', 2051, '최민준', '10/20', 'trace_lot_route'),
    wf('pm_overdue', '점검 주기를 넘긴 설비 목록', 'dep', 'a', 'v3', 1118, '정하은', '10/19'),
    wf('cycle_time', '공정 단계별 평균 처리 시간', 'dep', 'am', 'v2', 864, '박서연', '10/18', 'get_cycle_time'),
    wf('material_low_stock', '안전 재고 미만 자재와 담당자', 'draft', '', 'v1', null, '이도현', '10/16'),
    wf('wafer_defect_summary', 'Wafer별 불량 좌표 분포 집계', 'warn', 'm', 'v2', 41, '최민준', '10/14', 'Data API 2개 상태 확인 필요'),
    wf('line_balance_daily', '라인별 일일 처리량 균형', 'dep', 'a', 'v5', 1520, '정하은', '10/13'),
    wf('recipe_param_diff', '레시피 파라미터 변경 이력 비교', 'dep', 'am', 'v2', 388, '이도현', '10/13', 'diff_recipe_param'),
    wf('fab_wip_summary', '공정별 재공 현황 요약', 'dep', 'a', 'v4', 972, '박서연', '10/12'),
    wf('equip_downtime_daily', '설비별 일일 비가동 시간', 'dep', 'am', 'v3', 745, '김지훈', '10/11', 'get_equip_downtime'),
    wf('defect_map_summary', '불량 맵 영역별 요약', 'dep', 'aj', 'v1', 63, '최민준', '10/10'),
    wf('lot_hold_list', '현재 Hold 상태 Lot 목록', 'dep', 'a', 'v2', 1304, '정하은', '10/10'),
    wf('pm_schedule_next', '다음 PM 예정 설비', 'dep', 'a', 'v1', 218, '김지훈', '10/09'),
    wf('yield_trend_weekly', '주간 수율 추세', 'dep', 'amj', 'v3', 509, '박서연', '10/08', 'get_yield_trend'),
    wf('chamber_match_check', '챔버 간 편차 점검', 'warn', 'a', 'v1', 0, '이도현', '10/07', 'Data API 1개 배포 취소됨'),
    wf('queue_time_alert', '큐 타임 초과 대상 Lot', 'dep', 'am', 'v2', 826, '최민준', '10/06', 'get_queue_time_alert'),
    wf('shift_output_report', '교대별 생산량 보고', 'dep', 'a', 'v2', 1190, '정하은', '10/05'),
    wf('spc_violation_list', 'SPC 규칙 위반 목록', 'draft', '', 'v1', null, '김지훈', '10/05'),
    wf('wafer_scrap_reason', 'Wafer 스크랩 사유 분류', 'draft', '', 'v2', null, '박서연', '10/03'),
    wf('tool_utilization', '설비 가동률', 'dep', 'a', 'v3', 2406, '이도현', '10/02')
  ];

  return { tools: tools, groups: groups, agents: agents, workflows: workflows, equipRows: equipRows };
})();
