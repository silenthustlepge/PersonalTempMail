# 🚀 Real-Time Temporary Email Service

A modern web application that provides instant, disposable email addresses using Google Cloud Pub/Sub for real-time email notifications.

## ✨ Features

- **Real-time Email Reception**: Instant notifications via Google Cloud Pub/Sub
- **Disposable Addresses**: Generate temporary email addresses with Gmail aliases
- **Live Inbox**: Auto-refreshing inbox with real-time email display
- **Professional UI**: Modern React interface with Tailwind CSS
- **Email Management**: View, read, and retire email addresses
- **Gmail Integration**: Uses Gmail API for reliable email handling

## 🏗️ Architecture

```
Email → Gmail Inbox → Gmail API Watch → Pub/Sub Topic → Push Subscription → Webhook → Node.js Server → React UI
```

The system uses Gmail's `watch()` API to monitor incoming emails, which triggers Google Cloud Pub/Sub notifications that are instantly pushed to our webhook endpoint.

## 🛠️ Technology Stack

- **Backend**: Node.js + Express.js
- **Frontend**: React 19 + Tailwind CSS
- **APIs**: Gmail API, Google Cloud Pub/Sub API
- **Authentication**: OAuth2 with Google
- **Real-time**: Pub/Sub push notifications + frontend polling

## 📋 Prerequisites

Before setting up this application, you need:

1. **Google Cloud Platform Account**
2. **Gmail Account** (to receive emails)
3. **Node.js** (v16 or higher)
4. **ngrok** (for local webhook testing)

## 🚀 Setup Instructions

### Phase 1: Google Cloud Platform Setup

#### 1. Create GCP Project and Enable APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "temp-mail-service")
3. Note your **Project ID** (you'll need this later)
4. Go to "APIs & Services" → "Library"
5. Search and **enable** these APIs:
   - **Gmail API**
   - **Cloud Pub/Sub API**

#### 2. Create Pub/Sub Topic

1. In Google Cloud Console, go to "Pub/Sub" → "Topics"
2. Click "Create Topic"
3. Enter Topic ID: `gmail-push-notifications`
4. Keep other settings as default and create

#### 3. Create OAuth2 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Select "Web application"
4. Add these authorized redirect URIs:
   - `http://localhost:8001/oauth2callback`
   - `https://developers.google.com/oauthplayground`
5. Click "Create" and **download the JSON file**
6. Rename it to `credentials.json` and place in `/app/backend/`

⚠️ **IMPORTANT**: Keep `credentials.json` secure and never commit it to version control!

#### 4. Grant Gmail Publish Permissions

This critical step allows Gmail to publish to your Pub/Sub topic:

```bash
# Using gcloud CLI (install if needed: https://cloud.google.com/sdk/docs/install)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
    --role=roles/pubsub.publisher
```

Replace `YOUR_PROJECT_ID` with your actual Google Cloud Project ID.

### Phase 2: Application Configuration

#### 1. Update Environment Variables

Edit `/app/backend/.env`:
```env
GCP_PROJECT_ID=your-actual-project-id-here
PUB_SUB_TOPIC_ID=gmail-push-notifications
PORT=8001
NODE_ENV=development
```

#### 2. Update Email Aliases

Edit `/app/backend/emails.json` to use your actual Gmail address:
```json
[
  { "address": "youremail+alias1@gmail.com", "is_used": false },
  { "address": "youremail+alias2@gmail.com", "is_used": false },
  { "address": "youremail+shopping@gmail.com", "is_used": false }
]
```

Replace `youremail@gmail.com` with your actual Gmail address.

### Phase 3: Authentication & Authorization

#### 1. Authorize Gmail Access

```bash
cd /app/backend
node authorize.js
```

This will:
- Open a browser window for Google OAuth
- Ask you to sign in to your Gmail account
- Request permissions to read your emails
- Generate `tokens.json` with refresh tokens

#### 2. Set Up Gmail Watching

```bash
node start-watch.js
```

This tells Gmail to start sending notifications to your Pub/Sub topic when new emails arrive.

### Phase 4: Webhook Configuration

#### 1. Install and Start ngrok

```bash
# Install ngrok (if not already installed)
# Visit: https://ngrok.com/download

# Start ngrok tunnel
ngrok http 8001
```

Note the HTTPS URL (e.g., `https://abc123.ngrok.io`)

#### 2. Create Pub/Sub Subscription

1. In Google Cloud Console, go to "Pub/Sub" → "Subscriptions"
2. Click "Create Subscription"
3. Enter Subscription ID: `gmail-push-subscription`
4. Select your topic: `gmail-push-notifications`
5. **Delivery Type**: Choose "Push"
6. **Endpoint URL**: `https://your-ngrok-url.ngrok.io/webhook/pubsub-push`
7. Leave other settings as default and create

### Phase 5: Start the Application

#### 1. Start the Services

The services should already be running via supervisor, but you can restart them:

```bash
sudo supervisorctl restart all
```

#### 2. Verify Everything is Running

```bash
# Check service status
sudo supervisorctl status

# Test the API
curl http://localhost:8001/api/health

# Check backend logs
tail -f /var/log/supervisor/backend.out.log
```

#### 3. Access the Application

Open your browser and go to:
- **Frontend**: https://83780a11-cc81-4c00-8ee4-e3e3f43967ce.preview.emergentagent.com
- **Backend API**: https://83780a11-cc81-4c00-8ee4-e3e3f43967ce.preview.emergentagent.com/api

## 🧪 Testing the System

### End-to-End Test

1. **Open the web application**
2. **Click "Get New Address"** - you should see a temporary email address
3. **Copy the address** and send a test email to it from another account
4. **Watch the backend logs** - you should see the webhook notification
5. **Check the UI** - the email should appear in the inbox within seconds
6. **Click on the email** to view its content
7. **Click "Retire Address"** when done

### Troubleshooting

#### Backend Not Starting
```bash
# Check Node.js dependencies
cd /app/backend && npm install

# Check logs for errors
tail -n 50 /var/log/supervisor/backend.err.log
```

#### No Emails Received
1. Verify Gmail watch is active: `node start-watch.js`
2. Check Pub/Sub subscription endpoint URL
3. Ensure ngrok is running and URL is correct
4. Verify Gmail publish permissions

#### Authentication Errors
1. Re-run authorization: `node authorize.js`
2. Check `credentials.json` exists and is valid
3. Verify OAuth redirect URIs in Google Cloud Console

## 📊 API Endpoints

### Core Endpoints

- `GET /api/health` - Health check
- `GET /api/new-address` - Get available temporary address
- `POST /api/mark-used` - Retire an address
- `GET /api/inbox/:address` - Get emails for address
- `GET /api/addresses` - List all addresses (debug)

### Webhook

- `POST /webhook/pubsub-push` - Pub/Sub notification endpoint

## 🔒 Security Notes

- `credentials.json` and `tokens.json` contain sensitive data
- Use HTTPS in production
- Implement rate limiting for production use
- Consider implementing email content sanitization
- The Gmail watch expires every 7 days - set up a cron job to renew

## 🚀 Production Deployment

For production deployment:

1. **Deploy to a cloud service** (Heroku, DigitalOcean, Google App Engine)
2. **Update Pub/Sub subscription** with your production webhook URL
3. **Set up SSL/TLS certificates**
4. **Implement monitoring and logging**
5. **Set up automated Gmail watch renewal**
6. **Add rate limiting and security headers**
7. **Use a proper database** instead of JSON file storage

## 📝 License

MIT License - feel free to use this project as a starting point for your own applications!

---

**🎉 Congratulations!** You now have a fully functional real-time temporary email service powered by Google Cloud Pub/Sub!
