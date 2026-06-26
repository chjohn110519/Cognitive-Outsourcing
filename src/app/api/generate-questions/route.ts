import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"

const client = new OpenAI()

function extractJson(raw: string): string {
  return raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
}

export async function POST(req: NextRequest) {
  const { topic } = await req.json()

  if (!topic || typeof topic !== "string") {
    return NextResponse.json({ error: "주제를 입력해주세요." }, { status: 400 })
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content: `당신은 소크라테스식 대화를 이끄는 학습 코치입니다.
학생이 주제를 입력하면, 절대 답을 주지 말고 학생 스스로 생각하게 만드는 질문 3개만 생성하세요.

규칙:
- 질문은 반드시 한국어로 작성
- 각 질문은 학생의 개인 경험, 가치관, 관점을 끌어내는 내용
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
