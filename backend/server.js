// ...existing code...

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');

const app = express();
const PORT = process.env.PORT || 8001;
const EMAILS_FILE = path.join(__dirname, 'emails.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const PUBSUB_SERVICE_ACCOUNT_PATH = path.join(__dirname, 'pubsub-service-account.json');

// Explicitly allow CORS from frontend
// Remove duplicate CORS middleware and use a single, permissive CORS setup
// Initialize Pub/Sub client with service account
let pubsub = null;
function getPubSubClient() {
    if (!pubsub) {
        pubsub = new PubSub({ keyFilename: PUBSUB_SERVICE_ACCOUNT_PATH });
    }
    return pubsub;
}

// Example endpoint to publish a message to a Pub/Sub topic
app.post('/api/publish', async (req, res) => {
    const { topic, message } = req.body;
    if (!topic || !message) {
        return res.status(400).json({ error: 'Missing topic or message' });
    }
    try {
        const pubsubClient = getPubSubClient();
        const dataBuffer = Buffer.from(JSON.stringify(message));
        const messageId = await pubsubClient.topic(topic).publish(dataBuffer);
        res.json({ message: 'Message published', messageId });
    } catch (error) {
        console.error('Error publishing to Pub/Sub:', error);
        res.status(500).json({ error: 'Failed to publish message' });
    }
});

// In-memory storage for received emails
let receivedEmails = {};
let gmail; // Gmail API client

// File to persist last processed historyId
const HISTORY_ID_FILE = path.join(__dirname, 'last_history_id.txt');

// Helper to load last processed historyId
async function loadLastHistoryId() {
    try {
        const data = await fs.readFile(HISTORY_ID_FILE, 'utf8');
        return data.trim();
    } catch (e) {
        return null;
    }
}

// Helper to save last processed historyId
async function saveLastHistoryId(historyId) {
    try {
        await fs.writeFile(HISTORY_ID_FILE, String(historyId));
    } catch (e) {
        console.error('Error saving last historyId:', e);
    }
}

app.use(express.json());
// Enable CORS for all origins and allow ngrok-skip-browser-warning header
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning']
}));
app.use(express.raw({ type: 'application/octet-stream' }));

// Helper function to get an authenticated Gmail client
async function getAuthenticatedClient() {
    if (gmail) return gmail;

    try {
        const creds = JSON.parse(await fs.readFile(CREDENTIALS_PATH));
        const { client_secret, client_id } = creds.web || creds.installed;
        const tokens = JSON.parse(await fs.readFile(TOKEN_PATH));

        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
        oAuth2Client.setCredentials(tokens);
        gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        return gmail;
    } catch (error) {
        console.error('Error authenticating Gmail client:', error);
        throw new Error('Gmail authentication failed. Make sure to run "node authorize.js" first.');
    }
}

// Helper function to load emails from file
async function loadEmails() {
    try {
        const data = await fs.readFile(EMAILS_FILE, 'utf8');
        const parsed = JSON.parse(data);
        console.log(`[DEBUG] Loaded emails.json: count=${Array.isArray(parsed) ? parsed.length : 'not array'}`);
        if (Array.isArray(parsed)) {
            // Log first 3 entries for inspection
            console.log('[DEBUG] First 3 entries:', parsed.slice(0, 3));
        }
        return parsed;
    } catch (error) {
        console.error('[DEBUG] Error loading emails.json:', error);
        return [];
    }
}

// Helper function to save emails to file
async function saveEmails(emails) {
    try {
        await fs.writeFile(EMAILS_FILE, JSON.stringify(emails, null, 2));
    } catch (error) {
        console.error('Error saving emails.json:', error);
    }
}

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Temp Mail Service is running',
        timestamp: new Date().toISOString()
    });
});

// Get a new temporary email address
app.get('/api/new-address', async (req, res) => {
    try {
        console.log('[DEBUG] /api/new-address called');
        const emails = await loadEmails();
        if (!Array.isArray(emails)) {
            console.error('[DEBUG] emails.json did not parse to array:', emails);
            return res.status(500).json({ error: 'emails.json is not an array' });
        }
        const availableEmail = emails.find(email => email && email.address && email.is_used === false);
        console.log(`[DEBUG] Available email found:`, availableEmail);
        if (!availableEmail) {
            console.error('[DEBUG] No available email addresses. All aliases are currently in use.');
            return res.status(404).json({ 
                error: 'No available email addresses. All aliases are currently in use.' 
            });
        }
        // Mark as used and save
        availableEmail.is_used = true;
        await saveEmails(emails);
        // Initialize empty inbox for this address
        if (!receivedEmails[availableEmail.address]) {
            receivedEmails[availableEmail.address] = [];
        }
        console.log(`[DEBUG] Assigned new address: ${availableEmail.address} (marked as used)`);
        res.json({ address: availableEmail.address });
    } catch (error) {
        console.error('[DEBUG] Error getting new address:', error);
        res.status(500).json({ error: 'Failed to get new address', details: error.message });
    }
});

// Mark an address as used (retire it)
app.post('/api/mark-used', async (req, res) => {
    try {
        const { address } = req.body;
        
        if (!address) {
            return res.status(400).json({ error: 'Address is required' });
        }
        
        const emails = await loadEmails();
        const emailIndex = emails.findIndex(email => email.address === address);
        
        if (emailIndex === -1) {
            return res.status(404).json({ error: 'Address not found' });
        }
        
        emails[emailIndex].is_used = true;
        await saveEmails(emails);
        
        // Clear the inbox for this address
        delete receivedEmails[address];
        
        console.log(`🚫 Retired address: ${address}`);
        res.json({ message: 'Address marked as used and retired' });
        
    } catch (error) {
        console.error('Error marking address as used:', error);
        res.status(500).json({ error: 'Failed to mark address as used' });
    }
});

// Get inbox for a specific address
app.get('/api/inbox/:address', (req, res) => {
    try {
        const address = req.params.address;
        const emails = receivedEmails[address] || [];
        
        console.log(`📬 Fetching inbox for ${address}: ${emails.length} emails`);
        res.json(emails);
        
    } catch (error) {
        console.error('Error fetching inbox:', error);
        res.status(500).json({ error: 'Failed to fetch inbox' });
    }
});

// Get all available addresses (for debugging)
app.get('/api/addresses', async (req, res) => {
    try {
        const emails = await loadEmails();
        res.json(emails);
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.status(500).json({ error: 'Failed to fetch addresses' });
    }
});

// The Pub/Sub Webhook - This receives notifications when new emails arrive

// Utility to append logs to a file and also log to console
const EMAIL_LOG_FILE = path.join(__dirname, 'email_debug.log');
async function logToFile(...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
    await fs.appendFile(EMAIL_LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
    console.log(...args);
}

/**
 * A robust, recursive function to find the email body from a Gmail API payload,
 * based on the official API documentation.
 * It intelligently searches through nested parts and prioritizes the HTML body
 * over plain text when available.
 * 
 * @param {object} payload The message payload from the Gmail API resource.
 * @returns {string} The decoded email body as a string, or an empty string if not found.
 */
function parseMessageBody(payload) {
    if (!payload) return '';
    let body = '';

    // Case 1: The payload has parts (it's a multipart message)
    if (payload.parts && payload.parts.length) {
        // multipart/alternative contains different formats of the same content.
        // We should prioritize html over plain text.
        if (payload.mimeType === 'multipart/alternative') {
            const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
            if (htmlPart) {
                // The body data might be in the part itself or nested further.
                body = parseMessageBody(htmlPart);
                if (body) return body;
            }
        }
        // For any multipart type, recurse through the parts to find the first valid body.
        for (const part of payload.parts) {
            body = parseMessageBody(part);
            if (body) {
                return body; // Return the body from the first part that has one.
            }
        }
    }
    // Case 2: The payload itself has the body data (base case for recursion)
    else if (payload.body && payload.body.data) {
        return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    // Case 3: No body found
    return '';
}

/**
 * Parses a specific header from the Gmail API headers array.
 * @param {Array} headers The array of headers.
 * @param {string} name The name of the header to find (e.g., 'To', 'Subject').
 * @returns {string} The header value or an empty string.
 */
function parseHeader(headers, name) {
    if (!headers) return '';
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
}

/**
 * Extracts just the email address from a header value and normalizes it.
 * @param {string} headerValue The full header value.
 * @returns {string} The normalized, lowercase email address.
 */
function normalizeEmailAddress(headerValue) {
    if (!headerValue) return '';
    const match = headerValue.match(/<(.+)>/);
    const email = match ? match[1] : headerValue;
    return email.trim().toLowerCase();
}


// The NEW Pub/Sub Webhook - Stateful Synchronization (Final Version)
const STATE_PATH = path.join(__dirname, 'state.json'); // Add this near the top with other constants

app.post('/webhook/pubsub-push', async (req, res) => {
    console.log('➡️  /webhook/pubsub-push triggered. Ignoring notification payload.');
    try {
        // 1. Acknowledge the message immediately.
        res.status(204).send();

        // 2. Read the last known historyId from our state file.
        let state;
        try {
            state = JSON.parse(await fs.readFile(STATE_PATH, 'utf-8'));
        } catch (error) {
            console.error('❌ CRITICAL: state.json not found or corrupted. Please run start-watch.js.');
            return;
        }
        
        const lastHistoryId = state.lastHistoryId;
        console.log(`Syncing from last known historyId: ${lastHistoryId}`);

        // 3. Query Gmail for ALL changes since that ID.
        const gmailClient = await getAuthenticatedClient();
        const historyResponse = await gmailClient.users.history.list({
            userId: 'me',
            startHistoryId: lastHistoryId,
            historyTypes: ['messageAdded'],
        });

        // 4. Check if there is any new history to process.
        const history = historyResponse.data.history;
        if (!history || history.length === 0) {
            console.log('ℹ️ No new message history found. Sync complete.');
            return;
        }

        console.log(`Found ${history.length} new history records to process.`);

        // 5. Process each new message from the history records.
        for (const record of history) {
            if (!record.messagesAdded) continue;

            for (const msgAdded of record.messagesAdded) {
                const messageId = msgAdded.message.id;
                // ... (The rest of your message parsing logic is PERFECT and remains the same)
                const msgResponse = await gmailClient.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
                const payload = msgResponse.data.payload;
                const headers = payload.headers;
                const deliveredToHeader = parseHeader(headers, 'Delivered-To');
                const toHeader = parseHeader(headers, 'To');
                const fromHeader = parseHeader(headers, 'From');
                const subjectHeader = parseHeader(headers, 'Subject') || 'No Subject';
                const dateHeader = parseHeader(headers, 'Date');
                const body = parseMessageBody(payload);
                const targetAddress = normalizeEmailAddress(deliveredToHeader || toHeader);
                const inboxKey = Object.keys(receivedEmails).find(key => key.trim().toLowerCase() === targetAddress);

                if (inboxKey) {
                    receivedEmails[inboxKey].unshift({ from: fromHeader, subject: subjectHeader, body, date: dateHeader, id: messageId });
                    console.log(`✅ Email '${subjectHeader}' stored for ${inboxKey}.`);
                } else {
                    console.log(`❌ No tracked inbox for '${targetAddress}'.`);
                }
            }
        }
        
        // 6. IMPORTANT: Update the state file with the new latest historyId for the next sync.
        const newHistoryId = historyResponse.data.historyId;
        await fs.writeFile(STATE_PATH, JSON.stringify({ lastHistoryId: newHistoryId }, null, 2));
        console.log(`✅ Sync complete. New historyId ${newHistoryId} saved to state.json.`);

    } catch (error) {
        console.error('❌ FATAL Error processing sync:', error);
    }
});
// Add this new function
/**
 * Re-initializes the in-memory state from the persistent emails.json file.
 * This ensures that if the server restarts, it remembers which inboxes are active.
 */
async function initializeActiveInboxes() {
    console.log('🔄 Initializing active inboxes from emails.json...');
    try {
        const emails = await loadEmails();
        if (Array.isArray(emails)) {
            const activeEmails = emails.filter(email => email.is_used === true);
            receivedEmails = {}; // Reset the in-memory object
            for (const email of activeEmails) {
                if (email.address) {
                    receivedEmails[email.address] = []; // Create an empty inbox
                }
            }
            console.log(`✅ Re-initialized ${activeEmails.length} active inboxes.`);
        } else {
            console.error('⚠️ Could not initialize inboxes, emails.json is not an array.');
        }
    } catch(error) {
        console.error('❌ Failed to initialize active inboxes:', error);
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Temp Mail Server running on port ${PORT}`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook/pubsub-push`);
    console.log(`🔗 API base URL: http://localhost:${PORT}/api`);

    // <<<<<<<<<<<<<<< ADD THIS CRITICAL CALL HERE >>>>>>>>>>>>>>>
    await initializeActiveInboxes();

    // Try to authenticate Gmail client on startup
    try {
        await getAuthenticatedClient();
        console.log('✅ Gmail client authenticated successfully');
    } catch (error) {
        console.log('⚠️ Gmail authentication not ready. Run "node authorize.js" first.');
    }

    console.log('\n📋 Setup checklist:');
    console.log('1. ✅ Server started');
    console.log('2. 🔑 Run "node authorize.js" (if not done already)');
    console.log('3. 🌐 Start ngrok: "ngrok http 8001"');
    console.log('4. ⚙️ Update Pub/Sub subscription with ngrok URL');
    console.log('5. 👀 Run "node start-watch.js" to begin watching Gmail');
    console.log('6. 🧪 Test by sending emails to the temporary addresses!');
});