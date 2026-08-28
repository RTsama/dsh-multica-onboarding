import { describe, expect, it, vi } from 'vitest'
import type { CommandResult, CommandSpec } from '../src/host/cli.js'
import { DSH_BIN, MULTICA_BIN, MulticaService } from '../src/host/service.js'

function result(stdout = '', exitCode = 0): CommandResult {
  return { stdout, stderr: '', exitCode }
}

describe('MulticaService', () => {
  it('reports CLI, auth, daemon and runtime profile without exposing command output', async () => {
    const run = vi.fn(async (spec: CommandSpec) => {
      const command = [spec.executable, ...spec.args].join(' ')
      if (command.endsWith('multica version')) return result('multica 0.4.34\nos/arch: linux/amd64\n')
      if (command.includes('config show')) return result('server_url: https://multica.nevis.sina.com.cn\n')
      if (command.includes('auth status')) return result('Authenticated as employee\n')
      if (command.includes('daemon status')) return result('{"status":"running"}\n')
      if (command.includes('--probe')) return result('{"v":1,"type":"probe","runtime":"dsh","protocol_version":1}\n')
      return result('', 1)
    })
    const status = await new MulticaService(run).status('csrf-fixed')
    expect(status).toEqual({
      ok: true,
      csrfToken: 'csrf-fixed',
      cliInstalled: true,
      cliVersion: '0.4.34',
      configured: true,
      apiUrl: 'https://multica.nevis.sina.com.cn',
      authenticated: true,
      daemon: 'running',
      runtimeReady: true,
    })
    expect(JSON.stringify(status)).not.toContain('employee')
  })

  it('passes token only over stdin and starts a stopped daemon', async () => {
    const seen: CommandSpec[] = []
    const token = 'mul_super-secret-token'
    const run = vi.fn(async (spec: CommandSpec) => {
      seen.push(spec)
      if (spec.args.includes('status')) return result('{"status":"stopped"}')
      if (spec.args.includes('--probe')) return result('{"v":1,"type":"probe","runtime":"dsh","protocol_version":1}')
      return result('ok')
    })
    const configured = await new MulticaService(run).configure({
      apiUrl: 'https://multica.nevis.sina.com.cn',
      token,
      startDaemon: true,
    })

    const login = seen.find(spec => spec.args.includes('login'))
    expect(login).toMatchObject({
      executable: MULTICA_BIN,
      args: ['--server-url', 'https://multica.nevis.sina.com.cn', 'login', '--token'],
      stdin: `${token}\n`,
    })
    expect(seen.flatMap(spec => spec.args)).not.toContain(token)
    expect(seen.some(spec => spec.args.join(' ') === 'daemon start')).toBe(true)
    expect(seen.some(spec => spec.executable === DSH_BIN && spec.args.includes('--probe'))).toBe(true)
    expect(configured).toEqual({
      ok: true,
      configured: true,
      authenticated: true,
      daemon: 'running',
      runtimeReady: true,
    })
  })

  it('does not start daemon when the user opts out', async () => {
    const seen: CommandSpec[] = []
    const run = vi.fn(async (spec: CommandSpec) => {
      seen.push(spec)
      if (spec.args.includes('--probe')) return result('', 1)
      return result('ok')
    })
    const configured = await new MulticaService(run).configure({
      apiUrl: 'https://example.com', token: 'mul_12345678', startDaemon: false,
    })
    expect(seen.some(spec => spec.args.includes('daemon'))).toBe(false)
    expect(configured.daemon).toBe('stopped')
    expect(configured.runtimeReady).toBe(false)
  })

  it('returns a safe login error without CLI stderr', async () => {
    const run = vi.fn(async () => result('token=mul_leaked', 1))
    await expect(new MulticaService(run).configure({
      apiUrl: 'https://example.com', token: 'mul_12345678', startDaemon: false,
    })).rejects.toMatchObject({ code: 'login_failed', message: 'Multica 登录失败，请检查 API URL 和 token' })
  })
})
