// Eastern 'YYYY-MM-DD' helpers — the app dates everything in America/New_York.

export function todayEastern() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export function daysAgoEastern(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
