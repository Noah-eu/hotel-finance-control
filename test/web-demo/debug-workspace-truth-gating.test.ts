import { describe, expect, it } from 'vitest'
import { buildWebDemo } from '../../src/web-demo'

describe('debug workspace truth gating', () => {
  it('keeps Booking trace parsing inside the emitted browser runtime artifact', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-04-07T07:00:00.000Z'
    })

    expect(result.html).not.toContain('buildBookingConfirmationTraceDebugPayload(')
    expect(result.html).toMatch(/function buildDebugWorkspaceTruthPayload\(state\) \{[\s\S]*function readBookingConfirmationTrace\(detailEntries\) \{/) 
  })

  it('keeps workspace truth export rendering and download behind runtime debug gates', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-04-07T07:05:00.000Z'
    })

    expect(result.html).toMatch(/function renderCompletedRuntimeWorkspaceTruthExport\(state\) \{\s+if \(!runtimeOperatorDebugMode\) \{/)
    expect(result.html).toMatch(/function triggerDebugWorkspaceTruthDownload\(\) \{\s+if \(!runtimeOperatorDebugMode\) \{/) 
  })
})
