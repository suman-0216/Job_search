import type { SupabaseClient } from '@supabase/supabase-js'
import { executeRunRequest } from './userRunPipeline'

type JsonRecord = Record<string, unknown>

type UserSettingRow = {
  user_id: string
  workflow_enabled: boolean
  timezone: string | null
  run_times: unknown
}

type RunRequestRow = {
  id: string
  user_id: string
  settings_snapshot: JsonRecord | null
}

const toStringValue = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const toRunTimes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => toStringValue(item))
    .filter((item) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(item))
}

const getMinutesInTimezone = (date: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0')
  return hour * 60 + minute
}

const isDueNow = (now: Date, timezone: string, runTimes: string[], windowMinutes: number): boolean => {
  if (runTimes.length === 0) return false
  const current = getMinutesInTimezone(now, timezone)
  return runTimes.some((runTime) => {
    const [hour, minute] = runTime.split(':').map((part) => Number(part))
    const target = hour * 60 + minute
    const diff = Math.abs(target - current)
    const wrapDiff = Math.min(diff, 24 * 60 - diff)
    return wrapDiff <= windowMinutes
  })
}

const enqueueRuns = async (supabase: SupabaseClient, userIds: string[]) => {
  if (userIds.length === 0) return { inserted: 0 }

  const { data: existing, error: existingError } = await supabase
    .from('user_run_requests')
    .select('user_id,status')
    .in('user_id', userIds)
    .in('status', ['queued', 'running'])

  if (existingError) throw new Error(existingError.message)

  const blocked = new Set((existing || []).map((row) => row.user_id as string))
  const candidates = userIds.filter((userId) => !blocked.has(userId))
  if (candidates.length === 0) return { inserted: 0 }

  const payload = candidates.map((userId) => ({
    user_id: userId,
    status: 'queued',
    settings_snapshot: {},
  }))

  const { error } = await supabase.from('user_run_requests').insert(payload)
  if (error) throw new Error(error.message)
  return { inserted: candidates.length }
}

const claimNextRun = async (supabase: SupabaseClient): Promise<RunRequestRow | null> => {
  const { data: candidate, error: candidateError } = await supabase
    .from('user_run_requests')
    .select('id,user_id,settings_snapshot,requested_at')
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (candidateError) throw new Error(candidateError.message)
  if (!candidate) return null

  const { data: claimed, error: claimError } = await supabase
    .from('user_run_requests')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', candidate.id)
    .eq('status', 'queued')
    .select('id,user_id,settings_snapshot')
    .maybeSingle<RunRequestRow>()

  if (claimError) throw new Error(claimError.message)
  if (!claimed) return null
  return claimed
}

export const enqueueDueRuns = async (
  supabase: SupabaseClient,
  options?: { forceAllActive?: boolean; windowMinutes?: number; now?: Date },
): Promise<{ activeUsers: number; dueUsers: number; inserted: number }> => {
  const now = options?.now || new Date()
  const windowMinutes = options?.windowMinutes ?? (Number.parseInt(process.env.RUN_TRIGGER_WINDOW_MINUTES || '15', 10) || 15)

  const { data: settingsRows, error } = await supabase
    .from('user_settings')
    .select('user_id,workflow_enabled,timezone,run_times')
    .eq('workflow_enabled', true)

  if (error) throw new Error(error.message)

  const activeUsers = (settingsRows || []).length
  const dueUserIds =
    options?.forceAllActive
      ? (settingsRows || []).map((row) => row.user_id as string)
      : (settingsRows || [])
          .filter((row) => {
            const setting = row as UserSettingRow
            const timezone = toStringValue(setting.timezone) || 'America/Los_Angeles'
            const runTimes = toRunTimes(setting.run_times)
            return isDueNow(now, timezone, runTimes, windowMinutes)
          })
          .map((row) => row.user_id as string)

  const { inserted } = await enqueueRuns(supabase, dueUserIds)
  return { activeUsers, dueUsers: dueUserIds.length, inserted }
}

export const processQueuedRuns = async (
  supabase: SupabaseClient,
  options?: { concurrency?: number; maxRuns?: number },
): Promise<{ claimed: number; completed: number; failed: number; results: Array<Record<string, unknown>> }> => {
  const concurrency = Math.max(1, options?.concurrency || (Number.parseInt(process.env.RUN_WORKER_CONCURRENCY || '3', 10) || 3))
  const maxRuns = Math.max(1, options?.maxRuns || (Number.parseInt(process.env.RUN_WORKER_MAX_RUNS || '20', 10) || 20))

  const results: Array<Record<string, unknown>> = []
  let claimed = 0

  const workerLoop = async () => {
    while (true) {
      if (claimed >= maxRuns) return
      const next = await claimNextRun(supabase)
      if (!next) return
      claimed += 1
      const result = await executeRunRequest(supabase, next)
      results.push(result)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => workerLoop()))

  const completed = results.filter((result) => result.ok).length
  const failed = results.length - completed
  return { claimed, completed, failed, results }
}

