import { runCliDemo } from './index'

const fixtureKeyArg = process.argv[2]
const fixtureKey = fixtureKeyArg === 'matched-payout' || fixtureKeyArg === 'unmatched-payout'
  ? fixtureKeyArg
  : undefined

const result = runCliDemo({ fixtureKey })

process.stdout.write(result.output)
