import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { DEFAULT_API_URL, type ConfigureRequest, type MulticaStatus } from '../contracts.js'

interface FormProps {
  status: MulticaStatus | undefined
  saving: boolean
  error: string | undefined
  success: string | undefined
  submitLabel: string
  secondary?: ReactNode
  onSubmit(request: ConfigureRequest): Promise<boolean>
  onChanged(): void
}

function StatusDot({ good, children }: { good: boolean; children: ReactNode }): ReactNode {
  return (
    <div className="multica-status__item">
      <span className={`multica-status__dot ${good ? 'multica-status__dot--ok' : 'multica-status__dot--warn'}`} />
      <span>{children}</span>
    </div>
  )
}

export function StatusGrid({ status }: { status: MulticaStatus | undefined }): ReactNode {
  if (status === undefined) return null
  return (
    <div className="multica-status" aria-label="Multica 状态">
      <StatusDot good={status.cliInstalled}>CLI {status.cliInstalled ? `已安装${status.cliVersion === undefined ? '' : ` · ${status.cliVersion}`}` : '不可用'}</StatusDot>
      <StatusDot good={status.authenticated}>{status.authenticated ? '已登录' : '未登录'}</StatusDot>
      <StatusDot good={status.daemon === 'running'}>Daemon {status.daemon === 'running' ? '运行中' : status.daemon === 'stopped' ? '已停止' : '状态未知'}</StatusDot>
      <StatusDot good={status.runtimeReady}>DSH Multica profile {status.runtimeReady ? '可用' : '未就绪'}</StatusDot>
    </div>
  )
}

export function MulticaForm(props: FormProps): ReactNode {
  const apiUrlId = useId()
  const apiUrlHintId = useId()
  const tokenId = useId()
  const tokenHintId = useId()
  const daemonId = useId()
  const [apiUrl, setApiUrl] = useState(props.status?.apiUrl ?? DEFAULT_API_URL)
  const [token, setToken] = useState('')
  const [startDaemon, setStartDaemon] = useState(true)

  useEffect(() => {
    if (props.status?.apiUrl !== undefined) setApiUrl(props.status.apiUrl)
  }, [props.status?.apiUrl])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    await props.onSubmit({ apiUrl, token, startDaemon })
    // Do not retain a credential in component state after any submit attempt.
    setToken('')
  }

  return (
    <form className="multica-form" onSubmit={(event) => { void submit(event) }}>
      <StatusGrid status={props.status} />
      <div className="multica-field">
        <label className="multica-field__label" htmlFor={apiUrlId}>API URL</label>
        <input
          id={apiUrlId}
          aria-describedby={apiUrlHintId}
          className="multica-input"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          disabled={props.saving}
          value={apiUrl}
          onChange={(event) => { setApiUrl(event.target.value); props.onChanged() }}
        />
        <span className="multica-field__hint" id={apiUrlHintId}>Nevis 内部环境默认使用上面的地址。</span>
      </div>
      <div className="multica-field">
        <label className="multica-field__label" htmlFor={tokenId}>访问 Token</label>
        <input
          id={tokenId}
          aria-describedby={tokenHintId}
          className="multica-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          disabled={props.saving}
          value={token}
          placeholder="mul_… 或 mcn_…"
          onChange={(event) => { setToken(event.target.value); props.onChanged() }}
        />
        <span className="multica-field__hint" id={tokenHintId}>Token 只提交给当前 DSH Host，不会保存在浏览器或 DSH 设置中。</span>
      </div>
      <label className="multica-check" htmlFor={daemonId}>
        <input
          id={daemonId}
          type="checkbox"
          checked={startDaemon}
          disabled={props.saving}
          onChange={(event) => { setStartDaemon(event.target.checked); props.onChanged() }}
        />
        <span>登录后启动 Multica daemon</span>
      </label>
      {props.error !== undefined && <div className="multica-alert multica-alert--error" role="alert">{props.error}</div>}
      {props.success !== undefined && <div className="multica-alert multica-alert--success" role="status">{props.success}</div>}
      <div className="multica-actions">
        {props.secondary}
        <button className="multica-button multica-button--primary" type="submit" disabled={props.saving}>
          {props.saving ? '正在连接…' : props.submitLabel}
        </button>
      </div>
    </form>
  )
}
