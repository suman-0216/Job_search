import { useEffect, useState } from 'react'
import { XMarkIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { MY_PROFILE } from '../lib/candidate'
import { scoreJob, AugmentedJob } from '../lib/scorer'
import { generateOutreach, OutreachResult } from '../lib/outreach'

interface JobDetailPanelProps {
  job: Record<string, any> | null
  onClose: () => void
}

const timeAgo = (dateStr?: string): string => {
  if (!dateStr) return 'Unknown';
  if (dateStr.toLowerCase().includes('ago')) return dateStr;
  const timestamp = Date.parse(dateStr);
  if (Number.isNaN(timestamp)) return dateStr;
  const hours = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function JobDetailPanel({ job: rawJob, onClose }: JobDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'description' | 'outreach'>('description');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [scoredJob, setScoredJob] = useState<AugmentedJob | null>(null);
  const [outreach, setOutreach] = useState<OutreachResult | null>(null);

  useEffect(() => {
    if (!rawJob) return;

    // Score the job and generate outreach content
    const scored = scoreJob(rawJob, MY_PROFILE);
    const generatedOutreach = generateOutreach(scored, MY_PROFILE);
    
    setScoredJob(scored);
    setOutreach(generatedOutreach);
    
    // Default to the outreach tab for funded and stealth startups
    if (scored.sourceType === 'funded' || scored.sourceType === 'stealth') {
        setActiveTab('outreach');
    } else {
        setActiveTab('description');
    }

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onEsc);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onEsc);
    };
  }, [rawJob, onClose]);

  if (!rawJob || !scoredJob || !outreach) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getWhyApplySummary = (job: AugmentedJob) => {
    const skills = job.matched_skills.slice(0, 2).join(' + ');
    const competition = job.applicants ? `Low competition (${job.applicants} apps).` : '';
    const isFounding = job.title?.toLowerCase().includes('founding') ? 'Founding role.' : '';
    
    switch (job.variant) {
      case 'A': return `Strong match — your [Healthcare AI] focus and ${skills} experience directly maps to their mission. ${competition} ${isFounding}`;
      case 'B': return `Strong match — your [Backend/Infra] expertise and ${skills} experience is a direct hit for their stack. ${competition} ${isFounding}`;
      case 'C': return `Excellent match — your [Agentic AI] work and ${skills} skills align with their decision-making focus. ${competition} ${isFounding}`;
      case 'D': return `Niche match — your [On-Device/Edge] ML work and ${skills} expertise is exactly what they need for privacy-first AI. ${competition} ${isFounding}`;
      default: return `Good match — your ${skills} experience is highly relevant to their core requirements. ${competition} ${isFounding}`;
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="detail-sheet animate-slide-in absolute right-0 top-0 h-full w-full max-w-[760px] bg-[var(--apple-nav)]">
        <div className="detail-header px-8 pt-8 pb-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-[38px] leading-[1.02] font-semibold tracking-tight">{scoredJob.title}</h2>
              <p className="mt-2 text-base text-[var(--apple-text-muted)]">{scoredJob.company || scoredJob.companyName} | {scoredJob.location}</p>
            </div>
            <button type="button" onClick={onClose} className="ghost-icon p-2" aria-label="Close">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* --- MATCH SCORE CARD --- */}
        <div className="mx-8 mb-6 p-6 rounded-2xl bg-[var(--apple-button-hover)] border border-[var(--apple-border)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Match Score: <span className="text-blue-500">{scoredJob.score}/10</span></h3>
            <span className="text-sm font-medium text-[var(--apple-text-muted)] uppercase tracking-widest">{scoredJob.variant} Variant</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="metric-label mb-2">✅ Matched Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {scoredJob.matched_skills.slice(0, 6).map(skill => (
                  <span key={skill} className="skill-chip text-[11px]"><CheckIcon className="h-3 w-3 mr-1" /> {skill}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="metric-label mb-2">⚠️ Missing Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {scoredJob.missing_skills.length > 0 ? scoredJob.missing_skills.slice(0, 4).map(skill => (
                  <span key={skill} className="skill-chip text-[11px] border-orange-500/30"><ExclamationTriangleIcon className="h-3 w-3 mr-1 text-orange-400" /> {skill}</span>
                )) : <span className="text-xs text-[var(--apple-text-muted)] italic">None major</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--apple-border)] pt-4">
            <div className="flex items-center gap-2"><span className="text-sm font-semibold">⭐ Best Project:</span> <span className="text-sm text-blue-400">{scoredJob.best_project.name}</span></div>
            <div className="text-sm text-[var(--apple-text-muted)]">📊 {scoredJob.applicants || 'N/A'} applicants · {timeAgo(scoredJob.postedAt)} · {scoredJob.workRemoteAllowed ? 'Remote OK' : 'On-site'} · {scoredJob.salary || 'Salary N/A'}</div>
          </div>
        </div>

        <div className="px-8 border-b border-[var(--apple-border)]">
          <div className="flex items-center gap-6 -mb-px">
            <button className={`detail-tab ${activeTab === 'description' ? 'active' : ''}`} onClick={() => setActiveTab('description')}>Description</button>
            <button className={`detail-tab ${activeTab === 'outreach' ? 'active' : ''}`} onClick={() => setActiveTab('outreach')}>Outreach Messages</button>
          </div>
        </div>
        
        <div className="detail-body px-8 py-6 h-[calc(100%-350px)] overflow-y-auto">
          {activeTab === 'description' && (
            <section className="detail-section">
              <p className="metric-label">Why Apply?</p>
              <p className="mt-2 text-base font-medium text-blue-400/90 italic leading-relaxed">&quot;{getWhyApplySummary(scoredJob)}&quot;</p>
              <hr className="my-6 border-[var(--apple-border)]" />
              <p className="metric-label">Job Description</p>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[var(--apple-text)]">{scoredJob.description}</p>
            </section>
          )}

          {activeTab === 'outreach' && (
            <section className="space-y-8 pb-12">
              <div className="detail-section">
                <div className="flex items-center justify-between gap-2 mb-3"><p className="metric-label">Cold Email</p><button type="button" className="ghost-btn" onClick={() => handleCopy(outreach.email.body, 'email')}>{copiedKey === 'email' ? 'Copied' : 'Copy'}</button></div>
                <pre className="template-block p-4 bg-black/20 rounded-xl border border-[var(--apple-border)] whitespace-pre-wrap text-sm"><span className="text-[var(--apple-text-muted)] font-bold">Subject: {outreach.email.subject}</span>{`\n\n${outreach.email.body}`}</pre>
              </div>

              <div className="detail-section">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                        <p className="metric-label">LinkedIn DM</p>
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{outreach.linkedin.length} chars</span>
                    </div>
                    <button type="button" className="ghost-btn" onClick={() => handleCopy(outreach.linkedin, 'linkedin')}>{copiedKey === 'linkedin' ? 'Copied' : 'Copy'}</button>
                </div>
                <pre className="template-block p-4 bg-black/20 rounded-xl border border-[var(--apple-border)] whitespace-pre-wrap text-sm">{outreach.linkedin}</pre>
              </div>

              <div className="detail-section">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                        <p className="metric-label">Twitter/X DM</p>
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{outreach.twitter.length} chars</span>
                    </div>
                    <button type="button" className="ghost-btn" onClick={() => handleCopy(outreach.twitter, 'twitter')}>{copiedKey === 'twitter' ? 'Copied' : 'Copy'}</button>
                </div>
                <pre className="template-block p-4 bg-black/20 rounded-xl border border-[var(--apple-border)] whitespace-pre-wrap text-sm">{outreach.twitter}</pre>
              </div>
            </section>
          )}
        </div>
        
        <div className="detail-footer p-8 border-t border-[var(--apple-border)] flex items-center gap-4">
          <a href={scoredJob.link || '#'} target="_blank" rel="noreferrer" className="action-pill bg-blue-600 hover:bg-blue-500 text-white border-none px-6">
            <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-2" /> Open Application
          </a>
        </div>
      </aside>
    </div>
  )
}
