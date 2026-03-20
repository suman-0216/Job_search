import { useState, useEffect } from 'react'

export default function Dashboard() {
  const [data, setData] = useState<any[]>([])
  const [currentDay, setCurrentDay] = useState<any>({ jobs: [], funded: [], stealth: [] })
  const [activeTab, setActiveTab] = useState('jobs')
  const [theme, setTheme] = useState('light')

  // Search & Filter
  const [search, setSearch] = useState('')
  const [remoteFilter, setRemoteFilter] = useState('')
  const [sortCol, setSortCol] = useState('score')
  const [sortAsc, setSortAsc] = useState(false)

  // Outreach
  const [selectedCompany, setSelectedCompany] = useState('')

  useEffect(() => {
    // Check initial theme preference
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark')
    } else {
      setTheme('light')
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

  // Derived state for jobs
  let jobs = (currentDay?.jobs || []).filter((j: any) => {
    const text = (j.title + ' ' + j.company + ' ' + j.location).toLowerCase()
    if (search && !text.includes(search.toLowerCase())) return false
    if (remoteFilter === 'remote' && !text.includes('remote')) return false
    if (remoteFilter === 'sf' && !text.includes('francisco') && !text.includes('ca')) return false
    return true
  })

  jobs.sort((a: any, b: any) => {
    let valA = a[sortCol] || 0
    let valB = b[sortCol] || 0
    if (sortCol === 'role') { valA = a.title; valB = b.title }
    if (sortCol === 'date') { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime() }
    return (valA > valB ? 1 : -1) * (sortAsc ? 1 : -1)
  })

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(false) }
  }

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return 'Unknown'
    const hrs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000)
    if (hrs < 1) return '< 1h'
    if (hrs < 24) return hrs + 'h'
    return Math.floor(hrs/24) + 'd'
  }

  const companies = Array.from(new Set([
    ...(currentDay.jobs||[]).map((j: any) => j.company),
    ...(currentDay.funded||[]).map((f: any) => f.company),
    ...(currentDay.stealth||[]).map((s: any) => s.company)
  ])).sort().filter(Boolean)

  const emailOutreach = `Subject: AI Engineering at ${selectedCompany} - Driving impact\n\nHi [Founder Name],\n\nI've been following ${selectedCompany}'s recent work. As an AI Engineer based in the SF Bay Area (H1B), I specialize in building autonomous agents and scalable ML systems.\n\nI’d love to contribute to your engineering team. Let me know if you are open to a quick chat.\n\nBest,\nSuman\nmadipeddisuman@gmail.com`
  const linkedinOutreach = `Hi [Name], I saw ${selectedCompany} is scaling its AI efforts. I’m an AI Engineer based in SF building autonomous systems. Would love to connect and chat about potential engineering roles!`

  return (
    <div className="min-h-screen pb-24 text-[var(--apple-text)]">
      
      {/* Top Global Nav (Like Apple.com's dark bar) */}
      <div className="apple-global-nav sticky top-0 z-50 h-[44px] w-full flex justify-between items-center px-4 md:px-8 text-xs font-normal tracking-wide text-white/80">
        <div className="flex items-center gap-6 md:gap-10 w-full max-w-[1000px] mx-auto overflow-x-auto no-scrollbar justify-center">
          <span className="font-semibold text-white/90 whitespace-nowrap cursor-pointer hover:text-white transition-colors"> JobHunter</span>
          {['Jobs', 'Funded Startups', 'Stealth', 'Outreach'].map(tab => (
            <button 
              key={tab}
              onClick={() => {
                setActiveTab(tab.split(' ')[0].toLowerCase())
                window.scrollTo({ top: 250, behavior: 'smooth' })
              }}
              className={`whitespace-nowrap transition-colors ${activeTab === tab.split(' ')[0].toLowerCase() ? 'text-white' : 'hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Local Sticky Nav (Product Header) */}
      <div className="apple-local-nav sticky top-[44px] z-40 h-[52px] w-full flex justify-between items-center px-4 md:px-8 text-sm font-medium">
        <div className="font-semibold text-[21px] tracking-tight">Job Hunter <span className="text-[#0071e3]">Pro</span></div>
        <div className="flex items-center gap-4">
          <select 
            className="bg-transparent border-none font-medium text-[12px] outline-none text-[var(--apple-text)] cursor-pointer"
            onChange={(e) => loadDay(e.target.value)}
          >
            {data.map(d => (
              <option key={d.date} value={d.date}>{d.date} ({d.jobs.length})</option>
            ))}
          </select>
          <button 
            onClick={toggleTheme} 
            className="px-3 py-1 rounded-full bg-[var(--apple-hover)] hover:opacity-80 transition-opacity text-xs font-semibold"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <header className="bg-[var(--apple-bg-hero)] text-center pt-24 pb-20 px-5 animate-fade-in-up border-b border-[var(--apple-border)]">
        <h1 className="text-[52px] md:text-[80px] font-bold tracking-tighter leading-tight mb-3">
          Job Hunter Pro.
        </h1>
        <p className="text-[24px] md:text-[28px] text-[var(--apple-text)] tracking-tight max-w-2xl mx-auto font-medium">
          Meet the latest pipeline.
        </p>
        <p className="text-[19px] md:text-[21px] text-[var(--apple-text-muted)] tracking-tight max-w-2xl mx-auto font-normal mt-2 mb-8">
          Curated specifically for Founding Engineers.
        </p>
        <div className="flex justify-center gap-4">
          <button onClick={() => setActiveTab('jobs')} className="apple-btn-primary px-5 py-[10px] text-[15px]">View Jobs</button>
          <button onClick={() => setActiveTab('outreach')} className="apple-btn-secondary px-5 py-[10px] text-[15px]">Start Outreach</button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-[1080px] mx-auto px-5 pt-16">

        {/* JOBS PANE */}
        {activeTab === 'jobs' && (
          <div className="animate-fade-in-up">
            
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <input 
                type="text" 
                placeholder="Search roles, companies, locations..." 
                className="apple-input flex-1 p-3.5 px-5 text-[15px]"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select 
                className="apple-input p-3.5 px-5 text-[15px] cursor-pointer min-w-[200px]"
                value={remoteFilter}
                onChange={e => setRemoteFilter(e.target.value)}
              >
                <option value="">All Locations</option>
                <option value="remote">Remote Only</option>
                <option value="sf">San Francisco / CA</option>
              </select>
            </div>

            <div className="apple-card overflow-hidden bg-[var(--apple-surface)]">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--apple-border)] text-[12px] text-[var(--apple-text-muted)] uppercase tracking-wider font-semibold">
                      <th className="p-4 px-6 cursor-pointer hover:text-[var(--apple-text)] transition-colors" onClick={() => handleSort('score')}>Score</th>
                      <th className="p-4 px-6 cursor-pointer hover:text-[var(--apple-text)] transition-colors" onClick={() => handleSort('role')}>Role & Company</th>
                      <th className="p-4 px-6 cursor-pointer hover:text-[var(--apple-text)] transition-colors" onClick={() => handleSort('applicants')}>Applicants</th>
                      <th className="p-4 px-6 cursor-pointer hover:text-[var(--apple-text)] transition-colors" onClick={() => handleSort('date')}>Posted</th>
                      <th className="p-4 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j: any, i: number) => (
                      <tr key={i} className="border-b border-[var(--apple-border)] hover:bg-[var(--apple-hover)] transition-colors group">
                        <td className="p-4 px-6">
                          <span className="text-[17px] font-bold">{j.score || 0}</span>
                          <span className="text-[var(--apple-text-muted)] text-[13px]">/10</span>
                        </td>
                        <td className="p-4 px-6">
                          <a href={j.link} target="_blank" rel="noreferrer" className="font-semibold text-[17px] text-[var(--apple-text)] hover:text-[#0071e3] transition-colors">{j.title}</a>
                          <div className="text-[13px] text-[var(--apple-text-muted)] mt-1.5 font-medium">
                            {j.company} <span className="mx-2 opacity-50">•</span> {j.location} 
                            {(j.location||'').toLowerCase().includes('remote') && <span className="ml-2.5 inline-block px-2 py-0.5 bg-[rgba(255,149,0,0.15)] text-[#ff9500] text-[10px] rounded-full font-bold uppercase tracking-wider">Remote</span>}
                          </div>
                        </td>
                        <td className="p-4 px-6">
                          <span className="font-medium text-[15px]">{j.applicants}</span>
                          {(j.applicants||0) > 200 && <span className="ml-2.5 inline-block px-2 py-0.5 bg-[rgba(255,59,48,0.15)] text-[#ff3b30] text-[10px] rounded-full font-bold uppercase tracking-wider">Hot</span>}
                        </td>
                        <td className="p-4 px-6 text-[15px] font-medium text-[var(--apple-text-muted)]">{timeAgo(j.date)}</td>
                        <td className="p-4 px-6 text-right">
                          <a href={j.link} target="_blank" rel="noreferrer" className="apple-btn-primary inline-block px-4 py-1.5 text-[13px] tracking-wide">Apply</a>
                        </td>
                      </tr>
                    ))}
                    {jobs.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-[var(--apple-text-muted)] text-[15px] font-medium">No roles matched your search.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* FUNDED PANE */}
        {activeTab === 'funded' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
            {currentDay.funded?.length ? currentDay.funded.map((f: any, i: number) => (
              <div key={i} className="apple-card p-8 flex flex-col h-full">
                <div className="text-[24px] font-bold tracking-tight leading-tight mb-2">{f.company}</div>
                <div className="text-[15px] text-[var(--apple-text-muted)] mb-8 font-medium leading-relaxed">{f.title}</div>
                <div className="mt-auto pt-6 border-t border-[var(--apple-border)]">
                  <p className="text-[14px] text-[var(--apple-text-muted)] mb-2 font-medium">📧 {f.emailGuess}</p>
                  <p className="text-[14px] text-[var(--apple-text-muted)] font-medium leading-relaxed">💡 {f.hook}</p>
                </div>
              </div>
            )) : <p className="text-[var(--apple-text-muted)] text-[17px] font-medium col-span-full text-center py-16">No recently funded startups in today's scrape.</p>}
          </div>
        )}

        {/* STEALTH PANE */}
        {activeTab === 'stealth' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
            {currentDay.stealth?.length ? currentDay.stealth.map((s: any, i: number) => (
              <div key={i} className="apple-card p-8 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-[28px] font-bold tracking-tight">{s.company}</div>
                  <span className="px-3 py-1 bg-[rgba(52,199,89,0.15)] text-[#34c759] text-[11px] rounded-full font-bold uppercase tracking-wider">{s.batch||'Stealth'}</span>
                </div>
                <div className="text-[17px] text-[var(--apple-text-muted)] mb-8 font-medium leading-relaxed">{s.description}</div>
                <div className="mt-auto pt-6 border-t border-[var(--apple-border)]">
                  <p className="text-[15px] text-[var(--apple-text)] font-medium"><span className="text-[var(--apple-text-muted)]">Strategy:</span> {s.contactStrategy}</p>
                </div>
              </div>
            )) : <p className="text-[var(--apple-text-muted)] text-[17px] font-medium col-span-full text-center py-16">No stealth signals detected today.</p>}
          </div>
        )}

        {/* OUTREACH PANE */}
        {activeTab === 'outreach' && (
          <div className="animate-fade-in-up">
            <div className="mb-12 text-center">
              <select 
                className="apple-input w-full max-w-[440px] p-4 px-5 text-[15px] cursor-pointer shadow-sm mx-auto block font-medium"
                value={selectedCompany}
                onChange={e => setSelectedCompany(e.target.value)}
              >
                <option value="">Select a target company...</option>
                {companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {selectedCompany && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="apple-card p-8">
                  <div className="text-[21px] font-bold tracking-tight mb-5 flex items-center gap-3">
                    <span className="text-[24px]">✉️</span> Cold Email
                  </div>
                  <textarea 
                    readOnly 
                    className="apple-input w-full min-h-[220px] p-5 text-[15px] mb-5 resize-y font-medium leading-relaxed"
                    value={emailOutreach}
                  />
                  <button 
                    className="apple-btn-secondary px-6 py-2.5 font-medium text-[14px]"
                    onClick={(e) => {
                      navigator.clipboard.writeText(emailOutreach)
                      const target = e.target as HTMLButtonElement
                      const old = target.innerText
                      target.innerText = 'Copied to Clipboard!'
                      setTimeout(() => target.innerText = old, 2000)
                    }}
                  >
                    Copy Email
                  </button>
                </div>

                <div className="apple-card p-8">
                  <div className="text-[21px] font-bold tracking-tight mb-5 flex items-center gap-3">
                    <span className="text-[24px]">🤝</span> LinkedIn DM
                  </div>
                  <textarea 
                    readOnly 
                    className="apple-input w-full min-h-[140px] p-5 text-[15px] mb-5 resize-y font-medium leading-relaxed"
                    value={linkedinOutreach}
                  />
                  <button 
                    className="apple-btn-secondary px-6 py-2.5 font-medium text-[14px]"
                    onClick={(e) => {
                      navigator.clipboard.writeText(linkedinOutreach)
                      const target = e.target as HTMLButtonElement
                      const old = target.innerText
                      target.innerText = 'Copied to Clipboard!'
                      setTimeout(() => target.innerText = old, 2000)
                    }}
                  >
                    Copy Message
                  </button>
                </div>
              </div>
            )}
            
            {!selectedCompany && (
               <div className="text-center text-[var(--apple-text-muted)] py-20 text-[17px] font-medium apple-card shadow-none bg-transparent border-dashed">
                 Select a company from the dropdown to generate personalized templates.
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
