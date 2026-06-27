import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"

const client = new OpenAI()

function extractJson(raw: string): string {
  return raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
}

export async function POST(req: NextRequest) {
  const { topic, questions, answers, domain = "essay" } = await req.json()

  if (!Array.isArray(questions) || !Array.isArray(answers)) {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 })
  }

  const qa = questions
    .map((q: string, i: number) => `Q: ${q}\nA: ${answers[i] || "(답변 없음)"}`)
    .join("\n\n")

  // 도메인별 가이드라인 정의
  const blockGuides: Record<string, { types: string; description: string }> = {
    academic: {
      types: "- claim (주장)\n- evidence (근거)\n- counter (반론)\n- methodology (연구방법)",
      description: "학술 에세이/보고서에 걸맞게 논점과 연구 근거, 방법론적 타당성을 위주로 구조화하세요."
    },
    startup: {
      types: "- problem (문제정의)\n- solution (해결책)\n- evidence (시장근거)\n- businessModel (비즈니스모델)",
      description: "사업계획서/IR 자료에 맞게 핵심 페인포인트와 해결 솔루션, 비즈니스 가당성을 위주로 구조화하세요."
    },
    essay: {
      types: "- claim (주장)\n- reflection (성찰)\n- example (사례)\n- counter (반론)",
      description: "자유/인문 에세이에 맞게 감성적 깊이와 철학적 성찰, 구체적 개인 사례가 드러나도록 구조화하세요."
    }
  }

  const guide = blockGuides[domain] || blockGuides.essay

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2048,
    messages: [
      {
        role: "system",
        content: `당신은 논증 구조 분석가이자 문체 보존 전문가입니다.
학생이 작성한 질문 답변(Q&A) 세트를 분석하여, 학생의 논리적 주장을 카드(블록) 형태로 구조화하세요.

현재 도메인: ${domain}
블록 타입:
${guide.types}

[도메인 구조화 방향]
${guide.description}

[매우 중요 - Keyword Lock & Vibe Preservation 규칙]
1. Keyword Lock: 학생이 사용한 고유한 전문 용어, 학술 개념, 기술 약어(예: 'LLM 파인튜닝', 'SVD', '기후변화 대응책', 'Queueing Theory') 등을 임의로 일반화하거나 더 쉬운 범용 용어(예: 'AI 학습', '수학 공식', '환경 운동')로 변경하지 마세요. 고유한 어휘를 100% 그대로 유지해야 합니다.
2. Vibe Preservation: 학생이 쓴 원래의 구어체 뉘앙스, 문체적 어조, 서술 방식(예: "~인 것 같다", "~하니까", "~했음", "~라고 생각함")을 억지로 딱딱한 문어체나 포멀한 학술적 어조로 변경하지 마세요. 학생 본인이 쓴 글이라는 정체성 괴리감을 느끼지 않도록 뉘앙스를 고스란히 살리되, 논리적 선명성만 정돈하세요.
3. sourceQIndex 매핑: 각 블록은 입력받은 질문 목록(0-indexed) 중 어떤 질문의 답변(A)에서 유래했는지 'sourceQIndex' (0, 1, 2) 필드에 반드시 명시하세요.

[Few-shot 예시]
입력 Q&A:
Q: LLM의 한계는 무엇인가요?
A: LLM 파인튜닝을 해보니까 데이터가 적으면 과적합(Overfitting)이 쉽게 일어나는 거 같아서 고민이에요.

올바른 블록 변환 예시:
{
  "id": "b1",
  "type": "evidence",
  "content": "LLM 파인튜닝을 직접 해보니까, 학습용 데이터가 적으면 과적합(Overfitting)이 쉽게 일어나는 거 같아서 고민이다.",
  "sourceQIndex": 0
}
(※ 설명: 'LLM 파인튜닝', '과적합(Overfitting)' 키워드를 임의로 바꾸지 않고, 구어체 뉘앙스를 보존함)

잘못된 블록 변환 예시 (이렇게 하지 마세요):
{
  "id": "b1",
  "type": "evidence",
  "content": "인공지능 모델 조정 과정에서 데이터 부족 시 오류가 발생할 수 있습니다.",
  "sourceQIndex": 0
}
(※ 설명: 전문 용어가 다 뭉뚱그려졌고, 학생 특유의 구어체 뉘앙스가 완전히 사라짐)

JSON만 응답해야 하며 스키마는 다음과 같습니다:
{
  "blocks": [
    {
      "id": "string",
      "type": "claim" | "evidence" | "counter" | "example" | "methodology" | "problem" | "solution" | "businessModel" | "reflection",
      "content": "학생의 어조와 전문 단어가 보존된 문장",
      "sourceQIndex": number
    }
  ]
}`,
      },
      {
        role: "user",
        content: `주제: ${topic}\n\n${qa}`,
      },
    ],
  })

  const text = completion.choices[0].message.content
  if (!text) {
    return NextResponse.json({ error: "응답 생성 실패" }, { status: 500 })
  }

  try {
    const parsed = JSON.parse(extractJson(text))
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: "응답 파싱 실패" }, { status: 500 })
  }
}
