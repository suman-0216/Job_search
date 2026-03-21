// lib/scorer.ts
import { MY_PROFILE, Project } from './candidate';

// Define the shape of a job object that can be scored.
export interface ScorableJob {
  title?: string;
  description?: string;
  skills?: string[];
  companyEmployeesCount?: number;
  applicants?: number | string;
  postedAt?: string;
  workRemoteAllowed?: boolean;
  [key: string]: any;
}

// Define the output shape after scoring and augmentation.
export interface AugmentedJob extends ScorableJob {
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  best_project: {
    name: string;
    url: string;
    hook: string;
  };
  variant: 'A' | 'B' | 'C' | 'D';
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }
  return 0;
};

/**
 * Determines the most relevant project from the profile based on skill overlap.
 */
function findBestProject(jobSkills: Set<string>, profileProjects: Project[]): Project {
  let bestProject = profileProjects[0];
  let maxOverlap = -1;

  for (const project of profileProjects) {
    let currentOverlap = 0;
    const projectStackLower = project.stack.map(s => s.toLowerCase());
    for (const skill of jobSkills) {
      if (projectStackLower.includes(skill.toLowerCase())) {
        currentOverlap++;
      }
    }
    if (currentOverlap > maxOverlap) {
      maxOverlap = currentOverlap;
      bestProject = project;
    }
  }
  return bestProject;
}

/**
 * Determines the best outreach variant based on keywords in the job description.
 */
function determineVariant(description: string): 'A' | 'B' | 'C' | 'D' {
  const lowerDesc = description.toLowerCase();
  if (/\b(healthcare|medical|clinical|patient)\b/.test(lowerDesc)) return 'A';
  if (/\b(infrastructure|backend|platform|distributed|cloud)\b/.test(lowerDesc)) return 'B';
  if (/\b(decision|reasoning|planning|autonomous|agent)\b/.test(lowerDesc)) return 'C';
  if (/\b(on-device|edge|privacy|embedded|mobile)\b/.test(lowerDesc)) return 'D';
  return 'B'; // Default to a general backend/infra variant
}

/**
 * Scores a job against the candidate's profile and augments it with personalized data.
 */
export function scoreJob(job: ScorableJob, profile: typeof MY_PROFILE): AugmentedJob {
  let opportunityScore = 0;
  let skillScore = 0;
  
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const applicants = toNumber(job.applicants);
  const postedDate = job.postedAt ? new Date(job.postedAt) : new Date();
  const hoursSincePosted = (new Date().getTime() - postedDate.getTime()) / (1000 * 60 * 60);

  // --- Calculate Opportunity Score (max 10) ---
  if (title.includes('founding')) opportunityScore += 4;
  if (/\b(ai|ml|llm)\b/.test(title)) opportunityScore += 2;
  if (applicants < 100) opportunityScore += 2;
  if (applicants < 50) opportunityScore += 1; // bonus
  if (hoursSincePosted < 12) opportunityScore += 2;
  if (job.workRemoteAllowed) opportunityScore += 1;
  // Note: companyEmployeesCount is not available in the current data, so it's omitted for now.

  // --- Calculate Skill Match Score (max 10) ---
  const profileSkillsLower = new Set(profile.skills.map(s => s.toLowerCase()));
  const jobSkillsInJD = new Set<string>();
  (job.skills || []).forEach(s => jobSkillsInJD.add(s.toLowerCase()));

  // Also scan description for skills not listed in the skills array
  for (const profileSkill of profileSkillsLower) {
      if (description.includes(profileSkill)) {
          jobSkillsInJD.add(profileSkill);
      }
  }

  const matched_skills = [...jobSkillsInJD].filter(skill => profileSkillsLower.has(skill));
  const missing_skills = [...jobSkillsInJD].filter(skill => !profileSkillsLower.has(skill));

  const totalSkillsInJob = matched_skills.length + missing_skills.length;
  const match_ratio = totalSkillsInJob > 0 ? matched_skills.length / totalSkillsInJob : 0;

  if (match_ratio >= 0.7) skillScore = 10;
  else if (match_ratio >= 0.5) skillScore = 7;
  else if (match_ratio >= 0.3) skillScore = 5;
  else if (match_ratio >= 0.1) skillScore = 3;
  else skillScore = 1;

  // --- Normalize score to 0-10 scale ---
  // We'll weigh skill score more heavily
  const finalScore = ((opportunityScore * 0.4) + (skillScore * 0.6)); 
  
  // --- Augment the job object ---
  const bestProj = findBestProject(new Set(matched_skills), profile.projects);
  const variant = determineVariant(description);

  return {
    ...job,
    score: parseFloat(finalScore.toFixed(1)),
    matched_skills: matched_skills.map(s => profile.skills.find(ps => ps.toLowerCase() === s) || s), // Return with original casing
    missing_skills,
    best_project: {
      name: bestProj.name,
      url: bestProj.github,
      hook: bestProj.hook,
    },
    variant,
  };
}
