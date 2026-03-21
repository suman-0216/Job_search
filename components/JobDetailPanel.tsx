import { useEffect, useState } from 'react'
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/solid'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { generateOutreach, generateFundedOutreach, generateStealthOutreach, OutreachResult, Job } from '../lib/outreach'

interface JobDetailPanelProps {
  job: Job | null
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

export default function JobDetailPanel({ job, onClose }: JobDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'description' | 'outreach'>('description');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [outreachContent, setOutreachContent] = useState<OutreachResult | { singleMessage: string } | null>(null);

  useEffect(() => {
    if (!job) return;

    // Generate outreach content when the job changes
    const sourceType = job.sourceType as string;
    if (sourceType === 'funded') {
        setOutreachContent({ singleMessage: generateFundedOutreach(job) });
    } else if (sourceType === 'stealth') {
        setOutreachContent({ singleMessage: generateStealthOutreach(job) });
    } else {
        setOutreachContent(generateOutreach(job));
    }
    
    // Reset to description tab for new jobs
    setActiveTab('description');

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onEsc);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onEsc);
    };
  }, [job]);

  if (!job) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const title = job.title || 'Untitled Role';
  const company = job.company || 'Unknown Company';
  const location = job.location || 'N/A';
  const salary = job.salary || 'N/A';
  const description = job.description || 'No description available.';
  const link = job.link || '#';
  const applicants = job.applicants || 0;
  const postedAt = job.postedAt || '';
  const score = job.score || 'N/A';
  const remote = job.remote ? 'Remote OK' : 'On-site';

  const whyThisRole = `${applicants} applicants · Posted ${timeAgo(postedAt)} · Score ${score}/10 · ${remote}`;

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
            <h2 className="text-[38px] leading-[1.02] font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 text-base text-[var(--apple-text-muted)]">{company} | {location}</p>
          </div>
          <button type="button" onClick={onClose} className="ghost-icon" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-8 border-b border-[var(--apple-border)]">
          <div className="flex items-center gap-4 -mb-px">
            <button className={`detail-tab ${activeTab === 'description' ? 'active' : ''}`} onClick={() => setActiveTab('description')}>Description</button>
            <button className={`detail-tab ${activeTab === 'outreach' ? 'active' : ''}`} onClick={() => setActiveTab('outreach')}>Outreach</button>
          </div>
        </div>
        
        <div className="detail-body">
          {activeTab === 'description' && (
            <>
              <section className="detail-meta-grid">
                <div className="detail-meta"><p className="metric-label">Salary</p><p className="mt-1 text-base font-semibold">{salary}</p></div>
                <div className="detail-meta"><p className="metric-label">Applicants</p><p className="mt-1 text-base font-semibold">{applicants}</p></div>
                <div className="detail-meta"><p className="metric-label">Posted</p><p className="mt-1 text-base font-semibold">{timeAgo(postedAt)}</p></div>
                <div className="detail-meta"><p className="metric-label">Location</p><p className="mt-1 text-base font-semibold">{remote}</p></div>
              </section>
              <section className="detail-section">
                <p className="metric-label">Description</p>
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-[var(--apple-text)]">{description}</p>
              </section>
            </>
          )}

          {activeTab === 'outreach' && outreachContent && (
            <section className="detail-section">
              <div className="p-3 mb-4 rounded-lg bg-[var(--apple-button-hover)] border border-[var(--apple-border)]">
                  <p className="metric-label">Why this role?</p>
                  <p className="text-sm text-[var(--apple-text-muted)] mt-1">{whyThisRole}</p>
              </div>

              {'singleMessage' in outreachContent ? (
                  <div className="detail-section">
                    <div className="flex items-center justify-between gap-2"><p className="metric-label">Personalized Outreach</p><button type="button" className="ghost-btn" onClick={() => handleCopy(outreachContent.singleMessage, 'single')}>{copiedKey === 'single' ? 'Copied' : 'Copy'}</button></div>
                    <pre className="template-block">{outreachContent.singleMessage}</pre>
                  </div>
              ) : (
                <>
                  <div className="mb-4">
                    <p className="metric-label">Matched Skills</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {outreachContent.matchedSkills.length > 0 ? outreachContent.matchedSkills.map(skill => (
                            <span key={skill} className="skill-chip"><CheckIcon className="h-3 w-3 mr-1" /> {skill}</span>
                        )) : <span className="skill-chip">No direct skill matches found</span>}
                    </div>
                  </div>

                  <div className="detail-section">
                    <div className="flex items-center justify-between gap-2"><p className="metric-label">Cold Email</p><button type="button" className="ghost-btn" onClick={() => handleCopy(outreachContent.email.body, 'email')}>{copiedKey === 'email' ? 'Copied' : 'Copy'}</button></div>
                    <pre className="template-block"><span className="text-[var(--apple-text-muted)]">Subject: {outreachContent.email.subject}</span>{`\n\n${outreachContent.email.body}`}</pre>
                  </div>
                  <div className="detail-section">
                    <div className="flex items-center justify-between gap-2"><p className="metric-label">LinkedIn DM</p><button type="button" className="ghost-btn" onClick={() => handleCopy(outreachContent.linkedin, 'linkedin')}>{copiedKey === 'linkedin' ? 'Copied' : 'Copy'}</button></div>
                    <pre className="template-block">{outreachContent.linkedin}</pre>
                  </div>
                  <div className="detail-section">
                    <div className="flex items-center justify-between gap-2"><p className="metric-label">Twitter/X DM</p><button type="button" className="ghost-btn" onClick={() => handleCopy(outreachContent.twitter, 'twitter')}>{copiedKey === 'twitter' ? 'Copied' : 'Copy'}</button></div>
                    <pre className="template-block">{outreachContent.twitter}</pre>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
        
        <div className="detail-footer">
          <a href={link} target="_blank" rel="noreferrer" className="action-pill">
            <ArrowTopRightOnSquareIcon className="h-4 w-4" /> Open posting
          </a>
        </div>
      </aside>
    </div>
  )
}
