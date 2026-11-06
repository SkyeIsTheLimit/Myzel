import Decimal from 'break_infinity.js'

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']

export function formatNumber(value: Decimal | number, digits = 1): string {
  const d = new Decimal(value)
  if (d.lt(1000)) {
    const n = d.toNumber()
    return n < 10 && n % 1 !== 0 ? n.toFixed(digits) : Math.floor(n).toString()
  }
  const exp = Math.floor(d.log10() / 3)
  if (exp < SUFFIXES.length) {
    return `${d.div(Decimal.pow(1000, exp)).toNumber().toFixed(2)} ${SUFFIXES[exp]}`
  }
  return d.toExponential(2).replace('e+', 'e')
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} Std ${m} Min`
  if (m > 0) return `${m} Min`
  return `${s} Sek`
}
