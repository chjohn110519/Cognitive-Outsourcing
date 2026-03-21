"use client"

import { useState } from "react"
import { ChatInput } from "@/components/ui/chat-input"
import { Button } from "@/components/ui/button"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  CornerDownLeft,
  GripVertical,
  Loader2,
  Sparkles,
  LayoutGrid,
  BarChart2,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────

type CardType = "claim" | "evidence" | "counter" | "example"

interface Block {
  id: string
  type: CardType
  content: string
  userContent: string
  aiContent: string
}

const CARD_LABELS: Record<CardType, string> = {
  claim: "주장",
  evidence: "근거",
  counter: "반론",
  example: "사례",
}

const CARD_COLORS: Record<CardType, string> = {
  claim: "border-l-blue-400 bg-blue-50/50",
  evidence: "border-l-emerald-400 bg-emerald-50/50",
  counter: "border-l-amber-400 bg-amber-50/50",
  example: "border-l-violet-400 bg-violet-50/50",
}

const BADGE_COLORS: Record<CardType, string> = {
  claim: "bg-blue-100 text-blue-700",
  evidence: "bg-emerald-100 text-emerald-700",
  counter: "bg-amber-100 text-amber-700",
  example: "bg-violet-100 text-violet-700",
}

// ── Step Indicator ─────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1 as const, label: "질문 인출", icon: Sparkles },
    { n: 2 as const, label: "논리 조립", icon: LayoutGrid },
    { n: 3 as const, label: "오리지널리티", icon: BarChart2 },
  ]

  return (
    <div className="flex items-center justify-center gap-1">
      {steps.map((s, i) => {
        const Icon = s.icon
        const active = s.n === current
        const done = s.n < current
        return (
          <div key={s.n} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : done
                  ? "bg-muted text-muted-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className="size-3" />
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-6 ${done ? "bg-foreground/30" : "bg-border"}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Sortable Card ──────────────────────────────────────────────────────────

function SortableCard({
  block,
  index,
  onEdit,
}: {
  block: Block
  index: number
  onEdit: (id: string, content: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-3 rounded-xl border-l-4 border border-border/60 bg-background p-4 shadow-sm ${CARD_COLORS[block.type]}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-1 cursor-grab text-muted-foreground/30 transition-colors hover:text-muted-foreground active:cursor-grabbing"
        aria-label="드래그하여 순서 변경"
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {index + 1}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${BADGE_COLORS[block.type]}`}
          >
            {CARD_LABELS[block.type]}
          </span>
        </div>
        <textarea
          value={block.content}
          onChange={(e) => onEdit(block.id, e.target.value)}
          className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
          rows={Math.max(2, Math.ceil(block.content.length / 60))}
        />
      </div>
    </div>
  )
}

// ── Work Log Bar ───────────────────────────────────────────────────────────

function WorkLogBar({ blocks }: { blocks: Block[] }) {
  const totalChars = blocks.reduce((sum, b) => sum + b.content.length, 0)
  const userChars = blocks.reduce((sum, b) => {
    return sum + Math.min(b.userContent.length, b.content.length)
  }, 0)
  const userPct = totalChars > 0 ? Math.round((userChars / totalChars) * 100) : 0

  return (
    <div className="rounded-xl border border-border/60 bg-background p-6 shadow-sm space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-semibold">나의 기여도</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            직접 편집한 텍스트의 비중
          </p>
        </div>
        <span className="text-3xl font-bold tabular-nums">{userPct}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-all duration-700"
          style={{ width: `${userPct}%` }}
        />
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-foreground" />
          내가 쓴 내용
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-muted-foreground/30" />
          AI 보조
        </span>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [topic, setTopic] = useState("")
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [isLoadingQ, setIsLoadingQ] = useState(false)
  const [isLoadingB, setIsLoadingB] = useState(false)
  const [error, setError] = useState("")
  const [blocks, setBlocks] = useState<Block[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function handleGenerateQuestions(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) return
    setIsLoadingQ(true)
    setError("")
    setQuestions([])
    setAnswers([])
    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      })
      if (!res.ok) throw new Error("질문 생성에 실패했습니다.")
      const data = await res.json()
      setQuestions(data.questions)
      setAnswers(data.questions.map(() => ""))
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.")
    } finally {
      setIsLoadingQ(false)
    }
  }

  async function handleBuildBlocks() {
    if (answers.every((a) => !a.trim())) return
    setIsLoadingB(true)
    setError("")
    try {
      const res = await fetch("/api/classify-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, questions, answers }),
      })
      if (!res.ok) throw new Error("블록 생성에 실패했습니다.")
      const data = await res.json()
      setBlocks(data.blocks)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.")
    } finally {
      setIsLoadingB(false)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBlocks((prev) => {
        const oldIdx = prev.findIndex((b) => b.id === active.id)
        const newIdx = prev.findIndex((b) => b.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  function handleEditBlock(id: string, content: string) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, content } : b)))
  }

  function handleReset() {
    setStep(1)
    setTopic("")
    setQuestions([])
    setAnswers([])
    setBlocks([])
    setError("")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Top Nav ── */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">Assemble</span>
          <StepIndicator current={step} />
          {step > 1 && (
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              처음부터
            </button>
          )}
          {step === 1 && <div className="w-16" />}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 space-y-6">

        {/* ─── STEP 1 ─────────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            {/* Hero */}
            {questions.length === 0 && (
              <div className="py-12 text-center space-y-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  오늘 무엇을 생각해볼까요?
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AI가 답을 주는 대신, 당신의 생각을 함께 꺼냅니다.
                  <br />
                  주제를 입력하면 소크라테스식 질문 3개를 드립니다.
                </p>
              </div>
            )}

            {/* Topic Input — ChatInput 데모 디자인 */}
            <div className="max-w-2xl">
              <form
                onSubmit={handleGenerateQuestions}
                className="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring p-1"
              >
                <ChatInput
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="과제 주제를 입력하세요... (예: AI 시대의 창의성)"
                  className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0"
                  disabled={isLoadingQ}
                />
                <div className="flex items-center p-3 pt-0">
                  <Button
                    type="submit"
                    size="sm"
                    className="ml-auto gap-1.5"
                    disabled={isLoadingQ || !topic.trim()}
                  >
                    {isLoadingQ ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        질문 생성 중...
                      </>
                    ) : (
                      <>
                        질문 받기
                        <CornerDownLeft className="size-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* Error */}
            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}

            {/* Seed Questions + Answers */}
            {questions.length > 0 && (
              <div className="space-y-6">
                <p className="text-sm font-medium text-center text-muted-foreground">
                  아래 질문에 떠오르는 대로 자유롭게 적어보세요.
                </p>

                {questions.map((q, i) => (
                  <div key={i} className="space-y-2">
                    {/* Question */}
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-sm leading-relaxed">
                        <span className="mr-2 font-semibold text-muted-foreground">
                          Q{i + 1}.
                        </span>
                        {q}
                      </p>
                    </div>

                    {/* Answer Input — ChatInput 스타일 */}
                    <form
                      className="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring p-1"
                      onSubmit={(e) => e.preventDefault()}
                    >
                      <ChatInput
                        value={answers[i] ?? ""}
                        onChange={(e) => {
                          const next = [...answers]
                          next[i] = e.target.value
                          setAnswers(next)
                        }}
                        placeholder="당신의 생각을 적어보세요..."
                        className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0"
                      />
                    </form>
                  </div>
                ))}

                {/* Build Blocks CTA */}
                <div className="pt-2">
                  <Button
                    onClick={handleBuildBlocks}
                    disabled={isLoadingB || answers.every((a) => !a.trim())}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {isLoadingB ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        논리 블록 생성 중...
                      </>
                    ) : (
                      <>
                        <LayoutGrid className="size-4" />
                        논리 블록으로 조립하기
                      </>
                    )}
                  </Button>
                  {error && (
                    <p className="mt-2 text-center text-sm text-destructive">{error}</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── STEP 2 ─────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center space-y-1">
              <p className="text-sm font-medium">
                블록을 드래그해서 가장 설득력 있는 순서로 재배치하세요.
              </p>
              <p className="text-xs text-muted-foreground">
                블록을 클릭하면 내용을 직접 수정할 수 있습니다.
              </p>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={blocks.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {blocks.map((block, i) => (
                    <SortableCard
                      key={block.id}
                      block={block}
                      index={i}
                      onEdit={handleEditBlock}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <Button
              onClick={() => setStep(3)}
              className="w-full gap-2"
              size="lg"
            >
              <BarChart2 className="size-4" />
              오리지널리티 확인하기
            </Button>
          </div>
        )}

        {/* ─── STEP 3 ─────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <WorkLogBar blocks={blocks} />

            {/* Final blocks (readonly) */}
            <div className="space-y-3">
              {blocks.map((block, i) => (
                <div
                  key={block.id}
                  className={`rounded-xl border-l-4 border border-border/60 bg-background p-4 shadow-sm ${CARD_COLORS[block.type]}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground font-medium">
                      {i + 1}.
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${BADGE_COLORS[block.type]}`}
                    >
                      {CARD_LABELS[block.type]}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{block.content}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(2)}
              >
                ← 다시 조립하기
              </Button>
              <Button className="flex-1" onClick={handleReset}>
                새 주제 시작하기
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
