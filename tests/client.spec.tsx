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
  it('shows independent Nevis defaults and the official cloud URL hints on first run', async () => {
    mocks.getStatus.mockResolvedValue(status())
    render(<MulticaOnboarding stepId="multica" complete={vi.fn()} openSection={vi.fn()} />, {
      container: document.getElementById('test-host')!,
    })

    const serverUrl = await screen.findByLabelText('Server URL')
    const appUrl = screen.getByLabelText('App URL')
    expect((serverUrl as HTMLInputElement).value).toBe('https://multica.nevis.sina.com.cn')
    expect((appUrl as HTMLInputElement).value).toBe('https://multica.nevis.sina.com.cn')
    expect(screen.getByText(/官方云服务默认：https:\/\/api\.multica\.ai；Nevis/u)).toBeTruthy()
    expect(screen.getByText(/官方云服务默认：https:\/\/multica\.ai；Nevis/u)).toBeTruthy()

    fireEvent.change(serverUrl, { target: { value: 'https://server.example.internal' } })
    expect((serverUrl as HTMLInputElement).value).toBe('https://server.example.internal')
    expect((appUrl as HTMLInputElement).value).toBe('https://multica.nevis.sina.com.cn')

    fireEvent.change(appUrl, { target: { value: 'https://app.example.internal' } })
    expect((serverUrl as HTMLInputElement).value).toBe('https://server.example.internal')
    expect((appUrl as HTMLInputElement).value).toBe('https://app.example.internal')
  })

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
      serverUrl: 'https://multica.nevis.sina.com.cn',
      appUrl: 'https://multica.nevis.sina.com.cn',
      workspace: '',
      token: 'mul_secret-value',
      startDaemon: true,
    }, 'csrf-ui')
    const submitted = mocks.configure.mock.calls[0]?.[0]
    expect(submitted?.serverUrl).not.toMatch(/[，。；：！？、]/u)
    expect(submitted?.appUrl).not.toMatch(/[，。；：！？、]/u)
    expect(screen.queryByLabelText('访问 Token')).toBeNull()
  })

  it('keeps both URLs but clears the token after a failed attempt', async () => {
    mocks.getStatus.mockResolvedValue(status())
    mocks.configure.mockRejectedValue(new Error('登录失败'))
    render(<MulticaOnboarding stepId="multica" complete={vi.fn()} openSection={vi.fn()} />, {
      container: document.getElementById('test-host')!,
    })
    const serverUrl = await screen.findByLabelText('Server URL')
    const appUrl = screen.getByLabelText('App URL')
    const token = screen.getByLabelText('访问 Token')
    fireEvent.change(serverUrl, { target: { value: 'https://api.example.internal' } })
    fireEvent.change(appUrl, { target: { value: 'https://app.example.internal' } })
    fireEvent.change(token, { target: { value: 'mul_secret-value' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    await screen.findByRole('alert')
    expect((serverUrl as HTMLInputElement).value).toBe('https://api.example.internal')
    expect((appUrl as HTMLInputElement).value).toBe('https://app.example.internal')
    expect((token as HTMLInputElement).value).toBe('')
  })

  it('prefers saved URLs and allows independent reconfiguration without refilling a token', async () => {
    mocks.getStatus.mockResolvedValue(status({
      configured: true,
      authenticated: true,
      serverUrl: 'https://old-api.example.internal',
      appUrl: 'https://old-app.example.internal',
      workspace: 'old-team',
      daemon: 'running',
    }))
    mocks.configure.mockResolvedValue({
      ok: true, configured: true, authenticated: true, daemon: 'running', runtimeReady: true,
    })
    render(<MulticaSettings />, { container: document.getElementById('test-host')! })
    const serverUrl = await screen.findByLabelText('Server URL')
    const appUrl = screen.getByLabelText('App URL')
    const token = screen.getByLabelText('访问 Token')
    expect((serverUrl as HTMLInputElement).value).toBe('https://old-api.example.internal')
    expect((appUrl as HTMLInputElement).value).toBe('https://old-app.example.internal')
    expect((token as HTMLInputElement).value).toBe('')
    fireEvent.change(serverUrl, { target: { value: 'https://new-api.example.internal' } })
    expect((appUrl as HTMLInputElement).value).toBe('https://old-app.example.internal')
    fireEvent.change(appUrl, { target: { value: 'https://new-app.example.internal' } })
    expect((serverUrl as HTMLInputElement).value).toBe('https://new-api.example.internal')
    fireEvent.change(token, { target: { value: 'mcn_new-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await screen.findByRole('status')
    expect(mocks.configure).toHaveBeenCalledWith({
      serverUrl: 'https://new-api.example.internal',
      appUrl: 'https://new-app.example.internal',
      workspace: 'old-team',
      token: 'mcn_new-secret',
      startDaemon: true,
    }, 'csrf-ui')
    expect((token as HTMLInputElement).value).toBe('')
  })
})
