import type { ReactNode } from 'react'
import { MulticaForm } from './Form.js'
import { useMultica } from './use-multica.js'

export function MulticaSettings(): ReactNode {
  const state = useMultica()
  return (
    <section className="multica-settings" aria-labelledby="multica-settings-title">
      <h2 id="multica-settings-title">Multica</h2>
      <p className="multica-settings__lead">查看连接状态，或使用新的 API URL 和 token 重新登录。</p>
      <div className="multica-card">
        {state.loading
          ? <div className="multica-loading">正在读取 Multica 状态…</div>
          : (
              <MulticaForm
                status={state.status}
                saving={state.saving}
                error={state.error}
                success={state.success}
                submitLabel="保存配置"
                onChanged={state.clearMessages}
                onSubmit={state.save}
              />
            )}
      </div>
    </section>
  )
}
