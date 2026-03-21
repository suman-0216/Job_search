// lib/outreach.ts

// Define the shape of the job data we expect to receive.
export interface Job {
  title?: string;
  company?: string;
  description?: string;
  skills?: string[];
  salary?: string;
  link?: string;
  // For funded/stealth startups which have a different shape
  company_name?: string;
  funding_amount?: string;
  round_type?: string;
  article_url?: string;
  // Allow any other properties
  [key: string]: any;
}

// The output structure of our main generation function.
export interface OutreachResult {
  matchedSkills: string[];
  companyMission: string;
  email: {
    subject: string;
    body: string;
  };
  linkedin: string;
  twitter: string;
}

// Your professional profile to match against.
const CANDIDATE_PROFILE = {
  stack: ['Python', 'PyTorch', 'LLMs', 'RAG', 'FastAPI', 'Docker', 'Vector DBs', 'Kubernetes', 'AWS', 'Transformers', 'LangChain', 'OpenAI', 'Anthropic'],
  role: 'Founding Engineer / AI-ML Engineer',
};

/**
 * Extracts the core company mission from the first few sentences of a job description.
 * @param description - The full job description text.
 * @returns A single sentence summarizing the company's mission.
 */
export function extractCompanyMission(description: string = ''): string {
  if (!description) {
    return 'Their mission to innovate in the AI/ML space is exciting.';
  }

  // Sanitize the text by removing HTML tags and normalizing whitespace.
  const sanitized = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Look for sentences containing mission-related keywords.
  const sentences = sanitized.match(/[^.!?]+[.!?]+/g) || [sanitized];
  const missionKeywords = /we are building|our mission is|we help|a platform for|to revolutionize|solving the problem/i;
  
  for (const sentence of sentences.slice(0, 5)) { // Check first 5 sentences
    if (missionKeywords.test(sentence)) {
      return sentence.trim();
    }
  }

  // Fallback to the first sentence if no keywords are found.
  return sentences[0]?.trim() || 'Their mission to innovate in the AI/ML space is exciting.';
}

/**
 * Matches skills from the job data against the candidate's profile stack.
 * @param skills - An array of skills from the job object.
 * @param description - The full job description text (as a fallback).
 * @returns An array of matched skill names.
 */
export function matchSkills(skills: string[] = [], description: string = ''): string[] {
  const matched = new Set<string>();
  const lowercasedStack = CANDIDATE_PROFILE.stack.map(s => s.toLowerCase());
  
  // First, check the provided skills array.
  if (skills.length > 0) {
    for (const jobSkill of skills) {
      for (const candidateSkill of CANDIDATE_PROFILE.stack) {
        if (new RegExp(`\\b${candidateSkill}\\b`, 'i').test(jobSkill)) {
          matched.add(candidateSkill);
        }
      }
    }
  }

  // If no skills were matched, fall back to searching the entire description.
  if (matched.size === 0 && description) {
    const lowerDesc = description.toLowerCase();
    for (const candidateSkill of CANDIDATE_PROFILE.stack) {
      if (lowerDesc.includes(candidateSkill.toLowerCase())) {
        matched.add(candidateSkill);
      }
    }
  }
  
  return Array.from(matched);
}


/**
 * The main function to generate all personalized outreach content for a given job.
 * @param job - The job data object.
 * @returns An object containing matched skills, mission, and three message templates.
 */
export function generateOutreach(job: Job): OutreachResult {
  const companyName = job.company || job.company_name || '[Company Name]';
  const jobTitle = job.title || CANDIDATE_PROFILE.role;
  const description = job.description || '';

  const matchedSkills = matchSkills(job.skills, description);
  const companyMission = extractCompanyMission(description);

  // --- COLD EMAIL ---
  const emailSubject = `Early eng for ${companyName} — [Your Name]`;
  let emailBody = `Hi there,\n\n`;
  emailBody += `${companyMission}\n\n`;
  emailBody += `I'm an AI/ML engineer with hands-on experience in ${matchedSkills.slice(0, 3).join(', ') || 'key areas like Python, PyTorch, and LLMs'}.\n`;
  emailBody += `Here's something I built that's directly relevant:\n[Your GitHub link] — [one line description placeholder].\n\n`;

  if (job.salary && (job.salary.includes('150k') || job.salary.includes('150,000'))) {
    emailBody += `The role aligns well with what I'm looking for.\n\n`;
  }
  
  emailBody += `Open to a trial project or contract-first to start — happy to show what I can do before any commitment.\n\n`;
  emailBody += `Worth a 15-min call?\n[Your Name]`;

  // --- LINKEDIN DM ---
  const linkedinBody = `[CEO name] — saw the ${jobTitle} role. ${companyMission.substring(0, 100).trim()}... I'm an AI/ML eng with ${matchedSkills.slice(0, 2).join(' & ')}. Built [placeholder]. Open to a trial project?`;

  // --- TWITTER/X DM ---
  const twitterBody = `Hey ${companyName} team — ${companyMission.substring(0, 80).trim()}... AI/ML eng here, ${matchedSkills[0] || 'Python/PyTorch'}. Built [placeholder]. Worth a chat?`;
  
  return {
    matchedSkills,
    companyMission,
    email: {
      subject: emailSubject,
      body: emailBody,
    },
    linkedin: linkedinBody.substring(0, 299), // Ensure it's under the limit
    twitter: twitterBody.substring(0, 239), // Ensure it's under the limit
  };
}

/**
 * Generates outreach for a recently funded startup.
 * @param startup - The funded startup data object.
 * @returns A single, combined outreach message.
 */
export function generateFundedOutreach(startup: Job): string {
    const companyName = startup.company_name || '[Company Name]';
    const funding = startup.funding_amount || 'recent';
    const round = startup.round_type || 'funding';
    const mission = extractCompanyMission(startup.description);
    const skills = CANDIDATE_PROFILE.stack.slice(0, 3).join(', ');

    return `Congrats on the ${funding} ${round} — ${mission} I'm an AI/ML engineer with experience in ${skills}. Built [X]. Open to a trial project to help you scale?`;
}

/**
 * Generates outreach for a stealth startup.
 * @param startup - The stealth startup data object.
 * @returns A single, combined outreach message.
 */
export function generateStealthOutreach(startup: Job): string {
    const companyName = startup.company || startup.name || '[Company Name]';
    const source = startup.sourceType || 'my network'; // e.g., 'YC', 'Hacker News'
    const skills = CANDIDATE_PROFILE.stack.slice(0, 2).join(' & ');

    return `I came across ${companyName} through ${source}. Building in the AI domain is exactly where I want to be. I'm an AI/ML engineer with experience in ${skills}. Open to a confidential chat? Happy to sign an NDA.`;
}
