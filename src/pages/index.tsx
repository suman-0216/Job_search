import { useState, useEffect } from 'react'

export default function Dashboard() {
  const [data, setData] = useState<any[]>([])
  const [currentDay, setCurrentDay] = useState<any>({ jobs: [], funded: [], stealth: [] })
  const [activeTab, setActiveTab] = useState('jobs')
  const [theme, setTheme] = useState('dark')

  // Search & Filter
  const [search, setSearch] = useState('')
  const [remoteFilter, setRemoteFilter] = useState('')
  const [sortCol, setSortCol] = useState('score')
  const [sortAsc, setSortAsc] = useState(false)

  // Outreach
  const [selectedCompany, setSelectedCompany] = useState('')

  useEffect(() => {
    // Check initial theme preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
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
    } else {
      document.documentElement.classList.remove('dark')
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
    <div className="min-h-screen pb-24 font-sans antialiased text-[var(--text-primary)]">
      
      {/* Top Glass Navigation */}
      <div className="glass-nav sticky top-0 z-50 py-3 px-5 flex flex-wrap justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="font-bold text-lg tracking-tight">Job Hunter <span className="text-[#0071e3]">Pro</span></div>
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full hover:bg-[var(--hover-bg)] transition-colors text-[var(--text-secondary)] text-xl leading-none"
            title="Toggle Light/Dark Mode"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="flex gap-2 bg-[var(--hover-bg)] p-1 rounded-[24px]">
          {['jobs', 'funded', 'stealth', 'outreach'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-[6px] rounded-[20px] text-sm font-medium transition-all ${activeTab === tab ? 'bg-[var(--text-primary)] text-[var(--bg-color)] shadow-sm' : 'text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div>
          <select 
            className="bg-transparent border-none font-semibold text-[15px] outline-none text-[var(--text-primary)] cursor-pointer"
            onChange={(e) => loadDay(e.target.value)}
          >
            {data.map(d => (
              <option key={d.date} value={d.date}>{d.date} ({d.jobs.length})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Hero Section */}
      <header className="text-center pt-28 pb-20 px-5 animate-fade-in-up">
        <h1 className="text-[56px] md:text-[80px] font-bold tracking-[-0.03em] leading-tight mb-4">
          Engineered for <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0071e3] to-[#42a1ff]">Founders.</span>
        </h1>
        <p className="text-[21px] md:text-[24px] text-[var(--text-secondary)] tracking-tight max-w-2xl mx-auto font-medium">
          A meticulously curated AI pipeline. Zero noise. Pure signal.
        </p>
      </header>

      {/* Main Content Area */}
      <div className="max-w-[1080px] mx-auto px-5">

        {/* JOBS PANE */}
        {activeTab === 'jobs' && (
          <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <input 
                type="text" 
                placeholder="Search roles, companies, locations..." 
                className="apple-input flex-1 p-4 text-[15px] rounded-[16px]"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select 
                className="apple-input p-4 text-[15px] rounded-[16px] cursor-pointer"
                value={remoteFilter}
                onChange={e => setRemoteFilter(e.target.value)}
              >
                <option value="">All Locations</option>
                <option value="remote">Remote Only</option>
                <option value="sf">SF Bay Area</option>
              </select>
            </div>

            <div className="apple-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] text-[12px] text-[var(--text-secondary)] uppercase tracking-wider font-semibold">
                      <th className="p-5 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('score')}>Score</th>
                      <th className="p-5 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('role')}>Role & Company</th>
                      <th className="p-5 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('applicants')}>Applicants</th>
                      <th className="p-5 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('date')}>Posted</th>
                      <th className="p-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j: any, i: number) => (
                      <tr key={i} className="border-b border-[var(--border-color)] hover:bg-[var(--hover-bg)] transition-colors group">
                        <td className="p-5">
                          <span className="text-xl font-bold">{j.score || 0}</span>
                          <span className="text-[var(--text-secondary)] text-sm">/10</span>
                        </td>
                        <td className="p-5">
                          <a href={j.link} target="_blank" rel="noreferrer" className="font-semibold text-[17px] hover:text-[#0071e3] transition-colors">{j.title}</a>
                          <div className="text-[14px] text-[var(--text-secondary)] mt-1 font-medium">
                            {j.company} <span className="mx-2 opacity-50">•</span> {j.location} 
                            {(j.location||'').toLowerCase().includes('remote') && <span className="ml-3 inline-block px-2.5 py-1 bg-[rgba(255,149,0,0.15)] text-[#ff9500] text-[11px] rounded-full font-bold uppercase tracking-wider">Remote</span>}
                          </div>
                        </td>
                        <td className="p-5">
                          <span className="font-medium text-[15px]">{j.applicants}</span>
                          {(j.applicants||0) > 200 && <span className="ml-3 inline-block px-2.5 py-1 bg-[rgba(255,59,48,0.15)] text-[#ff3b30] text-[11px] rounded-full font-bold uppercase tracking-wider">Hot</span>}
                        </td>
                        <td className="p-5 text-[15px] font-medium text-[var(--text-secondary)]">{timeAgo(j.date)}</td>
                        <td className="p-5 text-right">
                          <a href={j.link} target="_blank" rel="noreferrer" className="apple-btn inline-block px-5 py-2 font-medium text-[14px]">Apply</a>
                        </td>
                      </tr>
                    ))}
                    {jobs.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-[var(--text-secondary)] text-lg font-medium">No positions match your criteria.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* FUNDED PANE */}
        {activeTab === 'funded' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            {currentDay.funded?.length ? currentDay.funded.map((f: any, i: number) => (
              <div key={i} className="apple-card p-8 flex flex-col h-full">
                <div className="text-[24px] font-bold tracking-tight leading-tight mb-3">{f.company}</div>
                <div className="text-[15px] text-[var(--text-secondary)] mb-6 font-medium leading-snug">{f.title}</div>
                <div className="mt-auto pt-6 border-t border-[var(--border-color)]">
                  <p className="text-[14px] text-[var(--text-secondary)] mb-3 font-medium">📧 {f.emailGuess}</p>
                  <p className="text-[14px] text-[var(--text-secondary)] font-medium leading-snug">💡 {f.hook}</p>
                </div>
              </div>
            )) : <p className="text-[var(--text-secondary)] text-lg font-medium col-span-full text-center py-12">No recently funded startups in today's scrape.</p>}
          </div>
        )}

        {/* STEALTH PANE */}
        {activeTab === 'stealth' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            {currentDay.stealth?.length ? currentDay.stealth.map((s: any, i: number) => (
              <div key={i} className="apple-card p-8 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-[24px] font-bold tracking-tight">{s.company}</div>
                  <span className="px-3 py-1 bg-[rgba(52,199,89,0.15)] text-[#34c759] text-[11px] rounded-full font-bold uppercase tracking-wider">{s.batch||'Stealth'}</span>
                </div>
                <div className="text-[16px] text-[var(--text-secondary)] mb-6 font-medium leading-snug">{s.description}</div>
                <div className="mt-auto pt-6 border-t border-[var(--border-color)]">
                  <p className="text-[14px] text-[var(--text-primary)] font-medium"><span className="text-[var(--text-secondary)]">Strategy:</span> {s.contactStrategy}</p>
                </div>
              </div>
            )) : <p className="text-[var(--text-secondary)] text-lg font-medium col-span-full text-center py-12">No stealth signals detected today.</p>}
          </div>
        )}

        {/* OUTREACH PANE */}
        {activeTab === 'outreach' && (
          <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="mb-10 text-center">
              <select 
                className="apple-input w-full max-w-[400px] p-4 text-[16px] rounded-[16px] cursor-pointer shadow-sm mx-auto block font-medium"
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
                  <div className="text-[20px] font-bold tracking-tight mb-5 flex items-center gap-2">
                    <span className="text-[24px]">✉️</span> Direct Email
                  </div>
                  <textarea 
                    readOnly 
                    className="apple-input w-full min-h-[220px] p-5 text-[15px] rounded-[16px] mb-5 resize-y font-medium leading-relaxed"
                    value={emailOutreach}
                  />
                  <button 
                    className="apple-btn-secondary px-6 py-2.5 font-medium text-[15px]"
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
                  <div className="text-[20px] font-bold tracking-tight mb-5 flex items-center gap-2">
                    <span className="text-[24px]">🤝</span> LinkedIn DM
                  </div>
                  <textarea 
                    readOnly 
                    className="apple-input w-full min-h-[140px] p-5 text-[15px] rounded-[16px] mb-5 resize-y font-medium leading-relaxed"
                    value={linkedinOutreach}
                  />
                  <button 
                    className="apple-btn-secondary px-6 py-2.5 font-medium text-[15px]"
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
               <div className="text-center text-[var(--text-secondary)] py-20 text-lg font-medium apple-card">
                 Select a company from the dropdown above to generate personalized, high-conversion outreach templates.
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
