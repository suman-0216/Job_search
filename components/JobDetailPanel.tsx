import { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/solid'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'

interface JobDetailPanelProps {
  job: Record<string, unknown> | null
  onClose: () => void
}

const readText = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

const readList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export default function JobDetailPanel({ job, onClose }: JobDetailPanelProps) {
  const [copied, setCopied] = useState<'email' | 'dm' | ''>('')

  useEffect(() => {
    if (!job) return

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onEsc)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onEsc)
    }
  }, [job, onClose])

  if (!job) return null

  const title = readText(job.title) || readText(job.role) || 'Untitled role'
  const company = readText(job.companyName) || readText(job.company) || 'Unknown company'
  const location = readText(job.location) || 'Location not listed'
  const salary = readText(job.salary) || 'Compensation not listed'
  const description = readText(job.description, 'No detailed description available for this role yet.')
  const link = readText(job.link)
  const applicants = readText(job.applicantsCount) || readText(job.applicants) || 'N/A'
  const posted = readText(job.postedAt) || readText(job.timestamp) || readText(job.date) || readText(job.posted) || 'Unknown'
  const skills = readList(job.skills)

  const coldEmail = `Subject: Interest in ${title} at ${company}\n\nHi hiring team,\n\nI came across the ${title} role at ${company} and would love to contribute. I focus on shipping pragmatic ML products and can help move quickly from prototype to customer value.\n\nIf useful, I can share a focused 30-60-90 day plan for this role.\n\nBest,\n[Your Name]`

  const linkedInDm = `Hi, I saw the ${title} role at ${company}. I build practical ML products and would love to discuss how I can help your team. Open to a quick chat?`

  const copyText = async (value: string, type: 'email' | 'dm') => {
    await navigator.clipboard.writeText(value)
    setCopied(type)
    window.setTimeout(() => setCopied(''), 1200)
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close details panel"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside className="detail-sheet animate-slide-in absolute right-0 top-0 h-full w-full max-w-[760px]">
        <div className="detail-header">
          <div>
            <p className="metric-label">Role detail</p>
            <h2 className="mt-1 text-[38px] leading-[1.02] font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 text-base text-[var(--apple-text-muted)]">
              {company} | {location}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ghost-icon"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="detail-body">
          <section className="detail-meta-grid">
            <div className="detail-meta">
              <p className="metric-label">Salary</p>
              <p className="mt-1 text-base font-semibold">{salary}</p>
            </div>
            <div className="detail-meta">
              <p className="metric-label">Applicants</p>
              <p className="mt-1 text-base font-semibold">{applicants}</p>
            </div>
            <div className="detail-meta">
              <p className="metric-label">Posted</p>
              <p className="mt-1 text-base font-semibold">{posted}</p>
            </div>
            <div className="detail-meta">
              <p className="metric-label">Skills</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.length > 0
                  ? skills.slice(0, 5).map((skill) => (
                      <span key={skill} className="skill-chip">
                        {skill}
                      </span>
                    ))
                  : <span className="skill-chip">Generalist</span>}
              </div>
            </div>
          </section>

          <section className="detail-section">
            <p className="metric-label">Description</p>
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-[var(--apple-text)]">{description}</p>
          </section>

          <section className="detail-section">
            <div className="flex items-center justify-between gap-2">
              <p className="metric-label">Cold email</p>
              <button type="button" className="ghost-btn" onClick={() => copyText(coldEmail, 'email')}>
                {copied === 'email' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="template-block">{coldEmail}</pre>
          </section>

          <section className="detail-section">
            <div className="flex items-center justify-between gap-2">
              <p className="metric-label">LinkedIn DM</p>
              <button type="button" className="ghost-btn" onClick={() => copyText(linkedInDm, 'dm')}>
                {copied === 'dm' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="template-block">{linkedInDm}</pre>
          </section>
        </div>

        <div className="detail-footer">
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="action-pill">
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Open posting
            </a>
          ) : (
            <span className="text-sm text-[var(--apple-text-muted)]">Posting link not available</span>
          )}
        </div>
      </aside>
    </div>
  )
}
