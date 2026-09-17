import {
  CONFIGURE_PATH,
  DISMISS_ONBOARDING_PATH,
  STATUS_PATH,
  type ConfigureRequest,
  type ConfigureResult,
  type DismissOnboardingResult,
  type ErrorResponse,
  type MulticaStatus,
} from '../contracts.js'

export class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

export async function dismissOnboarding(
  csrfToken: string,
  signal?: AbortSignal,
): Promise<DismissOnboardingResult> {
  return decode(await fetch(DISMISS_ONBOARDING_PATH, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'x-dsh-multica-csrf': csrfToken,
    },
    signal: signal ?? null,
  }))
}

async function decode<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('invalid_response', 'DSH 返回了无效响应')
  }
  if (!response.ok || (body as { ok?: unknown }).ok === false) {
    const failure = body as Partial<ErrorResponse>
    throw new ApiError(
      typeof failure.code === 'string' ? failure.code : `http_${response.status}`,
      typeof failure.message === 'string' ? failure.message : `请求失败（HTTP ${response.status}）`,
    )
  }
  return body as T
}

export async function getStatus(signal?: AbortSignal): Promise<MulticaStatus> {
  return decode(await fetch(STATUS_PATH, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    signal: signal ?? null,
  }))
}

export async function configure(
  request: ConfigureRequest,
  csrfToken: string,
  signal?: AbortSignal,
): Promise<ConfigureResult> {
  return decode(await fetch(CONFIGURE_PATH, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-dsh-multica-csrf': csrfToken,
    },
    body: JSON.stringify(request),
    signal: signal ?? null,
  }))
}
