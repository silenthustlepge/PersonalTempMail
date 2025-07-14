// Filename: test-history.js

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'tokens.json');

// This is the same authentication helper from your main server file
async function getAuthenticatedClient() {
    try {
        const creds = JSON.parse(await fs.promises.readFile(CREDENTIALS_PATH));
        const { client_secret, client_id } = creds.web || creds.installed;
        const tokens = JSON.parse(await fs.promises.readFile(TOKEN_PATH));

        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
        oAuth2Client.setCredentials(tokens);
        return google.gmail({ version: 'v1', auth: oAuth2Client });
    } catch (error) {
        console.error('Error authenticating Gmail client:', error);
        throw new Error('Gmail authentication failed. Make sure to run "node authorize.js" first.');
    }
}

async function testHistory(historyId) {
    if (!historyId) {
        console.error('❌ Please provide a historyId to test. Usage: node test-history.js <historyId>');
        return;
    }

    console.log(`🔍 Testing for historyId: ${historyId}...`);

    try {
        const gmailClient = await getAuthenticatedClient();
        const historyResponse = await gmailClient.users.history.list({
            userId: 'me',
            startHistoryId: historyId,
            historyTypes: ['messageAdded'],
        });

        if (!historyResponse.data.history || historyResponse.data.history.length === 0) {
            console.log('---');
            console.log(`📭 RESULT: Still no history found for ID ${historyId}.`);
            console.log('---');
        } else {
            console.log('---');
            console.log(`✅ SUCCESS! Found history for ID ${historyId}.`);
            console.log('Found record(s):', JSON.stringify(historyResponse.data.history, null, 2));
            console.log('---');
            console.log('This PROVES the issue is a race condition.');
        }

    } catch (error) {
        console.error('❌ An error occurred during the API call:', error);
    }
}

// Get the historyId from the command line arguments
const historyIdToTest = process.argv[2];
testHistory(historyIdToTest);
