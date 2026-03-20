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
      .then(res => res.json())
      .then(allData => {
        setData(allData)
        if (allData.length) setCurrentDay(allData[0])
      })
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

  const loadDay = (date: string) => setCurrentDay(data.find(d => d.date === date) || data[0])

  // Processing Jobs
  let jobs = (currentDay?.jobs || []).filter((j: any) => {
    const text = (j.title + ' ' + j.companyName + ' ' + j.company + ' ' + j.location).toLowerCase()
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
      valA = new Date(a.postedAt || a.date).getTime()
      valB = new Date(b.postedAt || b.date).getTime()
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
    const hrs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000)
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
    <div className="min-h-screen text-[var(--apple-text)] font-sans antialiased flex flex-col">
      
      {/* Global Header */}
      <header className="apple-global-nav sticky top-0 z-50 px-6 py-4 flex flex-wrap justify-between items-center border-b border-[var(--apple-border)]">
        <h1 className="text-2xl font-bold tracking-tight">AI Job Hunter <span className="text-[#0071e3]">◆</span></h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--apple-text-muted)] font-semibold uppercase tracking-wider">Select Day:</span>
            <select 
              className="bg-transparent border border-[#0071e3] text-[#0071e3] font-semibold text-sm rounded-md px-3 py-1 cursor-pointer outline-none"
              onChange={(e) => loadDay(e.target.value)}
            >
              {data.map(d => (
                <option key={d.date} value={d.date}>{d.date} ({d.jobs.length} jobs)</option>
              ))}
            </select>
          </div>
          <button 
            onClick={toggleTheme} 
            className="p-1.5 rounded-full bg-[var(--apple-hover)] hover:opacity-80 transition-opacity text-sm"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Controls Bar */}
      <div className="bg-[var(--apple-surface)] border-b border-[var(--apple-border)] px-6 py-4 flex flex-wrap gap-3 items-center shadow-sm">
        <input 
          type="text" 
          placeholder="Search title, company, location..." 
          className="apple-input px-4 py-2 text-sm flex-1 min-w-[250px]"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="apple-input px-4 py-2 text-sm cursor-pointer" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option>Full-time</option>
          <option>Contract</option>
          <option>Internship</option>
        </select>
        <select className="apple-input px-4 py-2 text-sm cursor-pointer" value={remoteFilter} onChange={e => setRemoteFilter(e.target.value)}>
          <option value="">All Locations</option>
          <option value="remote">Remote Only</option>
          <option value="ca">California</option>
          <option value="sf">San Francisco</option>
        </select>
        <select className="apple-input px-4 py-2 text-sm cursor-pointer" value={sortCol} onChange={e => { setSortCol(e.target.value); setSortDir(-1) }}>
          <option value="startup_score">Sort: Best Opportunity</option>
          <option value="applicants">Sort: Least Competitive</option>
          <option value="postedAt">Sort: Newest</option>
        </select>

        <div className="flex gap-2 ml-auto">
          <span className="px-3 py-1.5 border border-[var(--apple-border)] rounded-md text-[11px] text-[var(--apple-text-muted)] font-medium">Jobs: <b className="text-[var(--apple-text)]">{jobs.length}</b></span>
          <span className="px-3 py-1.5 border border-[var(--apple-border)] rounded-md text-[11px] text-[var(--apple-text-muted)] font-medium">🔥 Hot: <b className="text-[var(--apple-text)]">{hotCount}</b></span>
          <span className="px-3 py-1.5 border border-[var(--apple-border)] rounded-md text-[11px] text-[var(--apple-text-muted)] font-medium">⭐ Startups: <b className="text-[var(--apple-text)]">{startupCount}</b></span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex bg-[var(--apple-surface)] border-b border-[var(--apple-border)] px-4">
        {[
          { id: 'jobs', label: '📋 Jobs' },
          { id: 'funded', label: '💰 Funded Startups' },
          { id: 'stealth', label: '🕵️ Stealth' },
          { id: 'outreach', label: '✉️ Outreach' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-[13px] font-semibold tracking-wide transition-colors border-b-2 ${activeTab === tab.id ? 'border-[#0071e3] text-[#0071e3]' : 'border-transparent text-[var(--apple-text-muted)] hover:text-[var(--apple-text)]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-8 overflow-x-hidden">
        
        {/* JOBS */}
        {activeTab === 'jobs' && (
          <div className="animate-fade-in-up">
            <div className="overflow-x-auto apple-card border border-[var(--apple-border)]">
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px]">
                <thead>
                  <tr className="bg-[var(--apple-bg)] border-b border-[var(--apple-border)] text-[10px] text-[var(--apple-text-muted)] uppercase tracking-widest">
                    <th className="p-3 cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('startup_score')}>Score ↕</th>
                    <th className="p-3 cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('title')}>Title ↕</th>
                    <th className="p-3 cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('company')}>Company ↕</th>
                    <th className="p-3 cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('location')}>Location ↕</th>
                    <th className="p-3">Type</th>
                    <th className="p-3 cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('applicants')}>Applicants ↕</th>
                    <th className="p-3 cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('postedAt')}>Posted ↕</th>
                    <th className="p-3">Salary</th>
                    <th className="p-3">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j: any, i: number) => {
                    const apps = parseInt(j.applicantsCount || j.applicants) || 0
                    const score = j.startup_score || j.score || 0
                    const scoreColor = score >= 7 ? 'text-[#34c759]' : score >= 4 ? 'text-[#fbbf24]' : 'text-[var(--apple-text-muted)]'
                    
                    return (
                      <tr key={i} className="border-b border-[var(--apple-border)] hover:bg-[var(--apple-hover)] transition-colors text-[13px]">
                        <td className={`p-3 font-bold ${scoreColor}`}>{score}/10</td>
                        <td className="p-3">
                          <a href={j.link} target="_blank" rel="noreferrer" className="font-semibold text-[var(--apple-text)] hover:text-[#0071e3]">
                            {(j.workRemoteAllowed || (j.location||'').toLowerCase().includes('remote')) ? '🌐 ' : ''}{j.title}
                          </a>
                          <br/><span className="text-[11px] text-[var(--apple-text-muted)]">{j.companyName || j.company}</span>
                        </td>
                        <td className="p-3 text-[12px] text-[var(--apple-text-muted)] font-medium">{j.companyName || j.company}</td>
                        <td className="p-3 text-[12px] text-[var(--apple-text-muted)]">{j.location}</td>
                        <td className="p-3 text-[12px]">{j.employmentType || '—'}</td>
                        <td className={`p-3 font-medium ${apps >= 200 ? 'text-[#ff3b30]' : ''}`}>
                          {apps >= 200 ? '🔥 ' : ''}{apps}
                        </td>
                        <td className="p-3 text-[12px] text-[var(--apple-text-muted)]">{timeAgo(j.postedAt || j.date)}</td>
                        <td className="p-3 text-[12px] text-[#34c759] font-medium">{j.salary || '—'}</td>
                        <td className="p-3">
                          <a 
                            href={j.link} 
                            target="_blank" 
                            rel="noreferrer"
                            onClick={() => handleApplyClick(j.companyName || j.company, j.title)}
                            className="inline-flex items-center px-3 py-1.5 border border-[#0071e3] text-[#0071e3] rounded-md text-[11px] font-bold tracking-wide hover:bg-[#0071e3] hover:text-white transition-all"
                          >
                            Apply →
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FUNDED */}
        {activeTab === 'funded' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">
            {currentDay.funded?.length ? currentDay.funded.map((f: any, i: number) => (
              <div key={i} className="apple-card p-5 flex flex-col">
                <h3 className="text-[16px] font-bold mb-3">{f.company_name || f.company || f.searchResult?.title || 'Startup'}</h3>
                <div className="flex gap-4 mb-3 text-[12px] text-[var(--apple-text-muted)] bg-[var(--apple-input-bg)] p-3 rounded-lg">
                  <span>💰 <strong className="text-[var(--apple-text)]">{f.funding_amount || 'Funded'}</strong></span>
                  <span>📍 <strong className="text-[var(--apple-text)]">{f.location || 'SF'}</strong></span>
                  <span>👤 <strong className="text-[var(--apple-text)]">{f.ceo_name || '—'}</strong></span>
                </div>
                <p className="text-[13px] text-[var(--apple-text-muted)] leading-relaxed mb-4">
                  {f.why_apply || f.searchResult?.description || f.title || ''}
                </p>
                <div className="mt-auto bg-[var(--apple-input-bg)] rounded-lg p-3 text-[12px] text-[var(--apple-text)] border border-[var(--apple-border)]">
                  📧 {f.email_guess || f.emailGuess || 'Try: firstname@' + ((f.website || '').replace('https://','').replace('www.','').split('/')[0])}
                  {f.hook && <div className="mt-2 text-[var(--apple-text-muted)]">💡 {f.hook}</div>}
                </div>
              </div>
            )) : <p className="text-[var(--apple-text-muted)] p-5">No funded startup data for this day yet.</p>}
          </div>
        )}

        {/* STEALTH */}
        {activeTab === 'stealth' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
            {currentDay.stealth?.length ? currentDay.stealth.map((c: any, i: number) => (
              <div key={i} className="apple-card p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-[16px] font-bold">{c.description || c.company || 'Stealth Company'}</h3>
                  {c.batch && <span className="text-[10px] font-bold px-2 py-1 bg-[rgba(52,199,89,0.15)] text-[#34c759] rounded-full uppercase">{c.batch}</span>}
                </div>
                <p className="text-[13px] text-[var(--apple-text-muted)] leading-relaxed">
                  {c.contact_strategy || c.contactStrategy || ''}
                </p>
              </div>
            )) : <p className="text-[var(--apple-text-muted)] p-5">No stealth startup data for this day.</p>}
          </div>
        )}

        {/* OUTREACH */}
        {activeTab === 'outreach' && (
          <div className="animate-fade-in-up max-w-4xl">
            <p className="text-[13px] text-[var(--apple-text-muted)] mb-6 font-medium">
              Click "Apply" on any job in the Jobs tab, and the templates below will automatically populate.
            </p>
            
            <div className="space-y-6">
              <div className="apple-card p-6">
                <h3 className="text-[15px] font-bold mb-4 flex items-center gap-2">
                  <span className="text-xl">✉️</span> Cold Email Template
                </h3>
                <div className="bg-[var(--apple-input-bg)] border border-[var(--apple-border)] rounded-lg p-4 text-[13px] whitespace-pre-wrap leading-relaxed font-medium text-[var(--apple-text)]">
                  {emailTemplate}
                </div>
                <button 
                  onClick={(e) => copyText(emailTemplate, e)}
                  disabled={!outreachCompany}
                  className="mt-4 px-4 py-2 border border-[#0071e3] text-[#0071e3] font-bold text-[12px] rounded-md hover:bg-[#0071e3] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  📋 Copy Email
                </button>
              </div>

              <div className="apple-card p-6">
                <h3 className="text-[15px] font-bold mb-4 flex items-center gap-2">
                  <span className="text-xl">🤝</span> LinkedIn DM Template
                </h3>
                <div className="bg-[var(--apple-input-bg)] border border-[var(--apple-border)] rounded-lg p-4 text-[13px] whitespace-pre-wrap leading-relaxed font-medium text-[var(--apple-text)]">
                  {linkedinTemplate}
                </div>
                <button 
                  onClick={(e) => copyText(linkedinTemplate, e)}
                  disabled={!outreachCompany}
                  className="mt-4 px-4 py-2 border border-[#0071e3] text-[#0071e3] font-bold text-[12px] rounded-md hover:bg-[#0071e3] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  📋 Copy DM
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      <footer className="mt-auto py-6 text-center text-[11px] text-[var(--apple-text-muted)] border-t border-[var(--apple-border)]">
        Auto-updated daily by GitHub Actions · AI Job Hunter System · Built with Apify + Next.js
      </footer>
    </div>
  )
}
