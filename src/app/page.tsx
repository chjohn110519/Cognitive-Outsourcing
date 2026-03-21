"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ChatInput } from "@/components/ui/chat-input"
import { Button } from "@/components/ui/button"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Pencil,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────

type CardType = "claim" | "evidence" | "counter" | "example"

interface Block {
  id: string
  type: CardType
  content: string
  originalContent: string // AI가 생성한 원본 — 변하지 않음
  hasEdited: boolean      // 사용자가 직접 수정했는지
}

// ── Constants ──────────────────────────────────────────────────────────────

const CARD_LABELS: Record<CardType, string> = {
  claim: "주장", evidence: "근거", counter: "반론", example: "사례",
}

const CARD_COLORS: Record<CardType, string> = {
  claim:    "border-l-blue-400 bg-blue-50/40",
  evidence: "border-l-emerald-400 bg-emerald-50/40",
  counter:  "border-l-amber-400 bg-amber-50/40",
  example:  "border-l-violet-400 bg-violet-50/40",
}

const BADGE_COLORS: Record<CardType, string> = {
  claim:    "bg-blue-100 text-blue-700",
  evidence: "bg-emerald-100 text-emerald-700",
  counter:  "bg-amber-100 text-amber-700",
  example:  "bg-violet-100 text-violet-700",
}

const EXAMPLE_TOPICS = [
  "AI와 교육의 미래",
  "기후변화와 개인의 책임",
  "SNS와 자존감의 관계",
  "대학이 꼭 필요한가",
]

const LOADING_Q_MSGS = [
  "당신의 생각을 꺼낼 질문을 만들고 있어요...",
  "답이 아닌 질문을 준비 중이에요...",
  "소크라테스처럼 물어볼게요...",
]

const LOADING_B_MSGS = [
  "답변에서 논리 구조를 찾고 있어요...",
  "블록으로 나누는 중이에요...",
  "당신의 생각을 카드로 만들고 있어요...",
]

// ── Hooks ──────────────────────────────────────────────────────────────────

function useRotatingMsg(messages: string[], active: boolean) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (!active) { setIdx(0); return }
    const t = setInterval(() => setIdx(i => (i + 1) % messages.length), 1800)
    return () => clearInterval(t)
  }, [active, messages.length])
  return messages[idx]
}

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    setSeconds(0)
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  return seconds
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
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ${
              active ? "bg-foreground text-background shadow-sm"
              : done  ? "bg-muted text-muted-foreground"
              :         "text-muted-foreground"
            }`}>
              <Icon className="size-3" />
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-5 transition-colors duration-300 ${done ? "bg-foreground/25" : "bg-border"}`} />
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
  const [focused, setFocused] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : "auto",
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-3 rounded-xl border-l-4 border bg-background p-4 shadow-sm transition-shadow ${
        CARD_COLORS[block.type]
      } ${isDragging ? "shadow-lg" : "hover:shadow-md"} ${
        focused ? "border-border" : "border-border/60"
      }`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="mt-1 cursor-grab touch-none text-muted-foreground/25 transition-colors group-hover:text-muted-foreground/50 active:cursor-grabbing"
        aria-label="드래그하여 순서 변경"
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex-1 space-y-2 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${BADGE_COLORS[block.type]}`}>
            {CARD_LABELS[block.type]}
          </span>
          {block.hasEdited && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
              <Pencil className="size-2.5" />
              직접 수정됨
            </span>
          )}
        </div>

        {/* Editable Content */}
        <div className={`relative rounded-md transition-colors ${
          focused ? "bg-muted/40 ring-1 ring-border" : "hover:bg-muted/20"
        }`}>
          <textarea
            value={block.content}
            onChange={(e) => onEdit(block.id, e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-foreground focus:outline-none"
            rows={Math.max(2, Math.ceil(block.content.length / 55))}
          />
          {!focused && (
            <span className="absolute right-2 top-1.5 text-[10px] text-muted-foreground/40 pointer-events-none">
              클릭하여 편집
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Metric Row ─────────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  goal,
  met,
  unit = "",
}: {
  label: string
  value: number
  goal: string
  met: boolean
  unit?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">목표: {goal}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tabular-nums">
          {value}{unit}
        </span>
        {met
          ? <CheckCircle2 className="size-5 text-emerald-500" />
          : <AlertTriangle className="size-5 text-amber-400" />
        }
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [topic, setTopic] = useState("")
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [isLoadingQ, setIsLoadingQ] = useState(false)
  const [isLoadingB, setIsLoadingB] = useState(false)
  const [error, setError] = useState("")
  const [retryFn, setRetryFn] = useState<(() => void) | null>(null)

  // Step 2
  const [blocks, setBlocks] = useState<Block[]>([])
  const [rearrangeCount, setRearrangeCount] = useState(0)
  const step2Seconds = useTimer(step === 2)

  // Step 3
  const [copied, setCopied] = useState(false)
  const canvasTimeRef = useRef(0)

  // Loading messages
  const loadingQMsg = useRotatingMsg(LOADING_Q_MSGS, isLoadingQ)
  const loadingBMsg = useRotatingMsg(LOADING_B_MSGS, isLoadingB)

  // Save canvas time when leaving Step 2
  useEffect(() => {
    if (step !== 2) return
    return () => { canvasTimeRef.current = step2Seconds }
  }, [step, step2Seconds])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Handlers ───────────────────────────────────────────────────────────

  const doGenerateQuestions = useCallback(async () => {
    if (!topic.trim()) return
    setIsLoadingQ(true)
    setError("")
    setRetryFn(null)
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
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다."
      setError(msg)
      setRetryFn(() => doGenerateQuestions)
    } finally {
      setIsLoadingQ(false)
    }
  }, [topic])

  async function handleGenerateQuestions(e: React.FormEvent) {
    e.preventDefault()
    doGenerateQuestions()
  }

  const doBuildBlocks = useCallback(async () => {
    if (answers.every((a) => !a.trim())) return
    setIsLoadingB(true)
    setError("")
    setRetryFn(null)
    try {
      const res = await fetch("/api/classify-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, questions, answers }),
      })
      if (!res.ok) throw new Error("블록 생성에 실패했습니다.")
      const data = await res.json()
      setBlocks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.blocks.map((b: any) => ({
          id: b.id,
          type: b.type,
          content: b.content,
          originalContent: b.content, // AI 원본 저장
          hasEdited: false,
        }))
      )
      setRearrangeCount(0)
      setStep(2)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다."
      setError(msg)
      setRetryFn(() => doBuildBlocks)
    } finally {
      setIsLoadingB(false)
    }
  }, [topic, questions, answers])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBlocks((prev) => {
        const oldIdx = prev.findIndex((b) => b.id === active.id)
        const newIdx = prev.findIndex((b) => b.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
      setRearrangeCount((c) => c + 1)
    }
  }

  function handleEditBlock(id: string, content: string) {
    setBlocks((prev) =>
      prev.map((b) => b.id === id ? { ...b, content, hasEdited: true } : b)
    )
  }

  function handleGoToStep3() {
    canvasTimeRef.current = step2Seconds
    setStep(3)
  }

  function handleReset() {
    setStep(1)
    setTopic("")
    setQuestions([])
    setAnswers([])
    setBlocks([])
    setError("")
    setRetryFn(null)
    canvasTimeRef.current = 0
  }

  function handleCopy() {
    const text = blocks
      .map((b, i) => `${i + 1}. [${CARD_LABELS[b.type]}] ${b.content}`)
      .join("\n\n")
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Metrics ────────────────────────────────────────────────────────────

  const editedCount = blocks.filter((b) => b.hasEdited).length
  const editRatio = blocks.length > 0 ? Math.round((editedCount / blocks.length) * 100) : 0
  const canvasMin = Math.floor(canvasTimeRef.current / 60)
  const canvasSec = canvasTimeRef.current % 60

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col bg-background">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">Assemble</span>
          <StepIndicator current={step} />
          <div className="w-16 flex justify-end">
            {step > 1 && (
              <button
                onClick={handleReset}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                처음부터
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">

        {/* ─── STEP 1 ──────────────────────────────────────────────────── */}
        {step === 1 && (
          <div key="step1" className="step-fade-in space-y-6">

            {/* Hero (질문 없을 때만) */}
            {questions.length === 0 && (
              <div className="py-10 text-center space-y-3">
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

            {/* Topic Input */}
            <form
              onSubmit={handleGenerateQuestions}
              className="relative rounded-lg border bg-background p-1 focus-within:ring-1 focus-within:ring-ring"
            >
              <ChatInput
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="과제 주제를 입력하세요..."
                className="min-h-12 resize-none rounded-lg border-0 bg-background p-3 shadow-none focus-visible:ring-0"
                disabled={isLoadingQ}
              />
              <div className="flex items-center p-3 pt-0">
                {isLoadingQ ? (
                  <p className="text-xs text-muted-foreground animate-pulse">
                    {loadingQMsg}
                  </p>
                ) : (
                  <span />
                )}
                <Button
                  type="submit"
                  size="sm"
                  className="ml-auto gap-1.5"
                  disabled={isLoadingQ || !topic.trim()}
                >
                  {isLoadingQ ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      질문 받기
                      <CornerDownLeft className="size-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* 예시 주제 칩 */}
            {questions.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">또는 예시 주제를 선택하세요</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLE_TOPICS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 에러 */}
            {error && (
              <div className="flex items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
                {retryFn && (
                  <button
                    onClick={retryFn}
                    className="flex items-center gap-1 text-xs text-destructive underline-offset-2 hover:underline"
                  >
                    <RefreshCw className="size-3" />
                    다시 시도
                  </button>
                )}
              </div>
            )}

            {/* 질문 + 답변 */}
            {questions.length > 0 && (
              <div className="step-fade-in space-y-6">
                <p className="text-center text-sm text-muted-foreground">
                  아래 질문에 떠오르는 대로 자유롭게 적어보세요.
                </p>

                {questions.map((q, i) => (
                  <div key={i} className="space-y-2">
                    <div className="rounded-lg border bg-muted/25 px-4 py-3">
                      <p className="text-sm leading-relaxed">
                        <span className="mr-2 font-semibold text-muted-foreground">Q{i + 1}.</span>
                        {q}
                      </p>
                    </div>
                    <form
                      className="relative rounded-lg border bg-background p-1 focus-within:ring-1 focus-within:ring-ring"
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
                        className="min-h-12 resize-none rounded-lg border-0 bg-background p-3 shadow-none focus-visible:ring-0"
                      />
                    </form>
                  </div>
                ))}

                {/* Build Blocks CTA */}
                <div className="space-y-2 pt-2">
                  <Button
                    onClick={doBuildBlocks}
                    disabled={isLoadingB || answers.every((a) => !a.trim())}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {isLoadingB ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {loadingBMsg}
                      </>
                    ) : (
                      <>
                        <LayoutGrid className="size-4" />
                        논리 블록으로 조립하기
                      </>
                    )}
                  </Button>
                  {isLoadingB && (
                    <p className="text-center text-xs text-muted-foreground">
                      잠시만요, 당신의 생각을 구조화하는 중입니다.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 2 ──────────────────────────────────────────────────── */}
        {step === 2 && (
          <div key="step2" className="step-fade-in space-y-5">

            {/* Socratic 안내 */}
            <div className="rounded-xl border border-border/50 bg-muted/15 px-5 py-4 space-y-1.5">
              <p className="text-sm font-semibold">
                어떤 블록이 독자를 가장 먼저 설득할 수 있을까요?
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                드래그로 순서를 바꾸고, 블록을 클릭해 내용을 직접 수정해보세요.
                당신이 배치하는 순서가 곧 당신의 논리입니다.
              </p>
            </div>

            {/* 실시간 진행 카운터 */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>
                재배치{" "}
                <span className={`font-semibold ${rearrangeCount >= 3 ? "text-emerald-600" : "text-foreground"}`}>
                  {rearrangeCount}회
                </span>
                {rearrangeCount >= 3 && " ✓"}
              </span>
              <span>
                수정된 블록{" "}
                <span className={`font-semibold ${editRatio >= 40 ? "text-emerald-600" : "text-foreground"}`}>
                  {editedCount}/{blocks.length}
                </span>
                {editRatio >= 40 && " ✓"}
              </span>
              <span>
                체류{" "}
                <span className={`font-semibold tabular-nums ${step2Seconds >= 300 ? "text-emerald-600" : "text-foreground"}`}>
                  {String(Math.floor(step2Seconds / 60)).padStart(2, "0")}:{String(step2Seconds % 60).padStart(2, "0")}
                </span>
                {step2Seconds >= 300 && " ✓"}
              </span>
            </div>

            {/* Drag & Drop Canvas */}
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
              onClick={handleGoToStep3}
              className="w-full gap-2"
              size="lg"
            >
              <BarChart2 className="size-4" />
              오리지널리티 확인하기
            </Button>
          </div>
        )}

        {/* ─── STEP 3 ──────────────────────────────────────────────────── */}
        {step === 3 && (
          <div key="step3" className="step-fade-in space-y-6">

            {/* 오리지널리티 타이틀 */}
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">오리지널리티 핑거프린트</h2>
              <p className="text-sm text-muted-foreground">
                이 논리 구조는 당신이 직접 설계했습니다.
              </p>
            </div>

            {/* 3개 지표 — PRD 성공 기준과 직접 연결 */}
            <div className="rounded-xl border border-border/60 bg-background px-5 shadow-sm divide-y divide-border/50">
              <MetricRow
                label="블록 재배치"
                value={rearrangeCount}
                goal="3회 이상"
                met={rearrangeCount >= 3}
                unit="회"
              />
              <MetricRow
                label="직접 수정한 블록"
                value={editRatio}
                goal="전체의 40% 이상"
                met={editRatio >= 40}
                unit="%"
              />
              <MetricRow
                label="캔버스 체류 시간"
                value={canvasMin}
                goal="5분 이상"
                met={canvasMin >= 5}
                unit="분"
              />
            </div>

            {/* 완성된 블록 목록 */}
            <div className="space-y-2">
              <p className="text-sm font-medium">완성된 논리 구조</p>
              <div className="space-y-2.5">
                {blocks.map((block, i) => (
                  <div
                    key={block.id}
                    className={`rounded-xl border-l-4 border border-border/60 bg-background p-4 ${CARD_COLORS[block.type]}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-muted-foreground font-medium tabular-nums">{i + 1}.</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${BADGE_COLORS[block.type]}`}>
                        {CARD_LABELS[block.type]}
                      </span>
                      {block.hasEdited && (
                        <span className="ml-auto text-[10px] text-emerald-600 font-medium">직접 수정</span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">{block.content}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="size-4 text-emerald-500" />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    논리 구조 복사하기
                  </>
                )}
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                  ← 다시 조립하기
                </Button>
                <Button className="flex-1" onClick={handleReset}>
                  새 주제 시작하기
                </Button>
              </div>
              {copied && (
                <p className="text-center text-xs text-muted-foreground step-fade-in">
                  클립보드에 복사됐습니다. 이제 이 구조로 글을 시작해보세요.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
