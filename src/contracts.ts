export const STATUS_PATH = '/api/dsh-multica/status'
export const CONFIGURE_PATH = '/api/dsh-multica/configure'
export const DEFAULT_SERVER_URL = 'https://multica.nevis.sina.com.cn'
export const DEFAULT_APP_URL = 'https://multica.nevis.sina.com.cn'

export type DaemonState = 'running' | 'stopped' | 'unknown'

export interface MulticaStatus {
  ok: true
  csrfToken: string
  cliInstalled: boolean
  cliVersion?: string
  configured: boolean
  serverUrl?: string
  appUrl?: string
  workspace?: string
  authenticated: boolean
  daemon: DaemonState
  runtimeReady: boolean
}

export interface ConfigureRequest {
  serverUrl: string
  appUrl: string
  workspace: string
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
