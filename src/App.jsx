import { useState, useEffect, useCallback, useRef } from 'react'
import { evaluate, formatResult } from './calc.js'

const OPERATOR_CHARS = ['+', '−', '×', '÷']

// 화면 입력 문자 -> 키보드 입력 매핑
const KEY_MAP = {
  '/': '÷',
  '*': '×',
  '-': '−',
  '+': '+',
  '%': '%',
  '(': '()',
  ')': '()',
}

function isOperator(ch) {
  return OPERATOR_CHARS.includes(ch)
}

export default function App() {
  const [expr, setExpr] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState(false)
  // 잠긴 결과(페이월용)와 결제 화면 상태
  const [locked, setLocked] = useState(null) // { expr, result } | null
  const [screen, setScreen] = useState('calc') // 'calc' | 'paywall' | 'payment'
  const [selectedPlan, setSelectedPlan] = useState('basic')

  const clearAll = useCallback(() => {
    setExpr('')
    setError(false)
    setLocked(null)
  }, [])

  const backspace = useCallback(() => {
    setError(false)
    setLocked(null)
    setExpr((prev) => prev.slice(0, -1))
  }, [])

  const equals = useCallback(() => {
    if (!expr) return
    try {
      const result = evaluate(expr)
      const formatted = formatResult(result)
      setHistory((h) => [{ expr, result: formatted }, ...h].slice(0, 50))
      // 결과를 바로 보여주지 않고 잠금 상태로 둔다
      setLocked({ expr, result: formatted })
      setError(false)
    } catch {
      setError(true)
      setLocked(null)
    }
  }, [expr])

  // 괄호 자동 판단: 열린 괄호 수와 직전 문자로 ( 또는 ) 결정
  const insertParen = useCallback(() => {
    setError(false)
    setLocked(null)
    setExpr((prev) => {
      const open = (prev.match(/\(/g) || []).length
      const close = (prev.match(/\)/g) || []).length
      const last = prev.slice(-1)
      const openParensPending = open > close

      // 닫을 수 있고, 직전이 숫자/닫는괄호/% 이면 닫기
      if (openParensPending && (/[0-9)%]/.test(last))) {
        return prev + ')'
      }
      // 그 외엔 열기 (필요 시 곱셈 자동 삽입)
      if (/[0-9)%]/.test(last)) {
        return prev + '×('
      }
      return prev + '('
    })
  }, [])

  const append = useCallback((value) => {
    setError(false)
    setLocked(null)
    setExpr((prev) => {
      const last = prev.slice(-1)

      // 연산자 입력
      if (isOperator(value)) {
        if (prev === '') {
          // 음수만 시작 허용
          return value === '−' ? '−' : prev
        }
        // 직전이 연산자면 교체
        if (isOperator(last)) {
          return prev.slice(0, -1) + value
        }
        if (last === '(') {
          return value === '−' ? prev + '−' : prev
        }
        return prev + value
      }

      // 소수점
      if (value === '.') {
        // 현재 숫자 토막에 이미 . 이 있으면 무시
        const segment = prev.split(/[+\-−×÷*/()%]/).pop()
        if (segment.includes('.')) return prev
        if (segment === '') return prev + '0.'
        return prev + '.'
      }

      // 퍼센트
      if (value === '%') {
        if (prev === '' || isOperator(last) || last === '(') return prev
        return prev + '%'
      }

      // 숫자
      // 선행 0 정리: '0' 다음 바로 숫자가 오면 0 제거 (0.x 제외)
      if (/[0-9]/.test(value)) {
        const segment = prev.split(/[+\-−×÷*/()%]/).pop()
        if (segment === '0') {
          return prev.slice(0, -1) + value
        }
        // 닫는 괄호나 % 뒤 숫자는 곱셈 자동 삽입
        if (last === ')' || last === '%') {
          return prev + '×' + value
        }
      }

      return prev + value
    })
  }, [])

  // 키보드 지원 — 핸들러를 ref 에 담아 리스너를 단 한 번만 등록한다
  // (매 입력마다 리스너를 재등록하지 않아 버벅임 방지)
  const handlers = useRef({})
  handlers.current = { append, insertParen, equals, backspace, clearAll }

  useEffect(() => {
    const onKey = (e) => {
      const h = handlers.current
      const k = e.key
      if (k >= '0' && k <= '9') {
        h.append(k)
      } else if (k === '.') {
        h.append('.')
      } else if (KEY_MAP[k]) {
        if (k === '(' || k === ')') h.insertParen()
        else if (k === '%') h.append('%')
        else h.append(KEY_MAP[k])
      } else if (k === 'Enter' || k === '=') {
        e.preventDefault()
        h.equals()
      } else if (k === 'Backspace') {
        h.backspace()
      } else if (k === 'Escape') {
        h.clearAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const useHistoryItem = (item) => {
    setExpr(item.result.replace(/,/g, ''))
    setShowHistory(false)
    setError(false)
    setLocked(null)
  }

  const PLANS = {
    basic: {
      id: 'basic',
      name: '일반 모드',
      desc: '이번 결과 1회 열람',
      price: 5900,
      period: '1회',
    },
    pro: {
      id: 'pro',
      name: 'Pro 모드',
      desc: '무제한 계산 + 모든 결과 영구 열람',
      price: 129000,
      period: '평생',
    },
  }
  const won = (n) => '₩' + n.toLocaleString('en-US')

  // 디스플레이용: 천단위 콤마는 결과에만, 식은 그대로 보여준다
  const displayExpr = expr || '0'

  const buttons = [
    { label: 'C', type: 'clear', onClick: clearAll },
    { label: '⌫', type: 'clear', onClick: backspace, aria: '지우기' },
    { label: '%', type: 'func', onClick: () => append('%') },
    { label: '÷', type: 'op', onClick: () => append('÷') },

    { label: '7', type: 'num', onClick: () => append('7') },
    { label: '8', type: 'num', onClick: () => append('8') },
    { label: '9', type: 'num', onClick: () => append('9') },
    { label: '×', type: 'op', onClick: () => append('×') },

    { label: '4', type: 'num', onClick: () => append('4') },
    { label: '5', type: 'num', onClick: () => append('5') },
    { label: '6', type: 'num', onClick: () => append('6') },
    { label: '−', type: 'op', onClick: () => append('−') },

    { label: '1', type: 'num', onClick: () => append('1') },
    { label: '2', type: 'num', onClick: () => append('2') },
    { label: '3', type: 'num', onClick: () => append('3') },
    { label: '+', type: 'op', onClick: () => append('+') },

    { label: '( )', type: 'func', onClick: insertParen },
    { label: '0', type: 'num', onClick: () => append('0') },
    { label: '.', type: 'num', onClick: () => append('.') },
    { label: '=', type: 'equals', onClick: equals },
  ]

  return (
    <div className="phone">
      {/* 상단 바 */}
      <header className="topbar">
        <button
          className={`icon-btn ${showHistory ? 'active' : ''}`}
          onClick={() => setShowHistory((s) => !s)}
          aria-label="계산 기록"
        >
          <HistoryIcon />
        </button>
        <div className="topbar-right">
          <button className="icon-btn" aria-label="단위 변환">
            <RulerIcon />
          </button>
          <button className="icon-btn" aria-label="공학용 계산기">
            <SciIcon />
          </button>
        </div>
      </header>

      {/* 디스플레이 */}
      <section className="display">
        {showHistory ? (
          <div className="history-panel">
            {history.length === 0 ? (
              <p className="history-empty">계산 기록이 없습니다</p>
            ) : (
              <ul>
                {history.map((item, idx) => (
                  <li key={idx} onClick={() => useHistoryItem(item)}>
                    <span className="history-expr">{item.expr}</span>
                    <span className="history-result">= {item.result}</span>
                  </li>
                ))}
              </ul>
            )}
            {history.length > 0 && (
              <button className="clear-history" onClick={() => setHistory([])}>
                기록 지우기
              </button>
            )}
          </div>
        ) : locked ? (
          <div className="locked-area">
            <div className="locked-expr">{locked.expr} =</div>
            <div className="locked-result">
              <span className="locked-blur">{locked.result}</span>
              <span className="locked-lock">🔒</span>
            </div>
            <button className="reveal-btn" onClick={() => setScreen('paywall')}>
              결과 보기
            </button>
          </div>
        ) : (
          <div className={`expr-line ${error ? 'error' : ''}`}>
            {error ? '오류' : displayExpr}
            <span className="cursor" />
          </div>
        )}
      </section>

      {/* 버튼 패드 */}
      <section className="keypad">
        {buttons.map((b) => (
          <button
            key={b.label}
            className={`key key-${b.type}`}
            onClick={b.onClick}
            aria-label={b.aria || b.label}
          >
            {b.label}
          </button>
        ))}
      </section>

      {/* 결과 잠금 해제 페이월 */}
      {screen === 'paywall' && (
        <Paywall
          plans={PLANS}
          selected={selectedPlan}
          onSelect={setSelectedPlan}
          won={won}
          onClose={() => setScreen('calc')}
          onContinue={() => setScreen('payment')}
        />
      )}

      {/* 결제 수단 선택 화면 */}
      {screen === 'payment' && (
        <Payment
          plan={PLANS[selectedPlan]}
          won={won}
          onBack={() => setScreen('paywall')}
          onClose={() => setScreen('calc')}
        />
      )}
    </div>
  )
}

/* ── 결과 잠금 해제 페이월 (플랜 선택) ── */
function Paywall({ plans, selected, onSelect, won, onClose, onContinue }) {
  return (
    <div className="sheet paywall">
      <button className="sheet-close" onClick={onClose} aria-label="닫기">
        ✕
      </button>
      <div className="paywall-inner">
        <p className="paywall-eyebrow">UNLOCK RESULT</p>
        <h1 className="paywall-title">
          결과를 확인하려면
          <br />
          플랜을 선택하세요
        </h1>
        <p className="paywall-sub">고급 연산 엔진의 계산을 완료했어요</p>

        {Object.values(plans).map((plan) => {
          const active = selected === plan.id
          const isPro = plan.id === 'pro'
          return (
            <button
              key={plan.id}
              className={`plan-card ${active ? 'active' : ''} ${isPro ? 'pro' : ''}`}
              onClick={() => onSelect(plan.id)}
            >
              <div className="plan-head">
                <div className="plan-name-row">
                  <span className="plan-name">{plan.name}</span>
                  {isPro && <span className="plan-badge">BEST</span>}
                </div>
                <span className={`plan-radio ${active ? 'on' : ''}`} />
              </div>
              <p className="plan-desc">{plan.desc}</p>
              {isPro && (
                <ul className="plan-features">
                  <li>모든 계산 결과 무제한 열람</li>
                  <li>광고 제거 · 우선 처리</li>
                  <li>프리미엄 연산 엔진 V2</li>
                </ul>
              )}
              <div className="plan-price">
                <span className="plan-amount">{won(plan.price)}</span>
                <span className="plan-period">/ {plan.period}</span>
              </div>
            </button>
          )
        })}

        <button className="cta-btn" onClick={onContinue}>
          선택한 플랜으로 계속
        </button>
        <p className="paywall-foot">결제 전 약관 · 자동 갱신 · 언제든 해지 가능</p>
      </div>
    </div>
  )
}

/* ── 결제 수단 선택 화면 (목업) ── */
function Payment({ plan, won, onBack, onClose }) {
  const [method, setMethod] = useState('kakao')
  const [done, setDone] = useState(false)

  const methods = [
    { id: 'kakao', name: '카카오페이', sub: '간편결제', emoji: '💛', cls: 'kakao' },
    { id: 'naver', name: '네이버페이', sub: '포인트 적립', emoji: '💚', cls: 'naver' },
    { id: 'toss', name: '토스페이', sub: '간편결제', emoji: '💙', cls: 'toss' },
    { id: 'card', name: '신용 · 체크카드', sub: '일시불 / 할부', emoji: '💳', cls: 'card' },
    { id: 'phone', name: '휴대폰 결제', sub: '통신사 청구', emoji: '📱', cls: 'phone' },
  ]

  const handlePay = () => setDone(true)

  return (
    <div className="sheet payment">
      <header className="pay-header">
        <button className="pay-back" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <span className="pay-title">결제하기</span>
        <button className="pay-x" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </header>

      <div className="pay-body">
        <div className="pay-summary">
          <span className="pay-plan">{plan.name} · {plan.period}</span>
          <span className="pay-amount">{won(plan.price)}</span>
        </div>

        <p className="pay-section-title">결제 수단</p>
        <div className="pay-methods">
          {methods.map((m) => (
            <button
              key={m.id}
              className={`pay-method ${m.cls} ${method === m.id ? 'on' : ''}`}
              onClick={() => setMethod(m.id)}
            >
              <span className="pm-emoji">{m.emoji}</span>
              <span className="pm-text">
                <span className="pm-name">{m.name}</span>
                <span className="pm-sub">{m.sub}</span>
              </span>
              <span className={`pm-radio ${method === m.id ? 'on' : ''}`} />
            </button>
          ))}
        </div>

        <div className="pay-agree">
          <span className="pay-check">✓</span>
          주문 내용 확인 및 결제 진행에 동의합니다
        </div>
      </div>

      <div className="pay-footer">
        <button className="pay-btn" onClick={handlePay}>
          {won(plan.price)} 결제하기
        </button>
        <p className="pay-demo-note">데모 화면입니다 · 실제 결제는 진행되지 않습니다</p>
      </div>

      {done && (
        <div className="pay-toast" onClick={() => setDone(false)}>
          <div className="pay-toast-card">
            <div className="pay-toast-emoji">🧪</div>
            <p className="pay-toast-title">데모 결제 화면</p>
            <p className="pay-toast-desc">
              실제 결제는 연결되어 있지 않습니다.
              <br />
              {methods.find((m) => m.id === method)?.name}(으)로 {won(plan.price)}{' '}
              결제하는 화면입니다.
            </p>
            <button className="pay-toast-btn" onClick={() => setDone(false)}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function RulerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 16 16 3l5 5L8 21z" />
      <path d="M7 12l2 2M10 9l2 2M13 6l2 2" />
    </svg>
  )
}

function SciIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12l2 3 4-6" />
    </svg>
  )
}
