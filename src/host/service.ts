import type { ConfigureRequest, ConfigureResult, DaemonState, MulticaStatus } from '../contracts.js'
import { CommandError, runCommand, type CommandResult, type CommandSpec } from './cli.js'

export const MULTICA_BIN = '/usr/local/bin/multica'
export const DSH_BIN = '/usr/local/bin/dsh'

export type CommandRunner = (spec: CommandSpec) => Promise<CommandResult>

export class ServiceError extends Error {
  constructor(
    readonly code: 'cli_missing' | 'cli_timeout' | 'login_failed' | 'configure_failed' | 'daemon_failed',
    message: string,
  ) {
    super(message)
  }
}

function safeVersion(output: string): string | undefined {
  const match = /\bmultica\s+([0-9]+(?:\.[0-9]+){2}(?:[-+][0-9A-Za-z.-]+)?)/u.exec(output)
  return match?.[1]
}

function parseConfiguredUrl(output: string): string | undefined {
  for (const line of output.split(/\r?\n/u)) {
    const match = /^\s*(?:server_url|Server URL)\s*[:=]\s*(https?:\/\/\S+)\s*$/iu.exec(line)
    if (match?.[1] !== undefined) return match[1].replace(/\/$/u, '')
  }
  return undefined
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

async function safeRun(run: CommandRunner, spec: CommandSpec): Promise<CommandResult | undefined> {
  try {
    return await run(spec)
  } catch {
    return undefined
  }
}

export class MulticaService {
  constructor(private readonly run: CommandRunner = runCommand) {}

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
    const apiUrl = config?.exitCode === 0 ? parseConfiguredUrl(config.stdout) : undefined
    const result: MulticaStatus = {
      ok: true,
      csrfToken,
      cliInstalled: true,
      configured: apiUrl !== undefined,
      authenticated: auth?.exitCode === 0,
      daemon: daemon?.exitCode === 0 ? parseDaemonState(daemon.stdout) : 'unknown',
      runtimeReady: runtime !== undefined && profileReady(runtime),
    }
    const versionNumber = safeVersion(version.stdout)
    if (versionNumber !== undefined) result.cliVersion = versionNumber
    if (apiUrl !== undefined) result.apiUrl = apiUrl
    return result
  }

  async configure(request: ConfigureRequest): Promise<ConfigureResult> {
    const login = await this.requiredRun({
      executable: MULTICA_BIN,
      args: ['--server-url', request.apiUrl, 'login', '--token'],
      stdin: `${request.token}\n`,
      timeoutMs: 30_000,
    }, 'login_failed', 'Multica 登录失败，请检查 API URL 和 token')
    if (login.exitCode !== 0) throw new ServiceError('login_failed', 'Multica 登录失败，请检查 API URL 和 token')

    for (const key of ['server_url', 'app_url'] as const) {
      const configured = await this.requiredRun({
        executable: MULTICA_BIN,
        args: ['config', 'set', key, request.apiUrl],
        timeoutMs: 10_000,
      }, 'configure_failed', '保存 Multica 地址失败')
      if (configured.exitCode !== 0) throw new ServiceError('configure_failed', '保存 Multica 地址失败')
    }

    let daemon: DaemonState = 'stopped'
    if (request.startDaemon) {
      const current = await safeRun(this.run, {
        executable: MULTICA_BIN,
        args: ['daemon', 'status', '--output', 'json'],
        timeoutMs: 5_000,
      })
      daemon = current?.exitCode === 0 ? parseDaemonState(current.stdout) : 'unknown'
      if (daemon !== 'running') {
        const started = await this.requiredRun({
          executable: MULTICA_BIN,
          args: ['daemon', 'start'],
          timeoutMs: 30_000,
        }, 'daemon_failed', 'Multica daemon 启动失败，可稍后在设置中重试')
        if (started.exitCode !== 0) throw new ServiceError('daemon_failed', 'Multica daemon 启动失败，可稍后在设置中重试')
        daemon = 'running'
      }
    }

    const runtime = await safeRun(this.run, {
      executable: DSH_BIN,
      args: ['--profile', 'multica', '--probe'],
      timeoutMs: 10_000,
    })
    return {
      ok: true,
      configured: true,
      authenticated: true,
      daemon,
      runtimeReady: runtime !== undefined && profileReady(runtime),
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

export const serviceInternals = { parseConfiguredUrl, parseDaemonState, profileReady, safeVersion }
