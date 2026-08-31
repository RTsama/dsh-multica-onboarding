export const styles = String.raw`
.multica-onboarding-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.52)}
.multica-onboarding-dialog{box-sizing:border-box;width:min(520px,100%);max-height:calc(100vh - 48px);overflow:auto;border:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.24));border-radius:18px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);box-shadow:0 20px 60px rgba(0,0,0,.28);padding:28px}
.multica-onboarding-title{margin:0;font-size:22px;line-height:30px;font-weight:650}
.multica-onboarding-lead{margin:8px 0 24px;color:var(--dsw-alias-label-secondary,#555);font-size:14px;line-height:22px}
.multica-settings{box-sizing:border-box;width:min(680px,100%);padding:8px 2px 32px;color:var(--dsw-alias-label-primary,#111)}
.multica-settings h2{margin:0 0 8px;font-size:22px;line-height:30px}
.multica-settings__lead{margin:0 0 24px;color:var(--dsw-alias-label-secondary,#555);font-size:14px;line-height:22px}
.multica-card{border:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.24));border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);padding:20px}
.multica-form{display:grid;gap:18px}
.multica-field{display:grid;gap:7px}
.multica-field__label{font-size:14px;font-weight:600;line-height:20px}
.multica-field__hint{color:var(--dsw-alias-label-tertiary,#777);font-size:12px;line-height:18px}
.multica-input{box-sizing:border-box;width:100%;height:42px;border:1px solid var(--dsw-alias-border-default,rgba(127,127,127,.42));border-radius:9px;background:var(--dsw-alias-bg-base,#fff);color:inherit;padding:0 12px;font:inherit;outline:none}
.multica-input:focus{border-color:var(--dsw-alias-border-focus,#3977f6);box-shadow:0 0 0 3px rgba(57,119,246,.15)}
.multica-input:disabled{opacity:.62}
.multica-check{display:flex;align-items:flex-start;gap:9px;color:var(--dsw-alias-label-secondary,#555);font-size:14px;line-height:20px;cursor:pointer}
.multica-check input{width:16px;height:16px;margin:2px 0 0;accent-color:var(--dsw-alias-brand-primary,#3977f6)}
.multica-alert{border-radius:9px;padding:10px 12px;font-size:13px;line-height:20px}
.multica-alert--error{background:rgba(222,53,53,.11);color:var(--dsw-alias-status-error,#c92a2a)}
.multica-alert--success{background:rgba(34,160,83,.11);color:var(--dsw-alias-status-success,#16833d)}
.multica-actions{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:2px}
.multica-button{min-height:38px;border:1px solid transparent;border-radius:9px;padding:0 16px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.multica-button:disabled{cursor:wait;opacity:.62}
.multica-button--primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#3977f6));color:var(--dsw-alias-label-primary-foreground,#fff)}
.multica-button--primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#3977f6)))}
.multica-button--secondary{border-color:var(--dsw-alias-border-default,rgba(127,127,127,.42));background:transparent;color:inherit}
.multica-status{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 20px}
.multica-status__item{display:flex;align-items:center;gap:8px;min-width:0;color:var(--dsw-alias-label-secondary,#555);font-size:13px}
.multica-status__dot{width:8px;height:8px;flex:none;border-radius:50%;background:var(--dsw-alias-label-tertiary,#888)}
.multica-status__dot--ok{background:#20a053}
.multica-status__dot--warn{background:#d78b18}
.multica-loading{padding:24px;color:var(--dsw-alias-label-secondary,#555);font-size:14px}
@media(max-width:560px){.multica-onboarding-overlay{padding:12px}.multica-onboarding-dialog{padding:22px}.multica-status{grid-template-columns:1fr}.multica-actions{align-items:stretch;flex-direction:column-reverse}.multica-button{width:100%}}
`

export function installStyles(): () => void {
  const existing = document.querySelector<HTMLStyleElement>('style[data-dsh-multica-onboarding]')
  if (existing !== null) return () => {}
  const element = document.createElement('style')
  element.dataset.dshMulticaOnboarding = '1'
  element.textContent = styles
  document.head.appendChild(element)
  return () => { element.remove() }
}
