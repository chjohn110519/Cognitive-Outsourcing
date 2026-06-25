import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"

const client = new Anthropic()

function extractJson(raw: string): string {
  return raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
}

export async function POST(req: NextRequest) {
  const { topic, questions, answers } = await req.json()

  if (!Array.isArray(questions) || !Array.isArray(answers)) {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 })
  }

  const qa = questions
    .map((q: string, i: number) => `Q: ${q}\nA: ${answers[i] || "(답변 없음)"}`)
    .join("\n\n")

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `당신은 논증 구조 분석가입니다.
학생의 답변을 분석하여 각 내용을 논리 카드(블록)로 분류하세요.

블록 타입:
- claim: 주장 (핵심 입장, 주제에 대한 의견)
- evidence: 근거 (사실, 데이터, 경험)
- counter: 반론 (반대 입장, 한계)
- example: 사례 (구체적 예시, 사건)

규칙:
- 하나의 답변에서 여러 블록을 추출할 수 있음
- 각 블록은 학생의 말투와 표현을 최대한 살려 1~3문장으로 정리
- 블록 수는 3~6개가 적당
- JSON만 응답: { "blocks": [{ "id": "b1", "type": "claim"|"evidence"|"counter"|"example", "content": "..." }] }`,
    messages: [
      {
        role: "user",
        content: `주제: ${topic}\n\n${qa}`,
      },
    ],
  })

  const text = message.content[0]
  if (text.type !== "text") {
    return NextResponse.json({ error: "응답 생성 실패" }, { status: 500 })
  }

  try {
    const parsed = JSON.parse(extractJson(text.text))
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: "응답 파싱 실패" }, { status: 500 })
  }
}
