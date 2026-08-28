// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MulticaStatus } from '../src/contracts.js'
import { MulticaOnboarding } from '../src/client/Onboarding.js'
import { MulticaSettings } from '../src/client/Settings.js'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  configure: vi.fn(),
}))

vi.mock('../src/client/api.js', () => ({
  getStatus: mocks.getStatus,
  configure: mocks.configure,
}))

function status(overrides: Partial<MulticaStatus> = {}): MulticaStatus {
  return {
    ok: true,
    csrfToken: 'csrf-ui',
    cliInstalled: true,
    cliVersion: '0.4.34',
    configured: false,
    authenticated: false,
    daemon: 'stopped',
    runtimeReady: true,
    ...overrides,
  }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div><div id="test-host"></div>'
  mocks.getStatus.mockReset()
  mocks.configure.mockReset()
})

afterEach(() => { cleanup() })

describe('Multica client UI', () => {
  it('automatically completes onboarding when Multica is already authenticated', async () => {
    mocks.getStatus.mockResolvedValue(status({ configured: true, authenticated: true }))
    const complete = vi.fn()
    render(<MulticaOnboarding stepId="multica" complete={complete} openSection={vi.fn()} />, {
      container: document.getElementById('test-host')!,
    })
    await waitFor(() => { expect(complete).toHaveBeenCalledOnce() })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('submits first-run configuration and clears the token after success', async () => {
    mocks.getStatus.mockResolvedValue(status())
    mocks.configure.mockResolvedValue({
      ok: true, configured: true, authenticated: true, daemon: 'running', runtimeReady: true,
    })
    const complete = vi.fn()
    render(<MulticaOnboarding stepId="multica" complete={complete} openSection={vi.fn()} />, {
      container: document.getElementById('test-host')!,
    })
    const token = await screen.findByLabelText('访问 Token')
    fireEvent.change(token, { target: { value: 'mul_secret-value' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    await waitFor(() => { expect(complete).toHaveBeenCalledOnce() })
    expect(mocks.configure).toHaveBeenCalledWith({
      apiUrl: 'https://multica.nevis.sina.com.cn', token: 'mul_secret-value', startDaemon: true,
    }, 'csrf-ui')
    expect(screen.queryByLabelText('访问 Token')).toBeNull()
  })

  it('keeps the API URL but clears the token after a failed attempt', async () => {
    mocks.getStatus.mockResolvedValue(status())
    mocks.configure.mockRejectedValue(new Error('登录失败'))
    render(<MulticaOnboarding stepId="multica" complete={vi.fn()} openSection={vi.fn()} />, {
      container: document.getElementById('test-host')!,
    })
    const apiUrl = await screen.findByLabelText('API URL')
    const token = screen.getByLabelText('访问 Token')
    fireEvent.change(apiUrl, { target: { value: 'https://multica.example.internal' } })
    fireEvent.change(token, { target: { value: 'mul_secret-value' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    await screen.findByRole('alert')
    expect((apiUrl as HTMLInputElement).value).toBe('https://multica.example.internal')
    expect((token as HTMLInputElement).value).toBe('')
  })

  it('allows reconfiguration from the settings section without refilling a token', async () => {
    mocks.getStatus.mockResolvedValue(status({
      configured: true,
      authenticated: true,
      apiUrl: 'https://old.example.internal',
      daemon: 'running',
    }))
    mocks.configure.mockResolvedValue({
      ok: true, configured: true, authenticated: true, daemon: 'running', runtimeReady: true,
    })
    render(<MulticaSettings />, { container: document.getElementById('test-host')! })
    const apiUrl = await screen.findByLabelText('API URL')
    const token = screen.getByLabelText('访问 Token')
    expect((apiUrl as HTMLInputElement).value).toBe('https://old.example.internal')
    expect((token as HTMLInputElement).value).toBe('')
    fireEvent.change(apiUrl, { target: { value: 'https://new.example.internal' } })
    fireEvent.change(token, { target: { value: 'mcn_new-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await screen.findByRole('status')
    expect(mocks.configure).toHaveBeenCalledWith({
      apiUrl: 'https://new.example.internal', token: 'mcn_new-secret', startDaemon: true,
    }, 'csrf-ui')
    expect((token as HTMLInputElement).value).toBe('')
  })
})
