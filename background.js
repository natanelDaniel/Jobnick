// Background service worker for Jobnick extension
import { JobnickAI } from './ai_agent.js';

class BackgroundManager {
    constructor() {
        this.isAutomationRunning = false;
        this.currentJobIndex = 0;
        this.jobList = [];
        this.settings = {};
        this.aiAgent = null;
        this.init();
    }

    init() {
        this.setupMessageListeners();
        this.loadSavedSettings();
        this.setupPeriodicChecks();
        this.initializeAIAgent();
        this.loadPersistedGeminiKey();
        this.setupTabUpdateListener();
    }

    setupTabUpdateListener() {
        // Ensure content script is injected when tabs are updated/loaded
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
            // Only inject when page is completely loaded
            if (changeInfo.status === 'complete' && tab.url && 
                !tab.url.startsWith('chrome://') && 
                !tab.url.startsWith('chrome-extension://') &&
                !tab.url.startsWith('moz-extension://') &&
                !tab.url.startsWith('edge://')) {
                
                try {
                    // Try to ping existing content script first
                    const pingResult = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
                    if (pingResult?.ready) {
                        return; // Content script is already working
                    }
                } catch (_) {
                    // Content script not available, inject it
                }
                
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId, allFrames: true },
                        files: ['ai_agent.js', 'content.js', 'simple-popup.js', 'popup.js', 'background.js', 'settings.js']
                    });
                    console.log(`Content script injected for tab ${tabId}: ${tab.url}`);
                } catch (error) {
                    // Some sites block injection, that's expected
                    if (!error.message?.includes('Cannot access')) {
                        console.warn(`Failed to inject content script for tab ${tabId}:`, error.message);
                    }
                }
            }
        });
    }

    async loadPersistedGeminiKey() {
        try {
            let geminiApiKey = '';
            
            // Try sync storage first
            const sync = await chrome.storage.sync.get(['geminiApiKey', 'aiAgent']);
            geminiApiKey = sync?.geminiApiKey?.trim() 
                || sync?.aiAgent?.geminiApiKey?.trim() 
                || '';
                
            // Fallback to local storage
            if (!geminiApiKey) {
                const local = await chrome.storage.local.get(['geminiApiKey', 'aiAgent']);
                geminiApiKey = local?.geminiApiKey?.trim() 
                    || local?.aiAgent?.geminiApiKey?.trim() 
                    || '';
                // Migrate to sync if found in local
                if (geminiApiKey) { 
                    try { await chrome.storage.sync.set({ geminiApiKey }); } catch(_) {} 
                }
            }
            
            if (geminiApiKey && this.aiAgent) {
                await this.aiAgent.setGeminiApiKey(geminiApiKey);
            }
        } catch (e) {
            console.warn('Failed to load persisted Gemini key', e);
        }
    }

    initializeAIAgent() {
        try {
            this.aiAgent = new JobnickAI();
            console.log('AI Agent initialized successfully');
        } catch (error) {
            console.error('Error initializing AI Agent:', error);
        }
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });

        // React to key changes from any context
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'sync' && area !== 'local') return;
            const keyFromFlat = changes.geminiApiKey?.newValue;
            const keyFromObj = changes.aiAgent?.newValue?.geminiApiKey;
            const newKey = (typeof keyFromFlat === 'string' && keyFromFlat.trim()) || (typeof keyFromObj === 'string' && keyFromObj.trim()) || '';
            if (newKey && this.aiAgent) {
                this.aiAgent.setGeminiApiKey(newKey);
            }
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'startAutomation':
                    await this.startAutomation(message.settings);
                    sendResponse({ success: true });
                    break;
                    
                case 'stopAutomation':
                    await this.stopAutomation();
                    sendResponse({ success: true });
                    break;
                    
                case 'getJobList':
                    const jobList = await this.getJobList();
                    sendResponse({ success: true, jobList });
                    break;
                    
                case 'applyToJob':
                    const result = await this.applyToJob(message.jobId);
                    sendResponse({ success: true, result });
                    break;
                    
                case 'updateStatus':
                    await this.updateStatus(message.status);
                    sendResponse({ success: true });
                    break;

                case 'startAIJobSearch':
                    if (this.aiAgent) {
                        await this.aiAgent.startAIJobSearch(message.settings);
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: 'AI Agent not loaded' });
                    }
                    break;

                case 'stopAIJobSearch':
                    if (this.aiAgent) {
                        await this.aiAgent.stopAIJobSearch();
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: 'AI Agent not loaded' });
                    }
                    break;

                case 'analyzeJobWithAI':
                    if (this.aiAgent) {
                        const analysis = await this.aiAgent.analyzeJobWithAI(message.jobData);
                        sendResponse({ success: true, analysis });
                    } else {
                        sendResponse({ success: false, error: 'AI Agent not loaded' });
                    }
                    break;

                case 'setGeminiApiKey':
                    if (this.aiAgent) {
                        await this.aiAgent.setGeminiApiKey(message.apiKey);
                        try { await chrome.storage.sync.set({ geminiApiKey: message.apiKey }); } catch(_){}
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: 'AI Agent not loaded' });
                    }
                    break;

                case 'updateAIStatus':
                    // Do not re-forward back to the AI agent to avoid duplicate logs
                    // Simply acknowledge; popup listens directly to messages
                    sendResponse({ success: true });
                    break;
                case 'fetchUrlHTML': 
                    try {
                        // const response = await fetch(url);
                        // const html = await response.text();
                        const resp = await fetch(message.url, { method: 'GET', redirect: 'follow' });
                        const html = await resp.text();
                        sendResponse({
                        success: true,
                        status: resp.status,
                        finalUrl: resp.url,
                        html
                        });
                    } catch (e) {
                        sendResponse({ success: false, error: e?.message || 'Fetch failed' });
                    }
                    break;
                case 'extractAllText':
                    try {
                        // הסר רעש
                        document.querySelectorAll('script,style,template,noscript,svg,iframe')
                          .forEach(el => el.remove());
                        const text = (document.querySelector('main')?.innerText || document.body.innerText || '').trim();
                        sendResponse({ success: true, text, html: document.documentElement.outerHTML });
                      } catch (e) {
                        sendResponse({ success: false, error: String(e) });
                      }
                    break;
                case 'extractCtrlAText':
                    try {
                        // איפה לעשות Select All? עדיף main, ואם אין – כל ה-body
                        const root = document.querySelector('main') || document.body;
                    
                        // שמירת בחירה פעילה כדי להחזיר אחר כך
                        const sel = window.getSelection();
                        const saved = [];
                        for (let i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i));
                    
                        // בחירה "כמו Ctrl+A" ומיצוי הטקסט
                        sel.removeAllRanges();
                        const range = document.createRange();
                        range.selectNodeContents(root);
                        sel.addRange(range);
                        let text = sel.toString();
                    
                        // אם מסיבה כלשהי יצא ריק, פולבק ל-innerText (קרוב מאוד ל-Ctrl+A)
                        if (!text) text = (root.innerText || '').trim();
                    
                        // ניקוי והחזרת הבחירה המקורית
                        sel.removeAllRanges();
                        saved.forEach(r => sel.addRange(r));
                    
                        sendResponse({ success: true, text });
                        } catch (e) {
                        sendResponse({ success: false, error: String(e) });
                        }
                        break;
                case 'generateAIAnswer':
                    const answer = await this.generateAIAnswer(message.question, message.resumeData);
                    sendResponse({ success: true, answer });
                    break;
                case 'ping':
                    sendResponse({ success: true, aiAgentLoaded: !!this.aiAgent });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action 2' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async loadSavedSettings() {
        try {
            const result = await chrome.storage.sync.get(['automation', 'profile', 'preferences']);
            this.settings = result.automation || {};
            
            if (result.automation && result.automation.isRunning) {
                // Resume automation if it was running
                this.startAutomation(this.settings);
            }
        } catch (error) {
            console.error('Error loading saved settings:', error);
        }
    }

    async startAutomation(settings) {
        if (this.isAutomationRunning) {
            console.log('Automation is already running');
            return;
        }

        this.settings = settings;
        this.isAutomationRunning = true;
        this.currentJobIndex = 0;
        
        console.log('Starting automation with settings:', settings);
        
        // Save automation state
        await chrome.storage.sync.set({
            automation: { ...settings, isRunning: true }
        });

        // Start the automation loop
        this.automationLoop();
    }

    async stopAutomation() {
        this.isAutomationRunning = false;
        console.log('Stopping automation');
        
        // Save automation state
        await chrome.storage.sync.set({
            automation: { ...this.settings, isRunning: false }
        });
    }

    // --- AI answer, single source of truth ---
    async generateAIAnswer({ question, resumeData }) {
        const { aiAgent } = await chrome.storage.sync.get('aiAgent');
        const geminiApiKey = aiAgent?.geminiApiKey || '';
        if (!geminiApiKey) return { success: false, error: 'Missing Gemini API key' };
    
        const prompt = `
    You are a professional job application assistant.
    QUESTION: "${question}"
    
    RESUME:
    ${resumeData}
    
    Write a concise, professional answer (100-300 words). Use the question's language. Only the answer text.
        `.trim();
    
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
    
        if (!resp.ok) return { success: false, error: `Gemini HTTP ${resp.status}` };
        const data = await resp.json();
        const answer = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        return { success: !!answer, answer: answer || null };
    }

    async automationLoop() {
        while (this.isAutomationRunning) {
            try {
                // Check if we've reached the daily limit
                const dailyCount = await this.getDailyApplicationCount();
                if (dailyCount >= this.settings.maxApplications) {
                    console.log('Daily application limit reached');
                    await this.stopAutomation();
                    break;
                }

                // Get next job to process
                const job = await this.getNextJob();
                if (!job) {
                    console.log('No more jobs to process');
                    await this.delay(60000); // Wait 1 minute before checking again
                    continue;
                }

                // Process the job
                await this.processJob(job);
                
                // Wait before processing next job
                await this.delay(this.settings.applyDelay * 1000);
                
            } catch (error) {
                console.error('Error in automation loop:', error);
                await this.delay(30000); // Wait 30 seconds on error
            }
        }
    }

    async getNextJob() {
        try {
            // Get current active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) return null;

            const tab = tabs[0];
            if (!tab.url.includes('linkedin.com/jobs')) {
                console.log('Not on LinkedIn jobs page');
                return null;
            }

            // Send message to content script to get next job
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getNextJob' });
            return response.job;
        } catch (error) {
            console.error('Error getting next job:', error);
            return null;
        }
    }

    async processJob(job) {
        try {
            console.log('Processing job:', job.title);
            
            // Update status
            await this.updateStatus(`Processing: ${job.title}`);
            
            // Send application to the job
            const result = await this.applyToJob(job);
            
            if (result.success) {
                // Increment daily count
                await this.incrementDailyApplicationCount();
                console.log('Successfully applied to job:', job.title);
            } else {
                console.log('Failed to apply to job:', job.title, result.error);
            }
            
        } catch (error) {
            console.error('Error processing job:', error);
        }
    }

    async applyToJob(job) {
        try {
            // Get current active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found');
            }

            const tab = tabs[0];
            
            // Send application request to content script
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'applyToJob',
                job: job
            });
            
            return response;
        } catch (error) {
            console.error('Error applying to job:', error);
            return { success: false, error: error.message };
        }
    }

    async getDailyApplicationCount() {
        try {
            const result = await chrome.storage.local.get('applicationCount');
            return result.applicationCount || 0;
        } catch (error) {
            console.error('Error getting daily application count:', error);
            return 0;
        }
    }

    async incrementDailyApplicationCount() {
        try {
            const currentCount = await this.getDailyApplicationCount();
            await chrome.storage.local.set({ applicationCount: currentCount + 1 });
        } catch (error) {
            console.error('Error incrementing daily application count:', error);
        }
    }

    async updateStatus(status) {
        try {
            await chrome.storage.local.set({ currentStatus: status });
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    async getJobList() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) return [];

            const tab = tabs[0];
            if (!tab.url.includes('linkedin.com/jobs')) return [];

            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getJobList' });
            return response.jobList || [];
        } catch (error) {
            console.error('Error getting job list:', error);
            return [];
        }
    }

    setupPeriodicChecks() {
        // Check for new jobs every 5 minutes
        setInterval(async () => {
            if (this.isAutomationRunning) {
                // Reset daily count at midnight
                const now = new Date();
                if (now.getHours() === 0 && now.getMinutes() === 0) {
                    await chrome.storage.local.set({ applicationCount: 0 });
                }
            }
        }, 300000); // 5 minutes
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize background manager
const backgroundManager = new BackgroundManager();

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log('Jobnick extension installed');
        // Set default values
        chrome.storage.sync.set({
            automation: {
                applyDelay: 30,
                maxApplications: 10,
                autoApply: false,
                isRunning: false
            }
        });
    }
    // Migrate geminiApiKey from local to sync if needed
    try {
        const sync = await chrome.storage.sync.get(['geminiApiKey', 'aiAgent']);
        let syncKey = sync?.geminiApiKey?.trim() || sync?.aiAgent?.geminiApiKey?.trim() || '';
        
        if (!syncKey) {
            const local = await chrome.storage.local.get(['geminiApiKey', 'aiAgent']);
            const localKey = local?.geminiApiKey?.trim() || local?.aiAgent?.geminiApiKey?.trim() || '';
            if (localKey) {
                await chrome.storage.sync.set({ geminiApiKey: localKey });
            }
        }
    } catch(_) {}
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Jobnick extension started');
    backgroundManager.loadSavedSettings();
}); 