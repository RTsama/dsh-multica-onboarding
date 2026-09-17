import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHandlers } from '../src/host/http.js'
import type { MulticaService } from '../src/host/service.js'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => { server.close(() => resolve()) })))
})

async function serve(service: MulticaService): Promise<string> {
  const handlers = createHandlers({ service, csrfToken: 'csrf-test-token' })
  const server = createServer((req, res) => {
    if (req.url === '/status') void handlers.status(req, res)
    else if (req.url === '/dismiss') void handlers.dismissOnboarding(req, res)
    else void handlers.configure(req, res)
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function fakeService(): MulticaService {
  return {
    status: vi.fn(async csrfToken => ({
      ok: true as const,
      csrfToken,
      cliInstalled: true,
      configured: false,
      onboardingDismissed: false,
      authenticated: false,
      daemon: 'stopped' as const,
      runtimeReady: true,
    })),
    configure: vi.fn(async () => ({
      ok: true as const,
      configured: true as const,
      authenticated: true as const,
      daemon: 'running' as const,
      runtimeReady: true,
    })),
    dismissOnboarding: vi.fn(() => ({ ok: true as const, onboardingDismissed: true as const })),
  } as unknown as MulticaService
}

describe('HTTP handlers', () => {
  it('returns no-store status with a CSRF token', async () => {
    const base = await serve(fakeService())
    const response = await fetch(`${base}/status`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(await response.json()).toMatchObject({ ok: true, csrfToken: 'csrf-test-token' })
  })

  it('requires POST, JSON and the CSRF header', async () => {
    const base = await serve(fakeService())
    expect((await fetch(`${base}/configure`)).status).toBe(405)
    expect((await fetch(`${base}/configure`, { method: 'POST', body: '{}' })).status).toBe(415)
    expect((await fetch(`${base}/configure`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).status).toBe(403)
  })

  it('rejects invalid and oversized bodies before calling the service', async () => {
    const service = fakeService()
    const base = await serve(service)
    const invalid = await fetch(`${base}/configure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-multica-csrf': 'csrf-test-token' },
      body: JSON.stringify({ serverUrl: 'file:///etc/passwd', appUrl: 'https://example.com', workspace: 'team', token: 'mul_12345678', startDaemon: true }),
    })
    expect(invalid.status).toBe(400)
    const oversized = await fetch(`${base}/configure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-multica-csrf': 'csrf-test-token' },
      body: JSON.stringify({ padding: 'x'.repeat(33 * 1024) }),
    })
    expect(oversized.status).toBe(413)
    expect(service.configure).not.toHaveBeenCalled()
  })

  it('passes validated data and returns only the safe result', async () => {
    const service = fakeService()
    const base = await serve(service)
    const token = 'mul_top-secret-value'
    const response = await fetch(`${base}/configure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-multica-csrf': 'csrf-test-token' },
      body: JSON.stringify({ serverUrl: 'https://api.example.com/', appUrl: 'https://app.example.com/', workspace: 'team', token, startDaemon: true }),
    })
    const body = JSON.stringify(await response.json())
    expect(response.status).toBe(200)
    expect(service.configure).toHaveBeenCalledWith({
      serverUrl: 'https://api.example.com',
      appUrl: 'https://app.example.com',
      workspace: 'team',
      token,
      startDaemon: true,
    })
    expect(body).not.toContain(token)
  })

  it('persists onboarding dismissal only with a valid CSRF token', async () => {
    const service = fakeService()
    const base = await serve(service)
    expect((await fetch(`${base}/dismiss`, { method: 'POST' })).status).toBe(403)
    const response = await fetch(`${base}/dismiss`, {
      method: 'POST',
      headers: { 'x-dsh-multica-csrf': 'csrf-test-token' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, onboardingDismissed: true })
    expect(service.dismissOnboarding).toHaveBeenCalledOnce()
  })
})
