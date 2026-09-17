import { useCallback, useEffect, useRef, useState } from 'react'
import { configure, dismissOnboarding, getStatus } from './api.js'
import type { ConfigureRequest, MulticaStatus } from '../contracts.js'

interface MulticaState {
  status?: MulticaStatus
  loading: boolean
  saving: boolean
  error?: string
  success?: string
  refresh(): Promise<void>
  save(request: ConfigureRequest): Promise<boolean>
  dismiss(): Promise<boolean>
  clearMessages(): void
}

export function useMultica(): MulticaState {
  const [status, setStatus] = useState<MulticaStatus>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const next = await getStatus()
      if (mounted.current) setStatus(next)
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : '无法读取 Multica 状态')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const save = useCallback(async (request: ConfigureRequest): Promise<boolean> => {
    if (status === undefined) {
      setError('状态尚未加载，请稍后重试')
      return false
    }
    setSaving(true)
    setError(undefined)
    setSuccess(undefined)
    try {
      const result = await configure(request, status.csrfToken)
      if (!mounted.current) return false
      setStatus({
        ...status,
        configured: true,
        serverUrl: request.serverUrl,
        appUrl: request.appUrl,
        workspace: request.workspace,
        authenticated: true,
        daemon: result.daemon,
        runtimeReady: result.runtimeReady,
      })
      setSuccess('Multica 已连接')
      return true
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : 'Multica 配置失败')
      return false
    } finally {
      if (mounted.current) setSaving(false)
    }
  }, [status])

  const dismiss = useCallback(async (): Promise<boolean> => {
    if (status === undefined) {
      setError('状态尚未加载，请稍后重试')
      return false
    }
    setSaving(true)
    setError(undefined)
    try {
      await dismissOnboarding(status.csrfToken)
      if (!mounted.current) return false
      setStatus({ ...status, onboardingDismissed: true })
      return true
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : '保存稍后配置状态失败')
      return false
    } finally {
      if (mounted.current) setSaving(false)
    }
  }, [status])

  const clearMessages = useCallback(() => {
    setError(undefined)
    setSuccess(undefined)
  }, [])

  const result: MulticaState = { loading, saving, refresh, save, dismiss, clearMessages }
  if (status !== undefined) result.status = status
  if (error !== undefined) result.error = error
  if (success !== undefined) result.success = success
  return result
}
