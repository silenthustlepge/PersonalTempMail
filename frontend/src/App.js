// App.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import './App.css';
import {
    apiClient,
    getNewAddress,
    checkAddress,
    retireAddress,
    fetchInbox
} from './services/api';
import { useEmergentAuth } from './hooks/useEmergentAuth';
import { useApiAction } from './hooks/useApiAction';
import { EmergentAuthModals } from './components/EmergentAuthModals';

function App() {
    // --- State ---
    const [currentAddress, setCurrentAddress] = useState('');
    const [addressToCheck, setAddressToCheck] = useState('');
    const [inbox, setInbox] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [showWelcome, setShowWelcome] = useState(true);
    const wsRef = useRef(null);
    const addressRef = useRef(currentAddress);
    const emergentAuth = useEmergentAuth(setSuccess);
    
    // Memoize the calculation of unique emails to prevent re-running on every render.
    // This improves performance, especially with a large inbox.
    const uniqueEmails = useMemo(() => {
        const seenIds = new Set();
        const unique = [];
        // Filter out emails without a subject and duplicates based on ID
        for (const email of inbox) {
            if (email.subject && email.subject !== '(no subject)' && !seenIds.has(email.id)) {
                seenIds.add(email.id);
                unique.push(email);
            }
        }
        return unique;
    }, [inbox]);

    // Keep a ref in sync with the currentAddress state
    useEffect(() => {
        addressRef.current = currentAddress;
    }, [currentAddress]);

    // --- WebSocket Real-Time Updates ---
    useEffect(() => {
        // This effect runs only once on component mount to establish the connection.
        let wsUrl = apiClient.defaults.baseURL.replace(/^http/, 'ws');
        wsUrl = wsUrl.replace(/\/ws$/, '/');
        if (!wsUrl.endsWith('/')) wsUrl += '/';

        const ws = new window.WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket connection established');
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                // Use the ref to access the latest currentAddress without re-triggering the effect
                if (msg.type === 'NEW_EMAIL' && msg.data && msg.data.address === addressRef.current) {
                    setInbox(prev => [msg.data, ...prev]);
                    setSuccess('New email received!');
                }
                if (msg.type === 'NEW_EMERGENT_LOGIN') {
                    setSuccess('A new emergent login was saved.');
                }
            } catch (e) { console.error('Error parsing WebSocket message:', e); }
        };

        ws.onerror = (error) => { console.error('WebSocket Error:', error); };
        ws.onclose = () => { console.log('WebSocket connection closed'); };

        return () => {
            ws.close();
        };
    }, []); // Empty dependency array ensures this runs only once.

    // --- Notification Auto-dismiss ---
    useEffect(() => {
        if (error || success) {
            const timer = setTimeout(() => {
                setError('');
                setSuccess('');
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [error, success]);

    const { execute: fetchEmails, isLoading: isInboxLoading } = useApiAction(fetchInbox, {
        onSuccess: (emails) => {
            setInbox(emails);
        },
        onError: setError,
    });

    // --- Core Logic ---
    const resetSession = () => {
        setInbox([]);
        setSelectedEmail(null);
        setError('');
        setSuccess('');
    };

    const { execute: doHandleGetNewAddress, isLoading: isGettingAddress } = useApiAction(getNewAddress, {
        onSuccess: (newAddress) => {
            if (!newAddress) {
                setError('No address returned from backend.');
                return;
            }
            setCurrentAddress(newAddress);
            setSuccess('New address generated!');
            fetchEmails(newAddress);
        },
        onError: setError,
    });

    const { execute: doHandleLoadAddress, isLoading: isLoadingAddress } = useApiAction(checkAddress, {
        onSuccess: (data, address) => {
            if (data.isValid) {
                setCurrentAddress(address);
                setSuccess('Address loaded!');
                fetchEmails(address);
            } else {
                setError('This is not a valid or active address from our service.');
                setCurrentAddress('');
            }
        },
        onError: setError,
    });

    const handleGetNewAddress = () => {
        resetSession();
        setCurrentAddress('');
        setAddressToCheck('');
        setShowWelcome(false);
        doHandleGetNewAddress();
    };

    const handleLoadAddress = () => {
        if (!addressToCheck) {
            setError('Please enter an address to load.');
            return;
        }
        resetSession();
        setShowWelcome(false);
        doHandleLoadAddress(addressToCheck);
    };

    const { execute: doHandleRetireAddress, isLoading: isRetiringAddress } = useApiAction(retireAddress, {
        onSuccess: () => {
            setSuccess('Address retired successfully.');
            if(currentAddress === addressToCheck) {
              setAddressToCheck('');
            }
            setCurrentAddress('');
            resetSession();
        },
        onError: setError,
    });

    const handleRetireAddress = () => {
        const confirmRetire = window.confirm(`Are you sure you want to retire ${currentAddress}? This action cannot be undone.`);
        if (confirmRetire) doHandleRetireAddress(currentAddress);
    };

    const handleCopyToClipboard = async () => {
        if (!currentAddress) return;
        await navigator.clipboard.writeText(currentAddress);
        setSuccess('Email address copied to clipboard!');
    };

    const handleRefreshInbox = () => {
        if (currentAddress && !isInboxLoading) fetchEmails(currentAddress);
    };

    // --- Helpers & Sanitization ---
    const formatDate = (dateString) => new Date(dateString).toLocaleString();
    const sanitizeHtml = (html) => DOMPurify.sanitize(html || '');

    // --- Render ---
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 flex flex-col">
            {/* Welcome Section */}
            {showWelcome && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-40">
                    <div className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full text-center">
                        <h1 className="text-3xl font-bold mb-2 text-indigo-700">Welcome to Temp Mail Service!</h1>
                        <p className="mb-4 text-gray-700">Get a disposable email address instantly. Generate a new one or check a previous address below.</p>
                        <button onClick={() => setShowWelcome(false)} className="mt-2 px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition">Get Started</button>
                    </div>
                </div>
            )}
            <EmergentAuthModals emergentAuth={emergentAuth} />
            <div className="container mx-auto px-4 py-8 flex-1">
            {/* Emergent Login Save & Check Group */}
            <div className="flex flex-wrap gap-4 justify-end mb-4">
                <button
                    className="bg-gray-800 text-white px-5 py-2 rounded-lg font-semibold shadow hover:bg-gray-900 transition"
                    onClick={() => emergentAuth.handlers.openSaveModal(currentAddress)}
                >
                    Emergent.sh Login Save
                </button>
                <button
                    className="bg-blue-700 text-white px-5 py-2 rounded-lg font-semibold shadow hover:bg-blue-800 transition"
                    onClick={emergentAuth.handlers.openCheckModal}
                >
                    Check Emergent Email
                </button>
            </div>
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold text-indigo-800 mb-2 tracking-tight drop-shadow">📧 Temp Mail Service</h1>
                    <p className="text-gray-700 text-lg">Instant, disposable email for signups, downloads, and more.</p>
                </div>

                {/* Control Panel */}
                <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 flex flex-col md:flex-row gap-8">
                    {/* Generate New Address */}
                    <div className="flex-1 flex flex-col items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">1. Generate New Address</h3>
                        <button onClick={handleGetNewAddress} disabled={isGettingAddress || isLoadingAddress} className="bg-green-500 text-white px-8 py-3 rounded-lg text-lg font-bold shadow hover:bg-green-600 disabled:bg-gray-300 transition-all w-full">
                            {isGettingAddress ? '⏳ Loading...' : '🆕 Generate Email'}
                        </button>
                        <span className="text-gray-500 text-xs mt-1">Click to get a fresh, unique email address.</span>
                    </div>
                    {/* Check Previous Address */}
                    <div className="flex-1 flex flex-col items-center gap-3 border-t md:border-t-0 md:border-l border-gray-200 pt-6 md:pt-0 md:pl-8">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">2. Check Previous Address</h3>
                        <div className="flex w-full gap-2">
                            <input type="email" value={addressToCheck} onChange={e => setAddressToCheck(e.target.value)} placeholder="Paste a previous address" className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 font-mono text-sm focus:ring-indigo-500 focus:border-indigo-500" disabled={isGettingAddress || isLoadingAddress}/>
                            <button onClick={handleLoadAddress} disabled={!addressToCheck || isGettingAddress || isLoadingAddress} className="bg-purple-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-purple-600 disabled:bg-gray-300 transition-all">{isLoadingAddress ? '⏳ Loading...' : '📥 Load'}</button>
                        </div>
                        <span className="text-gray-500 text-xs mt-1">Check inbox for a previously generated address.</span>
                    </div>
                </div>

                {/* Active Session Card */}
                {currentAddress && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-8 shadow flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1">
                            <div className="text-xs text-indigo-700 font-semibold mb-1">Active Address</div>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-base md:text-lg bg-white border border-indigo-200 rounded px-3 py-2 text-indigo-900 select-all shadow-inner">{currentAddress}</span>
                                <button onClick={handleCopyToClipboard} className="ml-2 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-medium text-sm shadow">📋 Copy</button>
                            </div>
                        </div>
                        <div className="flex flex-col md:flex-row gap-2 md:gap-4 mt-4 md:mt-0 items-center">
                            <button onClick={handleRefreshInbox} disabled={isGettingAddress || isLoadingAddress || isRetiringAddress || isInboxLoading} className="bg-blue-500 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-600 shadow disabled:bg-gray-300">{isInboxLoading ? '🔄 Refreshing...' : '🔄 Refresh'}</button>
                            <button onClick={handleRetireAddress} disabled={isGettingAddress || isLoadingAddress || isRetiringAddress} className="bg-red-500 text-white px-5 py-2 rounded-lg font-medium hover:bg-red-600 shadow disabled:bg-gray-300">{isRetiringAddress ? '🚫 Retiring...' : '🚫 Retire'}</button>
                            <span className="flex items-center text-green-600 text-xs ml-2 mt-2 md:mt-0"><span className="animate-pulse w-2 h-2 bg-green-500 rounded-full mr-2"></span>Real-time auto-refresh enabled</span>
                        </div>
                    </div>
                )}

                {/* Feedback Toasts */}
                {(error || success) && (
                    <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-lg shadow-lg text-white font-semibold text-base transition-all ${error ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ pointerEvents: 'none' }}>
                        {error || success}
                    </div>
                )}

                {/* Main Content Area: Inbox + Email Viewer */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Inbox List */}
                    <div className="lg:col-span-1 bg-white rounded-xl shadow-lg">
                        <div className="bg-indigo-100 px-4 py-3 border-b rounded-t-xl flex items-center gap-2">
                            <span className="text-xl">📬</span>
                            <h2 className="text-lg font-bold text-indigo-800">Inbox ({uniqueEmails.length})</h2>
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            {isInboxLoading ? (
                                <div className="flex justify-center items-center p-10">
                                    <div className="spinner"></div>
                                </div>
                            ) : (
                                uniqueEmails.length === 0 ? (
                                    <div className="p-6 text-center text-gray-500 flex flex-col items-center">
                                        <div className="text-5xl mb-2">📭</div>
                                        <p className="mb-2">
                                            {currentAddress
                                                ? 'No emails yet...'
                                                : 'Generate or load an address to see its inbox'}
                                        </p>
                                        {currentAddress && <span className="text-xs text-gray-400">Try sending an email to this address!</span>}
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-200">
                                        {uniqueEmails.map((email) => (
                                            <div key={email.id} onClick={() => setSelectedEmail(email)} className={`p-4 cursor-pointer hover:bg-indigo-50 transition-colors ${selectedEmail?.id === email.id ? 'bg-indigo-100 border-r-4 border-indigo-500' : ''}`}>
                                                <div className="truncate font-semibold text-indigo-900 mb-1">{email.subject}</div>
                                                <div className="truncate text-sm text-gray-700 mb-1">From: {email.from}</div>
                                                <div className="text-xs text-gray-400">{formatDate(email.date)}</div>
                                            </div>
                                        ))}
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                    {/* Email Viewer */}
                    <div className="lg:col-span-2 bg-white rounded-xl shadow-lg h-full">
                        <div className="bg-indigo-100 px-4 py-3 border-b rounded-t-xl flex items-center gap-2">
                            <span className="text-xl">📄</span>
                            <h2 className="text-lg font-bold text-indigo-800">Email Content</h2>
                        </div>
                        <div className="p-6">
                            {selectedEmail && selectedEmail.subject && selectedEmail.subject !== '(no subject)' ? (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 p-4 rounded-md">
                                        <div className="grid grid-cols-1 gap-2 text-sm">
                                            <div><span className="font-medium">Subject:</span> <span className="ml-2">{selectedEmail.subject}</span></div>
                                            <div><span className="font-medium">From:</span> <span className="ml-2">{selectedEmail.from}</span></div>
                                            <div><span className="font-medium">Date:</span> <span className="ml-2">{formatDate(selectedEmail.date)}</span></div>
                                        </div>
                                    </div>
                                    <div className="border-t pt-4">
                                        <div className="prose max-w-none" dangerouslySetInnerHTML={{__html: sanitizeHtml(selectedEmail.body)}} />
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center text-gray-500 py-12 flex flex-col items-center">
                                    <div className="text-5xl mb-4">📧</div>
                                    <p>Select an email from the inbox to view it</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {/* Footer */}
            <footer className="mt-12 py-6 bg-indigo-900 text-indigo-100 text-center text-sm">
                <div>💡 Tip: Use this service for signups, downloads, or any time you need a quick, disposable email. Emails are received in real-time!</div>
                <div className="mt-2">&copy; {new Date().getFullYear()} Temp Mail Service</div>
            </footer>
        </div>
    );
}

export default App;
