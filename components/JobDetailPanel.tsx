"use client";

import { XMarkIcon } from '@heroicons/react/24/solid';

const JobDetailPanel = ({ job, onClose }) => {
  if (!job) return null;

  return (
    <div
      className="fixed top-0 right-0 h-full w-full max-w-2xl bg-[var(--apple-nav)] backdrop-blur-xl border-l border-[var(--apple-border)] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out"
      style={{ transform: 'translateX(0%)' }}
    >
      <div className="flex justify-between items-center p-6 border-b border-[var(--apple-border)]">
        <div>
          <h2 className="text-xl font-bold">{job.title}</h2>
          <p className="text-sm text-[var(--apple-text-muted)]">{job.companyName}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-[var(--apple-hover)]"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>
      <div className="p-6 overflow-y-auto h-[calc(100%-80px)]">
        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--apple-text-muted)] mb-4">
          Job Description
        </h3>
        <div 
          className="prose prose-sm dark:prose-invert" 
          dangerouslySetInnerHTML={{ __html: job.description || 'No description available.' }}
        />
        
        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--apple-text-muted)] mt-8 mb-4">
          Outreach Templates
        </h3>
        <div className="space-y-4">
            <div>
                <label className="text-xs font-bold text-[var(--apple-text-muted)]">Cold Email</label>
                <textarea
                    readOnly
                    className="w-full mt-1 p-2 bg-[var(--apple-input-bg)] rounded-md text-sm border border-[var(--apple-border)]"
                    rows={5}
                    value={`Subject: Inquiry about the ${job.title} role

Hi [Hiring Manager],

I came across the opening for a ${job.title} at ${job.companyName} and was immediately intrigued by your work in [mention specific area].

My background in [mention 1-2 key skills] and experience with [mention relevant project] align well with the requirements of this role. I am confident I can contribute to your team's success.

Would you be open to a brief chat next week?

Best,
[Your Name]`}
                />
            </div>
            <div>
                <label className="text-xs font-bold text-[var(--apple-text-muted)]">LinkedIn DM</label>
                <textarea
                    readOnly
                    className="w-full mt-1 p-2 bg-[var(--apple-input-bg)] rounded-md text-sm border border-[var(--apple-border)]"
                    rows={3}
                    value={`Hi [Name], I saw the ${job.title} role at ${job.companyName}. Your work in [specific area] is fascinating. My experience with [key skill] could be a great fit. Worth a quick chat?`}
                />
            </div>
        </div>
      </div>
    </div>
  );
};

export default JobDetailPanel;
