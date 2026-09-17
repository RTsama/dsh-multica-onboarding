import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ErrorResponse } from '../contracts.js'
import { InputError, parseConfigureRequest } from './validation.js'
import { MulticaService, ServiceError } from './service.js'

const MAX_BODY_BYTES = 32 * 1024

function json(res: ServerResponse, status: number, body: object, extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...extra,
  })
  res.end(JSON.stringify(body))
}

function error(res: ServerResponse, status: number, code: string, message: string): void {
  json(res, status, { ok: false, code, message } satisfies ErrorResponse)
}

function firstHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

export function sameToken(received: string | undefined, expected: string): boolean {
  if (received === undefined) return false
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const declared = firstHeader(req, 'content-length')
  if (declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw new InputError('invalid_json', '请求体过大')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const raw of req) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new InputError('invalid_json', '请求体过大')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new InputError('invalid_json', '请求体不是有效 JSON')
  }
}

export interface HandlerSet {
  status: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  configure: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  dismissOnboarding: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}

export function createHandlers(options: {
  service?: MulticaService
  csrfToken?: string
} = {}): HandlerSet {
  const service = options.service ?? new MulticaService()
  const csrfToken = options.csrfToken ?? randomUUID()

  return {
    async status(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('allow', 'GET, HEAD')
        error(res, 405, 'method_not_allowed', '仅支持 GET 请求')
        return
      }
      const state = await service.status(csrfToken)
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
          'x-content-type-options': 'nosniff',
        })
        res.end()
        return
      }
      json(res, 200, state)
    },

    async configure(req, res) {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        error(res, 405, 'method_not_allowed', '仅支持 POST 请求')
        return
      }
      const contentType = firstHeader(req, 'content-type')?.toLowerCase() ?? ''
      if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
        error(res, 415, 'unsupported_media_type', 'Content-Type 必须是 application/json')
        return
      }
      if (!sameToken(firstHeader(req, 'x-dsh-multica-csrf'), csrfToken)) {
        error(res, 403, 'invalid_csrf', '页面已失效，请刷新后重试')
        return
      }

      try {
        const request = parseConfigureRequest(await readJson(req))
        json(res, 200, await service.configure(request))
      } catch (caught) {
        if (caught instanceof InputError) {
          error(res, caught.message === '请求体过大' ? 413 : 400, caught.code, caught.message)
          return
        }
        if (caught instanceof ServiceError) {
          const status = caught.code === 'cli_missing' ? 503 : 502
          error(res, status, caught.code, caught.message)
          return
        }
        error(res, 500, 'internal_error', '配置 Multica 时发生内部错误')
      }
    },

    async dismissOnboarding(req, res) {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        error(res, 405, 'method_not_allowed', '仅支持 POST 请求')
        return
      }
      if (!sameToken(firstHeader(req, 'x-dsh-multica-csrf'), csrfToken)) {
        error(res, 403, 'invalid_csrf', '页面已失效，请刷新后重试')
        return
      }
      try {
        json(res, 200, service.dismissOnboarding())
      } catch (caught) {
        if (caught instanceof ServiceError) {
          error(res, 500, caught.code, caught.message)
          return
        }
        error(res, 500, 'internal_error', '保存稍后配置状态时发生内部错误')
      }
    },
  }
}
