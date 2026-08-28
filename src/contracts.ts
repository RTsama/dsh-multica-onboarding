export const STATUS_PATH = '/api/dsh-multica/status'
export const CONFIGURE_PATH = '/api/dsh-multica/configure'
export const DEFAULT_API_URL = 'https://multica.nevis.sina.com.cn'

export type DaemonState = 'running' | 'stopped' | 'unknown'

export interface MulticaStatus {
  ok: true
  csrfToken: string
  cliInstalled: boolean
  cliVersion?: string
  configured: boolean
  apiUrl?: string
  authenticated: boolean
  daemon: DaemonState
  runtimeReady: boolean
}

export interface ConfigureRequest {
  apiUrl: string
  token: string
  startDaemon: boolean
}

export interface ConfigureResult {
  ok: true
  configured: true
  authenticated: true
  daemon: DaemonState
  runtimeReady: boolean
}

export interface ErrorResponse {
  ok: false
  code: string
  message: string
}
