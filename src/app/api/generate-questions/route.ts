import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"

const client = new OpenAI()

function extractJson(raw: string): string {
  return raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
}

export async function POST(req: NextRequest) {
  const { topic, domain = "essay" } = await req.json()

  if (!topic || typeof topic !== "string") {
    return NextResponse.json({ error: "주제를 입력해주세요." }, { status: 400 })
  }

  const domainPrompts: Record<string, string> = {
    academic: "학술 및 연구 보고서용 소크라테스식 질문을 생성하세요. 연구 배경, 연구 방법론적 타당성, 대립 가설이나 한계점에 대해 스스로 파고들 수 있는 질문이어야 합니다.",
    startup: "스타트업 IR 및 사업계획서용 소크라테스식 질문을 생성하세요. 타깃 고객의 페인포인트(Pain Point), 솔루션의 고유 차별점(Moat), 그리고 수익 모델이나 근거 지표의 현실성에 대해 자문하도록 유도해야 합니다.",
    essay: "자유 및 인문 에세이용 소크라테스식 질문을 생성하세요. 개인적 경험, 내면의 가치관, 감정적 흐름과 그 이면의 철학적 통찰을 끌어낼 수 있는 질문이어야 합니다."
  }

  const domainInstruction = domainPrompts[domain] || domainPrompts.essay

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content: `당신은 소크라테스식 대화를 이끄는 학습 코치입니다.
학생이 주제를 입력하면, 절대 답을 주지 말고 학생 스스로 생각하게 만드는 질문 3개만 생성하세요.

[도메인 가이드]
${domainInstruction}

규칙:
- 질문은 반드시 한국어로 작성
- 각 질문은 학생의 개인 경험, 가치관, 관점, 그리고 논리 구조를 스스로 정립하도록 돕는 질문
- 답변을 유도하거나 정보를 제공하는 질문 금지
- JSON 배열 형식으로만 응답: ["질문1", "질문2", "질문3"]
- 다른 텍스트 없이 JSON만 출력`,
      },
      {
        role: "user",
        content: `주제: ${topic}`,
      },
    ],
  })

  const content = completion.choices[0].message.content
  if (!content) {
    return NextResponse.json({ error: "응답 생성 실패" }, { status: 500 })
  }

  try {
    const questions: string[] = JSON.parse(extractJson(content))
    return NextResponse.json({ questions })
  } catch {
    return NextResponse.json({ error: "응답 파싱 실패" }, { status: 500 })
  }
}
