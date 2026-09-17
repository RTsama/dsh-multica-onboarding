import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ConfigureRequest, ConfigureResult, DaemonState, DismissOnboardingResult, MulticaStatus } from '../contracts.js'
import { CommandError, runCommand, type CommandResult, type CommandSpec } from './cli.js'

export const MULTICA_BIN = '/usr/local/bin/multica'
export const DSH_BIN = '/usr/local/bin/dsh'
export const DAEMON_ENABLED_MARKER = join(
  process.env.HOME ?? '/home/node',
  '.multica',
  'nevis-daemon-enabled',
)
export const ONBOARDING_STATE_FILE = join(
  process.env.HOME ?? '/home/node',
  '.multica',
  'nevis-dsh-onboarding.json',
)

const ONBOARDING_STATE_VERSION = 1

export interface OnboardingStateStore {
  isDismissed(): boolean
  dismiss(): void
}

export type CommandRunner = (spec: CommandSpec) => Promise<CommandResult>

export class ServiceError extends Error {
  constructor(
    readonly code: 'cli_missing' | 'cli_timeout' | 'login_failed' | 'configure_failed' | 'daemon_failed' | 'onboarding_failed',
    message: string,
  ) {
    super(message)
  }
}

function safeVersion(output: string): string | undefined {
  const match = /\bmultica\s+([0-9]+(?:\.[0-9]+){2}(?:[-+][0-9A-Za-z.-]+)?)/u.exec(output)
  return match?.[1]
}

function parseConfiguredValues(output: string): { serverUrl?: string; appUrl?: string; workspace?: string } {
  const result: { serverUrl?: string; appUrl?: string; workspace?: string } = {}
  for (const line of output.split(/\r?\n/u)) {
    const match = /^\s*(server_url|app_url|workspace_id|Server URL|App URL|Workspace ID)\s*[:=]\s*(\S+)\s*$/iu.exec(line)
    if (match?.[1] === undefined || match[2] === undefined) continue
    const value = match[2].replace(/\/$/u, '')
    if (value === '(not set)') continue
    if (/^(?:server_url|Server URL)$/iu.test(match[1]) && /^https?:\/\//iu.test(value)) result.serverUrl = value
    if (/^(?:app_url|App URL)$/iu.test(match[1]) && /^https?:\/\//iu.test(value)) result.appUrl = value
    if (/^(?:workspace_id|Workspace ID)$/iu.test(match[1])) result.workspace = value
  }
  return result
}

function workspaceIdentifier(output: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  for (const key of ['id', 'workspace_id', 'slug']) {
    const value = record[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

function workspaceChoices(output: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return []
  }
  const entries = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Record<string, unknown>).workspaces)
      ? (parsed as { workspaces: unknown[] }).workspaces
      : []
  return entries.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return []
    const record = entry as Record<string, unknown>
    for (const key of ['id', 'workspace_id', 'slug']) {
      const value = record[key]
      if (typeof value === 'string' && value !== '') return [value]
    }
    return []
  })
}

function parseDaemonState(output: string): DaemonState {
  try {
    const parsed = JSON.parse(output) as { status?: unknown }
    if (parsed.status === 'running' || parsed.status === 'stopped') return parsed.status
  } catch {
    if (/\brunning\b/iu.test(output)) return 'running'
    if (/\bstopped\b/iu.test(output)) return 'stopped'
  }
  return 'unknown'
}

function profileReady(result: CommandResult): boolean {
  if (result.exitCode !== 0) return false
  try {
    const parsed = JSON.parse(result.stdout.trim()) as Record<string, unknown>
    return parsed.v === 1 && parsed.type === 'probe' && parsed.runtime === 'dsh' && parsed.protocol_version === 1
  } catch {
    return false
  }
}

function persistDaemonIntent(enabled: boolean): void {
  if (enabled) {
    mkdirSync(dirname(DAEMON_ENABLED_MARKER), { recursive: true, mode: 0o700 })
    writeFileSync(DAEMON_ENABLED_MARKER, 'enabled\n', { mode: 0o600 })
    return
  }
  rmSync(DAEMON_ENABLED_MARKER, { force: true })
}

function onboardingStateStore(path = ONBOARDING_STATE_FILE): OnboardingStateStore {
  return {
    isDismissed(): boolean {
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
        return parsed.version === ONBOARDING_STATE_VERSION && typeof parsed.dismissedAt === 'string'
      } catch {
        return false
      }
    },
    dismiss(): void {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
      try {
        writeFileSync(temporary, `${JSON.stringify({
          version: ONBOARDING_STATE_VERSION,
          dismissedAt: new Date().toISOString(),
        })}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        renameSync(temporary, path)
      } finally {
        rmSync(temporary, { force: true })
      }
    },
  }
}

async function safeRun(run: CommandRunner, spec: CommandSpec): Promise<CommandResult | undefined> {
  try {
    return await run(spec)
  } catch {
    return undefined
  }
}

export class MulticaService {
  constructor(
    private readonly run: CommandRunner = runCommand,
    private readonly setDaemonIntent: (enabled: boolean) => void = persistDaemonIntent,
    private readonly onboardingState: OnboardingStateStore = onboardingStateStore(),
  ) {}

  async status(csrfToken: string): Promise<MulticaStatus> {
    const version = await safeRun(this.run, {
      executable: MULTICA_BIN,
      args: ['version'],
      timeoutMs: 5_000,
    })
    if (version === undefined || version.exitCode !== 0) {
      return {
        ok: true,
        csrfToken,
        cliInstalled: false,
        configured: false,
        onboardingDismissed: this.onboardingState.isDismissed(),
        authenticated: false,
        daemon: 'unknown',
        runtimeReady: false,
      }
    }

    const [config, auth, daemon, runtime] = await Promise.all([
      safeRun(this.run, { executable: MULTICA_BIN, args: ['config', 'show'], timeoutMs: 5_000 }),
      safeRun(this.run, { executable: MULTICA_BIN, args: ['auth', 'status'], timeoutMs: 8_000 }),
      safeRun(this.run, { executable: MULTICA_BIN, args: ['daemon', 'status', '--output', 'json'], timeoutMs: 5_000 }),
      safeRun(this.run, { executable: DSH_BIN, args: ['--profile', 'multica', '--probe'], timeoutMs: 10_000 }),
    ])
    const values = config?.exitCode === 0 ? parseConfiguredValues(config.stdout) : {}
    const result: MulticaStatus = {
      ok: true,
      csrfToken,
      cliInstalled: true,
      onboardingDismissed: this.onboardingState.isDismissed(),
      configured: values.serverUrl !== undefined && values.appUrl !== undefined && values.workspace !== undefined,
      authenticated: auth?.exitCode === 0,
      daemon: daemon?.exitCode === 0 ? parseDaemonState(daemon.stdout) : 'unknown',
      runtimeReady: runtime !== undefined && profileReady(runtime),
    }
    const versionNumber = safeVersion(version.stdout)
    if (versionNumber !== undefined) result.cliVersion = versionNumber
    if (values.serverUrl !== undefined) result.serverUrl = values.serverUrl
    if (values.appUrl !== undefined) result.appUrl = values.appUrl
    if (values.workspace !== undefined) result.workspace = values.workspace
    return result
  }

  dismissOnboarding(): DismissOnboardingResult {
    try {
      this.onboardingState.dismiss()
    } catch {
      throw new ServiceError('onboarding_failed', '保存稍后配置状态失败，请重试')
    }
    return { ok: true, onboardingDismissed: true }
  }

  async configure(request: ConfigureRequest): Promise<ConfigureResult> {
    const login = await this.requiredRun({
      executable: MULTICA_BIN,
      args: ['--server-url', request.serverUrl, 'login', '--token'],
      stdin: `${request.token}\n`,
      timeoutMs: 30_000,
    }, 'login_failed', 'Multica 登录失败，请检查 Server URL 和 token')
    if (login.exitCode !== 0) throw new ServiceError('login_failed', 'Multica 登录失败，请检查 Server URL 和 token')

    for (const [key, value] of [
      ['server_url', request.serverUrl],
      ['app_url', request.appUrl],
    ] as const) {
      const configured = await this.requiredRun({
        executable: MULTICA_BIN,
        args: ['config', 'set', key, value],
        timeoutMs: 10_000,
      }, 'configure_failed', '保存 Multica 地址失败')
      if (configured.exitCode !== 0) throw new ServiceError('configure_failed', '保存 Multica 地址失败')
    }

    let workspace = request.workspace
    if (workspace === '') {
      const currentWorkspace = await safeRun(this.run, {
        executable: MULTICA_BIN,
        args: ['workspace', 'get', '--output', 'json'],
        timeoutMs: 10_000,
      })
      workspace = currentWorkspace?.exitCode === 0
        ? workspaceIdentifier(currentWorkspace.stdout) ?? ''
        : ''
    }
    if (workspace === '') {
      const listed = await this.requiredRun({
        executable: MULTICA_BIN,
        args: ['workspace', 'list', '--output', 'json'],
        timeoutMs: 15_000,
      }, 'configure_failed', '读取 Multica workspace 失败')
      const choices = workspaceChoices(listed.stdout)
      if (choices.length !== 1) {
        throw new ServiceError(
          'configure_failed',
          choices.length === 0
            ? '账号没有可用 workspace'
            : '账号有多个 workspace，请填写默认 Workspace ID 或 slug',
        )
      }
      workspace = choices[0] ?? ''
    }
    const switched = await this.requiredRun({
      executable: MULTICA_BIN,
      args: ['workspace', 'switch', workspace],
      timeoutMs: 15_000,
    }, 'configure_failed', '保存默认 Multica workspace 失败')
    if (switched.exitCode !== 0) throw new ServiceError('configure_failed', '保存默认 Multica workspace 失败')

    const runtime = await safeRun(this.run, {
      executable: DSH_BIN,
      args: ['--profile', 'multica', '--probe'],
      timeoutMs: 10_000,
    })
    const runtimeReady = runtime !== undefined && profileReady(runtime)
    if (request.startDaemon && !runtimeReady) {
      throw new ServiceError('daemon_failed', 'DSH Multica profile 未就绪，暂不能启动 daemon')
    }

    const current = await safeRun(this.run, {
      executable: MULTICA_BIN,
      args: ['daemon', 'status', '--output', 'json'],
      timeoutMs: 5_000,
    })
    let daemon: DaemonState = current?.exitCode === 0 ? parseDaemonState(current.stdout) : 'stopped'

    // A running daemon retains the old connection settings. Stop it before
    // persisting the new lifecycle intent so the next process sees the newly
    // saved URLs and token.
    if (daemon === 'running') {
      const stopped = await this.requiredRun({
        executable: MULTICA_BIN,
        args: ['daemon', 'stop'],
        timeoutMs: 15_000,
      }, 'daemon_failed', '停止旧 Multica daemon 失败')
      if (stopped.exitCode !== 0) throw new ServiceError('daemon_failed', '停止旧 Multica daemon 失败')
      daemon = 'stopped'
    }

    this.setDaemonIntent(request.startDaemon)
    if (request.startDaemon) {
      const started = await this.requiredRun({
        executable: MULTICA_BIN,
        args: ['daemon', 'start', '--no-auto-update', '--no-auto-reload'],
        timeoutMs: 30_000,
      }, 'daemon_failed', 'Multica daemon 启动失败，可稍后在设置中重试')
      if (started.exitCode !== 0) throw new ServiceError('daemon_failed', 'Multica daemon 启动失败，可稍后在设置中重试')
      daemon = 'running'
    }

    return {
      ok: true,
      configured: true,
      authenticated: true,
      daemon,
      runtimeReady,
    }
  }

  private async requiredRun(
    spec: CommandSpec,
    code: ServiceError['code'],
    message: string,
  ): Promise<CommandResult> {
    try {
      return await this.run(spec)
    } catch (error) {
      if (error instanceof CommandError && error.kind === 'not_found') {
        throw new ServiceError('cli_missing', '镜像中未找到 Multica CLI')
      }
      if (error instanceof CommandError && error.kind === 'timeout') {
        throw new ServiceError('cli_timeout', 'Multica 命令执行超时，请稍后重试')
      }
      throw new ServiceError(code, message)
    }
  }
}

export const serviceInternals = {
  onboardingStateStore,
  parseConfiguredValues,
  parseDaemonState,
  profileReady,
  safeVersion,
  workspaceChoices,
  workspaceIdentifier,
}
