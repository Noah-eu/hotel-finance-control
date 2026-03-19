import { buildWebDemo } from './index'

const result = await buildWebDemo({
  outputPath: 'dist/demo/index.html'
})

process.stdout.write(`Web demo written to ${result.outputPath}\n`)
