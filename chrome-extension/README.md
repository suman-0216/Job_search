# Chrome Extension (Resume Assistant)

## Load unpacked
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this `chrome-extension/` folder

## Usage
- Click extension icon -> side panel opens on right.
- Login or create account.
- Upload resume (PDF/DOCX), paste job description, click **Generate Resume**.
- Open **Profile** to update LLM provider/API key.

## API base
- Default: `https://jobsync-alpha.vercel.app`
- For local dev, change in auth view to: `http://localhost:3000`
