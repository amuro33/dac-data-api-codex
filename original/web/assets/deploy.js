// 배포 화면 동작 (목업용). 상태: API/MCP 대상 선택, 동기/Job, 미리보기 탭.
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(s) { Object.assign(this.state, s); }
}
class Component extends DCLogic {
constructor(props) {
super(props);
this.state = { api: true, mcp: true, tab: 'openapi', mode: 'sync' };
}
renderVals() {
const api = this.state.api;
const mcp = this.state.mcp;
const tab = this.state.tab;
const isAsync = this.state.mode === 'async';
const openapi = [
'openapi: 3.1.0',
'info:',
'  title: Lot 수율 · 공정 이력 분석',
'  version: 1.0.0',
'paths:',
'  /api/workflow/lot_yield_equip:',
'    post:',
'      operationId: runLotYieldEquip',
'      requestBody:',
'        content:',
'          application/json:',
'            schema:',
'              type: object',
'              required: [lot_id, wafer_id, start_time, end_time]',
'              properties:',
'                lot_id: { type: string }',
'                wafer_id: { type: string }',
'                start_time: { type: string, format: date-time }',
'                end_time: { type: string, format: date-time }',
'      responses:',
'        "200":',
'          description: equip_id별 평균 수율'
].join('\n');
const openapiLines = openapi.split('\n');
const respIdx = openapiLines.indexOf('      responses:');
const openapiAsync = openapiLines.slice(0, respIdx).concat([
'      responses:',
'        "202":',
'          description: Job 접수 (job_id 반환)',
'  /api/workflow/jobs/{job_id}:',
'    get:',
'      operationId: getJobResult',
'      responses:',
'        "200":',
'          description: 상태와 결과'
]).join('\n');
const mcpSchema = [
'{',
'  "name": "get_lot_yield_by_equipment",',
'  "description": "Lot·웨이퍼의 기간별 수율을 장비별로 집계",',
'  "inputSchema": {',
'    "type": "object",',
'    "required": ["lot_id", "wafer_id", "start_time", "end_time"],',
'    "properties": {',
'      "lot_id": { "type": "string" },',
'      "wafer_id": { "type": "string" },',
'      "start_time": { "type": "string", "format": "date-time" },',
'      "end_time": { "type": "string", "format": "date-time" }',
'    }',
'  }',
'}'
].join('\n');
const noTarget = !api && !mcp;
let label = 'API + MCP 배포하기';
if (api && !mcp) label = 'API로 배포하기';
if (!api && mcp) label = 'MCP로 배포하기';
if (noTarget) label = '배포 대상을 선택하세요';
return {
isAsync: isAsync,
setSync: () => this.setState({ mode: 'sync' }),
setAsync: () => this.setState({ mode: 'async' }),
syncBorder: isAsync ? '#d6dae1' : '#4f46e5',
syncBg: isAsync ? '#ffffff' : '#f5f6ff',
asyncBorder: isAsync ? '#4f46e5' : '#d6dae1',
asyncBg: isAsync ? '#f5f6ff' : '#ffffff',
apiOn: api,
mcpOn: mcp,
toggleApi: () => this.setState({ api: !this.state.api }),
toggleMcp: () => this.setState({ mcp: !this.state.mcp }),
apiBorder: api ? '#4f46e5' : '#d6dae1',
apiBg: api ? '#f5f6ff' : '#ffffff',
apiCheck: api ? '#4f46e5' : '#ffffff',
apiMark: api ? 1 : 0,
mcpBorder: mcp ? '#4f46e5' : '#d6dae1',
mcpBg: mcp ? '#f5f6ff' : '#ffffff',
mcpCheck: mcp ? '#4f46e5' : '#ffffff',
mcpMark: mcp ? 1 : 0,
apiFields: [
{ label: 'api_id', value: 'lot_yield_equip' },
{ label: '호출 경로', value: '/api/workflow/lot_yield_equip' },
{ label: '메서드', value: 'POST' },
{ label: '워크스페이스', value: 'MFG Analytics' }
],
mcpFields: [
{ label: 'MCP 서버', value: 'mes-analytics' },
{ label: '툴 이름', value: 'get_lot_yield_by_equipment' }
],
vars: [
{ name: 'lot_id', type: 'string', node: '수율 요약 조회', sample: 'L24A0815' },
{ name: 'wafer_id', type: 'string', node: '수율 요약 조회', sample: 'W07' },
{ name: 'start_time', type: 'datetime', node: '공정 이력 조회', sample: '2026-10-01T00:00:00Z' },
{ name: 'end_time', type: 'datetime', node: '공정 이력 조회', sample: '2026-10-20T00:00:00Z' }
],
showOpenapi: () => this.setState({ tab: 'openapi' }),
showMcp: () => this.setState({ tab: 'mcp' }),
tabIsOpenapi: tab === 'openapi',
tabIsMcp: tab === 'mcp',
tabOpenapiBg: tab === 'openapi' ? '#eef2ff' : 'transparent',
tabOpenapiFg: tab === 'openapi' ? '#4338ca' : '#475569',
tabMcpBg: tab === 'mcp' ? '#eef2ff' : 'transparent',
tabMcpFg: tab === 'mcp' ? '#4338ca' : '#475569',
preview: tab === 'openapi' ? (isAsync ? openapiAsync : openapi) : (isAsync ? mcpSchema.replace('장비별로 집계",','장비별로 집계 (Job 접수 후 job_id 반환)",') : mcpSchema),
checks: [
'테스트 실행 성공 (1.42s · 4행)',
'필수 변수 4개 정의 완료',
'사용한 Data API 2개 모두 배포 상태'
],
deployBg: noTarget ? '#64748b' : '#4f46e5',
deployLabel: label
};
}
}

const inst = new Component({});
window.PAGE = {
  values: () => inst.renderVals(),
  actions: new Proxy({}, { get: (_, name) => () => inst.renderVals()[name]() })
};
