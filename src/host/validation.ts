import type { ConfigureRequest } from '../contracts.js'

const MAX_TOKEN_LENGTH = 4096

export class InputError extends Error {
  constructor(
    readonly code: 'invalid_json' | 'invalid_api_url' | 'invalid_token' | 'invalid_start_daemon',
    message: string,
  ) {
    super(message)
  }
}

export function normalizeApiUrl(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) {
    throw new InputError('invalid_api_url', '请输入有效的 Multica API URL')
  }

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new InputError('invalid_api_url', '请输入有效的 Multica API URL')
  }

  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== ''
  ) {
    throw new InputError('invalid_api_url', 'API URL 仅支持 HTTP(S)，且不能包含凭据、查询参数或片段')
  }

  const normalized = parsed.toString()
  return parsed.pathname === '/' ? normalized.slice(0, -1) : normalized.replace(/\/$/u, '')
}

export function validateToken(input: unknown): string {
  if (
    typeof input !== 'string'
    || input.length < 8
    || input.length > MAX_TOKEN_LENGTH
    || !/^(?:mul|mcn)_[^\s\u0000-\u001f\u007f]+$/u.test(input)
  ) {
    throw new InputError('invalid_token', 'Token 应以 mul_ 或 mcn_ 开头，且不能包含空白字符')
  }
  return input
}

export function parseConfigureRequest(input: unknown): ConfigureRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InputError('invalid_json', '请求体必须是 JSON 对象')
  }
  const body = input as Record<string, unknown>
  if (typeof body.startDaemon !== 'boolean') {
    throw new InputError('invalid_start_daemon', 'startDaemon 必须是布尔值')
  }
  return {
    apiUrl: normalizeApiUrl(body.apiUrl),
    token: validateToken(body.token),
    startDaemon: body.startDaemon,
  }
}
