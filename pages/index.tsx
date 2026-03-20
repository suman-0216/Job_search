import { useState, useEffect } from 'react'
import JobDetailPanel from '../components/JobDetailPanel'

export default function Dashboard() {
  const [data, setData] = useState<any[]>([])
  const [currentDay, setCurrentDay] = useState<any>({ jobs: [], funded: [], stealth: [] })
  const [activeTab, setActiveTab] = useState('jobs')
  const [theme, setTheme] = useState('dark')
  const [selectedJob, setSelectedJob] = useState<any>(null)

  // Search & Filter
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [remoteFilter, setRemoteFilter] = useState('')

  useEffect(() => {
    if (localStorage.theme === 'light') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
    
    fetch('/api/data')
      .then(res => res.json())
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

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return '—'
    const timestamp = new Date(dateStr).getTime()
    if (isNaN(timestamp)) return dateStr
    const hrs = Math.floor((Date.now() - timestamp) / 3600000)
    if (hrs < 1) return 'Just now'
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs/24) + 'd ago'
  }

  const copyText = (text: string, e: React.MouseEvent<HTMLButtonElement>) => {
    navigator.clipboard.writeText(text)
    const btn = e.currentTarget
    const old = btn.innerText
    btn.innerText = '✓ Copied'
    setTimeout(() => btn.innerText = old, 1500)
  }

  return (
    <div className="min-h-screen bg-[var(--apple-bg)] text-[var(--apple-text)]">
      
      {/* 1. ULTRA-MINIMAL NAV */}
      <header className="fixed top-0 w-full z-50 bg-[var(--apple-nav)] backdrop-blur-xl border-b border-[var(--apple-border)] px-6 py-3 flex justify-between items-center">
        <h1 className="text-sm font-bold tracking-tight uppercase">Job Hunter Pro</h1>
        <div className="flex items-center gap-4">
          <select 
            className="bg-transparent text-[var(--apple-text-muted)] text-[12px] font-medium outline-none cursor-pointer hover:text-[var(--apple-text)]"
            onChange={(e) => loadDay(e.target.value)}
            value={currentDay?.date || ''}
          >
            {data.map(d => (
              <option key={d.date} value={d.date}>{d.date} ({Array.isArray(d.jobs) ? d.jobs.length : 0} leads)</option>
            ))}
          </select>
          <button onClick={toggleTheme} className="text-xs opacity-50 hover:opacity-100 transition-opacity">
            {theme === 'dark' ? 'LIGHT' : 'DARK'}
          </button>
        </div>
      </header>

      {/* 2. SUB-NAV / FILTERS */}
      <div className="pt-[55px] px-6 border-b border-[var(--apple-border)] flex items-center justify-between">
        <div className="flex gap-8">
          {[
            { id: 'jobs', label: 'DASHBOARD' },
            { id: 'funded', label: 'FUNDED' },
            { id: 'stealth', label: 'STEALTH' },
            { id: 'outreach', label: 'OUTREACH' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex gap-3 py-2">
          <input 
            type="text" 
            placeholder="Search..." 
            className="bg-transparent text-[13px] border-none outline-none text-[var(--apple-text)] w-[180px]"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="bg-transparent text-[12px] border-none outline-none cursor-pointer text-[var(--apple-text-muted)]" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">ALL TYPES</option>
            <option>Full-time</option>
            <option>Contract</option>
          </select>
        </div>
      </div>

      <main className="px-6 py-10 max-w-7xl mx-auto">
        
        {/* JOBS LIST - CLEAN ROWS */}
        {activeTab === 'jobs' && (
          <div className="animate-fade-in-up">
            <div className="flex justify-between items-baseline mb-10">
              <h2 className="text-4xl font-bold tracking-tight">Active Opportunities</h2>
              <span className="text-xs font-bold text-[var(--apple-text-muted)] uppercase tracking-[0.1em]">{jobs.length} LEADS FOUND</span>
            </div>

            <div className="flex flex-col">
              {jobs.map((j: any, i: number) => (
                import { useState, useEffect } from 'react'
import JobDetailPanel from '../components/JobDetailPanel'

export default function Dashboard() {
  const [data, setData] = useState<any[]>([])
  const [currentDay, setCurrentDay] = useState<any>({ jobs: [], funded: [], stealth: [] })
  const [activeTab, setActiveTab] = useState('jobs')
  const [theme, setTheme] = useState('dark')
  const [selectedJob, setSelectedJob] = useState<any>(null)

  // ... (rest of the file)
  
                <div key={i} className="flex items-center justify-between py-5 border-b border-[var(--apple-border)] transition-all hover:bg-[var(--apple-hover)] group px-2 rounded-lg -mx-2 cursor-pointer" onClick={() => setSelectedJob(j)}>
                  <div className="flex-1">
  
  // ... (rest of the file)

      <main className="px-6 py-10 max-w-7xl mx-auto">
        {/* ... (rest of the main content) */}
      </main>

      {selectedJob && <JobDetailPanel job={selectedJob} onClose={() => setSelectedJob(null)} />}

      <footer className="py-20 text-center opacity-30 text-[10px] font-black uppercase tracking-[0.5em]">
        Job Hunter Pro System • 2026
      </footer>
    </div>
  )
}

                    <div className="flex items-center gap-3 mb-1">
                      <a href={j.link} target="_blank" rel="noreferrer" className="text-lg font-bold hover:text-[var(--apple-accent)] transition-colors">
                        {j.title}
                      </a>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--apple-text)] text-[var(--apple-bg)] uppercase tracking-wider">
                        SCORE: {j.startup_score || j.score || '—'}
                      </span>
                    </div>
                    <div className="flex gap-4 text-[13px] text-[var(--apple-text-muted)] font-medium">
                      <span>{j.companyName || j.company}</span>
                      <span>•</span>
                      <span>{j.location}</span>
                      <span>•</span>
                      <span className="text-[var(--apple-success)] font-bold">{j.salary || 'Market Rate'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <span className="text-[11px] font-bold text-[var(--apple-text-muted)] uppercase tracking-widest">{timeAgo(j.postedAt || j.date)}</span>
                    <a href={j.link} target="_blank" rel="noreferrer" className="pill-btn uppercase tracking-widest">
                      Infiltrate
                    </a>
                  </div>
                </div>
              ))}
              {jobs.length === 0 && (
                <div className="py-20 text-center text-[var(--apple-text-muted)] uppercase tracking-widest text-xs font-bold">
                  No matches found for this cycle.
                </div>
              )}
            </div>
          </div>
        )}

        {/* FUNDED - MINIMAL CARDS */}
        {activeTab === 'funded' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 animate-fade-in-up">
            {Array.isArray(currentDay?.funded) && currentDay.funded.length ? currentDay.funded.map((f: any, i: number) => (
              <div key={i} className="flex flex-col border-t-4 border-[var(--apple-text)] pt-4">
                <span className="text-[10px] font-black text-[var(--apple-success)] mb-2 uppercase tracking-[0.2em]">Raised {f.funding_amount || 'Seed'}</span>
                <h3 className="text-2xl font-bold mb-4">{f.company_name || f.company || 'Startup'}</h3>
                <p className="text-[14px] text-[var(--apple-text-muted)] leading-relaxed mb-6 font-medium">
                  {f.why_apply || 'Focusing on high-growth AI infrastructure and enterprise automation.'}
                </p>
                <div className="text-[12px] font-bold uppercase tracking-widest text-[var(--apple-text)]">
                  Contact: {f.email_guess || 'In-Network Only'}
                </div>
              </div>
            )) : <p className="text-[var(--apple-text-muted)] py-20 text-center uppercase tracking-widest text-xs font-bold w-full col-span-full">No VC leads detected.</p>}
          </div>
        )}

        {/* OUTREACH - CLEAN TYPEFACE */}
        {activeTab === 'outreach' && (
          <div className="animate-fade-in-up max-w-2xl mx-auto py-10">
            <h2 className="text-3xl font-bold mb-10 tracking-tight text-center">Communication Lab</h2>
            <div className="space-y-16">
              <div>
                <span className="block text-[10px] font-black text-[var(--apple-text-muted)] uppercase tracking-[0.3em] mb-6 text-center">Cold Protocol (Email)</span>
                <div className="bg-[var(--apple-hover)] p-8 rounded-xl text-[15px] font-medium leading-relaxed shadow-sm">
                  Hi — saw the role at Stealth AI. I'm an AI/ML eng with experience in Python, PyTorch, and RAG systems. Built relevant projects in this space. Open to a trial task?
                </div>
                <button 
                  onClick={(e) => copyText("Hi — saw the role at Stealth AI. I'm an AI/ML eng with experience in Python, PyTorch, and RAG systems. Built relevant projects in this space. Open to a trial task?", e)}
                  className="mt-6 w-full text-[11px] font-black uppercase tracking-[0.3em] hover:text-[var(--apple-accent)] transition-colors"
                >
                  COPY PAYLOAD
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      <JobDetailPanel job={selectedJob} onClose={() => setSelectedJob(null)} />

      <footer className="py-20 text-center opacity-30 text-[10px] font-black uppercase tracking-[0.5em]">
        Job Hunter Pro System • 2026
      </footer>
    </div>
  )
}
