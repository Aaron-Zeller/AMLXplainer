const banks = [
  'Helvetia Trust',
  'Alpine Capital',
  'Orchid Finance',
  'Lakeside Bank',
  'Meridian Bank',
  'Harbor Union',
  'Northline',
  'Pacific Credit',
]

const countries = ['CH', 'DE', 'SG', 'GB', 'AE', 'US', 'HK', 'NL']

const accounts = [
  'CH-4001',
  'CH-2208',
  'SG-1882',
  'DE-0317',
  'GB-8821',
  'AE-5520',
  'US-1033',
  'HK-7704',
]

const paymentFormats = ['SWIFT', 'SEPA', 'Wire', 'ACH']

const currenciesByCountry: Record<string, string> = {
  CH: 'CHF',
  DE: 'EUR',
  SG: 'SGD',
  GB: 'GBP',
  AE: 'AED',
  US: 'USD',
  HK: 'HKD',
  NL: 'EUR',
}

const baseTimestamp = Date.parse('2026-03-01T06:00:00Z')

export const mockTransactionRecords = Array.from({ length: 5000 }, (_, index) => {
  const fromCountry = countries[index % countries.length]
  const toCountry = countries[(index * 5 + 3) % countries.length]
  const fromBank = banks[(index * 3 + 1) % banks.length]
  const toBank = banks[(index * 7 + 4) % banks.length]
  const fromAccount = accounts[(index * 2 + 5) % accounts.length]
  const toAccount = accounts[(index * 11 + 2) % accounts.length]
  const amountPaid = 1800 + ((index * 7919) % 145000)
  const feeFactor = 0.92 + ((index % 11) * 0.008)
  const amountReceived = Math.round(amountPaid * feeFactor)
  const timestampOffsetMinutes = (index * 37) % (60 * 24 * 28)
  const paymentCurrency = currenciesByCountry[fromCountry]
  const receivingCurrency = currenciesByCountry[toCountry]
  const paymentFormat = paymentFormats[(index * 13 + 1) % paymentFormats.length]

  return {
    timestamp: new Date(baseTimestamp + timestampOffsetMinutes * 60_000).toISOString(),
    fromBank,
    fromAccount,
    fromCountry,
    toBank,
    toAccount,
    toCountry,
    amountReceived,
    receivingCurrency,
    amountPaid,
    paymentCurrency,
    paymentFormat,
  }
})
