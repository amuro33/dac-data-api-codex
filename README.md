# dac-data-api-codex

Claude의 `amuro33/dac-data-api` main (`fee94f8`) 디자인을 유지한 실행형 프로토타입입니다.
원본 웹 화면과 명세는 `original/`에 보관했습니다. 원본 저장소는 수정하지 않습니다.

## 실행

Node.js 22 이상. 설치할 런타임 패키지가 없습니다.

```sh
npm start
# 또는 node server.js / Windows start.cmd
```

**http://127.0.0.1:4177** → 화면 목록 → Data Workflow.
기존 서버가 실행 중이면 종료한 뒤 재시작하세요. 다른 포트는 `node server.js 4180`.
HTML 파일을 직접 열면 서버 저장·실행 기능이 작동하지 않습니다.
Google Fonts를 불러오지 못하면 시스템 대체 글꼴을 사용합니다.

## 이번 단계: 1~3

- 공통 서버 저장소: 워크플로우 초안/리비전/배포 스냅샷, Agent 설정/대화, 최근 실행 200개.
- 새 워크플로우 생성 → 해당 ID 편집 → 저장 → 새로고침/서버 재시작 후 유지.
- 수율 흐름의 JOIN 방식, Filter 컬럼·조건, Group By·집계 변경이 실제 합성 데이터 연산에 반영됩니다.
- 테스트 통과한 **저장 리비전**만 배포됩니다. 미저장 테스트는 배포 검증을 대신하지 않습니다.
- 초안 수정은 운영 버전에 영향을 주지 않습니다. 재배포 시 새 불변 버전이 추가됩니다.
- Tool 목록은 실제 배포에서 생성됩니다. 입력/요청/결과/운영 버전과 호출 기록 확인 가능.
- Agent는 저장된 도구 중 하나를 선택해 같은 운영 실행기를 호출합니다. 입력과 실제 결과를 근거로 응답합니다.
- Agent 이름/프롬프트/도구 선택/대화는 서버에 저장됩니다. 프롬프트는 저장용이며 **LLM 미연결**입니다.

## 확인 순서

1. 목록에서 `lot_yield_equip` 열기 → 테스트 실행. 기본 결과는 4개 장비 그룹, 필터 통과 웨이퍼 10개.
2. `Filter`의 `yield_rate < 0.95`를 `< 0.89`로 변경 → 저장 → 테스트 실행. 3그룹, 4개 웨이퍼로 바뀝니다.
3. 배포 → 저장된 초안 테스트 → 툴 이름 지정 → 배포.
4. Tool Playground에서 해당 툴 선택 → 호출. 같은 결과와 배포 버전 확인.
5. `wafer_id=W001` 입력 → `EQ-201 / 평균 수율 0.88 / 1개` 확인.
6. Agent에서 해당 도구 선택 → 저장 → `LOT-1199 W001 수율 알려줘` 전송. 같은 데이터와 버전 확인.
7. 에디터 초안만 다시 바꾸고 저장해도 Tool·Agent는 재배포 전까지 이전 운영 결과를 유지합니다.

## 데이터 계약

- 데이터: `LOT-1199`, `LOT-1200`, 각 W001~W012. 가상 이력 W099는 수율 데이터 없이 존재합니다.
- 입력: lot_id 필수, wafer_id 선택(빈 값/ALL = 전체), start_time/end_time 필수.
- 시간대 없는 입력은 **KST**. 범위는 **시작 포함, 종료 제외**입니다.
- 기본 기간: 2026-10-19 14:00~2026-10-20 14:00 KST. 이전 이력 10/19 16시, 최신 이력 10/20 09시·12시.
- 복합키 `lot_id + wafer_id`로 JOIN. 기간 내 최신 공정 이력을 선택하며 같은 시각이면 큰 event_id를 우선합니다. 수율의 중복 키는 실패 처리합니다.
- 화면 순서 그대로 **JOIN → 웨이퍼 yield_rate Filter → Group By → END**. 평균 수율에 대한 사후 필터가 아닙니다.
- COUNT(*) 출력은 `wafer_cnt`이며 Lot 개수로 표시하지 않습니다. 평균은 웨이퍼별 수율의 산술평균입니다.
- 외부 JOIN의 NULL 수율은 Filter에서 제외됩니다. 수율 없는 이력이 집계에 섞이지 않습니다.
- START와 데이터 소스 연결은 이번 단계에서 고정입니다. 지원되지 않는 조합/컬럼은 실행 실패로 표시합니다.

## API

- GET `/api/state`, `/api/catalog`
- POST `/api/workflows` (id, desc) / GET·PUT `/api/workflows/{id}`
- POST `/api/workflows/{id}/test`, `/api/workflows/{id}/publish`
- POST `/api/tools/{toolName}/call` — Tool·Agent 공통 운영 실행 경로
- POST `/api/workflow/{id}` — REST 배포를 선택한 경우
- GET `/api/workflows/{id}/openapi` — OpenAPI 3.1 JSON
- POST `/api/agents`, PUT `/api/agents/{id}`
- POST `/api/agents/{id}/chat`, `/api/agents/{id}/clear`

## 저장 및 제한

`data/state.json`에 임시 파일 작성 후 rename으로 저장합니다. Git에 포함되지 않습니다.
`MES_DATA_DIR`로 위치 변경 가능. 테스트는 별도 임시 디렉터리를 사용합니다.
초안/Agent 설정 저장에는 revision 충돌 검사가 있습니다. 단일 로컬 서버용이며 여러 프로세스가 같은 파일을 공유하면 안 됩니다.
초기화가 필요하면 서버 종료 후 data 폴더를 다른 이름으로 옮기세요. 기존 파일을 자동 삭제하지 않습니다.

실행기는 현재 **Node.js의 결정적 fixture 연산**입니다. .NET/DuckDB, 자유로운 노드 편집, 실제 Oracle 호출, 외부 MCP Streamable HTTP, Job/웹훅, LLM, 스케줄, 메신저, 인증은 다음 단계입니다.
Mock 응답을 성공처럼 반환하지 않도록 미구현 도구/전송은 카탈로그에 노출하지 않습니다.
127.0.0.1 바인딩의 로컬 프로토타입이며 운영 서비스가 아닙니다. 데이터 행 한도를 검사하지만 강제 실행시간 취소는 아직 없습니다.

## 검증

```sh
npm test
# Playwright가 있는 개발 환경에서 (일반 실행에는 불필요)
node scripts/verify-browser.cjs
# 다른 위치의 Playwright 사용 시 PLAYWRIGHT_MODULE로 지정
```

엔진 경계조건, 중복키·한도, 저장 충돌, 배포 격리, Tool/Agent 동일 결과, 서버 재시작 복원, 루트 CSS/JS 로딩을 검증합니다.
브라우저 테스트는 목록→편집→저장→재접속→배포→Tool→Agent 흐름을 검증하며 `test-artifacts/`에 스크린샷을 저장합니다.
검증 환경은 Linux Chromium입니다. Windows `start.cmd` 자체 실행은 미검증입니다.
원본의 데스크톱 중심 레이아웃을 보존했으며 모바일 재설계는 이번 범위에 포함하지 않습니다.
