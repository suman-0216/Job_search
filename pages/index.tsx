import { useState, useEffect } from 'react'

export default function Dashboard() {
  const [data, setData] = useState<any[]>([])
  const [currentDay, setCurrentDay] = useState<any>({ jobs: [], funded: [], stealth: [] })
  const [activeTab, setActiveTab] = useState('jobs')
  const [theme, setTheme] = useState('dark')

  // Search & Filter
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [remoteFilter, setRemoteFilter] = useState('')
  const [sortCol, setSortCol] = useState('startup_score')
  const [sortDir, setSortDir] = useState(-1)

  // Outreach
  const [outreachCompany, setOutreachCompany] = useState('')
  const [outreachTitle, setOutreachTitle] = useState('')

  useEffect(() => {
    if (localStorage.theme === 'light') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
    
    fetch('/api/data')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      })
      .then(allData => {
        if (Array.isArray(allData)) {
          setData(allData)
          if (allData.length > 0) {
            setCurrentDay(allData[0])
          }
        }
      })
      .catch(err => console.error("Error fetching data:", err))
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
      localStorage.theme = 'dark'
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.theme = 'light'
    }
  }, [theme])

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  const loadDay = (date: string) => {
    const day = data.find(d => d.date === date)
    if (day) setCurrentDay(day)
  }

  // Processing Jobs
  const rawJobs = Array.isArray(currentDay?.jobs) ? currentDay.jobs : []
  let jobs = rawJobs.filter((j: any) => {
    const text = ((j.title || '') + ' ' + (j.companyName || j.company || '') + ' ' + (j.location || '')).toLowerCase()
    if (search && !text.includes(search.toLowerCase())) return false
    if (typeFilter && j.employmentType !== typeFilter) return false
    if (remoteFilter === 'remote' && !j.workRemoteAllowed && !text.includes('remote')) return false
    if (remoteFilter === 'ca' && !text.includes('california') && !text.includes(', ca')) return false
    if (remoteFilter === 'sf' && !text.includes('san francisco')) return false
    return true
  })

  jobs.sort((a: any, b: any) => {
    let valA = a[sortCol]
    let valB = b[sortCol]
    
    if (sortCol === 'applicants') {
      valA = parseInt(a.applicantsCount || a.applicants) || 0
      valB = parseInt(b.applicantsCount || b.applicants) || 0
    } else if (sortCol === 'postedAt' || sortCol === 'date') {
      valA = new Date(a.postedAt || a.date || 0).getTime()
      valB = new Date(b.postedAt || b.date || 0).getTime()
    } else if (sortCol === 'startup_score' || sortCol === 'score') {
      valA = a.startup_score || a.score || 0
      valB = b.startup_score || b.score || 0
    }
    
    if (valA < valB) return -1 * sortDir
    if (valA > valB) return 1 * sortDir
    return 0
  })

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(sortDir * -1)
    else { setSortCol(col); setSortDir(-1) }
  }

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return 'Unknown'
    const timestamp = new Date(dateStr).getTime()
    if (isNaN(timestamp)) return dateStr
    const hrs = Math.floor((Date.now() - timestamp) / 3600000)
    if (hrs < 1) return 'Just now'
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs/24) + 'd ago'
  }

  const hotCount = jobs.filter((j:any) => (parseInt(j.applicantsCount || j.applicants)||0) >= 200).length
  const startupCount = jobs.filter((j:any) => (j.startup_score || j.score || 0) >= 7).length

  const handleApplyClick = (company: string, title: string) => {
    setOutreachCompany(company)
    setOutreachTitle(title)
    setActiveTab('outreach')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyText = (text: string, e: React.MouseEvent<HTMLButtonElement>) => {
    navigator.clipboard.writeText(text)
    const btn = e.currentTarget
    const old = btn.innerText
    btn.innerText = '✓ Copied!'
    setTimeout(() => btn.innerText = old, 2000)
  }

  const emailTemplate = outreachCompany ? 
    `Subject: Early eng for ${outreachCompany} — [Your Name]\n\nHi [Founder Name],\n\nI saw the ${outreachTitle} posting at ${outreachCompany} — I'm particularly interested in what you're building and think I can contribute immediately.\n\nI'm an AI/ML engineer with experience in Python, PyTorch, LLM pipelines, and RAG systems. Here's a relevant project: [github.com/you/project]\n\nOpen to a trial task or contract-first to show what I can do.\n\nWorth a 15-min call?\n\n[Your Name]` : 
    'Select a company from the Jobs or Funded tabs to generate a personalized message.'
    
  const linkedinTemplate = outreachCompany ? 
    `Hi — saw the ${outreachTitle} role at ${outreachCompany}. Your work on [specific product detail] is exactly the space I want to be in. I'm an AI/ML eng — built [X thing]. Open to a trial project to start?` :
    'Select a company from the Jobs or Funded tabs to generate a personalized message.'

  return (
    <div className="min-h-screen text-[var(--apple-text)] font-sans antialiased flex flex-col bg-[var(--apple-bg)]">
      
      {/* Global Header */}
      <header className="apple-global-nav sticky top-0 z-50 px-8 py-5 flex flex-wrap justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight">AI Job Hunter <span className="text-[#0071e3]">◆</span></h1>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--apple-text-muted)] font-bold uppercase tracking-[0.1em]">Pipeline</span>
            <select 
              className="bg-transparent text-[var(--apple-accent)] font-semibold text-sm rounded-md px-1 cursor-pointer outline-none border-none"
              onChange={(e) => loadDay(e.target.value)}
              value={currentDay?.date || ''}
            >
              {data.map(d => (
                <option key={d.date} value={d.date}>{d.date} ({Array.isArray(d.jobs) ? d.jobs.length : 0} leads)</option>
              ))}
            </select>
          </div>
          <button 
            onClick={toggleTheme} 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--apple-hover)] hover:opacity-80 transition-opacity"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Hero Stats */}
      <div className="px-8 pt-8 pb-4 flex flex-wrap gap-4 items-center animate-fade-in-up">
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold">My Career Radar</h2>
          <p className="text-[13px] text-[var(--apple-text-muted)] mt-1">Found {jobs.length} relevant opportunities for {currentDay?.date || 'today'}</p>
        </div>
        <div className="flex gap-4 ml-auto">
          <div className="apple-card px-5 py-3 flex flex-col items-center min-w-[100px]">
            <span className="text-[10px] text-[var(--apple-text-muted)] font-bold uppercase tracking-wider mb-1">Active</span>
            <span className="text-xl font-bold">{jobs.length}</span>
          </div>
          <div className="apple-card px-5 py-3 flex flex-col items-center min-w-[100px]">
            <span className="text-[10px] text-[var(--apple-text-muted)] font-bold uppercase tracking-wider mb-1">🔥 Hot</span>
            <span className="text-xl font-bold text-[var(--apple-error)]">{hotCount}</span>
          </div>
          <div className="apple-card px-5 py-3 flex flex-col items-center min-w-[100px]">
            <span className="text-[10px] text-[var(--apple-text-muted)] font-bold uppercase tracking-wider mb-1">⭐ Top Tier</span>
            <span className="text-xl font-bold text-[var(--apple-success)]">{startupCount}</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="px-8 py-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[280px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input 
            type="text" 
            placeholder="Search roles or companies..." 
            className="apple-input w-full pl-9 pr-4 py-2 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="apple-input px-4 py-2 text-sm cursor-pointer min-w-[140px]" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option>Full-time</option>
          <option>Contract</option>
          <option>Internship</option>
        </select>
        <select className="apple-input px-4 py-2 text-sm cursor-pointer min-w-[140px]" value={remoteFilter} onChange={e => setRemoteFilter(e.target.value)}>
          <option value="">All Locations</option>
          <option value="remote">Remote Only</option>
          <option value="ca">California</option>
          <option value="sf">San Francisco</option>
        </select>
        <select className="apple-input px-4 py-2 text-sm cursor-pointer min-w-[180px]" value={sortCol} onChange={e => { setSortCol(e.target.value); setSortDir(-1) }}>
          <option value="startup_score">Opportunity Score</option>
          <option value="applicants">Competition Level</option>
          <option value="postedAt">Posting Date</option>
        </select>
      </div>

      {/* Tab Bar */}
      <div className="flex px-8 border-b border-[var(--apple-border)]">
        {[
          { id: 'jobs', label: 'Dashboard' },
          { id: 'funded', label: 'Funded Hub' },
          { id: 'stealth', label: 'Stealth Projects' },
          { id: 'outreach', label: 'Outreach Lab' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-4 text-[13px] font-semibold tracking-wide transition-all border-b-2 -mb-[1px] ${activeTab === tab.id ? 'border-[var(--apple-accent)] text-[var(--apple-accent)]' : 'border-transparent text-[var(--apple-text-muted)] hover:text-[var(--apple-text)]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-x-hidden">
        
        {/* JOBS */}
        {activeTab === 'jobs' && (
          <div className="animate-fade-in-up">
            <div className="overflow-x-auto apple-card">
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px]">
                <thead>
                  <tr className="bg-[var(--apple-input-bg)] border-b border-[var(--apple-border)] text-[9px] text-[var(--apple-text-muted)] uppercase tracking-[0.15em] font-bold">
                    <th className="p-4 cursor-pointer hover:text-[var(--apple-accent)]" onClick={() => handleSort('startup_score')}>Score</th>
                    <th className="p-4 cursor-pointer hover:text-[var(--apple-accent)]" onClick={() => handleSort('title')}>Position</th>
                    <th className="p-4 cursor-pointer hover:text-[var(--apple-accent)]" onClick={() => handleSort('company')}>Entity</th>
                    <th className="p-4 cursor-pointer hover:text-[var(--apple-accent)]" onClick={() => handleSort('location')}>Location</th>
                    <th className="p-4 cursor-pointer hover:text-[var(--apple-accent)]" onClick={() => handleSort('applicants')}>Market Comp</th>
                    <th className="p-4 cursor-pointer hover:text-[var(--apple-accent)]" onClick={() => handleSort('postedAt')}>Status</th>
                    <th className="p-4">Compensation</th>
                    <th className="p-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j: any, i: number) => {
                    const apps = parseInt(j.applicantsCount || j.applicants) || 0
                    const score = j.startup_score || j.score || 0
                    const scoreColor = score >= 7 ? 'text-[var(--apple-success)]' : score >= 4 ? 'text-[var(--apple-warning)]' : 'text-[var(--apple-text-muted)]'
                    
                    return (
                      <tr key={i} className="border-b border-[var(--apple-border)] hover:bg-[var(--apple-hover)] transition-colors text-[13px]">
                        <td className={`p-4 font-black ${scoreColor} tabular-nums tracking-wider`}>{score.toFixed(1)}</td>
                        <td className="p-4">
                          <a href={j.link} target="_blank" rel="noreferrer" className="font-bold text-[var(--apple-text)] hover:text-[var(--apple-accent)]">
                            {(j.workRemoteAllowed || (j.location||'').toLowerCase().includes('remote')) ? '🌐 ' : ''}{j.title}
                          </a>
                        </td>
                        <td className="p-4 text-[12px] font-semibold">{j.companyName || j.company}</td>
                        <td className="p-4 text-[12px] text-[var(--apple-text-muted)]">{j.location}</td>
                        <td className={`p-4 font-medium tabular-nums ${apps >= 200 ? 'text-[var(--apple-error)]' : ''}`}>
                          {apps >= 200 ? '🔥 ' : ''}{apps} applicants
                        </td>
                        <td className="p-4 text-[12px] text-[var(--apple-text-muted)] font-medium uppercase tracking-tight">{timeAgo(j.postedAt || j.date)}</td>
                        <td className="p-4 text-[12px] text-[var(--apple-success)] font-bold tabular-nums">{j.salary || 'Market Rate'}</td>
                        <td className="p-4">
                          <a 
                            href={j.link} 
                            target="_blank" 
                            rel="noreferrer"
                            onClick={() => handleApplyClick(j.companyName || j.company, j.title)}
                            className="apple-btn-secondary px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider"
                          >
                            Infiltrate
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {jobs.length === 0 && (
                <div className="p-20 text-center flex flex-col items-center">
                  <span className="text-4xl mb-4">🔍</span>
                  <p className="text-[var(--apple-text-muted)] font-medium">No results match your current filters.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FUNDED */}
        {activeTab === 'funded' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
            {Array.isArray(currentDay?.funded) && currentDay.funded.length ? currentDay.funded.map((f: any, i: number) => (
              <div key={i} className="apple-card p-6 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-[17px] font-bold">{f.company_name || f.company || f.searchResult?.title || 'Startup'}</h3>
                  <span className="text-[10px] font-black bg-[var(--apple-success)] text-white px-2 py-1 rounded-md">FUNDED</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-[var(--apple-input-bg)] p-3 rounded-lg border border-[var(--apple-border)]">
                    <span className="block text-[9px] uppercase font-bold text-[var(--apple-text-muted)] mb-1">Raised</span>
                    <span className="text-[13px] font-bold text-[var(--apple-success)]">{f.funding_amount || '$ —'}</span>
                  </div>
                  <div className="bg-[var(--apple-input-bg)] p-3 rounded-lg border border-[var(--apple-border)]">
                    <span className="block text-[9px] uppercase font-bold text-[var(--apple-text-muted)] mb-1">HQ</span>
                    <span className="text-[13px] font-bold">{f.location || 'SF'}</span>
                  </div>
                </div>
                <p className="text-[13px] text-[var(--apple-text-muted)] leading-relaxed mb-6 font-medium">
                  {f.why_apply || f.searchResult?.description || f.title || 'No description available for this venture.'}
                </p>
                <div className="mt-auto border-t border-[var(--apple-border)] pt-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--apple-accent)] text-white flex items-center justify-center text-xs font-bold">
                      {(f.ceo_name || 'U')[0]}
                    </div>
                    <div>
                      <span className="block text-[12px] font-bold">{f.ceo_name || 'Founder'}</span>
                      <span className="block text-[11px] text-[var(--apple-text-muted)]">{f.email_guess || 'Email via domain'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )) : <p className="text-[var(--apple-text-muted)] p-10 text-center font-medium border border-dashed border-[var(--apple-border)] rounded-2xl">No venture capital data logged for this cycle.</p>}
          </div>
        )}

        {/* STEALTH */}
        {activeTab === 'stealth' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
            {Array.isArray(currentDay?.stealth) && currentDay.stealth.length ? currentDay.stealth.map((c: any, i: number) => (
              <div key={i} className="apple-card p-6 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[16px] font-bold flex items-center gap-2">
                    <span className="text-xl">🕵️</span> {c.company || 'Stealth Entity'}
                  </h3>
                  {c.batch && <span className="text-[10px] font-bold px-3 py-1 bg-[rgba(0,113,227,0.1)] text-[var(--apple-accent)] rounded-full">{c.batch}</span>}
                </div>
                <div className="bg-[var(--apple-input-bg)] p-4 rounded-xl border border-[var(--apple-border)] mb-4">
                  <span className="block text-[9px] uppercase font-bold text-[var(--apple-text-muted)] mb-2">Internal Intel</span>
                  <p className="text-[13px] text-[var(--apple-text)] leading-relaxed font-medium">
                    {c.description || 'Confidential AI development in progress.'}
                  </p>
                </div>
                <div className="mt-auto">
                  <span className="block text-[9px] uppercase font-bold text-[var(--apple-text-muted)] mb-2">Outreach Strategy</span>
                  <p className="text-[12px] text-[var(--apple-text-muted)] leading-relaxed">
                    {c.contact_strategy || 'Direct approach via shared networks recommended.'}
                  </p>
                </div>
              </div>
            )) : <p className="text-[var(--apple-text-muted)] p-10 text-center font-medium border border-dashed border-[var(--apple-border)] rounded-2xl">No stealth operations detected in this cycle.</p>}
          </div>
        )}

        {/* OUTREACH */}
        {activeTab === 'outreach' && (
          <div className="animate-fade-in-up max-w-5xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-4 bg-[var(--apple-accent)] text-white rounded-2xl shadow-lg">
                <span className="text-3xl">📧</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Outreach Lab</h2>
                <p className="text-[14px] text-[var(--apple-text-muted)] font-medium">Personalized weaponized communication for {outreachCompany || 'target companies'}.</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="apple-card p-8 flex flex-col h-full">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[15px] font-bold uppercase tracking-wider text-[var(--apple-text-muted)]">Cold Protocol</h3>
                  <span className="text-[10px] font-bold px-2 py-1 bg-[var(--apple-accent)] text-white rounded">EMAIL</span>
                </div>
                <div className="flex-1 bg-[var(--apple-input-bg)] border border-[var(--apple-border)] rounded-xl p-6 text-[14px] whitespace-pre-wrap leading-relaxed font-medium text-[var(--apple-text)] shadow-inner mb-6">
                  {emailTemplate}
                </div>
                <button 
                  onClick={(e) => copyText(emailTemplate, e)}
                  disabled={!outreachCompany}
                  className="apple-btn-primary w-full py-3.5 font-bold uppercase tracking-widest text-[11px] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Copy Payload
                </button>
              </div>

              <div className="apple-card p-8 flex flex-col h-full">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[15px] font-bold uppercase tracking-wider text-[var(--apple-text-muted)]">Direct Note</h3>
                  <span className="text-[10px] font-bold px-2 py-1 bg-[#0077b5] text-white rounded">LINKEDIN</span>
                </div>
                <div className="flex-1 bg-[var(--apple-input-bg)] border border-[var(--apple-border)] rounded-xl p-6 text-[14px] whitespace-pre-wrap leading-relaxed font-medium text-[var(--apple-text)] shadow-inner mb-6">
                  {linkedinTemplate}
                </div>
                <button 
                  onClick={(e) => copyText(linkedinTemplate, e)}
                  disabled={!outreachCompany}
                  className="apple-btn-primary w-full py-3.5 font-bold uppercase tracking-widest text-[11px] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Copy Transmission
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      <footer className="py-12 text-center border-t border-[var(--apple-border)] bg-[var(--apple-surface)]">
        <div className="max-w-2xl mx-auto px-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] mb-3 text-[var(--apple-text-muted)]">Job Hunter Pro System</p>
          <p className="text-[11px] text-[var(--apple-text-muted)] leading-relaxed">
            Proprietary career acceleration infrastructure. Aggregated from VC Portfolios, YC, and Deep Web Job Boards. 
            <br />Auto-synced daily via secure GitHub Actions.
          </p>
        </div>
      </footer>
    </div>
  )
}
