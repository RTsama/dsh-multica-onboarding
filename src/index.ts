import type { IncomingMessage, ServerResponse } from 'node:http'
import { CONFIGURE_PATH, STATUS_PATH } from './contracts.js'
import { createHandlers } from './host/http.js'

export const name = 'dsh-multica-onboarding'
export const inject = ['webServer']

interface HostContext {
  effect(callback: () => (() => void), label?: string): void
  webServer: {
    register(route: {
      kind: 'exact'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }): () => void
  }
}

export function apply(ctx: HostContext): void {
  const handlers = createHandlers()
  ctx.effect(() => {
    const disposeStatus = ctx.webServer.register({
      kind: 'exact',
      path: STATUS_PATH,
      handler: handlers.status,
    })
    const disposeConfigure = ctx.webServer.register({
      kind: 'exact',
      path: CONFIGURE_PATH,
      handler: handlers.configure,
    })
    return () => {
      disposeConfigure()
      disposeStatus()
    }
  }, 'dsh-multica-onboarding: HTTP API')
}

export { createHandlers } from './host/http.js'
export { MulticaService } from './host/service.js'
export { normalizeApiUrl, parseConfigureRequest, validateToken } from './host/validation.js'
