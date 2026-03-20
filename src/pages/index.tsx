import { useState, useEffect } from 'react'

export default function Dashboard() {
  const [data, setData] = useState<any[]>([])
  const [currentDay, setCurrentDay] = useState<any>({ jobs: [], funded: [], stealth: [] })
  const [activeTab, setActiveTab] = useState('jobs')

  // Search & Filter
  const [search, setSearch] = useState('')
  const [remoteFilter, setRemoteFilter] = useState('')
  const [sortCol, setSortCol] = useState('score')
  const [sortAsc, setSortAsc] = useState(false)

  // Outreach
  const [selectedCompany, setSelectedCompany] = useState('')

  useEffect(() => {
    fetch('/api/data')
      .then(res => res.json())
      .then(allData => {
        setData(allData)
        if (allData.length) setCurrentDay(allData[0])
      })
  }, [])

  const loadDay = (date: string) => {
    setCurrentDay(data.find(d => d.date === date) || data[0])
  }

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
    if (hrs < 1) return '< 1h ago'
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs/24) + 'd ago'
  }

  // Companies for outreach dropdown
  const companies = Array.from(new Set([
    ...(currentDay.jobs||[]).map((j: any) => j.company),
    ...(currentDay.funded||[]).map((f: any) => f.company),
    ...(currentDay.stealth||[]).map((s: any) => s.company)
  ])).sort().filter(Boolean)

  const emailOutreach = `Subject: AI Engineering at ${selectedCompany} - Driving impact\n\nHi [Founder Name],\n\nI've been following ${selectedCompany}'s recent work. As an AI Engineer based in the SF Bay Area (H1B), I specialize in building autonomous agents and scalable ML systems.\n\nI’d love to contribute to your engineering team. Let me know if you are open to a quick chat.\n\nBest,\nSuman\nmadipeddisuman@gmail.com`
  
  const linkedinOutreach = `Hi [Name], I saw ${selectedCompany} is scaling its AI efforts. I’m an AI Engineer based in SF building autonomous systems. Would love to connect and chat about potential engineering roles!`

  return (
    <div className="min-h-screen bg-[#000000] text-[#f5f5f7] pb-20 font-sans">
      <header className="text-center pt-20 pb-10 px-5">
        <h1 className="text-[56px] font-bold tracking-tight mb-4">Job Hunter <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#2997ff] to-[#ab61ff]">Pro</span></h1>
        <p className="text-[21px] text-[#86868b] tracking-tight">AI-curated pipeline for Founding Engineers</p>
      </header>

      <div className="sticky top-0 z-50 bg-[rgba(29,29,31,0.72)] backdrop-blur-xl border-b border-[rgba(255,255,255,0.1)] py-3 px-5 flex justify-center items-center gap-3">
        <select 
          className="mr-5 bg-transparent border-none font-semibold text-[15px] p-2"
          onChange={(e) => loadDay(e.target.value)}
        >
          {data.map(d => (
            <option key={d.date} value={d.date}>{d.date} ({d.jobs.length} jobs)</option>
          ))}
        </select>

        {['jobs', 'funded', 'stealth', 'outreach'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-[18px] py-2 rounded-full text-sm font-medium transition-all ${activeTab === tab ? 'bg-[#f5f5f7] text-black' : 'text-[#f5f5f7] hover:bg-[rgba(255,255,255,0.1)]'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="max-w-[1200px] mx-auto mt-10 px-5">
        {/* JOBS PANE */}
        {activeTab === 'jobs' && (
          <div className="animate-[fadeIn_0.4s_ease]">
            <div className="flex flex-wrap gap-4 mb-8">
              <input 
                type="text" 
                placeholder="Search roles, companies, locations..." 
                className="flex-1 min-w-[250px] p-3 text-[15px] bg-[#1d1d1f] border border-[#333336] rounded-xl"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select 
                className="p-3 text-[15px] bg-[#1d1d1f] border border-[#333336] rounded-xl"
                value={remoteFilter}
                onChange={e => setRemoteFilter(e.target.value)}
              >
                <option value="">All Locations</option>
                <option value="remote">Remote Only</option>
                <option value="sf">San Francisco Bay Area</option>
              </select>
            </div>

            <div className="bg-[#1d1d1f] border border-[#333336] rounded-[18px] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#333336] text-[12px] text-[#86868b] uppercase tracking-wide">
                    <th className="p-4 pl-5 cursor-pointer hover:text-white" onClick={() => handleSort('score')}>Score</th>
                    <th className="p-4 cursor-pointer hover:text-white" onClick={() => handleSort('role')}>Role</th>
                    <th className="p-4 cursor-pointer hover:text-white" onClick={() => handleSort('applicants')}>Applicants</th>
                    <th className="p-4 cursor-pointer hover:text-white" onClick={() => handleSort('date')}>Posted</th>
                    <th className="p-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j: any, i: number) => (
                    <tr key={i} className="border-b border-[#333336] hover:bg-[#2d2d2f] transition-colors">
                      <td className="p-4 pl-5"><strong className="text-base">{j.score || 0}</strong><span className="text-[#86868b] text-xs">/10</span></td>
                      <td className="p-4">
                        <a href={j.link} target="_blank" rel="noreferrer" className="font-semibold hover:text-[#2997ff]">{j.title}</a>
                        <span className="block text-[13px] text-[#86868b] mt-1">
                          {j.company} • {j.location} {(j.location||'').toLowerCase().includes('remote') && <span className="ml-2 inline-block px-2 py-[2px] bg-[rgba(255,149,0,0.15)] text-[#ff9500] text-[10px] rounded-full font-bold uppercase tracking-wider">Remote</span>}
                        </span>
                      </td>
                      <td className="p-4">{j.applicants} {(j.applicants||0) > 200 && <span className="ml-2 inline-block px-2 py-[2px] bg-[rgba(255,59,48,0.15)] text-[#ff3b30] text-[10px] rounded-full font-bold uppercase tracking-wider">High Comp</span>}</td>
                      <td className="p-4">{timeAgo(j.date)}</td>
                      <td className="p-4"><a href={j.link} target="_blank" rel="noreferrer" className="inline-block px-4 py-2 bg-[#2997ff] hover:bg-[#147ce5] text-white text-sm font-medium rounded-full transition-all">Apply</a></td>
                    </tr>
                  ))}
                  {jobs.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-[#86868b]">No jobs found matching criteria.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FUNDED PANE */}
        {activeTab === 'funded' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-[fadeIn_0.4s_ease]">
            {currentDay.funded?.length ? currentDay.funded.map((f: any, i: number) => (
              <div key={i} className="bg-[#1d1d1f] border border-[#333336] rounded-[18px] p-6 hover:-translate-y-1 hover:shadow-2xl transition-all flex flex-col">
                <div className="text-[20px] font-semibold mb-2">{f.company}</div>
                <div className="text-[14px] text-[#86868b] mb-4">{f.title}</div>
                <div className="mt-auto pt-4 border-t border-[#333336]">
                  <p className="text-[13px] text-[#86868b] mb-2">📧 {f.emailGuess}</p>
                  <p className="text-[13px] text-[#86868b]">💡 {f.hook}</p>
                </div>
              </div>
            )) : <p className="text-[#86868b]">No new funded startups found.</p>}
          </div>
        )}

        {/* STEALTH PANE */}
        {activeTab === 'stealth' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-[fadeIn_0.4s_ease]">
            {currentDay.stealth?.length ? currentDay.stealth.map((s: any, i: number) => (
              <div key={i} className="bg-[#1d1d1f] border border-[#333336] rounded-[18px] p-6 hover:-translate-y-1 hover:shadow-2xl transition-all flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-[20px] font-semibold">{s.company}</div>
                  <span className="px-2 py-[2px] bg-[rgba(52,199,89,0.15)] text-[#34c759] text-[10px] rounded-full font-bold uppercase tracking-wider">{s.batch||'Stealth'}</span>
                </div>
                <div className="text-[14px] text-[#86868b] mb-4">{s.description}</div>
                <div className="mt-auto pt-4 border-t border-[#333336]">
                  <p className="text-[13px] text-[#86868b]"><strong>Strategy:</strong> {s.contactStrategy}</p>
                </div>
              </div>
            )) : <p className="text-[#86868b]">No new stealth companies found.</p>}
          </div>
        )}

        {/* OUTREACH PANE */}
        {activeTab === 'outreach' && (
          <div className="animate-[fadeIn_0.4s_ease]">
            <div className="mb-8">
              <select 
                className="w-full max-w-[400px] p-3 text-[15px] bg-[#1d1d1f] border border-[#333336] rounded-xl"
                value={selectedCompany}
                onChange={e => setSelectedCompany(e.target.value)}
              >
                <option value="">Select a company to generate outreach...</option>
                {companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {selectedCompany && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-[#1d1d1f] border border-[#333336] rounded-[18px] p-6">
                  <div className="text-[20px] font-semibold mb-4">Cold Email</div>
                  <textarea 
                    readOnly 
                    className="w-full min-h-[200px] p-4 text-[14px] bg-black border border-[#333336] rounded-xl mb-4 text-[#f5f5f7] resize-y focus:border-[#2997ff]"
                    value={emailOutreach}
                  />
                  <button 
                    className="px-5 py-[10px] bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-full text-sm font-medium transition-all"
                    onClick={(e) => {
                      navigator.clipboard.writeText(emailOutreach)
                      const target = e.target as HTMLButtonElement
                      const old = target.innerText
                      target.innerText = 'Copied!'
                      setTimeout(() => target.innerText = old, 2000)
                    }}
                  >
                    Copy Email
                  </button>
                </div>

                <div className="bg-[#1d1d1f] border border-[#333336] rounded-[18px] p-6">
                  <div className="text-[20px] font-semibold mb-4">LinkedIn DM</div>
                  <textarea 
                    readOnly 
                    className="w-full min-h-[120px] p-4 text-[14px] bg-black border border-[#333336] rounded-xl mb-4 text-[#f5f5f7] resize-y focus:border-[#2997ff]"
                    value={linkedinOutreach}
                  />
                  <button 
                    className="px-5 py-[10px] bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-full text-sm font-medium transition-all"
                    onClick={(e) => {
                      navigator.clipboard.writeText(linkedinOutreach)
                      const target = e.target as HTMLButtonElement
                      const old = target.innerText
                      target.innerText = 'Copied!'
                      setTimeout(() => target.innerText = old, 2000)
                    }}
                  >
                    Copy DM
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
