const buckets = new Map<string, number[]>()

export const isRateLimited = (key: string, limit: number, windowMs: number): boolean => {
  const now = Date.now()
  const windowStart = now - windowMs
  const existing = buckets.get(key) || []
  const recent = existing.filter((ts) => ts >= windowStart)
  if (recent.length >= limit) {
    buckets.set(key, recent)
    return true
  }
  recent.push(now)
  buckets.set(key, recent)
  return false
}
