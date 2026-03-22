import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import 'dotenv/config'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { XMLParser } from 'fast-xml-parser'

// --- HELPERS and CONFIG ---

const required = (name, value) => {
  if (!value) throw new Error(`${name} is not defined.`)
  return value
}

const envInt = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || `${fallback}`, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const APIFY_TOKEN = required('APIFY_TOKEN', process.env.APIFY_TOKEN)
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || ''
const AI_SKILL_ENRICHMENT_ENABLED = Boolean(GOOGLE_API_KEY)

const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-preview'
const APIFY_TIMEOUT_SECS = envInt('APIFY_TIMEOUT_SECS', 480)
const APIFY_DATASET_LIMIT = envInt('APIFY_DATASET_LIMIT', 150)
const APIFY_POLL_INTERVAL_MS = envInt('APIFY_POLL_INTERVAL_MS', 5000)
const GOOGLE_ENRICH_LIMIT = envInt('GOOGLE_ENRICH_LIMIT', 120)
const SKILL_DELAY_MS = envInt('SKILL_DELAY_MS', 120)
const CROSS_DAY_DEDUPE_DAYS = envInt('CROSS_DAY_DEDUPE_DAYS', 14)

const DATA_DIR = './data'
const NOW = new Date()
const TIMESTAMP = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(NOW.getDate()).padStart(2, '0')}-${String(NOW.getHours()).padStart(2, '0')}${String(NOW.getMinutes()).padStart(2, '0')}`

const genAI = AI_SKILL_ENRICHMENT_ENABLED ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null
const model = AI_SKILL_ENRICHMENT_ENABLED && genAI ? genAI.getGenerativeModel({ model: AI_MODEL }) : null
const xmlParser = new XMLParser()

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const normalizeText = (value) => String(value || '').toLowerCase()
const decodeHtmlEntities = (value) =>
  String(value || '')
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
const normalizeDateKey = (value) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`
}

const extractDateToken = (fileName) => {
  const match = fileName.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

const makeJobKey = (job) => {
  const link = normalizeText(job.link)
  if (link) return `link:${link}`
  const raw = `${normalizeText(job.title)}|${normalizeText(job.company)}|${normalizeText(job.location)}`
  return `hash:${createHash('sha1').update(raw).digest('hex')}`
}

// --- TARGETING CONSTANTS ---

const TARGET_ROLES = [
  'founding engineer', 'founding ai engineer', 'ai engineer', 'software engineer ai',
  'software engineer ml', 'machine learning engineer', 'ml engineer', 'applied ai engineer',
  'llm engineer', 'generative ai engineer', 'stealth startup',
]

const LOCATION_TARGETS = ['united states', 'california', 'san francisco bay area', 'san francisco', 'remote']

const LINKEDIN_SEARCH_URLS = [
  // Founding AI Engineer — Entry Level (f_E=2) — SF Bay Area — Last 24h
  "https://www.linkedin.com/jobs/search/?keywords=Founding+Engineer+AI+ML&f_E=2&f_TPR=r86400&geoId=102748604&position=1&pageNum=0",
  // ML Engineer — Entry Level — US — Last 24h 
  "https://www.linkedin.com/jobs/search/?keywords=Machine+Learning+Engineer&f_E=2&f_TPR=r86400&f_L=us%3A0&position=1&pageNum=0",
  // AI Engineer startup — Entry Level — SF — Last 24h
  "https://www.linkedin.com/jobs/search/?keywords=AI+Engineer+startup&f_E=2&f_TPR=r86400&geoId=102748604&position=1&pageNum=0",
  // Founding Engineer — Entry Level — SF — Last 24h
  "https://www.linkedin.com/jobs/search/?keywords=Founding+Engineer&f_E=2&f_TPR=r86400&geoId=102748604&position=1&pageNum=0",
  // LLM Engineer — Entry Level — US — Last 24h
  "https://www.linkedin.com/jobs/search/?keywords=LLM+Engineer&f_E=2&f_TPR=r86400&f_L=us%3A0&position=1&pageNum=0",
  // Generative AI Engineer — Entry Level — US — Last 24h
  "https://www.linkedin.com/jobs/search/?keywords=Generative+AI+Engineer&f_E=2&f_TPR=r86400&f_L=us%3A0&position=1&pageNum=0",
]

// --- SHARED DATA PROCESSING LOGIC ---

const hasTargetRole = (text) => TARGET_ROLES.some((role) => text.includes(role))
const hasTargetLocation = (text) => LOCATION_TARGETS.some((loc) => text.includes(loc))

const isEarlyCareer = (text) => {
  const lower = normalizeText(text)
  const includeSignals = [
    /\b0\s*[-–to]{1,3}\s*3\s*years?\b/, /\bentry\s*level\b/, /\bnew\s*grad\b/, /\bjunior\b/,
    /\bassociate\b/, /\bearly\s*career\b/, /\b1\+?\s*years?\b/, /\b2\+?\s*years?\b/, /\b3\+?\s*years?\b/
  ]
  const excludeSignals = [
    /\b4\+\s*years?\b/, /\b5\+\s*years?\b/, /\b10\+\s*years?\b/, /\bsenior\b/, /\bstaff\b/,
    /\bprincipal\b/, /\blead\b/, /\bmanager\b/
  ]
  if (excludeSignals.some((regex) => regex.test(lower))) return false
  return includeSignals.some((regex) => regex.test(lower)) || true
}

const normalizeLinkedInJob = (job) => ({
  ...job,
  source: 'linkedin',
  title: job.title || '',
  company: job.companyName || '',
  location: job.location || '',
  description: job.description || '',
  link: job.link || '',
  timestamp: job.postedAt || NOW.toISOString(),
})

const passesTargetFilters = (job) => {
  const text = normalizeText(`${job.title} ${job.company} ${job.location} ${job.description}`)
  return hasTargetRole(text) && hasTargetLocation(text) && isEarlyCareer(text)
}

const dedupeJobs = (jobs) => {
  const seen = new Set()
  return jobs.filter((job) => {
    const key = makeJobKey(job)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const validateJobSchema = (job) => {
  const title = String(job.title || '').trim()
  const link = String(job.link || '').trim()
  const timestamp = String(job.timestamp || '').trim()
  if (!title || !link || !timestamp) return false
  return !Number.isNaN(Date.parse(timestamp))
}

const sanitizeJobs = (jobs) => {
  let dropped = 0
  const valid = jobs.filter((job) => {
    const ok = validateJobSchema(job)
    if (!ok) dropped += 1
    return ok
  })
  if (dropped > 0) {
    console.log(`Dropped ${dropped} invalid jobs (missing title/link/timestamp or bad timestamp).`)
  }
  return valid
}

const buildRollingIndex = () => {
  if (!fs.existsSync(DATA_DIR)) return new Set()

  const nowDay = normalizeDateKey(new Date().toISOString())
  const nowDate = new Date(`${nowDay}T00:00:00.000Z`)
  const maxAgeMs = CROSS_DAY_DEDUPE_DAYS * 24 * 60 * 60 * 1000
  const index = new Set()

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.json') && file !== 'applied_jobs.json')

  for (const file of files) {
    const dateToken = extractDateToken(file)
    if (!dateToken) continue

    const fileDate = new Date(`${dateToken}T00:00:00.000Z`)
    if (Number.isNaN(fileDate.getTime())) continue
    if (nowDate.getTime() - fileDate.getTime() > maxAgeMs) continue

    try {
      const content = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'))
      const jobs = Array.isArray(content?.jobs) ? content.jobs : (Array.isArray(content) ? content : [])
      for (const job of jobs) {
        index.add(makeJobKey(job))
      }
    } catch {
      // Ignore malformed historical files and continue.
    }
  }

  console.log(`Loaded rolling dedupe index with ${index.size} jobs from last ${CROSS_DAY_DEDUPE_DAYS} days.`)
  return index
}

const dedupeAcrossDays = (jobs, rollingIndex) => {
  const deduped = []
  let dropped = 0

  for (const job of jobs) {
    const key = makeJobKey(job)
    if (rollingIndex.has(key)) {
      dropped += 1
      continue
    }
    rollingIndex.add(key)
    deduped.push(job)
  }

  if (dropped > 0) {
    console.log(`Dropped ${dropped} cross-day duplicate jobs.`)
  }
  return deduped
}

async function extractSkillsWithAI(jobDescription) {
  if (!AI_SKILL_ENRICHMENT_ENABLED || !model) return []
  if (!jobDescription || jobDescription.length < 50) return []
  try {
    const prompt = `Extract the top 5-7 most important technical skills from this job description. Return a simple comma-separated list. Example: Python, PyTorch, AWS, Docker, Kubernetes. Job Description: "${jobDescription}"`
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    return text.split(',').map((skill) => skill.trim()).filter(Boolean)
  } catch (error) {
    console.error('Error with Google AI skill extraction:', error)
    return []
  }
}

async function enrichJobsWithSkills(jobs) {
  if (!AI_SKILL_ENRICHMENT_ENABLED) {
    console.log('GOOGLE_API_KEY not set. Skipping AI skill enrichment.')
    return jobs.map((job) => ({ ...job, skills: [] }))
  }
  const enrichCount = Math.min(jobs.length, GOOGLE_ENRICH_LIMIT)
  console.log(`Enriching ${enrichCount}/${jobs.length} jobs with AI skills...`)
  const enriched = []
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    if (i < enrichCount) {
      await wait(SKILL_DELAY_MS)
      const skills = await extractSkillsWithAI(job.description)
      enriched.push({ ...job, skills })
    } else {
      enriched.push({ ...job, skills: [] })
    }
  }
  return enriched
}

// --- API & SCRAPING FUNCTIONS ---

async function runApifyActor(actorId, input, timeoutSecs = APIFY_TIMEOUT_SECS) {
  console.log(`Starting Apify actor: ${actorId}`)
  const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const runData = await runResponse.json()
  const runId = runData?.data?.id
  if (!runId) throw new Error(`Failed to start actor ${actorId}: ${JSON.stringify(runData)}`)

  const startTime = Date.now()
  while (Date.now() - startTime < timeoutSecs * 1000) {
    await wait(APIFY_POLL_INTERVAL_MS)
    const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
    const statusData = await statusResponse.json()
    const status = statusData?.data?.status
    console.log(`Run ${runId} status: ${status}`)
    if (status === 'SUCCEEDED') {
      const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${statusData.data.defaultDatasetId}/items?token=${APIFY_TOKEN}&limit=${APIFY_DATASET_LIMIT}`)
      return await itemsResponse.json()
    }
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Actor run ${runId} failed with status: ${status}`)
    }
  }
  throw new Error(`Actor run ${runId} timed out after ${timeoutSecs} seconds.`)
}

async function scrapeLinkedInJobs() {
  console.log('Scraping LinkedIn for targeted entry-level AI/ML roles...')
  const jobs = await runApifyActor('curious_coder~linkedin-jobs-scraper', {
    urls: LINKEDIN_SEARCH_URLS,
    count: APIFY_DATASET_LIMIT,
    scrapeCompany: true,
  })
  if (!Array.isArray(jobs)) return []
  return jobs.map(normalizeLinkedInJob).filter(passesTargetFilters)
}

async function scrapeFundedStartups() {
  console.log('Scraping RSS feeds for recently funded startups...')
  const feeds = [
    'https://techcrunch.com/category/artificial-intelligence/feed/',
    'https://techcrunch.com/category/startups/feed/',
    'https://venturebeat.com/category/ai/feed/',
  ]
  const fundingKeywords = /\b(raises?|raised|nabs|secures?|lands|closes?|funding|seed|series\s+[a-d]|pre-seed|venture\s+funding)\b/i
  const blockedHeadlineKeywords = /\b(court|lawsuit|pentagon|trump|policy|regulation|hearing|senate)\b/i
  const companyPatterns = [
    /^(.+?)\s+(?:raises?|raised|nabs|secures?|lands|closes?)\b/i,
    /^(.+?)\s+(?:announces?)\s+(?:seed|series\s+[a-d]|pre-seed)\b/i,
  ]
  const sevenDaysAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000)
  const results = []
  const seen = new Set()

  const extractCompanyName = (headline) => {
    const cleaned = decodeHtmlEntities(headline)
      .replace(/^exclusive:\s*/i, '')
      .replace(/^\[.*?\]\s*/, '')
      .trim()
    for (const pattern of companyPatterns) {
      const match = cleaned.match(pattern)
      if (match?.[1]) return match[1].trim()
    }
    return null
  }

  const responses = await Promise.allSettled(feeds.map(url => fetch(url).then(res => res.text())))
  for (const res of responses) {
    if (res.status !== 'fulfilled' || !res.value) continue
    const feed = xmlParser.parse(res.value)
    const items = feed.rss?.channel?.item || []
    for (const item of items) {
      const pubDate = new Date(item.pubDate)
      if (pubDate < sevenDaysAgo) continue
      const title = decodeHtmlEntities(item.title || '')
      if (!title) continue
      if (blockedHeadlineKeywords.test(title)) continue

      const text = decodeHtmlEntities(`${title} ${item.description || ''} ${item['content:encoded'] || ''}`)
      if (!fundingKeywords.test(text)) continue

      const companyName = extractCompanyName(title)
      if (!companyName || companyName.length < 2 || companyName.length > 80) continue

      let articleUrl = ''
      try {
        articleUrl = new URL(String(item.link || '')).toString()
      } catch {
        continue
      }

      const dedupeKey = `${normalizeText(companyName)}|${normalizeText(articleUrl)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const fundingMatch = text.match(/\$?(\d{1,3}(?:,\d{3})*(\.\d+)?)\s*million|\$?(\d+)\s*M/i)
      const ceoMatch = text.match(/(?:CEO|founder)\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/)

      results.push({
        company_name: companyName,
        title,
        funding_amount: fundingMatch ? fundingMatch[0] : 'N/A',
        round_type: text.match(/series\s+[a-d]|seed/i)?.[0] || 'N/A',
        link: articleUrl,
        url: articleUrl,
        article_url: articleUrl,
        published_date: pubDate.toISOString(),
        ceo_name: ceoMatch ? `${ceoMatch[1]} ${ceoMatch[2]}` : 'N/A',
        domain: `${normalizeText(companyName.split(' ')[0])}.com`,
        email_guess: ceoMatch ? `${normalizeText(ceoMatch[1])}@${normalizeText(companyName.split(' ')[0])}.com` : 'N/A',
        outreach_hook: `outreach_hook: Saw your recent funding of ${fundingMatch ? fundingMatch[0] : '...'}`,
      })
    }
  }
  return results
}

async function scrapeStealthStartups() {
  console.log('Finding stealth startups from YC, Wellfound, HN, and LinkedIn...')
  const allStealthSources = {
    yc: [],
    wellfound: [],
    hn: [],
    linkedin: [],
  }

  // YC Companies API
  const ycBatches = ['W25', 'S25']
  for (const batch of ycBatches) {
    const url = `https://api.ycombinator.com/v0.1/companies?batch=${batch}&industry=Artificial%20Intelligence`
    const res = await fetch(url)
    if (res.ok) allStealthSources.yc.push(...(await res.json()).companies)
  }

  // Wellfound RSS
  const wfRes = await fetch('https://wellfound.com/jobs.rss?role=engineer&remote=true').then(r => r.text())
  const wfFeed = xmlParser.parse(wfRes)
  allStealthSources.wellfound = (wfFeed.rss?.channel?.item || []).filter(item =>
    /ai|ml|founding/i.test(`${item.title} ${item.description}`)
  )

  // HN "Who is Hiring"
  const hnSearch = await fetch('https://hn.algolia.com/api/v1/search?query=who+is+hiring&tags=ask_hn').then(r => r.json())
  if (hnSearch.hits.length > 0) {
    const threadId = hnSearch.hits[0].objectID
    const thread = await fetch(`https://hacker-news.firebaseio.com/v0/item/${threadId}.json`).then(r => r.json())
    const commentIds = thread.kids?.slice(0, 100) || []
    const commentResponses = await Promise.allSettled(
      commentIds.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json()))
    )
    allStealthSources.hn = commentResponses
      .filter(r => r.status === 'fulfilled' && /ai|ml|san francisco|sf/i.test(r.value?.text || ''))
      .map(r => r.value)
  }

  // LinkedIn stealth search
  allStealthSources.linkedin = await runApifyActor('curious_coder~linkedin-jobs-scraper', {
    urls: ["https://www.linkedin.com/jobs/search/?keywords=stealth+startup+AI+engineer&f_TPR=r604800&geoId=102748604"],
    count: 50,
    scrapeCompany: true,
  })

  return allStealthSources
}

// --- MAIN EXECUTION ---

async function main() {
  const task = process.argv.find(arg => arg.startsWith('--task='))?.split('=')[1]

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

  if (task) {
    let result
    console.log(`Running isolated task: ${task}`)
    switch (task) {
      case 'linkedin':
        result = await scrapeLinkedInJobs()
        break
      case 'funded':
        result = await scrapeFundedStartups()
        break
      case 'stealth':
        result = await scrapeStealthStartups()
        break
      default:
        console.error(`Unknown task: ${task}`)
        process.exit(1)
    }
    const outPath = path.join(DATA_DIR, `${task}_results.json`)
    fs.writeFileSync(outPath, JSON.stringify(result || [], null, 2))
    console.log(`Task ${task} completed. Results saved to ${outPath}`)
    return
  }

  // Full run
  console.log('Starting full data fetch process...')
  const [linkedinResult, fundedResult, stealthResult] = await Promise.allSettled([
    scrapeLinkedInJobs(),
    scrapeFundedStartups(),
    scrapeStealthStartups(),
  ])

  const rawLinkedin = linkedinResult.status === 'fulfilled' ? linkedinResult.value : []
  const rollingIndex = buildRollingIndex()
  const dedupedInRun = dedupeJobs(rawLinkedin)
  const validated = sanitizeJobs(dedupedInRun)
  const uniqueAcrossDays = dedupeAcrossDays(validated, rollingIndex)
  const jobs = await enrichJobsWithSkills(uniqueAcrossDays)
  const funded_startups = fundedResult.status === 'fulfilled' ? fundedResult.value : { error: fundedResult.reason?.message }
  const stealth_startups = stealthResult.status === 'fulfilled' ? stealthResult.value : { error: stealthResult.reason?.message }

  const snapshot = {
    scrapedAt: NOW.toISOString(),
    timestamp: TIMESTAMP,
    jobs,
    source_stats: {
      linkedin_jobs: rawLinkedin.length,
      unique_in_run: dedupedInRun.length,
      schema_valid_jobs: validated.length,
      unique_across_days: uniqueAcrossDays.length,
      enriched_jobs: jobs.length,
    },
    funded_startups,
    stealth_startups,
  }

  const outPath = path.join(DATA_DIR, `${TIMESTAMP}.json`)
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2))
  console.log(`Full run data saved to ${outPath}`)
  console.log(`LinkedIn: ${rawLinkedin.length}, Final unique jobs: ${jobs.length}`)
}

main().catch((error) => {
  console.error('An error occurred during the fetch process:', error)
  process.exit(1)
})
