export const actionLabels: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  yaml_edit: 'YAML edit',
  logs: 'Logs',
  exec: 'Exec',
  scale: 'Scale',
  restart: 'Restart',
  rollback: 'Rollback',
  trigger: 'Trigger',
  cordon: 'Cordon',
  drain: 'Drain',
  reveal: 'Reveal',
  install: 'Install',
  upgrade: 'Upgrade',
  uninstall: 'Uninstall',
  reset_password: 'Reset password',
}

export function hasAction(
  grants: Record<string, string[]> | undefined,
  module: string,
  action: string,
): boolean {
  return grants?.[module]?.includes(action) ?? false
}

export function hasView(grants: Record<string, string[]> | undefined, module: string): boolean {
  return hasAction(grants, module, 'view')
}

export function actionLabel(action: string): string {
  return actionLabels[action] ?? action.replaceAll('_', ' ')
}

export function grantSummary(grants: Record<string, string[]> | undefined): {
  modules: number
  actions: number
} {
  const entries = Object.entries(grants ?? {}).filter(([, actions]) => actions.includes('view'))
  return {
    modules: entries.length,
    actions: entries.reduce((sum, [, actions]) => sum + actions.length, 0),
  }
}
