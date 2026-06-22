import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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

// PC(마우스 기반 데스크탑) 여부 감지 — 터치 기기는 false
function useIsPC() {
  const query = '(hover: hover) and (pointer: fine)'
  const [isPC, setIsPC] = useState(() => {
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  })
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setIsPC(mq.matches)
    on()
    if (mq.addEventListener) mq.addEventListener('change', on)
    else mq.addListener(on)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on)
      else mq.removeListener(on)
    }
  }, [])
  return isPC
}

export default function App() {
  const isPC = useIsPC()
  const [expr, setExpr] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState(false)
  // 잠긴 결과(페이월용)와 결제 화면 상태
  const [locked, setLocked] = useState(null) // { expr, result } | null
  const [screen, setScreen] = useState('calc') // 'calc' | 'paywall' | 'payment'
  const [selectedPlan, setSelectedPlan] = useState('basic')
  const [paidPlan, setPaidPlan] = useState(null) // 결제 완료된 플랜 id
  const [proUnlocked, setProUnlocked] = useState(false) // 프로 영구 활성화
  // 한 번 당하면 차단 (localStorage 기록)
  const [blocked, setBlocked] = useState(() => {
    try {
      return localStorage.getItem('ysm_blocked') === '1'
    } catch {
      return false
    }
  })

  const blockUser = useCallback(() => {
    try {
      localStorage.setItem('ysm_blocked', '1')
    } catch {
      /* ignore */
    }
    setBlocked(true)
  }, [])

  const clearAll = useCallback(() => {
    setExpr('')
    setError(false)
    setLocked(null)
    setPaidPlan(null)
  }, [])

  const backspace = useCallback(() => {
    setError(false)
    setLocked(null)
    setPaidPlan(null)
    setExpr((prev) => prev.slice(0, -1))
  }, [])

  const equals = useCallback(() => {
    // 차단된 사용자는 결과 대신 차단 화면
    if (blocked) {
      setScreen('blocked')
      return
    }
    if (!expr) return
    try {
      const result = evaluate(expr)
      const formatted = formatResult(result)
      setHistory((h) => [{ expr, result: formatted }, ...h].slice(0, 50))
      if (proUnlocked) {
        // 프로 활성화 후엔 모달 없이 결과 바로 표시
        setLocked({ expr, result: formatted })
        setPaidPlan('pro')
      } else {
        // 결과를 바로 보여주지 않고 잠금 + 결제 모달 즉시 표시
        setLocked({ expr, result: formatted })
        setScreen('paywall')
      }
      setError(false)
    } catch {
      setError(true)
      setLocked(null)
    }
  }, [expr, proUnlocked, blocked])

  // 괄호 자동 판단: 열린 괄호 수와 직전 문자로 ( 또는 ) 결정
  const insertParen = useCallback(() => {
    setError(false)
    setLocked(null)
    setPaidPlan(null)
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
    setPaidPlan(null)
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
      desc: '이번 계산 결과 1회 열람',
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

  // PC에서는 지원 안내만 표시
  if (isPC) return <UnsupportedPC />

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
        ) : locked && paidPlan ? (
          <div className="locked-area">
            <div className="locked-expr">{locked.expr} =</div>
            <div className="unlocked-result">{locked.result}</div>
            <div className={`unlock-badge ${paidPlan}`}>
              {paidPlan === 'pro' ? '✨ 프로 모드 활성화' : '🔓 1회 보기 중 · 남은 횟수 0회'}
            </div>
          </div>
        ) : locked ? (
          <div
            className="locked-area"
            onClick={() => setScreen('paywall')}
            role="button"
          >
            <div className="locked-expr">{locked.expr} =</div>
            <div className="locked-result">
              <span className="locked-blur">{locked.result}</span>
              <span className="locked-lock">🔒</span>
            </div>
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
          result={locked?.result}
          won={won}
          onBack={() => setScreen('paywall')}
          onClose={() => setScreen('calc')}
          onBlock={blockUser}
          onPaid={() => {
            setPaidPlan(selectedPlan)
            if (selectedPlan === 'pro') setProUnlocked(true)
            setScreen('calc')
          }}
        />
      )}

      {/* 차단된 사용자 화면 */}
      {screen === 'blocked' && <Blocked onClose={() => setScreen('calc')} />}
    </div>
  )
}

/* ── PC 미지원 안내 ── */
function UnsupportedPC() {
  return (
    <div className="pc-block">
      <div className="pc-block-inner">
        <div className="pc-block-icon">📱</div>
        <h1 className="pc-block-title">PC에선 지원되지 않습니다</h1>
        <p className="pc-block-desc">
          이 서비스는 모바일 전용입니다.
          <br />
          휴대폰으로 접속해 주세요.
        </p>
        <p className="pc-block-foot">Galaxy Calculator · Mobile only</p>
      </div>
    </div>
  )
}

/* ── 차단된 사용자 화면 ── */
function Blocked({ onClose }) {
  const now = new Date()
  const ts =
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0') +
    ' ' +
    String(now.getHours()).padStart(2, '0') +
    ':' +
    String(now.getMinutes()).padStart(2, '0')
  return (
    <div className="sheet blocked">
      <div className="blocked-inner">
        <div className="blocked-icon">⛔</div>
        <h1 className="blocked-title">차단된 사용자입니다</h1>
        <p className="blocked-desc">
          비정상 결제 시도가 감지되어
          <br />이 기기의 이용이 <b>영구 정지</b>되었습니다.
        </p>
        <div className="blocked-info">
          <div>
            <span>차단 사유</span>
            <span>결제 우회 · 탈옥 단말기</span>
          </div>
          <div>
            <span>대상</span>
            <span>이호성 · 010-8946-0970</span>
          </div>
          <div>
            <span>차단 시각</span>
            <span className="mono">{ts}</span>
          </div>
          <div>
            <span>처리 코드</span>
            <span className="mono">ERR-BLOCKED-403</span>
          </div>
        </div>
        <p className="blocked-foot">문의: support@galaxy-calc.io</p>
        <button className="blocked-btn" onClick={onClose}>
          확인
        </button>
      </div>
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

/* ── 결제창 (실제 PG 결제창 형태의 목업) ── */
const PAY_METHODS = [
  { id: 'kakao', name: '카카오페이', cls: 'm-kakao', mark: 'pay' },
  { id: 'naver', name: '네이버페이', cls: 'm-naver', mark: 'N Pay' },
  { id: 'toss', name: '토스페이', cls: 'm-toss', mark: 'toss' },
  { id: 'card', name: '신용·체크카드', cls: 'm-card', mark: 'CARD' },
  { id: 'bank', name: '계좌이체', cls: 'm-bank', mark: 'BANK' },
  { id: 'phone', name: '휴대폰', cls: 'm-phone', mark: 'PHONE' },
]
const CARD_COMPANIES = [
  '신한', '삼성', '현대', 'KB국민', '롯데', 'BC', '하나', 'NH농협', '우리', '씨티',
]
const INSTALLMENTS = ['일시불', '2개월', '3개월', '6개월', '12개월']

// 모든 값은 화면 연출용 랜덤 가짜 데이터 (실제 수집/전송 없음)
function rnd(n) {
  return Math.floor(Math.random() * n)
}
function digits(n) {
  return Array.from({ length: n }, () => rnd(10)).join('')
}
function b64ish(n) {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  return Array.from({ length: n }, () => c[rnd(c.length)]).join('')
}
function hex(n) {
  const c = '0123456789abcdef'
  return Array.from({ length: n }, () => c[rnd(16)]).join('')
}

// cmd 스타일 가짜 로그 한 줄 생성
const LOG_POOL = [
  () => `[*] reading /proc/${rnd(9000) + 1000}/maps`,
  () => `[+] su shell acquired (uid 0)`,
  () => `0x${hex(8)}: ldr x0, [x${rnd(28)}, #0x${hex(2)}]`,
  () => `[*] patching SELinux -> permissive`,
  () => `[+] Magisk policy patched (${rnd(2000) + 200} rules)`,
  () => `GET /v2/sync/contacts ${rnd(50) + 1}/${rnd(2000) + 1000}`,
  () => `POST /upload/IMG_${digits(8)}.jpg ${rnd(900) + 100}KB 200`,
  () => `[*] dumping /data/system/users/0/accounts.db`,
  () => `[+] decrypt blob ${b64ish(18)}`,
  () => `kalloc: ${rnd(900) + 100} pages @ 0x${hex(6)}`,
  () => `[*] resolve TelephonyManager.getDeviceId`,
  () => `sqlite> SELECT * FROM contacts LIMIT ${rnd(2000)}`,
  () => `[+] contacts2.db (${rnd(3000) + 500} rows)`,
  () => `[*] zip DCIM/Camera/ ${rnd(99)}% (${rnd(900) + 100}MB)`,
  () => `tcp 142.250.${rnd(255)}.${rnd(255)}:443 ESTABLISHED`,
  () => `[+] bootloader unlocked (OEM)`,
  () => `[*] dumping /data/data/.../mmssms.db`,
  () => `Magisk: zygote injected ok`,
]
function logLine() {
  return LOG_POOL[rnd(LOG_POOL.length)]()
}

// 결제 진행 내러티브 (탈옥 연출) — status: load/info/fail/ok
function makeSteps() {
  return [
    { key: 'check', text: '기기정보 확인 중', status: 'load', ms: 1300 },
    { key: 'dev', text: '갤럭시 Z 폴드 4 · Android 14 확인됨', status: 'info', ms: 1100 },
    { key: 'sandbox', text: '앱 권한 · SELinux 정책 분석 중', status: 'load', ms: 1600 },
    { key: 'jb', text: 'Magisk 루팅 익스플로잇 주입 중', status: 'load', ms: 2200 },
    { key: 'fail', text: 'Knox 보안에 차단됨', status: 'fail', ms: 1800 },
    { key: 'retry', text: '부트로더 언락으로 재시도 중', status: 'load', ms: 2200 },
    { key: 'ok', text: '루팅 성공 · 루트 권한 획득(rooted)', status: 'ok', ms: 1500 },
    { key: 'keychain', text: '계정·인증서 자격증명 덤프 중', status: 'load', ms: 1800 },
    { key: 'index', text: '연락처 · 사진 인덱싱 중', status: 'load', ms: 1800 },
    { key: 'pkg', text: '데이터 패키지 암호화 압축 중', status: 'load', ms: 1800 },
  ]
}

const STEP_ICON = { info: 'ℹ', fail: '✕', ok: '✓' }

// 마지막 dossier (장난 타겟 — 일부 항목은 고정, 나머지는 랜덤 연출 값)
function makeDossier() {
  return [
    { label: '기기', value: '갤럭시 Z 폴드 4 · Android' },
    { label: 'IMEI', value: '35' + digits(6) + '/' + digits(6) + '/' + digits(1) },
    { label: 'SIM(ICCID)', value: '8982 0' + digits(3) + ' ' + digits(4) + ' ' + digits(4) + ' ' + digits(1) },
    { label: 'CI', value: b64ish(40) + '…' },
    { label: 'DI', value: b64ish(40) + '…' },
    { label: '이름', value: '이호성', hot: true },
    { label: '전화번호', value: '010-8946-0970', hot: true },
    { label: '접속 위치', value: '경기도 화성시 봉담읍', hot: true },
    { label: '주민등록번호', value: '991215-1******', hot: true },
    { label: '결제정보', value: '수집 완료', done: true },
    { label: '기기 내 연락처', value: '70개 저장 완료', done: true },
  ]
}

function Payment({ plan, result, won, onBack, onClose, onPaid, onBlock }) {
  const [method, setMethod] = useState('kakao')
  const [card, setCard] = useState('신한')
  const [installment, setInstallment] = useState('일시불')
  const [agreeAll, setAgreeAll] = useState(false)
  // 결제수단 폼을 건너뛰고 바로 진행 연출부터 시작
  const [stage, setStage] = useState('processing') // 'processing' | 'dossier' | 'result'
  const [step, setStep] = useState(0)
  const steps = useMemo(makeSteps, [])
  const dossier = useMemo(makeDossier, [])

  const orderNo =
    'ORD-' +
    new Date().toISOString().slice(2, 10).replace(/-/g, '') +
    '-' +
    String(Math.abs(plan.price)).padStart(6, '0')

  const handlePay = () => {
    if (!agreeAll) return
    setStep(0)
    setStage('processing')
  }

  // 결제 진행 단계를 순서대로 진행 후 dossier 연출로 전환
  useEffect(() => {
    if (stage !== 'processing') return
    if (step >= steps.length) {
      // 마지막엔 '정보 취합 중'을 잠깐 보여준 뒤 dossier로
      const t = setTimeout(() => setStage('dossier'), 2000)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStep((s) => s + 1), steps[step].ms || 700)
    return () => clearTimeout(t)
  }, [stage, step, steps])

  // dossier 연출이 끝나면 결제 완료 화면으로 + 차단 기록
  useEffect(() => {
    if (stage !== 'dossier') return
    onBlock?.()
    const total = 1400 + dossier.length * 360 + 1400
    const t = setTimeout(() => setStage('result'), total)
    return () => clearTimeout(t)
  }, [stage, dossier.length, onBlock])

  const methodName = PAY_METHODS.find((m) => m.id === method)?.name
  const progress = Math.min(100, Math.round((step / steps.length) * 100))
  const isPro = plan.id === 'pro'

  return (
    <div className="sheet pg">
      {/* 상단 보안 바 */}
      <div className="pg-secure">
        <button className="pg-back" onClick={onBack} aria-label="뒤로">‹</button>
        <span className="pg-secure-center">
          <LockIcon /> 안전결제 · SSL 보안
        </span>
        <button className="pg-x" onClick={onClose} aria-label="닫기">✕</button>
      </div>

      <div className="pg-brandbar">
        <span className="pg-merchant">갤럭시 계산기</span>
        <span className="pg-pg">PG · 결제대행</span>
      </div>

      <div className="pg-body">
        {/* 주문 정보 */}
        <div className="pg-order">
          <div className="pg-order-row">
            <span className="pg-order-label">상품명</span>
            <span className="pg-order-val">{plan.name} ({plan.period} 이용권)</span>
          </div>
          <div className="pg-order-row">
            <span className="pg-order-label">주문번호</span>
            <span className="pg-order-val mono">{orderNo}</span>
          </div>
          <div className="pg-order-divider" />
          <div className="pg-order-row total">
            <span>결제금액</span>
            <span className="pg-order-total">{won(plan.price)}</span>
          </div>
        </div>

        {/* 결제수단 */}
        <p className="pg-label">결제수단</p>
        <div className="pg-methods">
          {PAY_METHODS.map((m) => (
            <button
              key={m.id}
              className={`pg-method ${m.cls} ${method === m.id ? 'on' : ''}`}
              onClick={() => setMethod(m.id)}
            >
              <span className="pg-mark">{m.mark}</span>
              <span className="pg-mname">{m.name}</span>
            </button>
          ))}
        </div>

        {/* 카드 상세 (신용카드 선택 시) */}
        {method === 'card' && (
          <div className="pg-card-detail">
            <p className="pg-label">카드사</p>
            <div className="pg-cards">
              {CARD_COMPANIES.map((c) => (
                <button
                  key={c}
                  className={`pg-card-chip ${card === c ? 'on' : ''}`}
                  onClick={() => setCard(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="pg-label">할부 개월</p>
            <div className="pg-installments">
              {INSTALLMENTS.map((i) => (
                <button
                  key={i}
                  className={`pg-inst-chip ${installment === i ? 'on' : ''}`}
                  onClick={() => setInstallment(i)}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 간편결제 안내 */}
        {method !== 'card' && (
          <div className="pg-simple-note">
            <SimplePayLogo brand={method} />
            <p>
              <strong>{methodName}</strong>로 결제를 진행합니다.
              <br />
              결제하기를 누르면 {methodName} 인증창으로 이동합니다.
            </p>
          </div>
        )}

        {/* 약관 동의 */}
        <button
          className={`pg-agree ${agreeAll ? 'on' : ''}`}
          onClick={() => setAgreeAll((v) => !v)}
        >
          <span className="pg-agree-check">{agreeAll ? '✓' : ''}</span>
          <span className="pg-agree-text">
            <b>전체 동의</b> · 결제 진행 필수 약관에 모두 동의합니다
          </span>
        </button>
        <ul className="pg-terms">
          <li>구매조건 확인 및 결제 진행 동의 <span>보기</span></li>
          <li>개인정보 수집·이용 동의 <span>보기</span></li>
          <li>전자금융거래 이용약관 <span>보기</span></li>
        </ul>
      </div>

      <div className="pg-footer">
        <div className="pg-footer-amount">
          <span>총 결제금액</span>
          <strong>{won(plan.price)}</strong>
        </div>
        <button
          className={`pg-pay-btn ${!agreeAll ? 'disabled' : ''}`}
          onClick={handlePay}
        >
          {won(plan.price)} 결제하기
        </button>
        <p className="pg-foot-note">
          감사합니다 · 결제완료 메시지가 도착해도 놀라지 마세요
        </p>
      </div>

      {/* 결제 진행중 — 탈옥 연출 (한 번에 한 단계만) */}
      {stage === 'processing' && (() => {
        const cur =
          step < steps.length
            ? steps[step]
            : { text: '정보 취합 중', status: 'load' }
        return (
          <div className={`pg-overlay drama st-${cur.status}`}>
            <p className="pg-overlay-title">{methodName} 결제 인증 중</p>

            {/* 현재 한 단계만 크게 표시 */}
            <div className="pg-stage" key={step}>
              <div className={`pg-stage-icon st-${cur.status}`}>
                {cur.status === 'load' ? (
                  <span className="pg-stage-spinner" />
                ) : (
                  <span className="pg-stage-glyph">{STEP_ICON[cur.status]}</span>
                )}
              </div>
              <p className={`pg-stage-text st-${cur.status}`}>
                {cur.text}
                {cur.status === 'load' ? '…' : ''}
              </p>
            </div>

            <div className="pg-progress">
              <div className="pg-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <p className="pg-progress-pct">{progress}%</p>

            <p className="pg-overlay-warn">
              결제가 진행 중입니다. 창을 닫지 마세요.
            </p>

            <HackerLog />
          </div>
        )
      })()}

      {/* 정보 수집 dossier — 결제화면처럼 자연스럽게 슥슥 등장 */}
      {stage === 'dossier' && (
        <div className="pg-dossier" onClick={() => setStage('result')}>
          <div className="pg-dossier-head">
            <div className="pg-dossier-check">✓</div>
            <h2 className="pg-dossier-title">
              <Typewriter text="정보 수집을 완료했습니다" speed={60} />
            </h2>
            <p className="pg-dossier-desc">결제 인증에 필요한 정보를 확인했어요</p>
          </div>

          <ul className="pg-dossier-list">
            {dossier.map((d, i) => (
              <li
                key={d.label}
                className={`${d.hot ? 'hot' : ''} ${d.done ? 'done' : ''}`}
                style={{ animationDelay: `${1.3 + i * 0.34}s` }}
              >
                <span className="dl-label">{d.label}</span>
                <span className="dl-value">
                  {d.done ? `✓ ${d.value}` : d.value}
                </span>
              </li>
            ))}
          </ul>

          <p className="pg-dossier-skip">화면을 누르면 계속</p>
        </div>
      )}

      {/* 결제 완료 — 팡파레 + 결과 공개 */}
      {stage === 'result' && (
        <div className="pg-overlay result">
          <Confetti />
          <div className="pg-result-badge pop">🎉</div>
          <p className="pg-done-title">결제 완료!</p>
          <p className="pg-done-sub">결제가 정상적으로 승인되었습니다</p>

          {/* 플랜 활성화 */}
          <div className={`pg-activate ${isPro ? 'pro' : 'basic'}`}>
            {isPro ? '✨ 프로 모드 활성화 완료!' : '🔓 1회 보기 활성화'}
            <span className="pg-activate-sub">
              {isPro ? '무제한 계산 · 모든 결과 영구 열람' : '이번 결과 1회 열람 가능'}
            </span>
          </div>

          {/* 백그라운드 동기화 (연출) */}
          <BackgroundUploads />

          {/* 잠금 해제된 계산 결과 */}
          <div className="pg-unlocked">
            <span className="pg-unlocked-label">계산 결과</span>
            <span className="pg-unlocked-value">{result}</span>
          </div>

          <div className="pg-receipt">
            <div className="pg-receipt-row">
              <span>결제수단</span><span>{methodName}{method === 'card' ? ` · ${card} · ${installment}` : ''}</span>
            </div>
            <div className="pg-receipt-row">
              <span>상품</span><span>{plan.name} ({plan.period})</span>
            </div>
            <div className="pg-receipt-row">
              <span>주문번호</span><span className="mono">{orderNo}</span>
            </div>
            <div className="pg-receipt-row total">
              <span>결제금액</span><span>{won(plan.price)}</span>
            </div>
          </div>
          <p className="pg-result-demo">
            실제 결제가 완료되었으며, 청구까지 약 5분 소요됩니다.
            결제완료 메시지가 도착해도 놀라지 마세요. 감사합니다 🙏
          </p>
          <button className="pg-result-btn" onClick={onPaid}>
            {isPro ? '프로 모드 시작하기' : '결과 확인하기'}
          </button>
        </div>
      )}
    </div>
  )
}

/* 타자기 효과 (글자 하나씩 등장) */
function Typewriter({ text, speed = 60 }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    let i = 0
    const id = setInterval(() => {
      i += 1
      setN(i)
      if (i >= text.length) clearInterval(id)
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])
  return (
    <>
      {text.slice(0, n)}
      <span className="tw-caret" />
    </>
  )
}

/* 백그라운드 동기화 연출 (연락처 → 갤러리) */
function BackgroundUploads() {
  const [phase, setPhase] = useState('contacts') // 'contacts' | 'gallery'
  const [cPct, setCPct] = useState(0)
  const [gCount, setGCount] = useState(0)
  const G_TOTAL = 3418

  useEffect(() => {
    if (phase !== 'contacts') return
    const id = setInterval(() => {
      setCPct((p) => {
        const next = p + 4
        if (next >= 100) {
          clearInterval(id)
          setTimeout(() => setPhase('gallery'), 600)
          return 100
        }
        return next
      })
    }, 110)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'gallery') return
    // 아주 느리게 (사실상 끝나지 않음)
    const id = setInterval(() => {
      setGCount((c) => Math.min(G_TOTAL, c + 1))
    }, 950)
    return () => clearInterval(id)
  }, [phase])

  const gPct = (gCount / G_TOTAL) * 100

  return (
    <div className="pg-uploads">
      <div className="pg-upload">
        <div className="pg-upload-head">
          <span>📇 연락처 DB 업로드 {phase === 'contacts' ? '중' : '완료'}</span>
          <span className="pg-upload-pct">
            {phase === 'contacts' ? `${cPct}%` : '✓'}
          </span>
        </div>
        <div className="pg-up-bar">
          <div
            className={`pg-up-fill ${phase !== 'contacts' ? 'done' : ''}`}
            style={{ width: phase === 'contacts' ? `${cPct}%` : '100%' }}
          />
        </div>
      </div>

      {phase === 'gallery' && (
        <div className="pg-upload">
          <div className="pg-upload-head">
            <span>🖼️ 갤러리 이미지 저장 중</span>
            <span className="pg-upload-pct">
              {gCount.toLocaleString()} / {G_TOTAL.toLocaleString()}
            </span>
          </div>
          <div className="pg-up-bar">
            <div className="pg-up-fill" style={{ width: `${gPct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

/* 진행 로그 한 줄 (빠르게 갱신) */
function HackerLog() {
  const [line, setLine] = useState(logLine)
  useEffect(() => {
    const id = setInterval(() => setLine(logLine()), 55)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="hacker-log" aria-hidden="true">
      {line}
    </div>
  )
}

/* 팡파레(색종이) 연출 */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.6 + Math.random() * 1.4,
        bg: ['#ff5e5e', '#ffd24c', '#2ad17f', '#3182f6', '#a259ff', '#ff7ac0'][i % 6],
        rot: Math.random() * 360,
      })),
    []
  )
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            left: `${p.left}%`,
            background: p.bg,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function SimplePayLogo({ brand }) {
  const map = {
    kakao: { cls: 'm-kakao', mark: 'pay' },
    naver: { cls: 'm-naver', mark: 'N Pay' },
    toss: { cls: 'm-toss', mark: 'toss' },
    bank: { cls: 'm-bank', mark: 'BANK' },
    phone: { cls: 'm-phone', mark: 'PHONE' },
  }
  const b = map[brand] || map.kakao
  return <span className={`pg-simple-logo ${b.cls}`}>{b.mark}</span>
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
