import { buildWebDemo } from './index'

const fixtureKeyArg = process.argv[2]
const fixtureKey = fixtureKeyArg === 'matched-payout' || fixtureKeyArg === 'unmatched-payout'
  ? fixtureKeyArg
  : undefined

const result = buildWebDemo({
  fixtureKey,
  outputPath: 'dist/demo/index.html'
})

process.stdout.write(`Web demo written to ${result.outputPath}\n`)
