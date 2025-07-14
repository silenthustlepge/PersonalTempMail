// Filename: start-watch.js (Updated)
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;

// Your Pub/Sub topic name from Google Cloud
const GMAIL_TOPIC_NAME = 'projects/tempmail-465904/topics/temp-mail-pubsub'; // <-- Updated to your actual topic name

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const STATE_PATH = path.join(__dirname, 'state.json'); // Path to our new state file

async function getAuthenticatedClient() {
    const creds = JSON.parse(await fs.readFile(CREDENTIALS_PATH));
    const { client_secret, client_id } = creds.web || creds.installed;
    const tokens = JSON.parse(await fs.readFile(TOKEN_PATH));
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
    oAuth2Client.setCredentials(tokens);
    return google.gmail({ version: 'v1', auth: oAuth2Client });
}

async function startWatch() {
    try {
        console.log('Setting up new Gmail watch...');
        const gmail = await getAuthenticatedClient();

        const requestBody = {
            // The name of the Pub/Sub topic to send notifications to.
            topicName: GMAIL_TOPIC_NAME,
            // We only care about new messages arriving.
            labelIds: ['INBOX'] 
        };

        const response = await gmail.users.watch({
            userId: 'me',
            requestBody: requestBody,
        });

        const historyId = response.data.historyId;
        console.log('✅ Success! Watch has been configured.');
        console.log(`Initial historyId is: ${historyId}`);

        // <<<<<<<<<<< NEW CODE HERE >>>>>>>>>>>>>
        // Save this initial historyId to our state file.
        const state = { lastHistoryId: historyId };
        await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
        console.log(`✅ Initial state saved to state.json with historyId: ${historyId}`);
        // <<<<<<<<<<< END NEW CODE >>>>>>>>>>>>>>

        console.log('Expiration:', new Date(Number(response.data.expiration)).toLocaleString());
        console.log('IMPORTANT: This watch will expire. You need to re-run this script periodically (e.g., every 6 days).');

    } catch (error) {
        console.error('❌ Error setting up watch:', error.message);
        console.error('---');
        console.error('Possible Reasons:');
        console.error('1. The topic name is incorrect.');
        console.error('2. The service account for Gmail does not have permission to publish to this Pub/Sub topic.');
        console.error('---');
    }
}

startWatch();