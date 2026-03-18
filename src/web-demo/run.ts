import { buildWebDemo } from './index'

const result = buildWebDemo({
  outputPath: 'dist/demo/index.html'
})

process.stdout.write(`Web demo written to ${result.outputPath}\n`)
