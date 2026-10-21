# dac-data-api

MES API Platform 2027 — Data Workflow · Playground.

- 스펙: [docs/SPEC.md](docs/SPEC.md)
- 화면 원본 목업(디자인 도구 소스): `design` 브랜치의 `docs/mockup/`

## 목업 사이트 실행

빌드 없이 정적 파일(`web/`)만 서빙하면 됩니다.

```
node server.js            # http://localhost:3000  (Node.js만 있으면 됨, 설치할 패키지 없음)
# 또는
npm start                 # 위와 같음
# 또는
python -m http.server 3000 --directory web
```

사내망처럼 패키지를 받을 수 없는 환경에서도 `node server.js`는 그대로 동작합니다.
서버 없이 `web/index.html`을 더블클릭해서 열어도 됩니다.

- `web/index.html` : 화면 목록
- `web/assets/styles.css` : 에디터·배포 화면 스타일 (목업에서 자동 추출)
- `web/assets/base.css`, `shell.js`, `mock-data.js` : 목록·플레이그라운드용 공통 스타일/셸/목업 데이터 (직접 작성)
- `web/workflows.html`, `tool-playground.html`, `agent-playground.html` : 직접 작성한 동작 화면 (목록 필터·페이징, 도구 호출·Job 조회, Agent 설정·채팅)
- `web/assets/editor.js` : 에디터 노드 선택·설정 패널 전환
- `web/assets/app.js`, `web/assets/deploy.js` : 배포 화면 동작(API/MCP 선택, 동기/Job, 미리보기 탭)

서버나 DB는 연결되어 있지 않고 화면 확인용입니다. 글꼴(Geist, IBM Plex Sans KR)은 Google Fonts에서 받으므로 인터넷이 연결되어 있어야 합니다.
