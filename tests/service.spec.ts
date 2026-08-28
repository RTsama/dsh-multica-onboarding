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
      if (command.includes('config show')) return result('server_url: https://multica.nevis.sina.com.cn\napp_url: https://multica.nevis.sina.com.cn\nworkspace_id: nevis-team\n')
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
      serverUrl: 'https://multica.nevis.sina.com.cn',
      appUrl: 'https://multica.nevis.sina.com.cn',
      workspace: 'nevis-team',
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
    const setDaemonIntent = vi.fn()
    const configured = await new MulticaService(run, setDaemonIntent).configure({
      serverUrl: 'https://multica.nevis.sina.com.cn',
      appUrl: 'https://app.nevis.sina.com.cn',
      workspace: 'nevis-team',
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
    expect(seen.some(spec => spec.args.join(' ') === 'daemon start --no-auto-update --no-auto-reload')).toBe(true)
    expect(setDaemonIntent).toHaveBeenCalledWith(true)
    expect(seen).toContainEqual(expect.objectContaining({ args: ['config', 'set', 'app_url', 'https://app.nevis.sina.com.cn'] }))
    expect(seen).toContainEqual(expect.objectContaining({ args: ['workspace', 'switch', 'nevis-team'] }))
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
      if (spec.args[0] === 'daemon' && spec.args[1] === 'status') return result('{"status":"stopped"}')
      return result('ok')
    })
    const setDaemonIntent = vi.fn()
    const configured = await new MulticaService(run, setDaemonIntent).configure({
      serverUrl: 'https://example.com', appUrl: 'https://app.example.com', workspace: 'team', token: 'mul_12345678', startDaemon: false,
    })
    expect(seen.some(spec => spec.args[0] === 'daemon' && (spec.args[1] === 'start' || spec.args[1] === 'stop'))).toBe(false)
    expect(configured.daemon).toBe('stopped')
    expect(configured.runtimeReady).toBe(false)
    expect(setDaemonIntent).toHaveBeenCalledWith(false)
  })

  it('hot-restarts a running daemon after saving both URLs', async () => {
    const seen: CommandSpec[] = []
    const run = vi.fn(async (spec: CommandSpec) => {
      seen.push(spec)
      if (spec.args.includes('--probe')) return result('{"v":1,"type":"probe","runtime":"dsh","protocol_version":1}')
      if (spec.args[0] === 'daemon' && spec.args[1] === 'status') return result('{"status":"running"}')
      return result('ok')
    })

    await new MulticaService(run, vi.fn()).configure({
      serverUrl: 'https://api.example.com',
      appUrl: 'https://app.example.com',
      workspace: 'team',
      token: 'mul_12345678',
      startDaemon: true,
    })

    const stop = seen.findIndex(spec => spec.args.join(' ') === 'daemon stop')
    const start = seen.findIndex(spec => spec.args.join(' ') === 'daemon start --no-auto-update --no-auto-reload')
    expect(stop).toBeGreaterThan(-1)
    expect(start).toBeGreaterThan(stop)
  })

  it('returns a safe login error without CLI stderr', async () => {
    const run = vi.fn(async () => result('token=mul_leaked', 1))
    await expect(new MulticaService(run, vi.fn()).configure({
      serverUrl: 'https://example.com', appUrl: 'https://app.example.com', workspace: 'team', token: 'mul_12345678', startDaemon: false,
    })).rejects.toMatchObject({ code: 'login_failed', message: 'Multica 登录失败，请检查 Server URL 和 token' })
  })
})
