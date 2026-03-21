import { useEffect, useMemo, useState } from 'react'
import { CheckIcon, MoonIcon, SunIcon } from '@heroicons/react/24/solid'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/router'
import JobDetailPanel from '../components/JobDetailPanel'
import CustomSelect, { SelectOption } from '../components/CustomSelect'

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
  const parsed = Date.parse(date)
  if (Number.isNaN(parsed)) return date
  return new Date(parsed).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getPastDates = (count: number): string[] => {
  const safeCount = Math.max(1, count)
  const today = new Date()
  return Array.from({ length: safeCount }, (_, index) => {
    const value = new Date(today)
    value.setDate(today.getDate() - index)
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
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
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

  const getJobKey = (job: NormalizedJob): string => {
    const keyFromLink = toStringValue(job.link)
    if (keyFromLink) return keyFromLink
    return `${job.title}__${job.company}__${job.location}`
  }

  useEffect(() => {
    const lastFive = getPastDates(5)
    setPastFiveDates(lastFive)

    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme)
    }

    Promise.all([fetch('/api/data'), fetch('/api/applied')])
      .then(async ([dataResponse, appliedResponse]) => {
        const dataPayload = (await dataResponse.json()) as { days?: unknown; latestWindowDays?: number } | unknown
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
        const appliedPayload = (await appliedResponse.json()) as { jobs?: Record<string, AppliedJob> }

        const incoming = toArray<DashboardDay>(allData).map((day) => ({
          date: toStringValue(day.date),
          jobs: toArray<JobRecord>(day.jobs),
          funded: toArray<Record<string, unknown>>(day.funded),
          stealth: toArray<Record<string, unknown>>(day.stealth),
        }))

        setData(incoming)
        setAppliedJobs(appliedPayload.jobs || {})
        const availableDates = new Set(incoming.map((item) => item.date))
        const latestFromWindow = dynamicPastDates.find((date) => availableDates.has(date))
        setSelectedDate(latestFromWindow || incoming[0]?.date || dynamicPastDates[0] || lastFive[0])
      })
      .catch(() => setData([]))
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

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
      const sourceType: Exclude<SourceTab, 'all'> =
        linkLower.includes('linkedin.com')
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

  const filteredJobs = useMemo(() => {
    const titleNeedle = titleSearch.trim().toLowerCase()
    const locationNeedle = locationSearch.trim().toLowerCase()
    const baseJobs =
      sourceTab === 'all'
        ? allJobs
        : allJobs.filter((job) =>
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
      if (appliedOnly && !appliedJobs[getJobKey(job)]) return false
      return true
    })

    return filtered.sort((a, b) => {
      if (sortMode === 'score') return b.score - a.score
      if (sortMode === 'lowCompetition') return a.applicants - b.applicants
      return toEpoch(b.postedAt) - toEpoch(a.postedAt)
    })
  }, [allJobs, appliedJobs, appliedOnly, locationSearch, selectedRun, sortMode, sourceTab, titleSearch, typeFilter])

  const appliedCount = Object.keys(appliedJobs).length
  const sourceCounts = useMemo(() => {
    const counts = { linkedin: 0, startups: 0, funded: 0, stealth: 0 }
    for (const job of allJobs) {
      if (job.sourceType === 'linkedin') counts.linkedin += 1
      if (job.sourceType === 'startups') counts.startups += 1
      if (job.sourceType === 'funded') counts.funded += 1
      if (job.sourceType === 'stealth') counts.stealth += 1
    }
    return counts
  }, [allJobs])

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      await router.push('/login')
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

  return (
    <div className="apple-shell min-h-screen text-[var(--apple-text)]">
      <header className="sticky top-0 z-40 border-b border-[var(--apple-border)] bg-[var(--apple-nav)]/95 backdrop-blur-xl">
        <div className="flex h-[54px] w-full items-center justify-between gap-2 px-3 sm:px-6">
          <div className="min-w-0 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--apple-text-muted)]">Job Hunter Pro</p>
            </div>
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
              className={`theme-toggle apple-input h-10 rounded-xl px-4 text-sm font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-2 ${theme === 'dark' ? 'theme-toggle-dark' : ''}`}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button
              type="button"
              onClick={() => {
                void logout()
              }}
              className="apple-input h-10 rounded-xl px-4 text-sm font-semibold uppercase tracking-[0.08em] inline-flex items-center"
              aria-label="Logout"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-3 pb-4 pt-3 sm:px-6">
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
                All {allJobs.length}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-3">
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
                      <button
                        type="button"
                        className={`action-pill ${appliedJobs[getJobKey(job)] ? 'applied' : 'secondary'}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void toggleApplied(job)
                        }}
                      >
                        {appliedJobs[getJobKey(job)] ? 'Applied' : 'Mark applied'}
                      </button>
                      <button type="button" className="action-pill" onClick={() => setSelectedJob(job)}>
                        Details
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
    </div>
  )
}
