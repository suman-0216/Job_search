import { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/solid'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { MY_PROFILE } from '../lib/candidate'
import { scoreJob, AugmentedJob } from '../lib/scorer'
import { generateOutreach, OutreachResult } from '../lib/outreach'

interface JobDetailPanelProps {
  job: Record<string, any> | null
  onClose: () => void
}

export default function JobDetailPanel({ job: rawJob, onClose }: JobDetailPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [scoredJob, setScoredJob] = useState<AugmentedJob | null>(null)
  const [outreach, setOutreach] = useState<OutreachResult | null>(null)

  useEffect(() => {
    if (!rawJob) return

    const scored = scoreJob(rawJob, MY_PROFILE)
    const generatedOutreach = generateOutreach(scored, MY_PROFILE)
    setScoredJob(scored)
    setOutreach(generatedOutreach)

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onEsc)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onEsc)
    }
  }, [rawJob, onClose])

  if (!rawJob || !scoredJob || !outreach) return null

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="detail-sheet animate-slide-in absolute right-0 top-0 h-full w-full max-w-[760px] bg-[var(--apple-nav)]">
        <div className="detail-header px-8 pt-8 pb-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-[38px] leading-[1.02] font-semibold tracking-tight">{scoredJob.title}</h2>
              <p className="mt-2 text-base text-[var(--apple-text-muted)]">
                {scoredJob.company || scoredJob.companyName} | {scoredJob.location}
              </p>
            </div>
            <button type="button" onClick={onClose} className="ghost-icon p-2" aria-label="Close">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="detail-body px-8 py-6 h-[calc(100%-270px)] overflow-y-auto">
          <section className="space-y-8 pb-12">
            <div className="detail-section">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="metric-label">Cold Email</p>
                <button type="button" className="ghost-btn" onClick={() => handleCopy(outreach.email.body, 'email')}>
                  {copiedKey === 'email' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="template-block whitespace-pre-wrap rounded-xl border border-[var(--apple-border)] bg-black/20 p-4 text-sm">
                <span className="font-bold text-[var(--apple-text-muted)]">Subject: {outreach.email.subject}</span>
                {`\n\n${outreach.email.body}`}
              </pre>
            </div>

            <div className="detail-section">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="metric-label">LinkedIn DM</p>
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">{outreach.linkedin.length} chars</span>
                </div>
                <button type="button" className="ghost-btn" onClick={() => handleCopy(outreach.linkedin, 'linkedin')}>
                  {copiedKey === 'linkedin' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="template-block whitespace-pre-wrap rounded-xl border border-[var(--apple-border)] bg-black/20 p-4 text-sm">{outreach.linkedin}</pre>
            </div>
          </section>
        </div>

        <div className="detail-footer flex items-center gap-4 border-t border-[var(--apple-border)] p-8">
          <a href={scoredJob.link || '#'} target="_blank" rel="noreferrer" className="action-pill border-none bg-blue-600 px-6 text-white hover:bg-blue-500">
            <ArrowTopRightOnSquareIcon className="mr-2 h-4 w-4" /> Open Application
          </a>
        </div>
      </aside>
    </div>
  )
}
