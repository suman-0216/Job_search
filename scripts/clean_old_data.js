import fs from 'fs';
import path from 'path';

const DATA_DIR = './data';
const RETENTION_DAYS = 5;

function cleanOldData() {
    console.log(`Cleaning data files older than ${RETENTION_DAYS} days...`);
    const files = fs.readdirSync(DATA_DIR);
    const now = new Date();

    files.forEach(file => {
        if (!file.endsWith('.json')) return;

        const filePath = path.join(DATA_DIR, file);
        const stats = fs.statSync(filePath);
        const fileDate = stats.mtime; // Use modification time
        const diffTime = Math.abs(now - fileDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > RETENTION_DAYS) {
            console.log(`Deleting old file: ${file} (${diffDays} days old)`);
            fs.unlinkSync(filePath);
        }
    });

    console.log('Cleanup complete.');
}

try {
    cleanOldData();
} catch (error) {
    console.error('An error occurred during cleanup:', error);
    process.exit(1);
}
