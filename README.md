# MES API Platform — 실행 가능한 프로토타입 v0.2

클로드 원본의 화면 구성을 바탕으로 구현한 로컬 웹 애플리케이션입니다.
**데이터만 합성이며, 조회·JOIN·집계·필터·저장·버전 배포·Job은 실제 실행됩니다.**

## 실행 (Node.js 20 이상)

1. ZIP을 풀고 `mes-platform-v2` 폴더에서 터미널을 엽니다.
2. `node server.js`를 실행합니다. `npm install`은 필요 없습니다.
3. 브라우저에서 **http://127.0.0.1:4177** 을 엽니다.

Windows에서는 `start.cmd`, macOS/Linux에서는 `sh start.sh`도 가능합니다.
HTML 파일만 더블클릭하면 서버 연결이 되지 않으므로 위 방식으로 실행하세요.
종료는 터미널에서 Ctrl+C. 재실행하면 저장된 초안·버전·실행 이력이 복원됩니다.
포트가 사용 중이면 PowerShell에서 `$env:PORT=4178; node server.js`,
Linux/macOS에서는 `PORT=4178 node server.js`로 변경합니다.

## 먼저 해볼 것

1. 워크플로우에서 **테스트 실행**: 기본 결과 4행.
2. FILTER 노드 → 기준 `0.93` → 테스트: EQ-201 1행.
3. START 노드 → `wafer_id=W001` → 테스트: 해당 웨이퍼 1개로 계산.
4. START에서 Wafer를 비우고 입력별 행 한도를 `10`으로 변경 → 실제 한도 초과 오류.
5. 한도를 `100000`으로 복원 → `오른쪽 API의 중복 키` 시나리오 → JOIN 관계 오류.
6. `W001 공정 이력 누락` 시나리오에서 INNER/LEFT를 바꿔 미매칭 결과 비교.
7. 초안 저장 → 배포 → 사전검증 → 새 버전 배포.
8. Tool 테스트에서 REST 또는 MCP로 **운영 버전** 호출.
9. 배포 모드를 Job으로 바꿔 새 버전 배포 → Tool 호출 → 상태 조회 또는 취소.
10. Agent 테스트에서 `LOT-1200 W001 수율 보여줘` → 실제 실행 결과 기반 응답.
11. 실행 기록에서 요청별 노드 행 수와 오류 확인. 배포 화면에서 운영 버전 롤백.

초안과 운영 버전은 분리되어 있습니다. 테스트는 현재 화면의 초안 설정을,
외부 API·MCP 호출은 마지막으로 배포한 운영 버전을 사용합니다.
설정 수정 후 저장하지 않고 이동하면 브라우저가 이탈 경고를 표시합니다.

## 데이터와 계산 계약

- 공장 `F02`, Lot `LOT-1199` / `LOT-1200`, 각 `W001`~`W030`.
- 수율: Lot·Wafer별 1행. 두 Lot의 수율은 다릅니다.
- 공정 이력: 2026-10-19 16:00 KST ETCH, 2026-10-20 10:00 KST FINAL_TEST.
- W001에는 FINAL_TEST 재검사 이력이 있어 최신 이력 선택을 검증할 수 있습니다.
- 기본 기간: 2026-10-19 14:00~2026-10-20 14:00 KST. 시작 포함 / 종료 제외.
- `wafer_id` 생략 또는 null은 전체. `ALL` 문자열은 허용하지 않습니다.
- JOIN 키: `lot_id + wafer_id`, 양쪽 키 유일성 검사. INNER/LEFT 지원.
- 그룹: `equip_id` 또는 `process_step`.
- 평균 수율은 웨이퍼 단순 평균. Die 수 가중 평균이 아닙니다.
- `low_yield_wafer_cnt`는 수율 < 0.95 개수. 평균 수율 필터와 별개입니다.
- GROUP BY 다음 평균 수율 필터. 입력·중간·응답 한도 초과 시 부분 결과 없이 실패.
- `unmatched` 테스트 시나리오는 W001의 공정 이력을 실제 제거합니다.
- `duplicate`는 어댑터 출력에 중복 키를 실제 주입합니다. 운영 호출에는 이 기능이 없습니다.

## 구현된 화면

- Data Workflow: 노드 선택, 설정 편집, 입력, 노드별 출력 미리보기, 실행 진단, JSON 다운로드.
- 배포: 실제 사전실행, REST/MCP 노출 선택, 동기/Job 설정, 불변 버전 생성 및 롤백.
- 목록: 실제 저장 상태와 호출 수, 초안 변경 유무.
- Tool Playground: 실제 HTTP REST / JSON-RPC MCP 호출, 입력 오류, Job 조회·취소.
- Agent Playground: Lot/Wafer 추출 → 운영 엔진 실행 → 결과 기반 응답.
- 실행 기록: 최근 100개 실행, 노드 상세, Job 상태.

## API와 MCP

- `POST /api/workflow/lot_yield_equip` — 운영 버전 실행. 동기 200 / Job 접수 202.
- `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel` — 상태·결과 / 취소.
- `GET /api/openapi.json` — 최소 OpenAPI 문서.
- `POST /mcp` — stateless HTTP JSON-RPC. initialize, ping, tools/list, tools/call.
- MCP 도구: `get_lot_yield_by_equipment`, `get_workflow_job`, `cancel_workflow_job`.
- MCP GET SSE 스트림·세션·인증·OAuth는 구현하지 않았습니다. JSON 응답 모드입니다.
- 실제 Dify/외부 MCP 클라이언트 연결은 미검증입니다. HTTP 핸드셰이크·도구 호출은 테스트했습니다.

요청 예시 (`request.json`으로 저장하고 실행 가능):

```json
{"lot_id":"LOT-1199","wafer_id":null,"start_time":"2026-10-19T14:00:00+09:00","end_time":"2026-10-20T14:00:00+09:00"}
```

```sh
curl -H "Content-Type: application/json" --data-binary @request.json http://127.0.0.1:4177/api/workflow/lot_yield_equip
```

## 범위와 다음 구현 단계

- **이번 런타임은 Node.js + 순수 JavaScript**입니다. .NET / DuckDB 구현본이 아닙니다.
- 고정된 DAG 한 개를 설정하는 수직 프로토타입입니다. 노드 추가·삭제·배선·드래그 편집은 미구현.
- 합성 Data API 어댑터를 사용합니다. SQL은 UI의 계약 설명이며 임의 SQL을 실행하지 않습니다.
- Agent는 규칙 기반이며 LLM 미연결입니다. 저장된 프롬프트는 향후 LLM 연결용이고 현재 응답에 영향을 주지 않습니다.
- Agent의 시간 범위는 fixture 기간으로 고정합니다. 다른 기간은 Tool/START에서 직접 지정하세요.
- 인증·권한·호출 제한·다중 사용자·분산 작업 큐는 미구현입니다. 기본 localhost 바인딩으로 실행하세요.
- 타임아웃은 노드 경계에서 경과 시간을 검사하는 방식입니다. 무거운 작업 강제 종료용 worker 분리는 다음 단계입니다.
- Job 지연 650ms는 대기/취소 UI를 체험하기 위한 실행 스케줄링 지연입니다. 결과는 그때 실제 계산합니다.
- .NET 전환 시 `engine.js`의 어댑터·연산·정책을 서비스로 분리하고, 연산을 DuckDB SQL로 옮길 수 있습니다.
- 원본 .dc.html을 역편집한 것이 아닙니다. 개선 UI는 `html/`의 HTML/CSS/JS이며 원본은 `original/`에 그대로 보존했습니다.

## 파일과 검증

- `server.js`: HTTP API, MCP, 저장, 버전, Job, 규칙 기반 Agent.
- `engine.js`: 합성 데이터와 조회·최신 이력 선택·JOIN·집계·필터·한도 검사.
- `html/`: 6개 화면, 공통 CSS/JS. 외부 폰트나 CDN 의존성 없음.
- `data/state.json`: 처음 실행할 때 생성. 저장 초기화는 서버 종료 후 `data/` 폴더 이름을 바꾸세요.
- `original/`: 제공받은 HTML 5개와 디자인 도구 원본.
- `screenshots/`: Chromium 1440px 실 렌더링 캡처.
- `test/`: `npm test` 또는 `node --test test/*.test.js`로 실행. 런타임 의존성 없음.

검증 완료: 서버 자동 테스트 8개 통과(계산/경계/오류/REST/MCP/버전/Job/재시작).
브라우저 검증: 6화면 렌더링, 0.93 필터, 저장 후 재로드, 중복 오류, Job 배포·MCP 조회,
Wafer 질문 실행, 기록 상세, 390px 본문 가로 넘침 없음. 페이지 JavaScript 오류 없음.
