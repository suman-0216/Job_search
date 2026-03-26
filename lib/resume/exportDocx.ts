import * as docx from 'docx'

const ALLOWED_FONTS = new Set(['Arial', 'Times New Roman', 'Calibri', 'Roboto', 'Garamond'])
const LETTER_WIDTH_TWIPS = 12240
const LETTER_HEIGHT_TWIPS = 15840
const MARGIN_TWIPS = 864

type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'link'; text: string; url: string }

const toText = (value: unknown): string => (typeof value === 'string' ? value : '')

export const toSafeFileStem = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'tailored_resume'

export const normalizeResumeFont = (value: unknown): string => {
  const font = toText(value).trim()
  return ALLOWED_FONTS.has(font) ? font : 'Calibri'
}

const parseInlineTokens = (input: string): InlineToken[] => {
  const text = String(input || '')
  const tokenRegex = /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]+)\)|\*\*([^*]+)\*\*/g
  const tokens: InlineToken[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > cursor) tokens.push({ type: 'text', text: text.slice(cursor, match.index) })
    if (match[1] && match[2]) tokens.push({ type: 'link', text: match[1], url: match[2] })
    else if (match[3]) tokens.push({ type: 'bold', text: match[3] })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) tokens.push({ type: 'text', text: text.slice(cursor) })
  if (!tokens.length) tokens.push({ type: 'text', text })
  return tokens
}

const tokensToRuns = (tokens: InlineToken[], font: string, size: number): docx.ParagraphChild[] => {
  const runs: docx.ParagraphChild[] = []
  for (const token of tokens) {
    if (token.type === 'link') {
      runs.push(
        new docx.ExternalHyperlink({
          children: [new docx.TextRun({ text: token.text, font, size, color: '0B57D0', underline: { type: docx.UnderlineType.SINGLE } })],
          link: token.url,
        }),
      )
      continue
    }
    runs.push(new docx.TextRun({ text: token.text, font, size, bold: token.type === 'bold' }))
  }
  return runs
}

export const createResumeDocxBuffer = async (input: { markdown: string; selectedFont?: string }): Promise<Buffer> => {
  const markdown = String(input.markdown || '').replace(/\r/g, '\n')
  const selectedFont = normalizeResumeFont(input.selectedFont)
  const lines = markdown.split('\n')

  const children: docx.Paragraph[] = []
  let beforeFirstSectionHeading = true

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const heading3 = line.match(/^###\s+(.+)$/)
    if (heading3) {
      beforeFirstSectionHeading = false
      children.push(
        new docx.Paragraph({
          heading: docx.HeadingLevel.HEADING_2,
          spacing: { before: 60, after: 60, line: 240 },
          children: tokensToRuns(parseInlineTokens(heading3[1]), selectedFont, 20),
        }),
      )
      continue
    }

    const heading2 = line.match(/^##\s+(.+)$/)
    if (heading2) {
      beforeFirstSectionHeading = false
      children.push(
        new docx.Paragraph({
          heading: docx.HeadingLevel.HEADING_1,
          spacing: { before: 120, after: 60, line: 240 },
          children: tokensToRuns(parseInlineTokens(heading2[1]), selectedFont, 20),
        }),
      )
      continue
    }

    const heading1 = line.match(/^#\s+(.+)$/)
    if (heading1) {
      children.push(
        new docx.Paragraph({
          heading: docx.HeadingLevel.TITLE,
          alignment: docx.AlignmentType.CENTER,
          spacing: { before: 0, after: 40, line: 240 },
          children: tokensToRuns(parseInlineTokens(heading1[1]), selectedFont, 28),
        }),
      )
      continue
    }

    const ordered = line.match(/^(\d+)[.)]\s+(.+)$/)
    if (ordered) {
      beforeFirstSectionHeading = false
      children.push(
        new docx.Paragraph({
          numbering: { reference: 'resume-numbering', level: 0 },
          spacing: { before: 0, after: 60, line: 240 },
          children: tokensToRuns(parseInlineTokens(ordered[2]), selectedFont, 20),
        }),
      )
      continue
    }

    const bullet = line.match(/^[-*\u2022]\s+(.+)$/)
    if (bullet) {
      beforeFirstSectionHeading = false
      children.push(
        new docx.Paragraph({
          bullet: { level: 0 },
          spacing: { before: 0, after: 60, line: 240 },
          children: tokensToRuns(parseInlineTokens(bullet[1]), selectedFont, 20),
        }),
      )
      continue
    }

    children.push(
      new docx.Paragraph({
        alignment: beforeFirstSectionHeading ? docx.AlignmentType.CENTER : docx.AlignmentType.JUSTIFIED,
        spacing: { before: 0, after: 60, line: 240 },
        children: tokensToRuns(parseInlineTokens(line), selectedFont, 20),
      }),
    )
  }

  const document = new docx.Document({
    numbering: {
      config: [
        {
          reference: 'resume-numbering',
          levels: [
            {
              level: 0,
              format: docx.LevelFormat.DECIMAL,
              text: '%1.',
              alignment: docx.AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: LETTER_WIDTH_TWIPS, height: LETTER_HEIGHT_TWIPS },
            margin: { top: MARGIN_TWIPS, right: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS },
          },
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(document)
}

const { Packer } = docx

