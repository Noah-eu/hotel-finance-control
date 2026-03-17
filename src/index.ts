import * as domain from './domain'
import * as imp from './import'
import * as extraction from './extraction'
import * as normalization from './normalization'
import * as matching from './matching'
import * as exceptions from './exceptions'
import * as reporting from './reporting'

export function bootstrap() {
  return {
    domain: domain.placeholder(),
    import: imp.placeholder(),
    extraction: extraction.placeholder(),
    normalization: normalization.placeholder(),
    matching: matching.placeholder(),
    exceptions: exceptions.placeholder(),
    reporting: reporting.placeholder()
  }
}

export type BootstrapResult = ReturnType<typeof bootstrap>
