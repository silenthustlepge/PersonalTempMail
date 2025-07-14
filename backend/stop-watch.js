// Filename: stop-watch.js
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'tokens.json');

async function getAuthenticatedClient() {
    const creds = JSON.parse(await fs.readFile(CREDENTIALS_PATH));
    const { client_secret, client_id } = creds.web || creds.installed;
    const tokens = JSON.parse(await fs.readFile(TOKEN_PATH));
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
    oAuth2Client.setCredentials(tokens);
    return google.gmail({ version: 'v1', auth: oAuth2Client });
}

async function stopWatch() {
    try {
        console.log('Attempting to stop existing Gmail watch...');
        const gmail = await getAuthenticatedClient();
        const response = await gmail.users.stop({ userId: 'me' });
        console.log('✅ Success! Any existing watch has been stopped.', response.data);
    } catch (error) {
        if (error.code === 404) {
            console.log('ℹ️ No active watch found to stop. This is normal.');
        } else {
            console.error('❌ Error stopping watch:', error.message);
        }
    }
}

stopWatch();
