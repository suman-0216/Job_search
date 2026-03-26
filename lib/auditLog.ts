export const auditLog = (event: string, payload: Record<string, unknown>): void => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: 'extension',
      event,
      ...payload,
    }),
  )
}
