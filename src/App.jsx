import { useState, useEffect, useCallback } from 'react'
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
  const [preview, setPreview] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState(false)

  // 실시간 미리보기 결과 계산
  useEffect(() => {
    if (!expr) {
      setPreview('')
      return
    }
    try {
      const result = evaluate(expr)
      setPreview(formatResult(result))
    } catch {
      setPreview('')
    }
  }, [expr])

  const clearAll = useCallback(() => {
    setExpr('')
    setPreview('')
    setError(false)
  }, [])

  const backspace = useCallback(() => {
    setError(false)
    setExpr((prev) => prev.slice(0, -1))
  }, [])

  const equals = useCallback(() => {
    if (!expr) return
    try {
      const result = evaluate(expr)
      const formatted = formatResult(result)
      setHistory((h) => [{ expr, result: formatted }, ...h].slice(0, 50))
      setExpr(formatted.replace(/,/g, ''))
      setPreview('')
      setError(false)
    } catch {
      setError(true)
    }
  }, [expr])

  // 괄호 자동 판단: 열린 괄호 수와 직전 문자로 ( 또는 ) 결정
  const insertParen = useCallback(() => {
    setError(false)
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

  // 키보드 지원
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key
      if (k >= '0' && k <= '9') {
        append(k)
      } else if (k === '.') {
        append('.')
      } else if (KEY_MAP[k]) {
        if (k === '(' || k === ')') insertParen()
        else if (k === '%') append('%')
        else append(KEY_MAP[k])
      } else if (k === 'Enter' || k === '=') {
        e.preventDefault()
        equals()
      } else if (k === 'Backspace') {
        backspace()
      } else if (k === 'Escape') {
        clearAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [append, insertParen, equals, backspace, clearAll])

  const useHistoryItem = (item) => {
    setExpr(item.result.replace(/,/g, ''))
    setShowHistory(false)
    setError(false)
  }

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
        ) : (
          <>
            <div className={`expr-line ${error ? 'error' : ''}`}>
              {error ? '오류' : displayExpr}
              <span className="cursor" />
            </div>
            <div className="preview-line">{preview && !error ? preview : ''}</div>
          </>
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
