import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MulticaForm } from './Form.js'
import { useMultica } from './use-multica.js'

export interface OnboardingProps {
  stepId: string
  complete(): void
  openSection(id: string): void
}

export function MulticaOnboarding({ complete }: OnboardingProps): ReactNode {
  const state = useMultica()
  const completed = useRef(false)
  const finish = useCallback(() => {
    if (completed.current) return
    completed.current = true
    complete()
  }, [complete])

  useEffect(() => {
    if (state.status?.onboardingDismissed === true || (state.status?.configured === true && state.status.authenticated)) finish()
  }, [finish, state.status?.authenticated, state.status?.configured, state.status?.onboardingDismissed])

  useEffect(() => {
    const root = document.getElementById('root')
    if (root === null || state.loading || state.status?.authenticated === true || state.status?.onboardingDismissed === true) return
    const previous = root.inert
    root.inert = true
    return () => { root.inert = previous }
  }, [state.loading, state.status?.authenticated, state.status?.onboardingDismissed])

  if (state.loading || state.status?.onboardingDismissed === true || (state.status?.configured === true && state.status.authenticated)) return null

  return createPortal(
    <div className="multica-onboarding-overlay">
      <section className="multica-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="multica-onboarding-title">
        <h2 className="multica-onboarding-title" id="multica-onboarding-title">连接 Multica</h2>
        <p className="multica-onboarding-lead">配置团队 Multica 服务，让 daemon 可以把任务交给本机 DSH 执行。</p>
        <MulticaForm
          status={state.status}
          saving={state.saving}
          error={state.error}
          success={state.success}
          submitLabel="保存并继续"
          onChanged={state.clearMessages}
          onSubmit={async (request) => {
            const saved = await state.save(request)
            if (saved) finish()
            return saved
          }}
          secondary={
            <button className="multica-button multica-button--secondary" type="button" disabled={state.saving} onClick={async () => {
              if (await state.dismiss()) finish()
            }}>
              稍后配置
            </button>
          }
        />
      </section>
    </div>,
    document.body,
  )
}
