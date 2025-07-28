// server.js - Final Merged Version

// --- 1. REQUIRE MODULES ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');
const http = require('http');
const WebSocket = require('ws');

// --- 2. DEFINE CONSTANTS ---
const PORT = process.env.PORT || 8001; // Your server runs on port 8001
const EMAILS_FILE = path.join(__dirname, 'emails.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const STATE_PATH = path.join(__dirname, 'state.json'); // From old file, for robust sync
const EMERGENT_LOGINS_FILE = path.join(__dirname, 'emergent_logins.json');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// --- 3. INITIALIZE APP & WEBSOCKET SERVER ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- 4. APPLY MIDDLEWARE ---
app.use(cors({
  origin: (origin, callback) => {
    // Define allowed origins, including the production URL from .env and common dev URLs
    const allowedOrigins = [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:3001'];

    // Allow requests with no origin (like mobile apps or curl requests) and from the allowed list
    if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
    } else {
        callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// --- 5. WEBSOCKET LOGIC ---
function broadcast(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    console.log(`WebSocket broadcasted: ${data.type}`);
}


function handleWsConnection(ws, req) {
    const ip = req.socket.remoteAddress;
    console.log(`✅ WebSocket client connected from ${ip}`);
    ws.on('close', () => console.log(`❌ WebSocket client disconnected from ${ip}`));
    ws.on('error', (error) => console.error('WebSocket Error:', error));
    ws.send(JSON.stringify({ type: 'welcome', message: 'Connection to backend established!' }));
}
wss.on('connection', handleWsConnection);

// --- 6. IN-MEMORY STORAGE & CLIENTS ---
let receivedEmails = {};
let gmail;

// --- 7. HELPER FUNCTIONS ---
// (Combined from both files, no major changes needed here)

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
        throw new Error('Gmail auth failed. Run "node authorize.js".');
    }
}

async function loadEmails() {
    try {
        return JSON.parse(await fs.readFile(EMAILS_FILE, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

async function saveEmails(emails) {
    await fs.writeFile(EMAILS_FILE, JSON.stringify(emails, null, 2));
}

async function initializeActiveInboxes() {
    console.log('🔄 Initializing active inboxes...');
    const emails = await loadEmails();
    receivedEmails = {}; // Reset
    emails.filter(e => e.is_used === true).forEach(e => {
        if (e.address) receivedEmails[e.address] = [];
    });
    console.log(`✅ Re-initialized ${Object.keys(receivedEmails).length} active inboxes.`);
}

function parseMessageBody(payload) {
    if (!payload) return '';
    let body = '';

    if (payload.parts && payload.parts.length) {
        // For multipart messages, prefer the HTML part
        if (payload.mimeType === 'multipart/alternative') {
            const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
            if (htmlPart) {
                body = parseMessageBody(htmlPart);
                if (body) return body;
            }
        }
        // Fallback to iterating through all parts
        for (const part of payload.parts) { body = parseMessageBody(part); if (body) return body; }
    } else if (payload.body && payload.body.data) {
        return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    return '';
}
function parseHeader(headers, name) { const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase()); return header ? header.value : ''; }
function normalizeEmailAddress(headerValue) { if (!headerValue) return ''; const match = headerValue.match(/<(.+)>/); const email = match ? match[1] : headerValue; return email.trim().toLowerCase(); }

// --- 8. API ROUTES ---

// --- Core Temp Mail Routes ---
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// FIX: Changed route to match frontend service for better versioning practice
app.get('/api/v1/address/new', async (req, res) => {
    try {
        const emails = await loadEmails();
        const availableEmail = emails.find(e => e && !e.is_used);
        if (!availableEmail) {
            return res.status(404).json({ error: 'No available email addresses.' });
        }
        availableEmail.is_used = true;
        await saveEmails(emails);
        receivedEmails[availableEmail.address] = [];
        res.json({ address: availableEmail.address });
    } catch (error) { res.status(500).json({ error: 'Failed to get new address.' }); }
});

app.post('/api/check-address', async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: 'Address is required.' });
        const emails = await loadEmails();
        const emailRecord = emails.find(e => e.address?.toLowerCase() === address.toLowerCase() && e.is_used === true);
        res.json({ isValid: !!emailRecord });
    } catch (error) { res.status(500).json({ error: 'Failed to check address.' }); }
});

app.get('/api/inbox/:address', (req, res) => {
    const { address } = req.params;
    res.json(receivedEmails[address] || []);
});

// FIX: Renamed route for clarity and added logic to persist the retired state.
app.post('/api/retire-address', async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: 'Address is required.' });
        const emails = await loadEmails();
        const emailIndex = emails.findIndex(e => e.address?.toLowerCase() === address.toLowerCase());
        if (emailIndex === -1) return res.status(404).json({ error: 'Address not found.' });

        // Mark the address as no longer in use and save it back to the file system.
        // This ensures the retired state persists across server restarts.
        emails[emailIndex].is_used = false;
        await saveEmails(emails);

        // Also remove it from the active in-memory cache.
        delete receivedEmails[address];
        res.json({ message: 'Address retired successfully.' });
    } catch (error) { res.status(500).json({ error: 'Failed to save login.' }); }
});

// Save emergent login
app.post('/api/save-emergent-login', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required.' });
        let logins = [];
        try { logins = JSON.parse(await fs.readFile(EMERGENT_LOGINS_FILE, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        // Prevent duplicate emails
        if (logins.some(l => l.email && l.email.toLowerCase() === email.toLowerCase())) {
            return res.status(409).json({ error: 'Email already exists.' });
        }
        logins.push({ name, email, password, savedAt: new Date().toISOString() });
        await fs.writeFile(EMERGENT_LOGINS_FILE, JSON.stringify(logins, null, 2));
        broadcast({ type: 'NEW_EMERGENT_LOGIN', data: { name, email } });
        res.status(201).json({ message: 'Saved successfully!' });
    } catch (error) { res.status(500).json({ error: 'Failed to save login.' }); }
});

// Check emergent login email existence
app.post('/api/check-emergent-login', async (req, res) => {
    try {
        let { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });
        email = email.trim().toLowerCase();
        let logins = [];
        try { logins = JSON.parse(await fs.readFile(EMERGENT_LOGINS_FILE, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const login = logins.find(l => l.email && l.email.trim().toLowerCase() === email);
        const exists = !!login;
        console.log(`[EmergentLogin] Checking email: '${email}' | Exists: ${exists}`);
        res.json({ exists, login: exists ? login : null });
    } catch (error) { res.status(500).json({ error: 'Failed to check emergent login.' }); }
});

// --- THE ROBUST PUB/SUB WEBHOOK from the old file, with WebSocket integration ---
app.post('/webhook/pubsub-push', async (req, res) => {
    console.log('📬 Pub/Sub webhook called at', new Date().toISOString());
    res.status(204).send(); // Acknowledge immediately
    try {
        let state;
        try { state = JSON.parse(await fs.readFile(STATE_PATH, 'utf-8')); }
        catch (error) { console.error('CRITICAL: state.json missing. Run start-watch.js'); return; }

        const gmailClient = await getAuthenticatedClient();
        const historyResponse = await gmailClient.users.history.list({
            userId: 'me', startHistoryId: state.lastHistoryId, historyTypes: ['messageAdded'],
        });

        const history = historyResponse.data.history;
        if (!history || history.length === 0) {
            console.log('No new Gmail history records.');
            return;
        }

        for (const record of history) {
            if (!record.messagesAdded) continue;
            for (const msgAdded of record.messagesAdded) {
                const messageId = msgAdded.message.id;
                let msgResponse;
                try {
                    msgResponse = await gmailClient.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
                } catch (err) {
                    if (err.code === 404) {
                        console.warn(`(Draft?) Message not found (ID: ${messageId}), likely deleted. Skipping.`);
                        continue;
                    }
                    throw err;
                }

                // --- THE DEFINITIVE FIX: Only process messages in the INBOX ---
                if (!msgResponse.data.labelIds || !msgResponse.data.labelIds.includes('INBOX')) {
                    console.log(`Skipping message (ID: ${messageId}) because it's not in the INBOX. Labels: ${msgResponse.data.labelIds ? msgResponse.data.labelIds.join(', ') : 'none'}`);
                    continue;
                }
                // --- END OF FIX ---

                const { payload } = msgResponse.data;
                const targetAddress = normalizeEmailAddress(parseHeader(payload.headers, 'Delivered-To') || parseHeader(payload.headers, 'To'));

                if (receivedEmails.hasOwnProperty(targetAddress)) {
                    // Idempotency check: prevent duplicates from Pub/Sub retries
                    const emailAlreadyExists = receivedEmails[targetAddress].some(email => email.id === messageId);
                    if (emailAlreadyExists) {
                        console.log(`Duplicate INBOX message (ID: ${messageId}) detected. Skipping.`);
                        continue;
                    }

                    const subject = parseHeader(payload.headers, 'Subject') || '(no subject)';
                    const emailData = {
                        id: messageId,
                        from: parseHeader(payload.headers, 'From'),
                        subject,
                        body: parseMessageBody(payload),
                        date: parseHeader(payload.headers, 'Date'),
                        address: targetAddress
                    };

                    receivedEmails[targetAddress].unshift(emailData);
                    console.log(`✅ Broadcasting INBOX email for ${targetAddress} with subject: "${subject}"`);
                    broadcast({ type: 'NEW_EMAIL', data: emailData });
                } else {
                    console.log(`Email for ${targetAddress} received but address is not active.`);
                }
            }
        }
        await fs.writeFile(STATE_PATH, JSON.stringify({ lastHistoryId: historyResponse.data.historyId }, null, 2));
    } catch (error) {
        console.error('FATAL Error in Pub/Sub sync:', error);
    }
});

// --- 9. ERROR HANDLING ---
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// --- 10. START THE SERVER ---
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Temp Mail Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket Server also available on ws://localhost:${PORT}`);
    
    await initializeActiveInboxes();
    try {
        await getAuthenticatedClient();
        console.log('✅ Gmail client authenticated successfully');
    } catch (error) {
        console.error(error.message);
    }
    console.log('✅ Server is ready.');
});
