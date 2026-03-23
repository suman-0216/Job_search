import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckIcon, MoonIcon, SunIcon } from '@heroicons/react/24/solid'
import { ArrowTopRightOnSquareIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/router'
import JobDetailPanel from '../components/JobDetailPanel'
import CustomSelect, { SelectOption } from '../components/CustomSelect'
import SettingsPanel from '../components/SettingsPanel'

type SortMode = 'score' | 'latest' | 'lowCompetition'
type RunSlot = 'all' | '0630' | '0900' | '1200'
type SourceTab = 'all' | 'linkedin' | 'startups' | 'funded' | 'stealth'

interface JobRecord {
  [key: string]: unknown
  title?: string
  role?: string
  companyName?: string
  company?: string
  location?: string
  salary?: string
  employmentType?: string
  postedAt?: string
  timestamp?: string
  date?: string
  posted?: string
  workRemoteAllowed?: boolean
  skills?: string[] | string
  applicants?: string | number
  applicantsCount?: string | number
  startup_score?: number
  score?: number
  link?: string
  description?: string
}

interface DashboardDay {
  date: string
  jobs: JobRecord[]
  funded: Record<string, unknown>[]
  stealth: Record<string, unknown>[]
}

interface NormalizedJob extends JobRecord {
  title: string
  company: string
  location: string
  salary: string
  employmentType: string
  postedAt: string
  remote: boolean
  applicants: number
  score: number
  link: string
  skills: string[]
  sourceType: Exclude<SourceTab, 'all'>
}

interface AppliedJob {
  jobKey: string
  title: string
  company: string
  link: string
  sourceDate: string
  appliedAt: string
  lastSeenAt: string
  status: string
}

interface RunRequestStatus {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  requestedAt?: string
  startedAt?: string | null
  finishedAt?: string | null
  error?: string | null
  stage?: string | null
  percent?: number | null
  logs?: Array<{ at?: string; stage?: string; message?: string }>
}

const EMPTY_DAY: DashboardDay = {
  date: '',
  jobs: [],
  funded: [],
  stealth: [],
}

const toStringValue = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

const toArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const match = value.match(/\d+(\.\d+)?/)
    if (!match) return 0
    const parsed = Number(match[0])
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const normalizeScore = (rawScore: unknown): number => {
  const value = toNumber(rawScore)
  if (!value) return 0
  if (value > 10) return Number((value / 10).toFixed(1))
  return Number(value.toFixed(1))
}

const parseApplicants = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return 0
  const lower = value.toLowerCase()
  if (lower.includes('less than')) return toNumber(value)
  if (lower.includes('k')) {
    const parsed = toNumber(lower)
    return parsed ? parsed * 1000 : 0
  }
  return toNumber(value)
}

const toEpoch = (rawDate: string): number => {
  const parsedDate = Date.parse(rawDate)
  if (!Number.isNaN(parsedDate)) return parsedDate

  const hourMatch = rawDate.match(/(\d+)\s*h/i)
  if (hourMatch) return Date.now() - Number(hourMatch[1]) * 60 * 60 * 1000

  const dayMatch = rawDate.match(/(\d+)\s*d/i)
  if (dayMatch) return Date.now() - Number(dayMatch[1]) * 24 * 60 * 60 * 1000

  return 0
}

const timeAgo = (dateStr: string): string => {
  if (!dateStr) return 'Unknown'
  if (dateStr.toLowerCase().includes('ago')) return dateStr

  const timestamp = Date.parse(dateStr)
  if (Number.isNaN(timestamp)) return dateStr

  const hours = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60))
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const formatDate = (date: string): string => {
  if (!date) return 'No date'
  const parsed = Date.parse(`${date}T12:00:00.000Z`)
  if (Number.isNaN(parsed)) return date
  return new Date(parsed).toLocaleDateString(undefined, {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const toIsoDate = (date: Date): string => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toIsoDateInTimezone = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value || '1970'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

const getPastDates = (count: number): string[] => {
  const safeCount = Math.max(1, count)
  const todayToken = toIsoDateInTimezone(new Date(), 'America/Los_Angeles')
  const [year, month, day] = todayToken.split('-').map((value) => Number(value))
  const today = new Date(Date.UTC(year, month - 1, day))
  return Array.from({ length: safeCount }, (_, index) => {
    const value = new Date(today)
    value.setUTCDate(today.getUTCDate() - index)
    return toIsoDate(value)
  })
}

const getRunSlotForTimestamp = (rawDate: string): Exclude<RunSlot, 'all'> | null => {
  if (!rawDate) return null
  const parsed = new Date(rawDate)
  if (Number.isNaN(parsed.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(parsed)

  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0')
  const total = hour * 60 + minute

  if (total <= 465) return '0630'
  if (total <= 630) return '0900'
  return '1200'
}

export default function Dashboard() {
  const router = useRouter()
  const [data, setData] = useState<DashboardDay[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [selectedJob, setSelectedJob] = useState<NormalizedJob | null>(null)

  const [titleSearch, setTitleSearch] = useState('')
  const [locationSearch, setLocationSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('score')
  const [selectedRun, setSelectedRun] = useState<RunSlot>('all')
  const [sourceTab, setSourceTab] = useState<SourceTab>('all')
  const [pastFiveDates, setPastFiveDates] = useState<string[]>([])
  const [appliedJobs, setAppliedJobs] = useState<Record<string, AppliedJob>>({})
  const [appliedOnly, setAppliedOnly] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profile, setProfile] = useState<{ email: string; username: string; fullName: string } | null>(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [runStatus, setRunStatus] = useState<RunRequestStatus | null>(null)
  const [lastRunStatus, setLastRunStatus] = useState<RunRequestStatus['status'] | null>(null)
  const [dismissedRunStatusId, setDismissedRunStatusId] = useState<string | null>(null)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

  const typeOptions: SelectOption[] = [
    { value: '', label: 'All types' },
    { value: 'Full-time', label: 'Full-time' },
    { value: 'Contract', label: 'Contract' },
  ]

  const sortOptions: SelectOption[] = [
    { value: 'score', label: 'Sort: score' },
    { value: 'latest', label: 'Sort: latest' },
    { value: 'lowCompetition', label: 'Sort: low competition' },
  ]

  const appliedStatusOptions: SelectOption[] = [
    { value: 'applied', label: 'Applied' },
    { value: 'assessment', label: 'Assessment' },
    { value: 'interviewing', label: 'Interviewing' },
    { value: 'offer', label: 'Offer' },
    { value: 'declined', label: 'Declined' },
  ]

  const getJobKey = (job: NormalizedJob): string => {
    const keyFromLink = toStringValue(job.link).trim()
    const normalizedLink = keyFromLink.toLowerCase()
    if (keyFromLink && normalizedLink !== '#' && normalizedLink !== 'n/a' && normalizedLink !== 'na') {
      return keyFromLink
    }
    return [
      toStringValue(job.sourceType, 'unknown'),
      toStringValue(job.title, 'untitled'),
      toStringValue(job.company, 'unknown-company'),
      toStringValue(job.location, 'unknown-location'),
      toStringValue(job.postedAt, 'unknown-time'),
      toStringValue(job.salary, 'unknown-salary'),
    ]
      .map((part) => part.toLowerCase().replace(/\s+/g, ' ').trim())
      .join('__')
  }

  const hydrateDataFromPayload = useCallback((dataPayload: { days?: unknown; latestWindowDays?: number } | unknown) => {
    const latestWindowDays =
      typeof dataPayload === 'object' && dataPayload !== null && 'latestWindowDays' in dataPayload
        ? Number((dataPayload as { latestWindowDays?: number }).latestWindowDays) || 5
        : 5
    const dynamicPastDates = getPastDates(latestWindowDays)
    setPastFiveDates(dynamicPastDates)

    const allData: unknown =
      typeof dataPayload === 'object' && dataPayload !== null && 'days' in dataPayload
        ? (dataPayload as { days?: unknown }).days
        : dataPayload
    const incoming = parseDashboardDays(allData)
    setData(incoming)
    const availableDates = new Set(incoming.map((item) => item.date))
    const latestFromWindow = dynamicPastDates.find((date) => availableDates.has(date))
    setSelectedDate((prev) => (prev && availableDates.has(prev) ? prev : latestFromWindow || incoming[0]?.date || dynamicPastDates[0] || ''))
  }, [])

  const refreshDashboardData = useCallback(async () => {
    const dataResponse = await fetch('/api/data')
    const dataPayload = (await dataResponse.json()) as { days?: unknown; latestWindowDays?: number } | unknown
    hydrateDataFromPayload(dataPayload)
  }, [hydrateDataFromPayload])

  useEffect(() => {
    const lastFive = getPastDates(5)
    setPastFiveDates(lastFive)

    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme)
    }

    Promise.all([fetch('/api/data'), fetch('/api/applied'), fetch('/api/auth/profile'), fetch('/api/user/runs/latest')])
      .then(async ([dataResponse, appliedResponse, profileResponse, runResponse]) => {
        const dataPayload = (await dataResponse.json()) as { days?: unknown; latestWindowDays?: number } | unknown
        hydrateDataFromPayload(dataPayload)
        const appliedPayload = (await appliedResponse.json()) as { jobs?: Record<string, AppliedJob> }
        const profilePayload = (await profileResponse.json()) as { email?: string; username?: string; fullName?: string }
        const runPayload = (await runResponse.json()) as { run?: RunRequestStatus | null }

        setAppliedJobs(appliedPayload.jobs || {})
        setRunStatus(runPayload.run || null)
        setLastRunStatus(runPayload.run?.status || null)
        if (profilePayload.username) {
          setProfile({
            email: profilePayload.email || '',
            username: profilePayload.username,
            fullName: profilePayload.fullName || profilePayload.username,
          })
        }
      })
      .catch(() => setData([]))
  }, [hydrateDataFromPayload])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!profileMenuOpen) return
      const target = event.target as Node | null
      if (profileMenuRef.current && target && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [profileMenuOpen])

  useEffect(() => {
    let isActive = true
    const pollLatestRun = async () => {
      try {
        const response = await fetch('/api/user/runs/latest')
        const payload = (await response.json()) as { run?: RunRequestStatus | null }
        if (!isActive) return
        const nextRun = payload.run || null
        setRunStatus(nextRun)
        if (nextRun?.id) {
          setDismissedRunStatusId((prev) => (prev === nextRun.id ? prev : null))
        }

        if (nextRun?.status && nextRun.status !== lastRunStatus) {
          if (nextRun.status === 'completed') {
            await refreshDashboardData()
          }
          setLastRunStatus(nextRun.status)
        }
      } catch {
        // keep existing dashboard state on polling failures
      }
    }

    void pollLatestRun()
    const timer = window.setInterval(() => {
      void pollLatestRun()
    }, 8000)

    return () => {
      isActive = false
      window.clearInterval(timer)
    }
  }, [lastRunStatus, refreshDashboardData])

  const currentDay = useMemo(() => {
    return data.find((day) => day.date === selectedDate) || data[0] || EMPTY_DAY
  }, [data, selectedDate])

  const dayByDate = useMemo(() => {
    return new Map(data.map((day) => [day.date, day]))
  }, [data])

  const jobs = useMemo<NormalizedJob[]>(() => {
    return toArray<JobRecord>(currentDay.jobs).map((job) => {
      const title = toStringValue(job.title) || toStringValue(job.role) || 'Untitled role'
      const company = toStringValue(job.companyName) || toStringValue(job.company) || 'Unknown company'
      const location = toStringValue(job.location) || 'Location not listed'
      const salary = toStringValue(job.salary) || 'Compensation not listed'
      const employmentType = toStringValue(job.employmentType) || 'Unspecified'
      const postedAt =
        toStringValue(job.postedAt) ||
        toStringValue(job.timestamp) ||
        toStringValue(job.date) ||
        toStringValue(job.posted) ||
        'Unknown'
      const applicants = parseApplicants(job.applicantsCount ?? job.applicants)
      const score = normalizeScore(job.startup_score ?? job.score)
      const link = toStringValue(job.link) || '#'
      const linkLower = link.toLowerCase()
      const sourceText = toStringValue(job.source).toLowerCase()
      const sourceType: Exclude<SourceTab, 'all'> =
        sourceText.includes('startups')
          ? 'startups'
          : sourceText.includes('linkedin')
            ? 'linkedin'
            : linkLower.includes('linkedin.com')
          ? 'linkedin'
          : (linkLower.includes('wellfound.com') ||
              linkLower.includes('ycombinator.com') ||
              linkLower.includes('jobs.lever.co') ||
              linkLower.includes('boards.greenhouse.io') ||
              linkLower.includes('angel.co') ||
              linkLower.includes('startup'))
            ? 'startups'
            : 'linkedin'

      const rawSkills = Array.isArray(job.skills)
        ? job.skills
        : typeof job.skills === 'string'
          ? job.skills.split(',')
          : []

      const skills = rawSkills.map((skill) => String(skill).trim()).filter(Boolean)
      const remote = Boolean(job.workRemoteAllowed) || /remote/i.test(`${title} ${company} ${location}`)

      return {
        ...job,
        title,
        company,
        location,
        salary,
        employmentType,
        postedAt,
        applicants,
        score,
        link,
        skills,
        remote,
        sourceType,
      }
    })
  }, [currentDay.jobs])

  const fundedJobs = useMemo<NormalizedJob[]>(() => {
    return toArray<Record<string, unknown>>(currentDay.funded).map((item) => {
      const title =
        toStringValue(item.title) ||
        toStringValue(item.company_name) ||
        toStringValue(item.company) ||
        toStringValue(item.name) ||
        'Funded startup'
      const company =
        toStringValue(item.company_name) ||
        toStringValue(item.company) ||
        toStringValue(item.name) ||
        'Funded startup'
      const link =
        toStringValue(item.link) ||
        toStringValue(item.url) ||
        toStringValue((item.searchResult as Record<string, unknown> | undefined)?.url) ||
        '#'
      return {
        ...item,
        title,
        company,
        location: toStringValue(item.location, 'Location not listed'),
        salary: toStringValue(item.funding_amount, 'Recently funded'),
        employmentType: 'Funded startup',
        postedAt: currentDay.date || 'Unknown',
        remote: false,
        applicants: 0,
        score: normalizeScore(item.score || item.startup_score || 8),
        link,
        skills: [],
        sourceType: 'funded',
      }
    })
  }, [currentDay.date, currentDay.funded])

  const stealthJobs = useMemo<NormalizedJob[]>(() => {
    return toArray<Record<string, unknown>>(currentDay.stealth).map((item) => {
      const title =
        toStringValue(item.title) ||
        toStringValue(item.company) ||
        toStringValue(item.description) ||
        'Stealth startup'
      const company = toStringValue(item.company, 'Stealth startup')
      const link = toStringValue(item.link) || toStringValue(item.url) || '#'
      return {
        ...item,
        title,
        company,
        location: toStringValue(item.location, 'Location not listed'),
        salary: toStringValue(item.batch, 'Stealth'),
        employmentType: 'Stealth startup',
        postedAt: currentDay.date || 'Unknown',
        remote: false,
        applicants: 0,
        score: normalizeScore(item.score || item.startup_score || 7),
        link,
        skills: [],
        sourceType: 'stealth',
      }
    })
  }, [currentDay.date, currentDay.stealth])

  const allJobs = useMemo(() => [...jobs, ...fundedJobs, ...stealthJobs], [jobs, fundedJobs, stealthJobs])

  const visiblePoolJobs = useMemo(() => {
    return allJobs.filter((job) => {
      const isApplied = Boolean(appliedJobs[getJobKey(job)])
      return appliedOnly ? isApplied : !isApplied
    })
  }, [allJobs, appliedJobs, appliedOnly])

  const filteredJobs = useMemo(() => {
    const titleNeedle = titleSearch.trim().toLowerCase()
    const locationNeedle = locationSearch.trim().toLowerCase()
    const baseJobs =
      sourceTab === 'all'
        ? visiblePoolJobs
        : visiblePoolJobs.filter((job) =>
            sourceTab === 'startups'
              ? job.sourceType === 'startups'
              : job.sourceType === sourceTab,
          )

    const filtered = baseJobs.filter((job) => {
      const titleText = `${job.title}`.toLowerCase()
      const locationText = `${job.location}`.toLowerCase()
      if (titleNeedle && !titleText.includes(titleNeedle)) return false
      if (locationNeedle && !locationText.includes(locationNeedle)) return false
      if (job.employmentType.toLowerCase().includes('intern')) return false
      if (typeFilter && job.employmentType.toLowerCase() !== typeFilter.toLowerCase()) return false
      if (selectedRun !== 'all') {
        if (job.sourceType !== 'linkedin' && job.sourceType !== 'startups') return false
        const slot = getRunSlotForTimestamp(job.postedAt)
        if (slot !== selectedRun) return false
      }
      return true
    })

    return filtered.sort((a, b) => {
      if (sortMode === 'score') return b.score - a.score
      if (sortMode === 'lowCompetition') return a.applicants - b.applicants
      return toEpoch(b.postedAt) - toEpoch(a.postedAt)
    })
  }, [locationSearch, selectedRun, sortMode, sourceTab, titleSearch, typeFilter, visiblePoolJobs])

  const appliedCount = Object.keys(appliedJobs).length
  const profileInitial = (profile?.fullName || profile?.username || 'U').trim().charAt(0).toUpperCase() || 'U'
  const statusPillVisible = Boolean(runStatus?.id && dismissedRunStatusId !== runStatus.id)
  const runStatusLabel =
    runStatus?.status === 'queued'
      ? 'Queued'
      : runStatus?.status === 'running'
        ? 'Running'
        : runStatus?.status === 'completed'
          ? 'Completed'
          : runStatus?.status === 'failed'
          ? 'Failed'
            : ''
  const latestRunLogMessage = runStatus?.logs?.length
    ? runStatus.logs[runStatus.logs.length - 1]?.message || ''
    : ''
  const runProgressText =
    runStatus?.status === 'running' && typeof runStatus?.percent === 'number'
      ? `${Math.max(0, Math.min(100, Math.round(runStatus.percent)))}%`
      : ''
  const runStageText = toStringValue(runStatus?.stage || '').replace(/_/g, ' ')
  const runStatusDetail =
    runStatus?.status === 'failed'
      ? runStatus.error || 'Run failed'
      : runStatus?.status === 'completed'
        ? 'Jobs updated'
        : runStatus?.status === 'running'
          ? `${runProgressText ? `${runProgressText} | ` : ''}${runStageText || 'Processing'}${latestRunLogMessage ? ` | ${latestRunLogMessage}` : ''}`
          : runStatus?.status === 'queued'
            ? 'Waiting in queue'
            : ''
  const sourceCounts = useMemo(() => {
    const counts = { linkedin: 0, startups: 0, funded: 0, stealth: 0 }
    for (const job of visiblePoolJobs) {
      if (job.sourceType === 'linkedin') counts.linkedin += 1
      if (job.sourceType === 'startups') counts.startups += 1
      if (job.sourceType === 'funded') counts.funded += 1
      if (job.sourceType === 'stealth') counts.stealth += 1
    }
    return counts
  }, [visiblePoolJobs])

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      await router.push('/login')
    }
  }

  const changePassword = async () => {
    setPasswordError('')
    if (!currentPassword || !newPassword) {
      setPasswordError('Enter both current and new password.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    setPasswordSaving(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setPasswordError(payload.error || 'Failed to update password')
        return
      }
      setShowPasswordModal(false)
      setCurrentPassword('')
      setNewPassword('')
    } catch {
      setPasswordError('Failed to update password')
    } finally {
      setPasswordSaving(false)
    }
  }

  const toggleApplied = async (job: NormalizedJob) => {
    const jobKey = getJobKey(job)
    const alreadyApplied = Boolean(appliedJobs[jobKey])

    const response = await fetch('/api/applied', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobKey,
        title: job.title,
        company: job.company,
        link: job.link,
        sourceDate: selectedDate,
        applied: !alreadyApplied,
      }),
    })

    const payload = (await response.json()) as { jobs?: Record<string, AppliedJob> }
    if (payload.jobs) setAppliedJobs(payload.jobs)
  }

  const updateAppliedStatus = async (job: NormalizedJob, status: string) => {
    const jobKey = getJobKey(job)
    if (!appliedJobs[jobKey]) return

    const response = await fetch('/api/applied', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobKey,
        title: job.title,
        company: job.company,
        link: job.link,
        sourceDate: selectedDate,
        applied: true,
        status,
      }),
    })

    const payload = (await response.json()) as { jobs?: Record<string, AppliedJob> }
    if (payload.jobs) setAppliedJobs(payload.jobs)
  }

  const removeApplied = async (job: NormalizedJob) => {
    const jobKey = getJobKey(job)
    const response = await fetch('/api/applied', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobKey,
        applied: false,
      }),
    })

    const payload = (await response.json()) as { jobs?: Record<string, AppliedJob> }
    if (payload.jobs) setAppliedJobs(payload.jobs)
  }

  return (
    <div className="apple-shell min-h-screen text-[var(--apple-text)]">
      <header className="sticky top-0 z-40 border-b border-[var(--apple-border)] bg-[var(--apple-nav)]/95 backdrop-blur-xl">
        <div className="flex h-[54px] w-full items-center justify-between gap-2 px-3 sm:px-6">
          <div className="min-w-0 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--apple-text-muted)]">Job Hunter Pro</p>
            </div>
          </div>
          <div className="header-status-slot">
            {statusPillVisible && runStatus ? (
              <div className={`run-status-pill ${runStatus.status}`}>
                <span className="run-status-dot" />
                <span className="run-status-text">{runStatusLabel}</span>
                {runStatusDetail ? <span className="run-status-subtext">{runStatusDetail}</span> : null}
                <button
                  type="button"
                  className="run-status-close"
                  aria-label="Close run status"
                  onClick={() => setDismissedRunStatusId(runStatus.id)}
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <div className="run-strip">
              <button type="button" className={`run-tag ${selectedRun === '0630' ? 'active' : ''}`} onClick={() => setSelectedRun('0630')}>
                6:30 AM
              </button>
              <button type="button" className={`run-tag ${selectedRun === '0900' ? 'active' : ''}`} onClick={() => setSelectedRun('0900')}>
                9:00 AM
              </button>
              <button type="button" className={`run-tag ${selectedRun === '1200' ? 'active' : ''}`} onClick={() => setSelectedRun('1200')}>
                12:00 PM
              </button>
              <button type="button" className={`run-tag ${selectedRun === 'all' ? 'active' : ''}`} onClick={() => setSelectedRun('all')}>
                All Runs
              </button>
            </div>
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="apple-input apple-select h-10 rounded-xl px-3 text-sm"
              aria-label="Select date"
            >
              {pastFiveDates.map((dateValue) => {
                const dayData = dayByDate.get(dateValue)
                const count = dayData ? toArray<JobRecord>(dayData.jobs).length : 0
                return (
                  <option key={dateValue} value={dateValue}>
                    {formatDate(dateValue)} ({count})
                  </option>
                )
              })}
            </select>

            <button
              type="button"
              onClick={toggleTheme}
              className={`theme-toggle icon-circle-btn apple-input ${theme === 'dark' ? 'theme-toggle-dark' : ''}`}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
            </button>
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="icon-circle-btn logout-btn apple-input"
                aria-label="Profile menu"
              >
                <span className="text-sm font-semibold leading-none">{profileInitial}</span>
              </button>
              {profileMenuOpen && (
                <div className="profile-menu">
                  <p className="profile-name">{profile?.fullName || profile?.username || 'User'}</p>
                  {profile?.email ? <p className="profile-username">{profile.email}</p> : null}
                  <button
                    type="button"
                    className="profile-action"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      setShowSettingsModal(true)
                    }}
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    className="profile-action"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      setShowPasswordModal(true)
                    }}
                  >
                    Change Password
                  </button>
                  <button
                    type="button"
                    className="profile-action danger"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      void logout()
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-54px)] w-full flex-col px-3 pb-4 pt-3 sm:px-6">
        <section className="compact-panel">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <input
              type="text"
              value={titleSearch}
              onChange={(event) => setTitleSearch(event.target.value)}
              placeholder="Search title"
              className="apple-input h-10 rounded-xl px-3 text-sm"
            />

            <input
              type="text"
              value={locationSearch}
              onChange={(event) => setLocationSearch(event.target.value)}
              placeholder="Search location"
              className="apple-input h-10 rounded-xl px-3 text-sm"
            />

            <CustomSelect
              value={typeFilter}
              options={typeOptions}
              onChange={setTypeFilter}
              ariaLabel="Filter by type"
            />

            <CustomSelect
              value={sortMode}
              options={sortOptions}
              onChange={(value) => setSortMode(value as SortMode)}
              ariaLabel="Sort jobs"
            />

            <button
              type="button"
              onClick={() => setAppliedOnly((value) => !value)}
              aria-pressed={appliedOnly}
              className={`applied-toggle apple-input h-10 rounded-xl px-3 text-sm font-semibold uppercase tracking-[0.08em] ${appliedOnly ? 'active' : ''}`}
            >
              {appliedOnly && <CheckIcon className="h-4 w-4" />}
              Applied {appliedCount}
            </button>
          </div>

          <div className="mt-2">
            <div className="source-bar">
              <div className="source-tabs">
                <button type="button" className={`source-tab ${sourceTab === 'linkedin' ? 'active' : ''}`} onClick={() => setSourceTab('linkedin')}>
                  LinkedIn {sourceCounts.linkedin}
                </button>
                <button type="button" className={`source-tab ${sourceTab === 'startups' ? 'active' : ''}`} onClick={() => setSourceTab('startups')}>
                  Startups {sourceCounts.startups}
                </button>
                <button type="button" className={`source-tab ${sourceTab === 'funded' ? 'active' : ''}`} onClick={() => setSourceTab('funded')}>
                  Funded {sourceCounts.funded}
                </button>
                <button type="button" className={`source-tab ${sourceTab === 'stealth' ? 'active' : ''}`} onClick={() => setSourceTab('stealth')}>
                  Stealth {sourceCounts.stealth}
                </button>
              </div>
              <button type="button" className={`source-tab source-tab-all ${sourceTab === 'all' ? 'active' : ''}`} onClick={() => setSourceTab('all')}>
                All {visiblePoolJobs.length}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-3 flex-1 min-h-0">
          <div className="roles-shell">
            <div className="roles-list">
              {filteredJobs.map((job, index) => (
                <article key={`${job.link}-${index}`} className="job-row" onClick={() => setSelectedJob(job)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[22px] font-semibold leading-tight tracking-tight">{job.title}</h3>
                      <span className="apple-chip">Score {job.score || 'N/A'}</span>
                      <span className="apple-chip">{job.sourceType}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--apple-text-muted)]">{job.company} | {job.location}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {job.skills.slice(0, 4).map((skill) => (
                        <span key={skill} className="skill-chip">
                          {skill}
                        </span>
                      ))}
                      {job.skills.length === 0 && <span className="skill-chip">Generalist</span>}
                    </div>
                  </div>

                  <div className="job-meta">
                    <p className="text-sm font-semibold">{job.salary}</p>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--apple-text-muted)]">
                      {timeAgo(job.postedAt)} | {job.applicants || 0} applicants
                    </p>
                    <div className="flex gap-2">
                      {!appliedJobs[getJobKey(job)] ? (
                        <button
                          type="button"
                          className="action-pill secondary"
                          onClick={(event) => {
                            event.stopPropagation()
                            void toggleApplied(job)
                          }}
                        >
                          Mark applied
                        </button>
                      ) : appliedOnly ? (
                        <>
                          <CustomSelect
                            value={appliedJobs[getJobKey(job)]?.status || 'applied'}
                            options={appliedStatusOptions}
                            onChange={(value) => {
                              void updateAppliedStatus(job, value)
                            }}
                            ariaLabel="Applied status"
                            className="applied-status-select"
                          />
                          <button
                            type="button"
                            className="action-pill secondary delete-pill"
                            onClick={(event) => {
                              event.stopPropagation()
                              void removeApplied(job)
                            }}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                      <button type="button" className="action-pill bg-blue-600/20 text-blue-400 border-blue-500/30" onClick={(e) => { e.stopPropagation(); setSelectedJob(job); }}>
                        Get Outreach
                      </button>
                      <a
                        href={job.link}
                        target="_blank"
                        rel="noreferrer"
                        className="action-pill secondary open-link-pill"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        Open
                      </a>
                    </div>
                  </div>

                </article>
              ))}

              {filteredJobs.length === 0 && (
                <div className="empty-state">
                  <p className="text-sm font-medium text-[var(--apple-text-muted)]">No roles match this filter.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {selectedJob && <JobDetailPanel job={selectedJob} onClose={() => setSelectedJob(null)} />}

      {showSettingsModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm"
          onClick={() => setShowSettingsModal(false)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <SettingsPanel onClose={() => setShowSettingsModal(false)} className="settings-dialog-embedded" />
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--apple-border)] bg-[var(--apple-surface)] p-5">
            <p className="text-lg font-semibold">Change Password</p>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                className="apple-input h-10 w-full rounded-xl px-3 text-sm"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                className="apple-input h-10 w-full rounded-xl px-3 text-sm"
              />
              {passwordError && <p className="text-xs font-semibold text-[var(--apple-error)]">{passwordError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="action-pill secondary"
                onClick={() => {
                  setShowPasswordModal(false)
                  setPasswordError('')
                }}
              >
                Cancel
              </button>
              <button type="button" className="action-pill" disabled={passwordSaving} onClick={() => void changePassword()}>
                {passwordSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const parseDashboardDays = (allData: unknown): DashboardDay[] =>
  toArray<DashboardDay>(allData).map((day) => ({
    date: toStringValue(day.date),
    jobs: toArray<JobRecord>(day.jobs),
    funded: toArray<Record<string, unknown>>(day.funded),
    stealth: toArray<Record<string, unknown>>(day.stealth),
  }))

