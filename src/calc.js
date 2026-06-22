// 간단하고 안전한 수식 평가기 (eval 미사용)
// 지원: + - × ÷ % ( ) 소수점, 단항 음수
// 표시 기호(×, ÷, −)와 내부 연산 기호를 매핑한다.

const OPERATORS = {
  '+': { prec: 2, assoc: 'L', fn: (a, b) => a + b },
  '-': { prec: 2, assoc: 'L', fn: (a, b) => a - b },
  '*': { prec: 3, assoc: 'L', fn: (a, b) => a * b },
  '/': { prec: 3, assoc: 'L', fn: (a, b) => a / b },
}

// 화면 표시 문자열을 내부 토큰용 문자열로 정규화
export function normalize(expr) {
  return expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
}

// 토크나이저: 숫자, 연산자, 괄호, % 를 토큰 배열로 변환
function tokenize(input) {
  const tokens = []
  let i = 0
  const s = normalize(input)

  while (i < s.length) {
    const ch = s[i]

    if (ch === ' ') {
      i++
      continue
    }

    // 숫자 (소수점 포함)
    if (/[0-9.]/.test(ch)) {
      let num = ''
      while (i < s.length && /[0-9.]/.test(s[i])) {
        num += s[i]
        i++
      }
      if ((num.match(/\./g) || []).length > 1) {
        throw new Error('잘못된 숫자')
      }
      tokens.push({ type: 'num', value: parseFloat(num) })
      continue
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch })
      i++
      continue
    }

    if (ch === '%') {
      tokens.push({ type: 'percent' })
      i++
      continue
    }

    if (ch in OPERATORS) {
      tokens.push({ type: 'op', value: ch })
      i++
      continue
    }

    throw new Error('알 수 없는 문자: ' + ch)
  }

  return tokens
}

// 단항 음수 처리: 식 시작이나 '(' 또는 연산자 뒤의 '-' 는 단항으로 본다.
// 단항 음수는 (0 - x) 형태로 변환해 처리한다.
function preprocessUnary(tokens) {
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === 'op' && t.value === '-') {
      const prev = out[out.length - 1]
      const isUnary =
        !prev ||
        (prev.type === 'op') ||
        (prev.type === 'paren' && prev.value === '(')
      if (isUnary) {
        // 0 - ... 로 치환
        out.push({ type: 'num', value: 0 })
        out.push({ type: 'op', value: '-' })
        continue
      }
    }
    out.push(t)
  }
  return out
}

// 퍼센트 변환: 숫자 뒤의 % 는 그 숫자를 /100 한다.
function applyPercent(tokens) {
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === 'percent') {
      const prev = out[out.length - 1]
      if (prev && prev.type === 'num') {
        prev.value = prev.value / 100
        continue
      }
      throw new Error('잘못된 % 사용')
    }
    out.push(t)
  }
  return out
}

// Shunting-yard 로 후위표기식 변환 후 평가
export function evaluate(expr) {
  let tokens = tokenize(expr)
  tokens = preprocessUnary(tokens)
  tokens = applyPercent(tokens)

  const output = []
  const stack = []

  for (const t of tokens) {
    if (t.type === 'num') {
      output.push(t)
    } else if (t.type === 'op') {
      const o1 = OPERATORS[t.value]
      while (stack.length) {
        const top = stack[stack.length - 1]
        if (top.type === 'op') {
          const o2 = OPERATORS[top.value]
          if (
            (o1.assoc === 'L' && o1.prec <= o2.prec) ||
            (o1.assoc === 'R' && o1.prec < o2.prec)
          ) {
            output.push(stack.pop())
            continue
          }
        }
        break
      }
      stack.push(t)
    } else if (t.type === 'paren' && t.value === '(') {
      stack.push(t)
    } else if (t.type === 'paren' && t.value === ')') {
      let found = false
      while (stack.length) {
        const top = stack.pop()
        if (top.type === 'paren' && top.value === '(') {
          found = true
          break
        }
        output.push(top)
      }
      if (!found) throw new Error('괄호 불일치')
    }
  }

  while (stack.length) {
    const top = stack.pop()
    if (top.type === 'paren') throw new Error('괄호 불일치')
    output.push(top)
  }

  // 후위표기식 평가
  const evalStack = []
  for (const t of output) {
    if (t.type === 'num') {
      evalStack.push(t.value)
    } else if (t.type === 'op') {
      const b = evalStack.pop()
      const a = evalStack.pop()
      if (a === undefined || b === undefined) throw new Error('수식 오류')
      if (t.value === '/' && b === 0) throw new Error('0으로 나눌 수 없음')
      evalStack.push(OPERATORS[t.value].fn(a, b))
    }
  }

  if (evalStack.length !== 1) throw new Error('수식 오류')
  const result = evalStack[0]
  if (!isFinite(result)) throw new Error('계산 불가')
  return result
}

// 결과를 보기 좋게 포맷 (불필요한 소수점 제거, 자릿수 콤마)
export function formatResult(num) {
  if (typeof num !== 'number' || isNaN(num)) return '오류'
  // 부동소수 오차 정리
  let rounded = Math.round((num + Number.EPSILON) * 1e10) / 1e10
  if (Object.is(rounded, -0)) rounded = 0

  const [intPart, decPart] = String(rounded).split('.')
  const withCommas = Number(intPart).toLocaleString('en-US')
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas
}
