import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import axios from 'axios';
// Simple normalization: just lowercases and trims the address
function normalizeEmailAddress(headerValue) {
    if (!headerValue) return '';
    const match = headerValue.match(/<(.+)>/);
    const email = match ? match[1] : headerValue;
    return email.trim().toLowerCase();
}

// Add ngrok-skip-browser-warning header to all axios requests
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';
// Set backend URL, fallback to ngrok if env is missing
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://primary-lemming-noble.ngrok-free.app';
const API = `${BACKEND_URL}/api`;
console.log('REACT_APP_BACKEND_URL:', process.env.REACT_APP_BACKEND_URL);
console.log('API base URL:', API);

function App() {
    const [currentAddress, setCurrentAddress] = useState('');
    const [inbox, setInbox] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [isPolling, setIsPolling] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);

    const intervalRef = useRef(null);

    // Function to fetch emails for the current address
    const fetchEmails = async (address) => {
        if (!address) return;
        console.log("[DEBUG] Fetching inbox for address:", address);
        try {
            const response = await axios.get(`${API}/inbox/${address}`);
            setInbox(response.data);
            setLastUpdate(new Date().toLocaleTimeString());
        } catch (err) {
            console.error("Failed to fetch emails:", err, err?.response);
            setError('Failed to fetch emails');
        }
    };

    useEffect(() => {
        // Clear interval on component unmount
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                setIsPolling(false);
            }
        };
    }, []);

    const startPolling = (address) => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        
        setIsPolling(true);
        
        // Initial fetch
        fetchEmails(address);
        
        // Set up polling every 5 seconds
        intervalRef.current = setInterval(() => {
            fetchEmails(address);
        }, 5000);
    };

    const stopPolling = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPolling(false);
    };

    const getNewAddress = async () => {
        setIsLoading(true);
        setError('');
        setInbox([]);
        setCurrentAddress('');
        setSelectedEmail(null);
        stopPolling();

        try {
            const response = await axios.get(`${API}/new-address`);
            console.log('DEBUG: /new-address response:', response);
            if (response && response.data) {
                console.log('DEBUG: response.data:', response.data);
            }
            const newAddress = response.data.address;
            console.log('[DEBUG] Received new address from API:', newAddress);
            if (!newAddress) {
                console.error('DEBUG: No address in response:', response.data);
                setError('No address returned from backend.');
                return;
            }
            setCurrentAddress(newAddress);
            startPolling(newAddress);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to get a new address.');
            console.error('Error getting new address:', err, err?.response);
            if (err.response) {
                console.error('DEBUG: Error response data:', err.response.data);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const markAsUsed = async () => {
        if (!currentAddress) return;

        const confirmRetire = window.confirm(
            `Are you sure you want to retire ${currentAddress}? This action cannot be undone.`
        );

        if (!confirmRetire) return;

        stopPolling();

        try {
            await axios.post(`${API}/mark-used`, { address: currentAddress });
            setCurrentAddress('');
            setInbox([]);
            setSelectedEmail(null);
            setError('');
            alert(`${currentAddress} has been retired successfully.`);
        } catch (err) {
            setError('Failed to retire address.');
            console.error('Error marking address as used:', err, err?.response);
        }
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(currentAddress);
            alert('Email address copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = currentAddress;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Email address copied to clipboard!');
        }
    };

    const refreshInbox = () => {
        if (currentAddress) {
            fetchEmails(currentAddress);
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    const sanitizeHtml = (html) => {
        // Basic HTML sanitization - in production, use a proper library like DOMPurify
        return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-800 mb-2">
                        📧 Temporary Email Service
                    </h1>
                    <p className="text-gray-600">
                        Get instant, disposable email addresses for your temporary needs
                    </p>
                </div>

                {/* Address Control Panel */}
                <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Your Temporary Email Address:
                        </label>
                        <div className="flex items-center space-x-3">
                            <div className="flex-1 bg-gray-50 border border-gray-300 rounded-md px-4 py-3 font-mono text-sm">
                                {currentAddress || "Click 'Get New Address' to start"}
                            </div>
                            <button
                                onClick={copyToClipboard}
                                disabled={!currentAddress}
                                className="bg-blue-500 text-white px-4 py-3 rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                            >
                                📋 Copy
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 mb-4">
                        <button
                            onClick={getNewAddress}
                            disabled={isLoading}
                            className="bg-green-500 text-white px-6 py-2 rounded-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                            {isLoading ? '⏳ Loading...' : '🆕 Get New Address'}
                        </button>
                        
                        <button
                            onClick={refreshInbox}
                            disabled={!currentAddress}
                            className="bg-blue-500 text-white px-6 py-2 rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                            🔄 Refresh Inbox
                        </button>
                        
                        <button
                            onClick={markAsUsed}
                            disabled={!currentAddress}
                            className="bg-red-500 text-white px-6 py-2 rounded-md hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                            🚫 Retire Address
                        </button>
                    </div>

                    {/* Status indicators */}
                    <div className="flex items-center space-x-4 text-sm">
                        {isPolling && (
                            <span className="flex items-center text-green-600">
                                <span className="animate-pulse w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                Auto-refreshing inbox
                            </span>
                        )}
                        {lastUpdate && (
                            <span className="text-gray-500">
                                Last updated: {lastUpdate}
                            </span>
                        )}
                    </div>

                    {error && (
                        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3">
                            <p className="text-red-600 text-sm">⚠️ {error}</p>
                        </div>
                    )}
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Inbox List */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg shadow-lg">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
                                <h2 className="text-lg font-semibold text-gray-800">
                                    📬 Inbox ({inbox.length})
                                </h2>
                            </div>
                            <div className="max-h-96 overflow-y-auto">
                                {inbox.length === 0 ? (
                                    <div className="p-6 text-center text-gray-500">
                                        <div className="text-4xl mb-2">📭</div>
                                        <p>No emails yet...</p>
                                        {currentAddress && (
                                            <p className="text-sm mt-2">
                                                Send an email to<br />
                                                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                                                    {currentAddress}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-200">
                                        {inbox.map((email, index) => (
                                            <div
                                                key={index}
                                                onClick={() => setSelectedEmail(email)}
                                                className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                                                    selectedEmail === email ? 'bg-blue-50 border-r-4 border-blue-500' : ''
                                                }`}
                                            >
                                                <div className="truncate font-medium text-gray-900 mb-1">
                                                    {email.subject}
                                                </div>
                                                <div className="truncate text-sm text-gray-600 mb-1">
                                                    From: {email.from}
                                                </div>
                                                <div className="text-xs text-gray-400">
                                                    {formatDate(email.date)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Email Viewer */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-lg shadow-lg h-full">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
                                <h2 className="text-lg font-semibold text-gray-800">
                                    📄 Email Content
                                </h2>
                            </div>
                            <div className="p-6">
                                {selectedEmail ? (
                                    <div className="space-y-4">
                                        <div className="bg-gray-50 p-4 rounded-md">
                                            <div className="grid grid-cols-1 gap-2 text-sm">
                                                <div>
                                                    <span className="font-medium text-gray-700">Subject:</span>
                                                    <span className="ml-2 text-gray-900">{selectedEmail.subject}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-700">From:</span>
                                                    <span className="ml-2 text-gray-900">{selectedEmail.from}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-700">Date:</span>
                                                    <span className="ml-2 text-gray-900">{formatDate(selectedEmail.date)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="border-t pt-4">
                                            <div 
                                                className="prose max-w-none text-gray-800"
                                                dangerouslySetInnerHTML={{ 
                                                    __html: sanitizeHtml(selectedEmail.body) 
                                                }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-500 py-12">
                                        <div className="text-4xl mb-4">📧</div>
                                        <p>Select an email from the inbox to view its content</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Instructions */}
                <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-blue-800 mb-3">📋 How to Use</h3>
                    <ol className="list-decimal list-inside space-y-2 text-blue-700">
                        <li>Click "Get New Address" to receive a temporary email address</li>
                        <li>Copy the address and use it for signups, downloads, or any temporary needs</li>
                        <li>Emails sent to this address will appear in the inbox automatically</li>
                        <li>Click on any email to view its full content</li>
                        <li>When done, click "Retire Address" to permanently disable it</li>
                    </ol>
                    <div className="mt-4 text-sm text-blue-600">
                        💡 <strong>Tip:</strong> Emails are received in real-time thanks to Google Cloud Pub/Sub integration!
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;