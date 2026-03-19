export function formatAmountMinorCs(amountMinor: number, currency: string): string {
  const sign = amountMinor < 0 ? '-' : ''
  const absoluteAmountMinor = Math.abs(amountMinor)
  const wholeUnits = Math.floor(absoluteAmountMinor / 100)
  const fractionalUnits = absoluteAmountMinor % 100
  const formattedWholeUnits = wholeUnits.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const formattedFractionalUnits = fractionalUnits.toString().padStart(2, '0')
  const currencySuffix = currency === 'CZK' ? 'Kč' : currency

  return `${sign}${formattedWholeUnits},${formattedFractionalUnits} ${currencySuffix}`
}