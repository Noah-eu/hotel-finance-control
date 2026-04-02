export function resolvePreviousMonthKey(monthKey: string | undefined): string {
  const normalized = String(monthKey || '').trim()

  if (!/^[0-9]{4}-[0-9]{2}$/.test(normalized)) {
    return ''
  }

  const [yearString, monthString] = normalized.split('-')
  const year = Number(yearString)
  const month = Number(monthString)

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return ''
  }

  if (month === 1) {
    return String(year - 1) + '-12'
  }

  return String(year) + '-' + String(month - 1).padStart(2, '0')
}