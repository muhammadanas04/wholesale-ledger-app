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

