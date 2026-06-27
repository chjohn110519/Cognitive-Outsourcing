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
  Plus,
  Trash2,
  Lock,
  Unlock,
  Eye,
  Download,
  Calendar,
  Clock,
  Award,
  Zap,
  Info,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────

type CardType =
  | "claim"
  | "evidence"
  | "counter"
  | "example"
  | "methodology"
  | "problem"
  | "solution"
  | "businessModel"
  | "reflection"

interface Block {
  id: string
  type: CardType
  content: string
  originalContent: string 
  hasEdited: boolean      
  sourceQIndex?: number   
}

interface HistoryEvent {
  timestamp: number
  action: "init" | "rearrange" | "edit" | "add" | "delete" | "change_type" | "idle_detect"
  description: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const CARD_LABELS: Record<CardType, string> = {
  claim: "주장",
  evidence: "근거",
  counter: "반론",
  example: "사례",
  methodology: "연구방법",
  problem: "문제정의",
  solution: "해결책",
  businessModel: "비즈니스모델",
  reflection: "성찰",
}

const CARD_COLORS: Record<CardType, string> = {
  claim: "border-l-blue-400 bg-blue-50/40 dark:bg-blue-950/20",
  evidence: "border-l-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20",
  counter: "border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20",
  example: "border-l-violet-400 bg-violet-50/40 dark:bg-violet-950/20",
  methodology: "border-l-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20",
  problem: "border-l-rose-400 bg-rose-50/40 dark:bg-rose-950/20",
  solution: "border-l-teal-400 bg-teal-50/40 dark:bg-teal-950/20",
  businessModel: "border-l-orange-400 bg-orange-50/40 dark:bg-orange-950/20",
  reflection: "border-l-pink-400 bg-pink-50/40 dark:bg-pink-950/20",
}

const BADGE_COLORS: Record<CardType, string> = {
  claim: "bg-blue-100 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300",
  evidence: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300",
  counter: "bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300",
  example: "bg-violet-100 text-violet-700 dark:bg-violet-900/35 dark:text-violet-300",
  methodology: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/35 dark:text-indigo-300",
  problem: "bg-rose-100 text-rose-700 dark:bg-rose-900/35 dark:text-rose-300",
  solution: "bg-teal-100 text-teal-700 dark:bg-teal-900/35 dark:text-teal-300",
  businessModel: "bg-orange-100 text-orange-700 dark:bg-orange-900/35 dark:text-orange-300",
  reflection: "bg-pink-100 text-pink-700 dark:bg-pink-900/35 dark:text-pink-300",
}

const DOMAIN_TEMPLATES = [
  { id: "essay" as const, label: "자유/인문 에세이", emoji: "✍️", types: ["claim", "reflection", "example", "counter"] as CardType[] },
  { id: "academic" as const, label: "학술/연구 보고서", emoji: "🎓", types: ["claim", "evidence", "counter", "methodology"] as CardType[] },
  { id: "startup" as const, label: "스타트업 IR/사업계획서", emoji: "🚀", types: ["problem", "solution", "evidence", "businessModel"] as CardType[] },
]

const EXAMPLE_TOPICS: Record<string, string[]> = {
  essay: ["SNS와 자존감의 관계", "대학이 꼭 필요한가"],
  academic: ["AI와 교육의 미래: 기계 학습 도입의 타당성", "기후변화와 개인의 실질적 책임에 대한 메타분석"],
  startup: ["Z세대를 위한 개인 맞춤형 Fashion RecSys 플랫폼", "로컬 아티스트를 위한 AI Music Video 자동 생성 및 퍼블리싱 솔루션"],
}

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

// 각 논리 카드 쌍 사이에 논리적 흐름을 돕는 국문 접속사 사전 정의 (Step 3 연결용)
const LOGICAL_TRANSITIONS: Record<string, string[]> = {
  "claim-evidence": ["왜냐하면", "이에 대한 구체적인 근거로", "그 이유는"],
  "claim-counter": ["그러나 일각에서는", "물론 이에 대한 반론으로", "다만 우려되는 점은"],
  "evidence-example": ["실례로", "구체적인 사례를 들면", "실제로"],
  "counter-solution": ["이를 극복하기 위해", "이에 대한 대안으로", "따라서 해결책으로"],
  "problem-solution": ["이 문제를 해결하기 위해", "이에 따른 대응 방향으로", "따라서 제시하는 대책은"],
  "solution-businessModel": ["이 솔루션의 수익화 방안은", "비즈니스 모델 측면에서는", "지속 가능한 성장을 위해"],
  "reflection-counter": ["하지만 되짚어보면", "그럼에도 불구하고", "한 단계 더 나아가 생각해보면"],
  default: ["그리고", "나아가", "더불어", "또한"],
}

function getTransition(prevType: CardType, nextType: CardType): string {
  const key = `${prevType}-${nextType}`
  const list = LOGICAL_TRANSITIONS[key] || LOGICAL_TRANSITIONS.default
  return list[0]
}

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

// ── Helpers ────────────────────────────────────────────────────────────────

// 텍스트 볼륨 가중 TTR (어휘 다양성 지표 보완)
// 짧은 답변 작성 시 TTR이 지나치게 100%로 편향되는 오류를 최소 글자 수 페널티 가중치로 보완
function calculateWeightedTTR(texts: string[]): number {
  const fullText = texts.join(" ").trim()
  if (!fullText) return 0
  const charCount = fullText.length
  const tokens = fullText.toLowerCase().split(/[\s,.\?\!\'\"]+/).filter(w => w.length > 0)
  if (tokens.length === 0) return 0
  
  const uniqueTokens = new Set(tokens)
  const baseTtr = uniqueTokens.size / tokens.length

  // 글자 수가 100자 이하일 경우 점진적 패널티 스케일 적용 (100자 이상 시 1.0 가중치 확보)
  const lengthPenalty = Math.min(1.0, charCount / 100)
  return Math.round(baseTtr * lengthPenalty * 100) / 100
}

function extractKeywords(text: string): string[] {
  if (!text) return []
  const cleanText = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\"]/g, "")
  const words = cleanText.split(/\s+/)
  const keywords = words.filter(word => {
    const isEnglishOrNum = /^[a-zA-Z0-9]{2,}$/.test(word)
    const isKoreanLong = /^[\uac00-\ud7a3]{3,}$/.test(word)
    return isEnglishOrNum || isKoreanLong
  })
  return Array.from(new Set(keywords))
}

// ── Step Indicator ─────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1 as const, label: "질문 인출", icon: Sparkles },
    { n: 2 as const, label: "논리 조립", icon: LayoutGrid },
    { n: 3 as const, label: "사고 증명서", icon: BarChart2 },
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

interface SortableCardProps {
  block: Block
  index: number
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
  onChangeType: (id: string, type: CardType) => void
  rawAnswers: string[]
  rawQuestions: string[]
  allowedTypes: CardType[]
}

function SortableCard({
  block,
  index,
  onEdit,
  onDelete,
  onChangeType,
  rawAnswers,
  rawQuestions,
  allowedTypes,
}: SortableCardProps) {
  const [focused, setFocused] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : "auto",
  }

  const sourceRawText = block.sourceQIndex !== undefined ? rawAnswers[block.sourceQIndex] : ""
  const rawKeywords = extractKeywords(sourceRawText)
  const lockedKeywords = rawKeywords.filter(kw => block.content.includes(kw))

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex flex-col gap-3 rounded-xl border-l-4 border bg-background p-4 shadow-sm transition-shadow ${
        CARD_COLORS[block.type]
      } ${isDragging ? "shadow-lg" : "hover:shadow-md"} ${
        focused ? "border-border" : "border-border/60"
      }`}
    >
      <div className="flex items-start gap-3 w-full">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab touch-none text-muted-foreground/25 transition-colors group-hover:text-muted-foreground/50 active:cursor-grabbing"
          aria-label="드래그하여 순서 변경"
        >
          <GripVertical className="size-4" />
        </button>

        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            
            <select
              value={block.type}
              onChange={(e) => onChangeType(block.id, e.target.value as CardType)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide border-0 cursor-pointer focus:ring-1 focus:ring-ring ${BADGE_COLORS[block.type]}`}
            >
              {allowedTypes.map((t) => (
                <option key={t} value={t}>
                  {CARD_LABELS[t]}
                </option>
              ))}
            </select>

            {lockedKeywords.length > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Lock className="size-2.5 text-blue-500" />
                Keyword Lock ({lockedKeywords.length})
              </span>
            )}

            {block.hasEdited && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                <Pencil className="size-2.5" />
                직접 수정됨
              </span>
            )}
          </div>

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

        <button
          onClick={() => onDelete(block.id)}
          className="mt-1 text-muted-foreground/30 hover:text-destructive/80 transition-colors"
          title="블록 삭제"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {lockedKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center px-7 text-[10px] text-muted-foreground">
          <span className="text-slate-400">보존된 키워드:</span>
          {lockedKeywords.map((kw, i) => (
            <span key={i} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1 rounded border border-slate-200/50">
              {kw}
            </span>
          ))}
        </div>
      )}

      {block.sourceQIndex !== undefined && (
        <div className="px-7">
          <button
            onClick={() => setShowOverlay(!showOverlay)}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <Eye className="size-3" />
            {showOverlay ? "원본 답변 가리기" : "원본 답변 대조 (Vibe Check)"}
          </button>

          {showOverlay && (
            <div className="mt-2 rounded-lg border border-slate-200/60 bg-slate-50/60 p-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 space-y-1">
              <p className="font-semibold text-[10px] text-slate-400">
                [Q] {rawQuestions[block.sourceQIndex]}
              </p>
              <p className="italic leading-relaxed whitespace-pre-wrap">
                "{sourceRawText || "(답변 없음)"}"
              </p>
            </div>
          )}
        </div>
      )}
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
  description,
}: {
  label: string
  value: number | string
  goal: string
  met: boolean
  unit?: string
  description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">목표: {goal}</p>
        {description && <p className="text-[11px] text-slate-400">{description}</p>}
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
  const [domain, setDomain] = useState<"essay" | "academic" | "startup">("essay")

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
  const [historyLogs, setHistoryLogs] = useState<HistoryEvent[]>([])
  
  // 유휴 시간(Idle Time) 측정을 위한 타이머 & 상태 개선
  const step2Seconds = useTimer(step === 2)
  const [idleSeconds, setIdleSeconds] = useState(0)
  const lastActiveTimeRef = useRef<number>(Date.now())
  const isIdleRef = useRef<boolean>(false)

  // Step 3
  const [copied, setCopied] = useState(false)
  const canvasTimeRef = useRef(0)
  const canvasIdleRef = useRef(0)

  // Loading messages
  const loadingQMsg = useRotatingMsg(LOADING_Q_MSGS, isLoadingQ)
  const loadingBMsg = useRotatingMsg(LOADING_B_MSGS, isLoadingB)

  // ── Logging Helper ─────────────────────────────────────────────────────
  
  const addLog = useCallback((action: HistoryEvent["action"], description: string) => {
    setHistoryLogs((prev) => [...prev, { timestamp: Date.now(), action, description }])
  }, [])

  // ── Idle Detection Logic (사유 어뷰징 방지) ──────────────────────────────
  // 마우스나 키보드 조작이 30초 이상 없으면 Idle 상태로 분류하고, 휴면 시간을 적산
  useEffect(() => {
    if (step !== 2) return

    const handleActivity = () => {
      lastActiveTimeRef.current = Date.now()
      if (isIdleRef.current) {
        isIdleRef.current = false
        addLog("idle_detect", "학생이 에디터 조작으로 복귀했습니다.")
      }
    }

    window.addEventListener("mousemove", handleActivity)
    window.addEventListener("keydown", handleActivity)
    window.addEventListener("scroll", handleActivity)

    const interval = setInterval(() => {
      const now = Date.now()
      // 30초 동안 움직임이 없는 경우 유휴 처리
      if (now - lastActiveTimeRef.current > 30000) {
        if (!isIdleRef.current) {
          isIdleRef.current = true
          addLog("idle_detect", "30초 동안 조작이 없어 유휴 상태(Idle)로 진입했습니다.")
        }
        setIdleSeconds(s => s + 1)
      }
    }, 1000)

    return () => {
      window.removeEventListener("mousemove", handleActivity)
      window.removeEventListener("keydown", handleActivity)
      window.removeEventListener("scroll", handleActivity)
      clearInterval(interval)
    }
  }, [step, addLog])

  // Save canvas time when leaving Step 2
  useEffect(() => {
    if (step !== 2) return
    return () => { 
      canvasTimeRef.current = step2Seconds 
      canvasIdleRef.current = idleSeconds
    }
  }, [step, step2Seconds, idleSeconds])

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
    setHistoryLogs([])
    setIdleSeconds(0)
    isIdleRef.current = false
    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, domain }),
      })
      if (!res.ok) throw new Error("질문 생성에 실패했습니다.")
      const data = await res.json()
      setQuestions(data.questions)
      setAnswers(data.questions.map(() => ""))
      addLog("init", `소크라테스식 질문 ${data.questions.length}개 생성됨`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다."
      setError(msg)
      setRetryFn(() => doGenerateQuestions)
    } finally {
      setIsLoadingQ(false)
    }
  }, [topic, domain, addLog])

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
        body: JSON.stringify({ topic, questions, answers, domain }),
      })
      if (!res.ok) throw new Error("블록 생성에 실패했습니다.")
      const data = await res.json()
      setBlocks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.blocks.map((b: any) => ({
          id: b.id,
          type: b.type,
          content: b.content,
          originalContent: b.content,
          hasEdited: false,
          sourceQIndex: b.sourceQIndex,
        }))
      )
      setRearrangeCount(0)
      setStep(2)
      addLog("init", `AI 구조화 블록 ${data.blocks.length}개 조립 완료`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다."
      setError(msg)
      setRetryFn(() => doBuildBlocks)
    } finally {
      setIsLoadingB(false)
    }
  }, [topic, questions, answers, domain, addLog])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBlocks((prev) => {
        const oldIdx = prev.findIndex((b) => b.id === active.id)
        const newIdx = prev.findIndex((b) => b.id === over.id)
        const activeBlock = prev[oldIdx]
        const overBlock = prev[newIdx]
        addLog("rearrange", `블록 순서 변경: #${oldIdx + 1}(${CARD_LABELS[activeBlock.type]}) -> #${newIdx + 1}(${CARD_LABELS[overBlock.type]})`)
        return arrayMove(prev, oldIdx, newIdx)
      })
      setRearrangeCount((c) => c + 1)
    }
  }

  function handleEditBlock(id: string, content: string) {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id === id) {
          if (!b.hasEdited) {
            addLog("edit", `블록 #${prev.findIndex(x => x.id === id) + 1} (${CARD_LABELS[b.type]}) 내용 수정 시작`)
          }
          return { ...b, content, hasEdited: true }
        }
        return b
      })
    )
  }

  function handleDeleteBlock(id: string) {
    setBlocks((prev) => {
      const targetIdx = prev.findIndex((b) => b.id === id)
      if (targetIdx !== -1) {
        addLog("delete", `블록 #${targetIdx + 1} (${CARD_LABELS[prev[targetIdx].type]}) 삭제`)
      }
      return prev.filter((b) => b.id !== id)
    })
  }

  function handleChangeBlockType(id: string, type: CardType) {
    setBlocks((prev) =>
      prev.map((b, idx) => {
        if (b.id === id) {
          addLog("change_type", `블록 #${idx + 1} 타입 변경: ${CARD_LABELS[b.type]} -> ${CARD_LABELS[type]}`)
          return { ...b, type }
        }
        return b
      })
    )
  }

  function handleAddBlock() {
    const currentTypes = DOMAIN_TEMPLATES.find(d => d.id === domain)?.types || ["claim"]
    const defaultType = currentTypes[0]
    const newBlock: Block = {
      id: `custom-${Date.now()}`,
      type: defaultType,
      content: "새로운 생각을 적어보세요...",
      originalContent: "",
      hasEdited: true,
    }
    setBlocks((prev) => {
      const next = [...prev, newBlock]
      addLog("add", `사용자 커스텀 블록 추가 (기본 타입: ${CARD_LABELS[defaultType]})`)
      return next
    })
  }

  function handleGoToStep3() {
    canvasTimeRef.current = step2Seconds
    canvasIdleRef.current = idleSeconds
    setStep(3)
  }

  // 처음부터
  function handleReset() {
    setStep(1)
    setTopic("")
    setQuestions([])
    setAnswers([])
    setBlocks([])
    setError("")
    setRetryFn(null)
    setHistoryLogs([])
    setIdleSeconds(0)
    isIdleRef.current = false
    canvasTimeRef.current = 0
    canvasIdleRef.current = 0
  }

  function handleCopy() {
    // 접속사가 적용된 최종 개요 에세이 흐름 복사
    let text = ""
    blocks.forEach((b, i) => {
      if (i > 0) {
        const prev = blocks[i - 1]
        const transition = getTransition(prev.type, b.type)
        text += `\n\n[${transition}]\n\n`
      }
      text += `[${CARD_LABELS[b.type]}] ${b.content}`
    })

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Thought Index & Analytics (어뷰징 방지 강화) ─────────────────────────

  const editedCount = blocks.filter((b) => b.hasEdited).length
  const editRatio = blocks.length > 0 ? Math.round((editedCount / blocks.length) * 100) : 0
  
  // 실질 고민 시간 (전체 체류 시간 - 감지된 유휴 유령 시간)
  const realDurationSeconds = Math.max(0, canvasTimeRef.current - canvasIdleRef.current)
  const canvasMin = Math.floor(realDurationSeconds / 60)
  
  // 텍스트 볼륨이 가중된 정교한 TTR
  const lexicalDiversity = calculateWeightedTTR(answers)

  // 1) 실질 체류 시간 (최대 30점): 실질 고민 시간 5분(300초) 이상 시 30점 만점
  const timeScore = Math.min(30, Math.round((realDurationSeconds / 300) * 30))
  // 2) 편집 비율 (최대 30점): 40% 이상 직접 수정 시 30점 만점
  const editScore = Math.min(30, Math.round((editRatio / 40) * 30))
  // 3) 재배치 빈도 (최대 20점): 3회 이상 순서 섞었을 시 20점 만점
  const rearrangeScore = Math.min(20, Math.round((rearrangeCount / 3) * 20))
  // 4) 어휘 다양성 지표 (최대 20점): 보정 TTR * 20
  const diversityScore = Math.round(lexicalDiversity * 20)

  const thoughtIndex = Math.min(100, timeScore + editScore + rearrangeScore + diversityScore)

  // Markdown Report Export (접속사 흐름 적용)
  function handleExportMarkdown() {
    const templateLabel = DOMAIN_TEMPLATES.find(d => d.id === domain)?.label || ""
    const dateStr = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    
    const logsText = historyLogs
      .map((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString("ko-KR", { hour12: false })
        return `- [${time}] **${log.action.toUpperCase()}**: ${log.description}`
      })
      .join("\n")

    let essayFlowText = ""
    blocks.forEach((b, i) => {
      if (i > 0) {
        const prev = blocks[i - 1]
        const transition = getTransition(prev.type, b.type)
        essayFlowText += `\n\n*(${transition})*\n\n`
      }
      essayFlowText += `**[${CARD_LABELS[b.type]}]** ${b.content}`
    })

    const markdownContent = `# 📝 Proof of Thought (사고 과정 증명서)
    
- **작성일시**: ${dateStr}
- **글의 목적 / 장르**: ${templateLabel}
- **주제**: ${topic}

---

## 📊 오리지널리티 & 사유 지표 (Thought Metrics)

- **종합 사유 점수 (Thought Index)**: **${thoughtIndex}점** / 100점
  - *실질 고민 시간 점수*: ${timeScore}점 (순수 고민 시간: ${canvasMin}분 ${realDurationSeconds % 60}초 / 휴면 시간: ${Math.floor(canvasIdleRef.current / 60)}분 ${canvasIdleRef.current % 60}초 제외)
  - *논리 조립/수정 점수*: ${editScore}점 (수정 비율: ${editRatio}%)
  - *재배치 점수*: ${rearrangeScore}점 (재배치 횟수: ${rearrangeCount}회)
  - *어휘 다양성 점수*: ${diversityScore}점 (가중 TTR: ${lexicalDiversity})

---

## 🗺️ 사고 과정 히스토리 맵 (Milestones)
${logsText}

---

## 🧩 완성된 논리적 에세이 흐름 (Final Logical Essay Flow)
${essayFlowText}
`
    const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `Proof_of_Thought_${topic.replace(/\s+/g, "_")}.md`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const allowedTypes = DOMAIN_TEMPLATES.find((d) => d.id === domain)?.types || ["claim", "evidence", "counter", "example"]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm no-print">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">Assemble Scaffolder</span>
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

            {/* Hero */}
            {questions.length === 0 && (
              <div className="py-10 text-center space-y-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  오늘 무엇을 생각해볼까요?
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AI가 답을 다 주는 대필 유혹 대신, 당신 내부의 독창적 생각을 끄집어냅니다.
                  <br />
                  장르를 선택하고 주제를 입력하면 맞춤형 소크라테스식 질문이 제공됩니다.
                </p>
              </div>
            )}

            {/* Domain Template Selector */}
            {questions.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground text-center">글의 목적 (도메인)</p>
                <div className="grid grid-cols-3 gap-2">
                  {DOMAIN_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      onClick={() => setDomain(tmpl.id)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                        domain === tmpl.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <span className="text-lg mb-1">{tmpl.emoji}</span>
                      <span className="text-xs font-semibold">{tmpl.label}</span>
                    </button>
                  ))}
                </div>
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
                placeholder="어떤 논제나 아이디어로 글을 시작할까요?..."
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
                      질문 유도받기
                      <CornerDownLeft className="size-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* 예시 주제 칩 */}
            {questions.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">선택한 장르의 예시 키워드</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLE_TOPICS[domain].map((t) => (
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
                  아래 질문에 답변하면서 당신의 고유 어휘(전문 키워드 등)를 자유롭게 섞어 써 보세요.
                </p>

                {questions.map((q, i) => {
                  const answerLen = (answers[i] ?? "").length
                  const isAnswerWeak = answerLen > 0 && answerLen < 15
                  return (
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
                          placeholder="머릿속에 맴도는 구어체 단어들도 모두 좋습니다. 편하게 답해 보세요..."
                          className="min-h-12 resize-none rounded-lg border-0 bg-background p-3 shadow-none focus-visible:ring-0"
                        />
                      </form>
                      
                      {/* 실시간 퀄리티 게이트 피드백 가이드 */}
                      {isAnswerWeak && (
                        <p className="text-[11px] text-amber-600 flex items-center gap-1 px-1">
                          <Info className="size-3" />
                          생각의 재료가 조금 더 풍성해지도록 전문 용어나 세부 사항을 10자 이상 덧붙여 보세요!
                        </p>
                      )}
                    </div>
                  )
                })}

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
                        비파괴 논리 블록 조립하기
                      </>
                    )}
                  </Button>
                  {isLoadingB && (
                    <p className="text-center text-xs text-muted-foreground">
                      당신의 구어체 뉘앙스와 전문 어휘(Keyword Lock)를 보존하며 카드를 생성하고 있습니다.
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
                당신의 고유 뉘앙스가 100% 반영된 논리 캔버스입니다.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                블록을 직접 수정하고, 카드의 종류를 변경하거나, 새로운 논증 블록을 수동으로 추가해보세요.
                구어체 말투의 훼손도가 궁금하다면 <strong>원본 답변 대조 (Vibe Check)</strong> 버튼을 클릭하세요.
              </p>
            </div>

            {/* 실시간 진행 카운터 */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-border/40">
              <span>
                순서 조립{" "}
                <span className={`font-semibold ${rearrangeCount >= 3 ? "text-emerald-600 font-bold" : "text-foreground"}`}>
                  {rearrangeCount}회
                </span>
                {rearrangeCount >= 3 && " ✓"}
              </span>
              <span>
                직접 수정{" "}
                <span className={`font-semibold ${editRatio >= 40 ? "text-emerald-600 font-bold" : "text-foreground"}`}>
                  {editRatio}% ({editedCount}개)
                </span>
                {editRatio >= 40 && " ✓"}
              </span>
              <span>
                순수 고민{" "}
                <span className={`font-semibold tabular-nums ${canvasMin >= 5 ? "text-emerald-600 font-bold" : "text-foreground"}`}>
                  {String(Math.floor(realDurationSeconds / 60)).padStart(2, "0")}:{String(realDurationSeconds % 60).padStart(2, "0")}
                </span>
                {canvasMin >= 5 && " ✓"}
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
                      onDelete={handleDeleteBlock}
                      onChangeType={handleChangeBlockType}
                      rawAnswers={answers}
                      rawQuestions={questions}
                      allowedTypes={allowedTypes}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add Custom Block Button */}
            <div className="flex justify-center py-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddBlock}
                className="gap-1.5 border-dashed border-slate-300 hover:border-slate-500 hover:bg-slate-50"
              >
                <Plus className="size-3.5" />
                논리 카드 수동 추가
              </Button>
            </div>

            <Button
              onClick={handleGoToStep3}
              className="w-full gap-2"
              size="lg"
            >
              <BarChart2 className="size-4" />
              Proof of Thought 증명서 발급하기
            </Button>
          </div>
        )}

        {/* ─── STEP 3 ──────────────────────────────────────────────────── */}
        {step === 3 && (
          <div key="step3" className="step-fade-in space-y-6 print-full">

            {/* 오리지널리티 타이틀 */}
            <div className="space-y-1">
              <span className="rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-xs font-semibold dark:bg-indigo-900/35 dark:text-indigo-300">
                Official Certification
              </span>
              <h2 className="text-2xl font-bold tracking-tight mt-1">Proof of Thought (사고 과정 증명서)</h2>
              <p className="text-sm text-muted-foreground">
                이 문서는 AI에 의한 자동 대필이 아닌, 학생 본인의 주체적 고민과 고유 사유 과정(Lock & Preserved)을 증명합니다.
              </p>
            </div>

            {/* 종합 점수 디스플레이 */}
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/30 to-background p-6 text-center space-y-3 dark:border-indigo-950/20">
              <span className="text-xs font-semibold text-indigo-600 uppercase tracking-widest">Thought Index</span>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-6xl font-extrabold text-indigo-600 tracking-tighter">{thoughtIndex}</span>
                <span className="text-lg font-medium text-slate-400">/ 100</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {thoughtIndex >= 80 
                  ? "훌륭합니다! AI의 구조 조력을 활용하되 독창적인 전문 어휘와 말투를 주체적으로 통제하고 재조립하였습니다."
                  : thoughtIndex >= 50
                  ? "양호합니다. AI 가이드를 기반으로 본인의 수정 및 조립 개입도가 확인되었습니다."
                  : "주의: 직접적인 수정과 재조립 개입 비율이 다소 낮습니다. 주체성을 더 높여보는 것을 추천합니다."
                }
              </p>
            </div>

            {/* 4개 지표 대시보드 */}
            <div className="rounded-xl border border-border/60 bg-background px-5 shadow-sm divide-y divide-border/50">
              <MetricRow
                label="블록 재배치 빈도"
                value={rearrangeCount}
                goal="3회 이상"
                met={rearrangeCount >= 3}
                unit="회"
                description="논증의 흐름을 본인만의 흐름으로 재배열한 흔적"
              />
              <MetricRow
                label="직접 수정한 블록"
                value={editRatio}
                goal="전체의 40% 이상"
                met={editRatio >= 40}
                unit="%"
                description="AI가 제안한 문장에 휩쓸리지 않고 직접 타이핑하여 수정한 비율"
              />
              <MetricRow
                label="캔버스 실질 고민 시간"
                value={canvasMin}
                goal="5분 이상"
                met={canvasMin >= 5}
                unit="분"
                description={`순수 조립 조작을 진행한 시간 (감지된 무반응 휴면 시간 ${Math.floor(canvasIdleRef.current / 60)}분 ${canvasIdleRef.current % 60}초 차감 완료)`}
              />
              <MetricRow
                label="보정 어휘 다양성 지표 (TTR)"
                value={lexicalDiversity}
                goal="0.4 이상"
                met={lexicalDiversity >= 0.4}
                description="답변 어휘 중복을 피하고 고유 단어를 적용한 정도 (텍스트 미달 패널티 보정 적용)"
              />
            </div>

            {/* 히스토리 마일스톤 흐름 */}
            <div className="space-y-3">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="size-4 text-indigo-600" />
                사고 과정 히스토리 맵 (Milestones Timeline)
              </p>
              <div className="relative border-l border-indigo-100 ml-3 pl-4 space-y-4 dark:border-indigo-900/30">
                {historyLogs.map((log, i) => {
                  const logDate = new Date(log.timestamp)
                  return (
                    <div key={i} className="relative text-xs">
                      <span className="absolute -left-[21px] top-1.5 flex h-2 w-2 rounded-full bg-indigo-500 ring-4 ring-background" />
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {log.action.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {logDate.toLocaleTimeString("ko-KR", { hour12: false })}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{log.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 에세이 논리 브릿지 뷰 (접속사 추천 흐름) */}
            <div className="space-y-3">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Award className="size-4 text-emerald-600" />
                완성된 논리 에세이 개요서 (접속 가이드라인 포함)
              </p>
              
              <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/20 p-4 text-xs text-emerald-800 space-y-1 mb-2">
                <p className="font-bold flex items-center gap-1">
                  <Info className="size-3.5" />
                  글쓰기 꿀팁:
                </p>
                <p className="leading-relaxed">
                  각 카드 사이에 어울리는 접속 지문을 자동으로 배치했습니다. 이 연결 지시어를 활용해 카드 텍스트를 결합하면 논리 정연한 에세이 초안이 완성됩니다!
                </p>
              </div>

              <div className="space-y-2.5">
                {blocks.map((block, i) => {
                  const showTransition = i > 0
                  const prevBlock = showTransition ? blocks[i - 1] : null
                  const transitionWord = prevBlock ? getTransition(prevBlock.type, block.type) : ""

                  return (
                    <div key={block.id} className="space-y-2.5">
                      {showTransition && (
                        <div className="flex items-center gap-2 px-6">
                          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-full dark:bg-emerald-950 dark:text-emerald-300">
                            👉 {transitionWord}
                          </span>
                          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />
                        </div>
                      )}

                      <div
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
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{block.content}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* CTA */}
            <div className="space-y-3 no-print">
              <div className="flex gap-3">
                <Button
                  className="flex-1 gap-2"
                  onClick={handleExportMarkdown}
                >
                  <Download className="size-4" />
                  Markdown 증명서 내보내기
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => window.print()}
                >
                  <Zap className="size-4" />
                  PDF 인쇄 / 저장
                </Button>
              </div>
              
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="size-4 text-emerald-500" />
                    연결 흐름 복사 완료
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    접속사 결합 흐름 전체 복사
                  </>
                )}
              </Button>
              
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                  ← 에디터로 돌아가기
                </Button>
                <Button className="flex-1" onClick={handleReset}>
                  새로운 논제 시작하기
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
