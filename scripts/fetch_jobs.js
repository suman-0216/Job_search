import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'
import { GoogleGenerativeAI } from '@google/generative-ai'

const required = (name, value) => {
  if (!value) throw new Error(`${name} is not defined.`)
  return value
}

const envInt = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || `${fallback}`, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const GOOGLE_API_KEY = required('GOOGLE_API_KEY', process.env.GOOGLE_API_KEY)
const APIFY_TOKEN = required('APIFY_TOKEN', process.env.APIFY_TOKEN)

const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
const APIFY_TIMEOUT_SECS = envInt('APIFY_TIMEOUT_SECS', 480)
const APIFY_DATASET_LIMIT = envInt('APIFY_DATASET_LIMIT', 500)
const APIFY_POLL_INTERVAL_MS = envInt('APIFY_POLL_INTERVAL_MS', 4000)
const GOOGLE_ENRICH_LIMIT = envInt('GOOGLE_ENRICH_LIMIT', 140)
const SKILL_DELAY_MS = envInt('SKILL_DELAY_MS', 120)
const GOOGLE_RESULTS_PER_PAGE = envInt('GOOGLE_RESULTS_PER_PAGE', 30)

const DATA_DIR = './data'
const NOW = new Date()
const TIMESTAMP = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(NOW.getDate()).padStart(2, '0')}-${String(NOW.getHours()).padStart(2, '0')}${String(NOW.getMinutes()).padStart(2, '0')}`

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY)
const model = genAI.getGenerativeModel({ model: AI_MODEL })

const TARGET_ROLES = [
  'founding engineer',
  'founding ai engineer',
  'ai engineer',
  'software engineer ai',
  'software engineer ml',
  'machine learning engineer',
  'ml engineer',
  'applied ai engineer',
  'llm engineer',
  'generative ai engineer',
]

const LOCATION_TARGETS = ['united states', 'california', 'san francisco bay area', 'san francisco']

const LINKEDIN_SEARCH_URLS = [
  // United States
  'https://www.linkedin.com/jobs/search/?keywords=Founding%20Engineer%20AI%20ML&f_E=1%2C2&f_TPR=r86400&location=United%20States',
  'https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer&f_E=1%2C2&f_TPR=r86400&location=United%20States',
  'https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer%20AI&f_E=1%2C2&f_TPR=r86400&location=United%20States',
  'https://www.linkedin.com/jobs/search/?keywords=Machine%20Learning%20Engineer&f_E=1%2C2&f_TPR=r86400&location=United%20States',

  // California
  'https://www.linkedin.com/jobs/search/?keywords=Founding%20Engineer&f_E=1%2C2&f_TPR=r86400&location=California%2C%20United%20States',
  'https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer%20startup&f_E=1%2C2&f_TPR=r86400&location=California%2C%20United%20States',
  'https://www.linkedin.com/jobs/search/?keywords=Machine%20Learning%20Engineer&f_E=1%2C2&f_TPR=r86400&location=California%2C%20United%20States',

  // San Francisco Bay Area
  'https://www.linkedin.com/jobs/search/?keywords=Founding%20AI%20Engineer&f_E=1%2C2&f_TPR=r86400&geoId=102752184',
  'https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer%20startup&f_E=1%2C2&f_TPR=r86400&geoId=102752184',
  'https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer%20AI&f_E=1%2C2&f_TPR=r86400&geoId=102752184',
  'https://www.linkedin.com/jobs/search/?keywords=Machine%20Learning%20Engineer&f_E=1%2C2&f_TPR=r86400&geoId=102752184',
]

const GOOGLE_JOB_QUERIES = [
  // USA broad
  '"founding ai engineer" OR "ai engineer" OR "software engineer ai" OR "machine learning engineer" "0-3 years" "United States" (site:jobs.lever.co OR site:boards.greenhouse.io OR site:wellfound.com OR site:linkedin.com/jobs/view)',
  '"entry level ai engineer" OR "junior machine learning engineer" "United States" jobs',

  // California
  '"founding engineer" OR "ai engineer" "California" "0-3 years" (site:jobs.lever.co OR site:boards.greenhouse.io OR site:wellfound.com)',
  '"software engineer ai" "California" "entry level" jobs',

  // Bay Area
  '"ai engineer" OR "ml engineer" "San Francisco Bay Area" "0-3 years" jobs',
  '"founding engineer" "San Francisco" startup jobs',

  // YC / startup ecosystems
  'site:ycombinator.com/jobs ("ai engineer" OR "machine learning engineer" OR "founding engineer")',
  'site:wellfound.com "founding engineer" "ai"',
  'site:jobs.lever.co "machine learning engineer" "San Francisco"',
  'site:boards.greenhouse.io "software engineer" "ai" "bay area"',
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeText = (value) => String(value || '').toLowerCase()

const hasTargetRole = (text) => TARGET_ROLES.some((role) => text.includes(role))

const hasTargetLocation = (text) => LOCATION_TARGETS.some((loc) => text.includes(loc))

const isEarlyCareer = (text) => {
  const lower = normalizeText(text)

  const includeSignals = [
    /\b0\s*[-–to]{1,3}\s*3\s*years?\b/, /\b0\s*[-–]\s*2\s*years?\b/, /\b1\s*[-–]\s*3\s*years?\b/,
    /\bentry\s*level\b/, /\bnew\s*grad\b/, /\bjunior\b/, /\bassociate\b/, /\bearly\s*career\b/,
    /\b1\+?\s*years?\b/, /\b2\+?\s*years?\b/, /\b3\+?\s*years?\b/
  ]

  const excludeSignals = [
    /\b4\+\s*years?\b/, /\b5\+\s*years?\b/, /\b6\+\s*years?\b/, /\b7\+\s*years?\b/, /\b8\+\s*years?\b/,
    /\b10\+\s*years?\b/, /\bsenior\b/, /\bstaff\b/, /\bprincipal\b/, /\blead\b/
  ]

  if (excludeSignals.some((regex) => regex.test(lower))) return false
  if (includeSignals.some((regex) => regex.test(lower))) return true

  return true
}

const normalizeLinkedInJob = (job) => ({
  ...job,
  source: 'linkedin',
  title: job.title || job.role || '',
  company: job.companyName || job.company || '',
  location: job.location || '',
  description: job.description || '',
  link: job.link || '',
  timestamp: job.postedAt || job.timestamp || NOW.toISOString(),
})

const normalizeGoogleResultToJob = (item) => {
  const title = item.title || item.searchQuery?.term || 'AI/ML role'
  const description = item.description || item.snippet || ''
  const link = item.url || item.link || ''
  const domain = (() => {
    try {
      return link ? new URL(link).hostname.replace('www.', '') : 'unknown source'
    } catch {
      return 'unknown source'
    }
  })()

  return {
    source: 'google-search',
    title,
    role: title,
    company: domain,
    companyName: domain,
    location: item.searchQuery?.term || 'United States',
    description,
    link,
    timestamp: NOW.toISOString(),
    postedAt: NOW.toISOString(),
    applicants: 'N/A',
    workRemoteAllowed: /remote/i.test(`${title} ${description}`),
    employmentType: '',
    salary: '',
  }
}

const passesTargetFilters = (job) => {
  const text = normalizeText(`${job.title} ${job.role} ${job.company} ${job.companyName} ${job.location} ${job.description}`)
  return hasTargetRole(text) && hasTargetLocation(text) && isEarlyCareer(text)
}

const dedupeJobs = (jobs) => {
  const seen = new Set()
  return jobs.filter((job) => {
    const key = `${normalizeText(job.link)}|${normalizeText(job.title || job.role)}|${normalizeText(job.companyName || job.company)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function extractSkillsWithAI(jobDescription) {
  if (!jobDescription || jobDescription.length < 50) return []
  try {
    const prompt = `Extract the top 5-7 most important technical skills or technologies from this job description. Return them as a simple comma-separated list. Example: Python, PyTorch, AWS, Docker, Kubernetes. Job Description: "${jobDescription}"`
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    return text.split(',').map((skill) => skill.trim()).filter(Boolean)
  } catch (error) {
    console.error('Error with Google AI skill extraction:', error)
    return []
  }
}

async function runApifyActor(actorId, input, timeoutSecs = APIFY_TIMEOUT_SECS) {
  console.log(`Starting Apify actor: ${actorId}`)
  const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const runData = await runResponse.json()
  const runId = runData?.data?.id
  if (!runId) throw new Error(`Unable to start actor ${actorId}: ${JSON.stringify(runData)}`)

  const startTime = Date.now()
  while (Date.now() - startTime < timeoutSecs * 1000) {
    await wait(APIFY_POLL_INTERVAL_MS)
    const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
    const statusData = await statusResponse.json()
    const status = statusData?.data?.status
    const defaultDatasetId = statusData?.data?.defaultDatasetId

    console.log(`Run ${runId} status: ${status}`)
    if (status === 'SUCCEEDED') {
      const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}&limit=${APIFY_DATASET_LIMIT}`)
      return await itemsResponse.json()
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Actor run ${runId} failed with status: ${status}`)
    }
  }

  throw new Error(`Actor run ${runId} timed out after ${timeoutSecs} seconds.`)
}

async function scrapeLinkedInJobs() {
  console.log('Scraping LinkedIn Jobs (US + CA + Bay Area aggressive)...')
  const jobs = await runApifyActor('curious_coder/linkedin-jobs-scraper', {
    startUrls: LINKEDIN_SEARCH_URLS.map((url) => ({ url })),
    maxItems: APIFY_DATASET_LIMIT,
  })

  if (!Array.isArray(jobs)) return []
  return jobs.map(normalizeLinkedInJob).filter(passesTargetFilters)
}

async function scrapeGoogleJobs() {
  console.log('Scraping Google-indexed jobs (Lever/Greenhouse/Wellfound/YC/LinkedIn pages)...')
  const results = await runApifyActor('apify/google-search-scraper', {
    queries: GOOGLE_JOB_QUERIES,
    resultsPerPage: GOOGLE_RESULTS_PER_PAGE,
    maxPagesPerQuery: 1,
  })

  if (!Array.isArray(results)) return []
  return results.map(normalizeGoogleResultToJob).filter(passesTargetFilters)
}

async function enrichJobsWithSkills(jobs) {
  const enrichCount = Math.min(jobs.length, GOOGLE_ENRICH_LIMIT)
  console.log(`Enriching ${enrichCount}/${jobs.length} jobs with AI skills...`)

  const enriched = []
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index]
    if (index < enrichCount) {
      await wait(SKILL_DELAY_MS)
      const skills = await extractSkillsWithAI(job.description)
      enriched.push({ ...job, skills })
      continue
    }
    enriched.push({ ...job, skills: [] })
  }

  return enriched
}

async function scrapeFundedStartups() {
  console.log('Scraping recently funded startups...')
  return await runApifyActor('apify/google-search-scraper', {
    queries: [
      'AI ML startup seed series A funding raised San Francisco last 7 days site:techcrunch.com',
      'AI startup funding announcement site:venturebeat.com OR site:crunchbase.com',
      'AI startup funding round Bay Area site:forbes.com OR site:axios.com',
    ],
    resultsPerPage: 20,
  })
}

async function scrapeStealthStartups() {
  console.log('Finding stealth startups...')
  return await runApifyActor('apify/google-search-scraper', {
    queries: [
      'linkedin stealth startup AI engineer San Francisco',
      'ycombinator.com W26 OR S26 batch AI',
      'wellfound.com jobs engineer AI ML founding',
      'site:jobs.lever.co AI engineer startup',
      'site:boards.greenhouse.io AI machine learning engineer startup careers',
      'site:ycombinator.com/jobs AI engineer',
    ],
    resultsPerPage: 20,
  })
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

  const [linkedinJobs, googleJobs, funded, stealth] = await Promise.allSettled([
    scrapeLinkedInJobs(),
    scrapeGoogleJobs(),
    scrapeFundedStartups(),
    scrapeStealthStartups(),
  ])

  const rawLinkedin = linkedinJobs.status === 'fulfilled' ? linkedinJobs.value : []
  const rawGoogleJobs = googleJobs.status === 'fulfilled' ? googleJobs.value : []
  const mergedJobs = dedupeJobs([...rawLinkedin, ...rawGoogleJobs])
  const jobs = await enrichJobsWithSkills(mergedJobs)

  const snapshot = {
    scrapedAt: NOW.toISOString(),
    timestamp: TIMESTAMP,
    jobs,
    source_stats: {
      linkedin_jobs: rawLinkedin.length,
      google_indexed_jobs: rawGoogleJobs.length,
      merged_unique_jobs: mergedJobs.length,
      enriched_jobs: jobs.length,
    },
    funded_startups: funded.status === 'fulfilled' ? funded.value : { error: funded.reason.message },
    stealth_startups: stealth.status === 'fulfilled' ? stealth.value : { error: stealth.reason.message },
  }

  const outPath = path.join(DATA_DIR, `${TIMESTAMP}.json`)
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2))
  console.log(`Data saved to ${outPath}`)
  console.log(`LinkedIn: ${rawLinkedin.length}, Google indexed jobs: ${rawGoogleJobs.length}, Final unique: ${mergedJobs.length}`)
}

main().catch((error) => {
  console.error('An error occurred during the fetch process:', error)
  process.exit(1)
})

