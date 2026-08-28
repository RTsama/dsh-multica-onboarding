import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { DEFAULT_APP_URL, DEFAULT_SERVER_URL, type ConfigureRequest, type MulticaStatus } from '../contracts.js'

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
  const serverUrlId = useId()
  const serverUrlHintId = useId()
  const appUrlId = useId()
  const appUrlHintId = useId()
  const workspaceId = useId()
  const workspaceHintId = useId()
  const tokenId = useId()
  const tokenHintId = useId()
  const daemonId = useId()
  const [serverUrl, setServerUrl] = useState(props.status?.serverUrl ?? DEFAULT_SERVER_URL)
  const [appUrl, setAppUrl] = useState(props.status?.appUrl ?? DEFAULT_APP_URL)
  const [workspace, setWorkspace] = useState(props.status?.workspace ?? '')
  const [token, setToken] = useState('')
  const [startDaemon, setStartDaemon] = useState(true)

  useEffect(() => {
    if (props.status?.serverUrl !== undefined) setServerUrl(props.status.serverUrl)
    if (props.status?.appUrl !== undefined) setAppUrl(props.status.appUrl)
    if (props.status?.workspace !== undefined) setWorkspace(props.status.workspace)
  }, [props.status?.appUrl, props.status?.serverUrl, props.status?.workspace])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    await props.onSubmit({ serverUrl, appUrl, workspace, token, startDaemon })
    // Do not retain a credential in component state after any submit attempt.
    setToken('')
  }

  return (
    <form className="multica-form" onSubmit={(event) => { void submit(event) }}>
      <StatusGrid status={props.status} />
      <div className="multica-field">
        <label className="multica-field__label" htmlFor={serverUrlId}>Server URL</label>
        <input
          id={serverUrlId}
          aria-describedby={serverUrlHintId}
          className="multica-input"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          disabled={props.saving}
          value={serverUrl}
          onChange={(event) => { setServerUrl(event.target.value); props.onChanged() }}
        />
        <span className="multica-field__hint" id={serverUrlHintId}>Multica API 服务地址；Nevis 内部环境默认使用上面的地址，也可以覆盖。</span>
      </div>
      <div className="multica-field">
        <label className="multica-field__label" htmlFor={workspaceId}>默认 Workspace</label>
        <input
          id={workspaceId}
          aria-describedby={workspaceHintId}
          className="multica-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={props.saving}
          value={workspace}
          placeholder="Workspace ID 或 slug"
          onChange={(event) => { setWorkspace(event.target.value); props.onChanged() }}
        />
        <span className="multica-field__hint" id={workspaceHintId}>已有默认值时可留空；账号只有一个 workspace 时会自动选择。</span>
      </div>
      <div className="multica-field">
        <label className="multica-field__label" htmlFor={appUrlId}>App URL</label>
        <input
          id={appUrlId}
          aria-describedby={appUrlHintId}
          className="multica-input"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          disabled={props.saving}
          value={appUrl}
          onChange={(event) => { setAppUrl(event.target.value); props.onChanged() }}
        />
        <span className="multica-field__hint" id={appUrlHintId}>浏览器入口地址；默认与 Server URL 相同，也可以单独覆盖。</span>
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
        <span>保存后启动或热重启 Multica daemon，并在容器重启后自动恢复</span>
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
