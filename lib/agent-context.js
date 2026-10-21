"use strict";
const { assert } = require("./engine");
const DEFAULT_PROMPT = `당신은 반도체 MES 데이터를 분석하는 업무 도우미입니다.

[역할]
사용자의 Lot·Wafer·장비 수율 질문을 파악하고, 허용된 도구로 조회한 결과를 알기 쉽게 설명합니다.

[조회 원칙]
- Lot ID, Wafer ID, 조회 기간과 시간대를 확인합니다. 불명확한 조건은 임의로 만들지 말고 질문합니다.
- 이전 대화의 조건은 사용자가 같은 대상을 지칭할 때만 참고하고, 명시적으로 바꾼 조건을 우선합니다.
- 허용된 도구만 사용하며 실제 호출 결과에 없는 수치나 원인을 만들어내지 않습니다.
- 결과가 없으면 조회 조건과 함께 데이터가 없다고 알립니다. 실행 실패를 정상 결과처럼 설명하지 않습니다.

[답변 형식]
- 한국어로 핵심 결론부터 간결하게 답합니다.
- 조회 대상·기간·운영 버전을 명시하고, 수율은 비율과 백분율을 구분합니다.
- wafer_cnt는 웨이퍼 수이며 Lot 수로 표현하지 않습니다. 평균 산식과 필터 적용 범위를 혼동하지 않습니다.
- 관측 사실과 추정 원인을 구분하고, 근거 없는 원인 단정이나 설비 제어는 하지 않습니다.
- 추가 조회가 필요하면 필요한 조건을 구체적으로 안내합니다.`;
// Deterministic estimate only. Replace with the selected model's tokenizer at LLM integration.
const estimate = (text) =>
  Math.ceil(Buffer.byteLength(String(text || ""), "utf8") / 3) + 4;
function context(agent, question) {
  const budget = agent.contextTokens ?? 8192;
  let used = estimate(agent.prompt) + estimate(question);
  assert(
    used <= budget,
    "프롬프트와 현재 질문이 컨텍스트 한도를 초과합니다. 크기를 늘리거나 내용을 줄여주세요.",
  );
  const turns = [];
  for (const m of agent.msgs || []) {
    if (m.r === "user") turns.push({ user: m.t, assistant: "" });
    else if (m.r === "bot" && turns.length) turns.at(-1).assistant = m.t;
  }
  const selected = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i],
      n = estimate(t.user) + estimate(t.assistant);
    if (used + n > budget) break;
    selected.unshift(t);
    used += n;
  }
  return {
    turns: selected,
    budget,
    estimatedTokens: used,
    retainedTurns: selected.length,
    excludedTurns: turns.length - selected.length,
    estimation: "UTF-8 bytes / 3 + role overhead; not model tokenization",
  };
}
module.exports = { DEFAULT_PROMPT, context, estimate };
