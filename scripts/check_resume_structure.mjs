#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const SECTION_HEADING_MAP = {
  summary: 'SUMMARY',
  experience: 'WORK EXPERIENCE',
  projects: 'PROJECT EXPERIENCE',
  skills: 'TECHNICAL SKILLS',
  education: 'EDUCATION',
  certifications: 'CERTIFICATIONS',
}
const KNOWN_SECTION_KEYS = new Set(Object.keys(SECTION_HEADING_MAP))
const isKnownSectionHeadingLine = (line) => {
  const raw = String(line || '').trim()
  if (!raw) return false
  const hasMarkdownHeading = /^#{1,6}\s+\S+/.test(raw)
  const hasBoldMarkerHeading = /^\*\*[^*]+\*\*$/.test(raw)
  const isAllCapsHeading = /[A-Z]/.test(raw) && raw === raw.toUpperCase()
  const headingCandidate = raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/\*\*/g, '')
    .trim()
  if (!headingCandidate) return false
  if (!KNOWN_SECTION_KEYS.has(normalizeSectionKey(headingCandidate))) return false
  return hasMarkdownHeading || hasBoldMarkerHeading || isAllCapsHeading
}

const normalizeSectionKey = (value) => {
  const cleaned = String(value || '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/\*\*/g, '')
    .replace(/[:\s]+$/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  if (/(professional summary|summary|profile|objective)/.test(cleaned)) return 'summary'
  if (/(project experience|projects|project)/.test(cleaned)) return 'projects'
  if (/(work experience|professional experience|experience|employment)/.test(cleaned)) return 'experience'
  if (/(technical skills|skills|core skills|competencies)/.test(cleaned)) return 'skills'
  if (/(education|academic)/.test(cleaned)) return 'education'
  if (/(certifications|licenses|certification)/.test(cleaned)) return 'certifications'
  return cleaned
}

const isUpperHeadingLike = (value) => /^[A-Z][A-Z0-9 &/()+,.\-]{2,}$/.test(value) && value.length <= 72

const isLikelySectionHeading = (line) => {
  const raw = String(line || '').trim()
  if (!raw) return false
  const headingCandidate = raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/\*\*/g, '')
    .trim()
  if (!headingCandidate) return false
  if (/^#{1,6}\s+\S+/.test(raw)) return true
  const key = normalizeSectionKey(headingCandidate)
  if (KNOWN_SECTION_KEYS.has(key)) return true
  return isUpperHeadingLike(headingCandidate)
}

const extractSectionOrderFromResume = (resumeText) => {
  const lines = String(resumeText || '').replace(/\r/g, '\n').split('\n')
  const seen = new Set()
  const ordered = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/@|\||https?:\/\//i.test(line)) continue
    if (!isKnownSectionHeadingLine(line)) continue
    const headingCandidate = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\*\*(.+)\*\*$/, '$1')
      .replace(/\*\*/g, '')
      .trim()
    const key = normalizeSectionKey(headingCandidate)
    if (!key || seen.has(key)) continue
    seen.add(key)
    ordered.push(key)
  }
  return ordered
}

const extractSourceSectionBlocks = (resumeText) => {
  const lines = String(resumeText || '').replace(/\r/g, '\n').split('\n')
  const blocks = new Map()
  let index = 0
  while (index < lines.length) {
    const line = lines[index]?.trim() || ''
    if (!line || !isKnownSectionHeadingLine(line)) {
      index += 1
      continue
    }
    const key = normalizeSectionKey(line)
    if (!KNOWN_SECTION_KEYS.has(key)) {
      index += 1
      continue
    }
    const content = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const next = lines[cursor]?.trim() || ''
      if (next && isKnownSectionHeadingLine(next)) break
      if (next) content.push(next)
      cursor += 1
    }
    if (content.length) blocks.set(key, [`## ${SECTION_HEADING_MAP[key]}`, ...content])
    index = cursor
  }
  return blocks
}

const extractHeaderLinesFromSource = (resumeText) => {
  const lines = String(resumeText || '').replace(/\r/g, '\n').split('\n')
  const header = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (isKnownSectionHeadingLine(line)) break
    header.push(line)
    if (header.length >= 2) break
  }
  return header
}

const enforceStrictSectionLayoutFromSource = (resumeText) => {
  const order = extractSectionOrderFromResume(resumeText)
  const blocks = extractSourceSectionBlocks(resumeText)
  const keys = (order.length ? order : Array.from(blocks.keys())).filter((key) => KNOWN_SECTION_KEYS.has(key))
  const sourceHeader = extractHeaderLinesFromSource(resumeText)

  const name = String(sourceHeader[0] || 'CANDIDATE NAME')
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const contact = String(sourceHeader[1] || '').trim()

  const out = [`# ${name.toUpperCase()}`]
  if (contact) out.push(contact)
  for (const key of keys) {
    const heading = SECTION_HEADING_MAP[key] || key.toUpperCase()
    const content = (blocks.get(key) || []).slice(1)
    if (!content.length) continue
    out.push(`## ${heading}`)
    out.push(...content)
  }
  return { order: keys, markdown: out.join('\n').trim() }
}

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/check_resume_structure.mjs <input-markdown-file> [output-markdown-file]')
  process.exit(1)
}

const absoluteInput = path.resolve(process.cwd(), inputPath)
const outputPathArg = process.argv[3]
const absoluteOutput = path.resolve(process.cwd(), outputPathArg || 'tmp/structure_output.md')

const input = fs.readFileSync(absoluteInput, 'utf8')
const result = enforceStrictSectionLayoutFromSource(input)

fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true })
fs.writeFileSync(absoluteOutput, result.markdown, 'utf8')

console.log(`Order: ${result.order.join(' -> ')}`)
console.log(`Output written: ${absoluteOutput}`)
