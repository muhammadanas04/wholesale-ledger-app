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
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
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

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

