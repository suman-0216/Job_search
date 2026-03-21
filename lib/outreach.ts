// lib/outreach.ts
import { MY_PROFILE } from './candidate';
import { AugmentedJob } from './scorer';

export interface OutreachResult {
  email: {
    subject: string;
    body: string;
  };
  linkedin: string;
  twitter: string;
}

/**
 * Extracts the company mission from the first two sentences of a job description 
 * that contain specific keywords.
 */
function extractMissionHook(description: string = ''): string {
  if (!description) return 'Building the future of AI is a mission I truly resonate with.';

  const sanitized = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = sanitized.match(/[^.!?]+[.!?]+/g) || [sanitized];
  const missionKeywords = /\b(we|our|building|platform|mission|help)\b/i;
  
  const relevantSentences = sentences
    .filter(s => missionKeywords.test(s))
    .slice(0, 2)
    .join(' ')
    .trim();

  return relevantSentences || 'Your mission to innovate in the AI space is exactly the problem area I want to work in.';
}

/**
 * Generates personalized outreach content based on a scored job and the candidate's profile.
 */
export function generateOutreach(job: AugmentedJob, profile: typeof MY_PROFILE): OutreachResult {
  const company = job.company || job.companyName || '[Company]';
  const missionHook = extractMissionHook(job.description);
  const bestProject = job.best_project;
  const topMatchedSkills = job.matched_skills.slice(0, 3).join(', ');
  const applicantsCount = typeof job.applicants === 'number' ? job.applicants : parseInt(String(job.applicants).match(/\d+/)?.[0] || '0');

  // --- COLD EMAIL ---
  const emailSubject = `Early eng for ${company} — ${profile.name}`;
  let emailBody = `Hi there,\n\n`;
  emailBody += `${missionHook} This is exactly the problem space I want to work on.\n\n`;
  emailBody += `I'm Suman — a ${profile.title} with 2 years of experience building production systems end-to-end. Most relevant to this role:\n\n`;
  emailBody += `→ ${bestProject.name}: ${bestProject.hook}\n${bestProject.url}\n\n`;
  emailBody += `Tech match: ${topMatchedSkills}\n\n`;

  if (applicantsCount > 0 && applicantsCount < 100) {
    emailBody += `With only ${applicantsCount} applicants, I'd love to move fast — happy to start with a trial project or async task.\n\n`;
  } else {
    emailBody += `Open to a trial project or contract-first to show what I can do.\n\n`;
  }

  const salary = (job.salary || '').toLowerCase();
  if (salary.includes('150000') || salary.includes('200') || salary.includes('250')) {
    emailBody += `The comp range aligns well with what I'm looking for.\n\n`;
  }

  emailBody += `Worth a 15-min call?\n${profile.name}\n${profile.portfolio} | ${profile.github} | ${profile.linkedin}`;

  // --- LINKEDIN DM ---
  const linkedinBody = `Hi ${company} — ${missionHook.substring(0, 80)}... I'm Suman, Founding AI eng — built ${bestProject.name} (${job.matched_skills[0]}). ${applicantsCount > 0 ? `${applicantsCount} applicants, ` : ''}happy to move fast. Trial project? ${profile.portfolio}`;

  // --- TWITTER/X DM ---
  const twitterBody = `Hey ${company} team — ${missionHook.substring(0, 70)}... AI/ML eng here, ${job.matched_skills[0] || 'Python/PyTorch'}. Built ${bestProject.name}. Worth a chat? ${profile.portfolio}`;

  return {
    email: {
      subject: emailSubject,
      body: emailBody,
    },
    linkedin: linkedinBody.substring(0, 299),
    twitter: twitterBody.substring(0, 239),
  };
}

/**
 * Generates outreach for funded startup leads.
 */
export function generateFundedOutreach(job: any, profile: typeof MY_PROFILE): string {
  const company = job.company_name || '[Company]';
  const funding = job.funding_amount || 'recent';
  const round = job.round_type || 'funding';
  const description = job.description || job.article_description || '';
  const missionHook = extractMissionHook(description);
  
  // Find a relevant project hook for the domain if possible
  const project = profile.projects[0]; // fallback to first

  return `Congrats on the ${funding} ${round}!\n${missionHook}\nI'm Suman — I've built ${project.hook.split(',')[0]}.\nOpen to a trial project or contract-first to help you move faster.\n${profile.portfolio} | ${profile.github}`;
}

/**
 * Generates outreach for stealth startup leads.
 */
export function generateStealthOutreach(job: any, profile: typeof MY_PROFILE): string {
  const company = job.company || job.name || '[Stealth Startup]';
  const source = job.source || 'my network';
  const domain = job.domain || 'AI';
  const project = profile.projects[0]; // fallback

  return `Hi — I came across ${company} through ${source}.\nBuilding in ${domain} is exactly where I want to be.\nI'm Suman — I recently built ${project.name} (${profile.metrics.executionAccuracy}).\nHappy to keep this confidential and sign an NDA if needed.\n${profile.portfolio}`;
}
