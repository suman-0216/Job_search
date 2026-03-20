import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = './data';
const PUBLIC_DIR = './public';

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

function loadLast5Days() {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .sort().reverse().slice(0, 5);
  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f)));
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

const days = loadLast5Days();
console.log(`📅 Building Apple-style dashboard from ${days.length} days of data...`);

const templatePath = path.join(__dirname, 'dashboard_template.html');
let template = fs.readFileSync(templatePath, 'utf8');

const dateOptions = days.map(d => `<option value="${d.date}">${d.date} (${(d.jobs||[]).length} jobs)</option>`).join('\n');

const html = template
  .replace('DATES_PLACEHOLDER', dateOptions)
  .replace('DATA_PLACEHOLDER', JSON.stringify(days));

fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), html);
console.log('✅ Built premium Apple-style dashboard at public/index.html');