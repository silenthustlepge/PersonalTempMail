#!/bin/bash

# 🧪 Temp Mail Service Test Script
# Quick testing utility for the Real-Time Temporary Email Service

set -e

BASE_URL="http://localhost:8001/api"

echo "🧪 Testing Temp Mail Service API"
echo "================================"

# Test 1: Health Check
echo "1️⃣  Health Check"
echo "   GET /api/health"
HEALTH=$(curl -s "$BASE_URL/health")
echo "   Response: $HEALTH"
echo

# Test 2: Get New Address
echo "2️⃣  Get New Address"
echo "   GET /api/new-address"
ADDRESS_RESPONSE=$(curl -s "$BASE_URL/new-address")
ADDRESS=$(echo $ADDRESS_RESPONSE | jq -r '.address')
echo "   Generated: $ADDRESS"
echo

# Test 3: Check Empty Inbox
echo "3️⃣  Check Inbox (should be empty)"
echo "   GET /api/inbox/$ADDRESS"
INBOX=$(curl -s "$BASE_URL/inbox/$ADDRESS")
echo "   Inbox: $INBOX"
echo

# Test 4: List All Addresses
echo "4️⃣  List All Addresses"
echo "   GET /api/addresses"
curl -s "$BASE_URL/addresses" | jq '.[] | select(.address == "'$ADDRESS'")'
echo

# Test 5: Manual Email Test Instructions
echo "5️⃣  Manual Email Test"
echo "   📧 Send an email to: $ADDRESS"
echo "   📖 Instructions:"
echo "   1. Open your email client"
echo "   2. Send a test email to: $ADDRESS"
echo "   3. Check the inbox with: curl $BASE_URL/inbox/$ADDRESS"
echo "   4. Or use the web interface"
echo

# Test 6: Mark as Used
echo "6️⃣  Mark Address as Used"
echo "   POST /api/mark-used"
read -p "   Press Enter to retire this address..."
RETIRE_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"address\":\"$ADDRESS\"}" "$BASE_URL/mark-used")
echo "   Response: $RETIRE_RESPONSE"
echo

# Test 7: Verify Retirement
echo "7️⃣  Verify Address Retirement"
echo "   GET /api/addresses"
curl -s "$BASE_URL/addresses" | jq '.[] | select(.address == "'$ADDRESS'")'
echo

echo "✅ API Testing Complete!"
echo
echo "🌐 Frontend URL: https://83780a11-cc81-4c00-8ee4-e3e3f43967ce.preview.emergentagent.com"
echo "📚 For full setup instructions, see README.md"
echo
echo "🔧 Next Steps for Full Functionality:"
echo "1. Set up Google Cloud credentials (credentials.json)"
echo "2. Run: node authorize.js"
echo "3. Start ngrok: ngrok http 8001"
echo "4. Configure Pub/Sub subscription"
echo "5. Run: node start-watch.js"
echo "6. Test with real emails!"