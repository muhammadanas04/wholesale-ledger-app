export const formatCurrency = (amount, symbol = '₹') => {
  return `${symbol}${(amount / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export const formatPhone = (phone) => {
  if (!phone) return ''
  const cleaned = phone.replace(/\D/g, '')
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/)
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`
  }
  return phone
}

export const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return dateString
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

export const formatDateTime = (utcString) => {
  if (!utcString) return ''
  let date
  if (utcString.includes('T')) {
    date = new Date(utcString)
  } else {
    // SQLite UTC format is 'YYYY-MM-DD HH:MM:SS'. Make it ISO by adding T and Z.
    const isoString = utcString.replace(' ', 'T') + 'Z'
    date = new Date(isoString)
  }

  if (isNaN(date.getTime())) {
    return utcString
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })

  return `${day}/${month}/${year}, ${timeStr}`
}

// Auto-detect modulus from rule range values
export function getModulus(from, to) {
  const maxVal = Math.max(Math.abs(from), Math.abs(to))
  if (maxVal < 1) return 1        // decimal rules: 0.0-0.9 → mod 1
  if (maxVal < 10) return 10       // ones digit: 0-9 → mod 10
  if (maxVal < 100) return 100     // tens: 10-99 → mod 100
  if (maxVal < 1000) return 1000   // hundreds: 100-999 → mod 1000
  return 10
}

// Apply rounding based on ceil/floor rules
export function applyRounding(amountInt, config) {
  const amount = Number(amountInt)
  if (isNaN(amount) || !config || !(config.enabled === true || config.enabled === 'true')) {
    return { discountInt: 0, finalInt: isNaN(amount) ? amountInt : amount }
  }

  const isNegative = amount < 0
  const absVal = Math.abs(amount)
  const amountDecimal = absVal / 100

  // Try each rule: ceil first, then floor
  const rules = [
    { ...config.ceil, action: 'ceil' },
    { ...config.floor, action: 'floor' }
  ]

  for (const rule of rules) {
    const fromVal = parseFloat(rule.from)
    const toVal = parseFloat(rule.to)
    if (isNaN(fromVal) || isNaN(toVal)) continue

    const modulus = getModulus(fromVal, toVal)
    const relevantPart = amountDecimal % modulus
    const eps = 0.0001

    if (relevantPart >= fromVal - eps && relevantPart <= toVal + eps) {
      let finalDecimal
      if (rule.action === 'ceil') {
        finalDecimal = amountDecimal - relevantPart
      } else {
        finalDecimal = amountDecimal - relevantPart + modulus
      }

      const finalInt = Math.round(finalDecimal * 100) * (isNegative ? -1 : 1)
      const discountInt = finalInt - amount
      return { discountInt, finalInt }
    }
  }

  return { discountInt: 0, finalInt: amount }
}

