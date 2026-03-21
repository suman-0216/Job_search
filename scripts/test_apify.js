import fetch from 'node-fetch';
import 'dotenv/config';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const actorId = 'apify/google-search-scraper';
const input = {
  queries: ['test'],
};

async function testApify() {
  try {
    const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const runData = await runResponse.json();
    console.log(JSON.stringify(runData, null, 2));
  } catch (error) {
    console.error('Error during Apify test:', error);
  }
}

testApify();
