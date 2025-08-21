// AI Agent for Jobnick - Powered by Gemini
export class JobnickAI {
    constructor() {
        this.geminiApiKey = null;
        this.profile = null;
        this.preferences = null;
        this.isRunning = false;
        this.currentJob = null;
        this.jobQueue = [];
        this.processedJobLinks = new Set();
        this.currentJobSearchTabId = null;
        this.jobSearchTabs = new Map(); // Track multiple job search tabs
        this.userOriginalTab = null; // Save user's original tab
        this.startTime = Date.now(); // Track when the system started
        this.lastActivity = null; // Track last activity
        this.init();
    }

    async init() {
        await this.loadProfileAndPreferences();
        await this.loadGeminiApiKey();
        await this.loadProcessedJobs();
        this.setupMessageListeners();
        this.setupTabEventListeners();
    }

    setupTabEventListeners() {
        try {
            // Listen for tab removal events to clean up tracking
            chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
                this.removeJobSearchTab(tabId);
            });
            
            // Listen for tab updates to track URL changes
            chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
                if (changeInfo.status === 'complete' && tab.url) {
                    // Check if this is a tracked job search tab
                    if (this.jobSearchTabs.has(tabId)) {
                        const tabInfo = this.jobSearchTabs.get(tabId);
                        if (tabInfo.url !== tab.url) {
                            // URL changed, update tracking
                            tabInfo.url = tab.url;
                            tabInfo.lastActivity = Date.now();
                            
                            // Update status based on URL
                            if (tab.url.includes('linkedin.com/jobs')) {
                                tabInfo.status = 'ready';
                            } else {
                                tabInfo.status = 'navigated_away';
                            }
                            
                            console.log(`AI Agent: Tab ${tabId} URL updated to: ${tab.url}`);
                        }
                    }
                }
            });
            
            console.log('AI Agent: Tab event listeners set up successfully');
        } catch (error) {
            console.error('AI Agent: Error setting up tab event listeners:', error);
        }
    }

    async loadProfileAndPreferences() {
        try {
            const result = await chrome.storage.sync.get(['profile', 'preferences']);
            this.profile = result.profile || {};
            this.preferences = result.preferences || {};
        } catch (error) {
            console.error('Error loading profile and preferences:', error);
        }
    }

    async loadGeminiApiKey() {
        try {
            // Try sync storage first
            const sync = await chrome.storage.sync.get(['geminiApiKey', 'aiAgent']);
            let apiKey = sync?.geminiApiKey?.trim() 
                || sync?.aiAgent?.geminiApiKey?.trim() 
                || '';
                
            // Fallback to local storage
            if (!apiKey) {
                const local = await chrome.storage.local.get(['geminiApiKey', 'aiAgent']);
                apiKey = local?.geminiApiKey?.trim() 
                    || local?.aiAgent?.geminiApiKey?.trim() 
                    || '';
            }
            
            this.geminiApiKey = apiKey;
        } catch (error) {
            console.error('Error loading Gemini API key:', error);
        }
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });
    }

    async forceNewJobSearchTab() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Force creating new job search tab...');
            await this.updateStatus('Force creating new job search tab...', 'info');
            
            // Create a new tab regardless of current state
            const newTab = await this.createJobSearchTab();
            
            // Update status to indicate this is a forced new tab
            await this.updateJobSearchTabStatus(newTab.id, 'forced_new', true);
            
            console.log(`AI Agent: New job search tab created with ID: ${newTab.id}`);
            await this.updateStatus('New job search tab created and ready', 'success');
            
            return newTab;
        } catch (error) {
            console.error('AI Agent: Error force creating new job search tab:', error);
            await this.updateStatus(`Error creating new tab: ${error.message}`, 'error');
            throw error;
        }
    }

    async cleanupJobSearchTabs() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Cleaning up job search tabs...');
            await this.updateStatus('Cleaning up job search tabs...', 'info');
            
            const tabsToRemove = [];
            const currentTime = Date.now();
            const maxAge = 30 * 60 * 1000; // 30 minutes
            
            for (const [tabId, info] of this.jobSearchTabs) {
                const age = currentTime - info.lastActivity;
                if (age > maxAge) {
                    tabsToRemove.push(tabId);
                }
            }
            
            for (const tabId of tabsToRemove) {
                try {
                    // Try to close the tab
                    await chrome.tabs.remove(tabId);
                    console.log(`AI Agent: Closed old job search tab ${tabId}`);
                } catch (error) {
                    console.log(`AI Agent: Could not close tab ${tabId}, removing from tracking: ${error.message}`);
                }
                
                // Remove from tracking
                await this.removeJobSearchTab(tabId);
            }
            
            if (tabsToRemove.length > 0) {
                console.log(`AI Agent: Cleaned up ${tabsToRemove.length} old job search tabs`);
                await this.updateStatus(`Cleaned up ${tabsToRemove.length} old tabs`, 'success');
            } else {
                console.log('AI Agent: No old tabs to clean up');
                await this.updateStatus('No old tabs to clean up', 'info');
            }
            
            return tabsToRemove.length;
        } catch (error) {
            console.error('AI Agent: Error cleaning up job search tabs:', error);
            await this.updateStatus(`Error cleaning up tabs: ${error.message}`, 'error');
            return 0;
        }
    }

    async performJobSearchWithChoice(forceNewTab = false) {
        try {
            this.updateLastActivity();
            console.log(`AI Agent: Performing job search with choice - forceNewTab: ${forceNewTab}`);
            await this.updateStatus(`Performing job search ${forceNewTab ? 'in new tab' : 'in existing tab'}...`, 'info');
            
            // Get user preferences for search
            const preferences = this.preferences;
            const searchQuery = preferences.jobTitles || preferences.keywords || 'software engineer';
            const location = preferences.locationPreference || preferences.location || '';
            const experienceFilters = Array.isArray(preferences.experienceFilters) ? preferences.experienceFilters : [];
            const datePosted = preferences.datePosted || 'any';
            const jobTypeFilters = Array.isArray(preferences.jobTypeFilters) ? preferences.jobTypeFilters : [];
            
            console.log(`AI Agent: Searching for: "${searchQuery}" in "${location}"`);
            await this.updateStatus(`Searching for: "${searchQuery}" in "${location}"`, 'info');
            
            let targetTab;
            
            if (forceNewTab) {
                // Force create a new tab
                targetTab = await this.createJobSearchTab();
                console.log('AI Agent: Created new tab for job search (forced)');
            } else {
                // Check if we already have a job search tab, if not create one
                if (this.jobSearchTabs.size === 0) {
                    // First time - create new tab
                    console.log('AI Agent: First time search - creating new tab');
                    targetTab = await this.createJobSearchTab();
                } else {
                    // Reuse existing tab
                    const existingTabId = this.currentJobSearchTabId || Array.from(this.jobSearchTabs.keys())[0];
                    targetTab = await chrome.tabs.get(existingTabId);
                    console.log(`AI Agent: Reusing existing tab for job search: ${targetTab.id}`);
                }
            }
            
            // Prepare search data
            const searchData = {
                query: searchQuery,
                location: location,
                experienceFilters: experienceFilters,
                datePosted: datePosted,
                jobTypeFilters: jobTypeFilters
            };
            
            console.log('AI Agent: Sending search request with data:', searchData);
            await this.updateStatus('Sending search request...', 'info');
            
            // Send search request to content script
            const response = await chrome.tabs.sendMessage(targetTab.id, {
                action: 'performJobSearch',
                searchData: searchData
            });
            
            if (response && response.success) {
                console.log('AI Agent: Job search performed successfully');
                await this.updateStatus('Job search completed, waiting for results...', 'success');
                
                // Wait for search results to load
                console.log('AI Agent: Waiting for search results to load...');
                await this.updateStatus('Waiting for search results...', 'info');
                await this.delay(10000); // Wait 10 seconds for results
                
                // Verify we have results
                const resultsCheck = await chrome.tabs.sendMessage(targetTab.id, { 
                    action: 'extractJobListings' 
                });
                
                if (resultsCheck && resultsCheck.jobs && resultsCheck.jobs.length > 0) {
                    console.log(`AI Agent: Found ${resultsCheck.jobs.length} job results`);
                    await this.updateStatus(`Found ${resultsCheck.jobs.length} job results`, 'success');
                } else {
                    console.log('AI Agent: No job results found yet, waiting more...');
                    await this.updateStatus('No results yet, waiting more...', 'warning');
                    await this.delay(5000); // Wait 5 more seconds
                }
                
                return { success: true, tabId: targetTab.id, newTab: forceNewTab };
            } else {
                console.log('AI Agent: Job search failed');
                await this.updateStatus('Job search failed', 'error');
                return { success: false, error: 'Search failed' };
            }
        } catch (error) {
            console.error('AI Agent: Error performing job search:', error);
            await this.updateStatus(`Search error: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async closeSpecificTab(tabId) {
        try {
            this.updateLastActivity();
            console.log(`AI Agent: Closing specific tab ${tabId}...`);
            await this.updateStatus(`Closing tab ${tabId}...`, 'info');
            
            // Check if tab exists
            const tab = await chrome.tabs.get(tabId);
            if (!tab) {
                throw new Error(`Tab ${tabId} not found`);
            }
            
            // Close the tab
            await chrome.tabs.remove(tabId);
            console.log(`AI Agent: Successfully closed tab ${tabId}`);
            await this.updateStatus(`Tab ${tabId} closed successfully`, 'success');
            
            // Remove from tracking if it was a job search tab
            if (this.jobSearchTabs.has(tabId)) {
                await this.removeJobSearchTab(tabId);
                console.log(`AI Agent: Removed tab ${tabId} from job search tracking`);
            }
            
            return { success: true, tabId, message: 'Tab closed successfully' };
        } catch (error) {
            console.error(`AI Agent: Error closing tab ${tabId}:`, error);
            await this.updateStatus(`Error closing tab: ${error.message}`, 'error');
            return { success: false, tabId, error: error.message };
        }
    }

    async returnToUserTab() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Returning to user tab...');
            await this.updateStatus('Returning to your original tab...', 'info');
            
            // Get the current active tab (which should be the user's tab)
            const userTab = await this.getCurrentTab();
            
            // Activate the user's tab
            await chrome.tabs.update(userTab.id, { active: true });
            
            console.log(`AI Agent: Returned to user tab ${userTab.id}`);
            await this.updateStatus('Returned to your original tab', 'success');
            
            return { success: true, tabId: userTab.id, url: userTab.url };
        } catch (error) {
            console.error('AI Agent: Error returning to user tab:', error);
            await this.updateStatus(`Error returning to your tab: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async saveUserOriginalTab() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Saving user original tab...');
            
            const userTab = await this.getCurrentTab();
            this.userOriginalTab = {
                id: userTab.id,
                url: userTab.url,
                title: userTab.title,
                savedAt: Date.now()
            };
            
            console.log(`AI Agent: Saved user original tab: ${userTab.id} - ${userTab.title}`);
            await this.updateStatus('Saved your current tab as original', 'success');
            
            return this.userOriginalTab;
        } catch (error) {
            console.error('AI Agent: Error saving user original tab:', error);
            await this.updateStatus(`Error saving your tab: ${error.message}`, 'error');
            return null;
        }
    }

    async returnToUserOriginalTab() {
        try {
            this.updateLastActivity();
            if (!this.userOriginalTab) {
                throw new Error('No user original tab saved');
            }
            
            console.log('AI Agent: Returning to user original tab...');
            await this.updateStatus('Returning to your original tab...', 'info');
            
            // Check if the tab still exists
            try {
                const tab = await chrome.tabs.get(this.userOriginalTab.id);
                if (tab) {
                    // Tab exists, activate it
                    await chrome.tabs.update(this.userOriginalTab.id, { active: true });
                    console.log(`AI Agent: Returned to user original tab ${this.userOriginalTab.id}`);
                    await this.updateStatus('Returned to your original tab', 'success');
                    return { success: true, tabId: this.userOriginalTab.id, url: this.userOriginalTab.url };
                }
            } catch (error) {
                console.log('AI Agent: User original tab no longer exists, trying to find similar tab...');
            }
            
            // Try to find a tab with similar URL
            const allTabs = await chrome.tabs.query({});
            const similarTab = allTabs.find(tab => 
                tab.url === this.userOriginalTab.url || 
                tab.title === this.userOriginalTab.title
            );
            
            if (similarTab) {
                await chrome.tabs.update(similarTab.id, { active: true });
                console.log(`AI Agent: Found and activated similar tab ${similarTab.id}`);
                await this.updateStatus('Found and activated similar tab', 'success');
                return { success: true, tabId: similarTab.id, url: similarTab.url, foundSimilar: true };
            }
            
            throw new Error('Could not find your original tab or similar tab');
            
        } catch (error) {
            console.error('AI Agent: Error returning to user original tab:', error);
            await this.updateStatus(`Error returning to your tab: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async getUserOriginalTabInfo() {
        try {
            this.updateLastActivity();
            if (!this.userOriginalTab) {
                return { success: false, error: 'No user original tab saved' };
            }
            
            // Check if the tab still exists
            let tabExists = false;
            let currentInfo = null;
            
            try {
                const tab = await chrome.tabs.get(this.userOriginalTab.id);
                if (tab) {
                    tabExists = true;
                    currentInfo = {
                        id: tab.id,
                        url: tab.url,
                        title: tab.title,
                        active: tab.active
                    };
                }
            } catch (error) {
                // Tab no longer exists
                tabExists = false;
            }
            
            return {
                success: true,
                originalTab: this.userOriginalTab,
                tabExists: tabExists,
                currentInfo: currentInfo
            };
        } catch (error) {
            console.error('AI Agent: Error getting user original tab info:', error);
            return { success: false, error: error.message };
        }
    }

    async clearUserOriginalTab() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Clearing user original tab...');
            
            if (!this.userOriginalTab) {
                return { success: false, error: 'No user original tab saved' };
            }
            
            const clearedTab = { ...this.userOriginalTab };
            this.userOriginalTab = null;
            
            console.log('AI Agent: Cleared user original tab');
            await this.updateStatus('Cleared your original tab', 'success');
            
            return { success: true, clearedTab };
        } catch (error) {
            console.error('AI Agent: Error clearing user original tab:', error);
            await this.updateStatus(`Error clearing your tab: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async getAvailableActions() {
        try {
            this.updateLastActivity();
            const actions = {
                // AI Job Search
                'startAIJobSearch': 'Start AI-powered job search (reuses existing tab or creates new)',
                'stopAIJobSearch': 'Stop AI job search',
                'performJobSearch': 'Perform job search (reuses existing tab or creates new)',
                'performJobSearchWithChoice': 'Perform job search with choice of new/existing tab',
                
                // Tab Management
                'createNewJobSearchTab': 'Create a new job search tab',
                'getCurrentJobSearchTab': 'Get current job search tab info',
                'getJobSearchTabsInfo': 'Get all tracked job search tabs',
                'getJobSearchTabsDetailedStatus': 'Get detailed status of job search tabs',
                'getAllOpenTabsInfo': 'Get all open tabs info',
                'closeSpecificTab': 'Close a specific tab',
                'closeAllJobSearchTabs': 'Close all job search tabs',
                'resetJobSearchTabs': 'Reset job search tabs (close all and force new tab creation)',
                'removeJobSearchTab': 'Remove tab from tracking',
                'cleanupJobSearchTabs': 'Clean up old job search tabs',
                
                // User Tab Management
                'saveUserOriginalTab': 'Save current tab as user original',
                'getUserOriginalTabInfo': 'Get user original tab info',
                'returnToUserOriginalTab': 'Return to user original tab',
                'returnToUserTab': 'Return to current user tab',
                'clearUserOriginalTab': 'Clear user original tab',
                
                // AI Analysis
                'analyzeJobWithAI': 'Analyze job with AI',
                'setGeminiApiKey': 'Set Gemini API key'
            };
            
            return {
                success: true,
                actions: actions,
                totalActions: Object.keys(actions).length,
                description: 'Available AI Agent actions for job search and tab management'
            };
        } catch (error) {
            console.error('AI Agent: Error getting available actions:', error);
            return { success: false, error: error.message };
        }
    }

    async getSystemStatus() {
        try {
            this.updateLastActivity();
            const status = {
                // AI Agent Status
                isRunning: this.isRunning,
                hasApiKey: !!this.geminiApiKey,
                apiKeyConfigured: this.geminiApiKey ? `${this.geminiApiKey.substring(0, 10)}...` : 'Not configured',
                
                // Tab Management Status
                totalJobSearchTabs: this.jobSearchTabs.size,
                currentJobSearchTabId: this.currentJobSearchTabId,
                hasUserOriginalTab: !!this.userOriginalTab,
                
                // Job Processing Status
                processedJobsCount: this.processedJobLinks.size,
                jobQueueLength: this.jobQueue.length,
                currentJob: this.currentJob ? {
                    title: this.currentJob.title,
                    company: this.currentJob.company
                } : null,
                
                // Profile and Preferences
                hasProfile: !!this.profile && Object.keys(this.profile).length > 0,
                hasPreferences: !!this.preferences && Object.keys(this.preferences).length > 0,
                
                // Timestamps
                lastActivity: this.lastActivity || 'Never',
                uptime: Date.now() - (this.startTime || Date.now()),
                
                // System Info
                version: '1.0.0',
                lastUpdated: new Date().toISOString()
            };
            
            return {
                success: true,
                status: status,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('AI Agent: Error getting system status:', error);
            return { success: false, error: error.message };
        }
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'startAIJobSearch':
                    await this.startAIJobSearch(message.settings);
                    sendResponse({ success: true });
                    break;
                    
                case 'stopAIJobSearch':
                    await this.stopAIJobSearch();
                    sendResponse({ success: true });
                    break;
                    
                case 'analyzeJobWithAI':
                    const analysis = await this.analyzeJobWithAI(message.jobData);
                    sendResponse({ success: true, analysis });
                    break;
                    
                case 'setGeminiApiKey':
                    await this.setGeminiApiKey(message.apiKey);
                    sendResponse({ success: true });
                    break;
                    
                case 'performJobSearch':
                    // Handle direct job search requests - reuse existing tab if available
                    const searchResult = await this.performJobSearch();
                    sendResponse({ success: searchResult });
                    break;
                    
                case 'performJobSearchWithChoice':
                    // Handle job search with choice of new or existing tab
                    const forceNewTab = message.forceNewTab !== false; // Default to false (reuse existing)
                    const choiceResult = await this.performJobSearchWithChoice(forceNewTab);
                    sendResponse(choiceResult);
                    break;
                    
                case 'createNewJobSearchTab':
                    // Handle requests to create a new job search tab
                    const newTab = await this.forceNewJobSearchTab();
                    sendResponse({ success: true, tabId: newTab.id, url: newTab.url });
                    break;
                    
                case 'getCurrentJobSearchTab':
                    // Return current job search tab info
                    const currentTab = await this.getCurrentTab();
                    sendResponse({ 
                        success: true, 
                        tabId: currentTab.id, 
                        url: currentTab.url,
                        isLinkedInJobs: currentTab.url.includes('linkedin.com/jobs')
                    });
                    break;
                    
                case 'getJobSearchTabsInfo':
                    // Return information about all tracked job search tabs
                    const tabsInfo = await this.getJobSearchTabsInfo();
                    sendResponse({ success: true, tabs: tabsInfo });
                    break;
                    
                case 'getJobSearchTabsDetailedStatus':
                    // Return detailed status of job search tabs
                    const detailedStatus = await this.getJobSearchTabsDetailedStatus();
                    sendResponse(detailedStatus);
                    break;
                    
                case 'getAllOpenTabsInfo':
                    // Return information about all open tabs
                    const allTabsInfo = await this.getAllOpenTabsInfo();
                    sendResponse({ success: true, tabs: allTabsInfo });
                    break;
                    
                case 'getUserOriginalTabInfo':
                    // Get information about the user's original tab
                    const originalTabInfo = await this.getUserOriginalTabInfo();
                    sendResponse(originalTabInfo);
                    break;
                    
                case 'saveUserOriginalTab':
                    // Save the user's current tab as original
                    const savedTab = await this.saveUserOriginalTab();
                    sendResponse({ success: true, savedTab });
                    break;
                    
                case 'clearUserOriginalTab':
                    // Clear the user's original tab
                    const clearResult = await this.clearUserOriginalTab();
                    sendResponse(clearResult);
                    break;
                    
                case 'returnToUserOriginalTab':
                    // Return to the user's saved original tab
                    const returnOriginalResult = await this.returnToUserOriginalTab();
                    sendResponse(returnOriginalResult);
                    break;
                    
                case 'returnToUserTab':
                    // Return to the user's current tab
                    const returnResult = await this.returnToUserTab();
                    sendResponse(returnResult);
                    break;
                    
                case 'cleanupJobSearchTabs':
                    // Clean up old job search tabs
                    const cleanedCount = await this.cleanupJobSearchTabs();
                    sendResponse({ success: true, cleanedCount });
                    break;
                    
                case 'closeAllJobSearchTabs':
                    // Close all job search tabs
                    const closedCount = await this.closeAllJobSearchTabs();
                    sendResponse({ success: true, closedCount });
                    break;
                    
                case 'resetJobSearchTabs':
                    // Reset job search tabs - close all and clear tracking
                    const resetResult = await this.resetJobSearchTabs();
                    sendResponse(resetResult);
                    break;
                    
                case 'closeSpecificTab':
                    // Close a specific tab
                    if (message.tabId) {
                        const closeResult = await this.closeSpecificTab(message.tabId);
                        sendResponse(closeResult);
                    } else {
                        sendResponse({ success: false, error: 'No tab ID provided' });
                    }
                    break;
                    
                case 'removeJobSearchTab':
                    // Remove a specific job search tab from tracking
                    if (message.tabId) {
                        await this.removeJobSearchTab(message.tabId);
                        sendResponse({ success: true, message: `Tab ${message.tabId} removed from tracking` });
                    } else {
                        sendResponse({ success: false, error: 'No tab ID provided' });
                    }
                    break;
                    
                case 'getAvailableActions':
                    // Get all available actions
                    const actionsInfo = await this.getAvailableActions();
                    sendResponse(actionsInfo);
                    break;
                    
                case 'getSystemStatus':
                    // Get overall system status
                    const systemStatus = await this.getSystemStatus();
                    sendResponse(systemStatus);
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action 1' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    updateLastActivity() {
        this.lastActivity = Date.now();
    }

    async updateStatus(message, type = 'info') {
        try {
            // Update last activity
            this.updateLastActivity();
            
            // Send status update to popup
            await chrome.runtime.sendMessage({
                action: 'updateAIStatus',
                status: {
                    message,
                    type,
                    timestamp: Date.now()
                }
            });
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    async startAIJobSearch(settings) {
        console.log('🚀 AI Agent: startAIJobSearch called with settings:', settings);
        this.updateLastActivity();
        
        if (this.isRunning) {
            const msg = 'AI Job Search is already running';
            console.log(msg);
            await this.updateStatus(msg, 'warning');
            return { success: false, error: msg };
        }

        if (!this.geminiApiKey) {
            const msg = 'Gemini API key not set. Please configure your API key first.';
            console.error(msg);
            await this.updateStatus(msg, 'error');
            throw new Error(msg);
        }

        console.log(`✅ AI Agent: API key configured: ${this.geminiApiKey.substring(0, 10)}...`);

        this.isRunning = true;
        console.log('🎯 Starting AI-powered job search...');
        await this.updateStatus('AI Job Search started', 'info');
        
        try {
            // Check if we already have a job search tab, if not create one
            let targetTab;
            if (this.jobSearchTabs.size === 0) {
                // First time - create new tab
                console.log('🆕 First time AI job search - creating new tab...');
                await this.updateStatus('Creating new tab for AI job search...', 'info');
                targetTab = await this.createJobSearchTab();
                console.log(`✅ New AI job search tab created with ID: ${targetTab.id}`);
                await this.updateStatus('New AI job search tab created successfully', 'success');
            } else {
                // Reuse existing tab
                const existingTabId = this.currentJobSearchTabId || Array.from(this.jobSearchTabs.keys())[0];
                targetTab = await chrome.tabs.get(existingTabId);
                console.log(`✅ Reusing existing AI job search tab: ${targetTab.id}`);
                await this.updateStatus('Using existing AI job search tab', 'success');
            }

            // Always perform an initial search using user preferences
            console.log('🔍 Performing initial search from preferences...');
            await this.performInitialSearchFromPreferences();

            // Start the AI job search loop
            console.log('🔄 Starting job search loop...');
            await this.updateStatus('Starting job search loop...', 'info');
            this.aiJobSearchLoop(settings);
            
            console.log('✅ AI Job Search initialized successfully');
            return { success: true };
            
        } catch (error) {
            console.error('❌ Error in startAIJobSearch:', error);
            await this.updateStatus(`Error starting job search: ${error.message}`, 'error');
            this.isRunning = false;
            throw error;
        }
    }

    buildSearchFromPreferences() {
        const titles = (this.preferences?.jobTitles || '').toString().trim();
        const keywords = (this.preferences?.keywords || '').toString().trim();
        const query = [titles, keywords].filter(Boolean).join(', ');
        const location = (this.preferences?.locationPreference || this.profile?.location || '').toString().trim();
        const experienceFilters = Array.isArray(this.preferences?.experienceFilters) ? this.preferences.experienceFilters : [];
        const datePosted = (this.preferences?.datePosted || 'any');
        const jobTypeFilters = Array.isArray(this.preferences?.jobTypeFilters) ? this.preferences.jobTypeFilters : [];
        return { query, location, experienceFilters, datePosted, jobTypeFilters };
    }

    async performInitialSearchFromPreferences() {
        try {
            this.updateLastActivity();
            const { query, location, experienceFilters, datePosted, jobTypeFilters } = this.buildSearchFromPreferences();
            if (!query && !location) {
                await this.updateStatus('No search preferences provided. Using current page.', 'warning');
                return;
            }
            
            await this.updateStatus(`Performing initial search: "${query || 'any'}" @ "${location || 'any'}"`, 'info');
            
            // Check if we already have a job search tab, if not create one
            let targetTab;
            if (this.jobSearchTabs.size === 0) {
                // First time - create new tab
                console.log('AI Agent: First time initial search - creating new tab');
                targetTab = await this.createJobSearchTab();
            } else {
                // Reuse existing tab
                const existingTabId = this.currentJobSearchTabId || Array.from(this.jobSearchTabs.keys())[0];
                targetTab = await chrome.tabs.get(existingTabId);
                console.log(`AI Agent: Reusing existing tab for initial search: ${targetTab.id}`);
                await this.updateStatus('Using existing job search tab for initial search', 'info');
            }
            
            // Prepare search data
            const searchData = {
                query: query || 'any',
                location: location || 'any',
                experienceFilters: experienceFilters || [],
                datePosted: datePosted || 'any',
                jobTypeFilters: jobTypeFilters || []
            };
            
            console.log('AI Agent: Sending initial search request with data:', searchData);
            await this.updateStatus('Sending initial search request...', 'info');
            
            // Send search request to content script
            const response = await chrome.tabs.sendMessage(targetTab.id, {
                action: 'performJobSearch',
                searchData: searchData
            });
            
            if (response && response.success) {
                console.log('AI Agent: Initial search performed successfully');
                await this.updateStatus('Initial search completed, waiting for results...', 'success');
                
                // Wait for search results to load
                console.log('AI Agent: Waiting for initial search results to load...');
                await this.updateStatus('Waiting for initial search results...', 'info');
                await this.delay(10000); // Wait 10 seconds for results
                
                // Verify we have results
                const resultsCheck = await chrome.tabs.sendMessage(targetTab.id, { 
                    action: 'extractJobListings' 
                });
                
                if (resultsCheck && resultsCheck.jobs && resultsCheck.jobs.length > 0) {
                    console.log(`AI Agent: Found ${resultsCheck.jobs.length} job results`);
                    await this.updateStatus(`Initial search found ${resultsCheck.jobs.length} job results`, 'success');
                } else {
                    console.log('AI Agent: No initial search results found yet, waiting more...');
                    await this.updateStatus('No initial results yet, waiting more...', 'warning');
                    await this.delay(5000); // Wait 5 more seconds
                }
            } else {
                console.log('AI Agent: Initial search failed');
                await this.updateStatus('Initial search failed', 'error');
            }
        } catch (err) {
            console.error('AI Agent: performInitialSearchFromPreferences error:', err);
            await this.updateStatus(`Initial search error: ${err.message}`, 'error');
        }
    }

    async stopAIJobSearch() {
        this.updateLastActivity();
        this.isRunning = false;
        console.log('AI Job Search stopped');
    }

    async performJobSearch() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Performing job search with user preferences...');
            await this.updateStatus('Performing job search with your preferences...', 'info');
            
            // Get user preferences for search
            const preferences = this.preferences;
            const searchQuery = preferences.jobTitles || preferences.keywords || 'software engineer';
            const location = preferences.locationPreference || preferences.location || '';
            const experienceFilters = Array.isArray(preferences.experienceFilters) ? preferences.experienceFilters : [];
            const datePosted = preferences.datePosted || 'any';
            const jobTypeFilters = Array.isArray(preferences.jobTypeFilters) ? preferences.jobTypeFilters : [];
            
            console.log(`AI Agent: Searching for: "${searchQuery}" in "${location}"`);
            await this.updateStatus(`Searching for: "${searchQuery}" in "${location}"`, 'info');
            
            // Check if we already have a job search tab, if not create one
            let targetTab;
            if (this.jobSearchTabs.size === 0) {
                // First time - create new tab
                console.log('AI Agent: First time search - creating new tab');
                targetTab = await this.createJobSearchTab();
            } else {
                // Reuse existing tab
                const existingTabId = this.currentJobSearchTabId || Array.from(this.jobSearchTabs.keys())[0];
                targetTab = await chrome.tabs.get(existingTabId);
                console.log(`AI Agent: Reusing existing job search tab: ${targetTab.id}`);
                await this.updateStatus('Using existing job search tab', 'info');
            }
            
            // Prepare search data
            const searchData = {
                query: searchQuery,
                location: location,
                experienceFilters: experienceFilters,
                datePosted: datePosted,
                jobTypeFilters: jobTypeFilters
            };
            
            console.log('AI Agent: Sending search request with data:', searchData);
            await this.updateStatus('Sending search request...', 'info');
            
            // Send search request to content script
            const response = await chrome.tabs.sendMessage(targetTab.id, {
                action: 'performJobSearch',
                searchData: searchData
            });
            
            if (response && response.success) {
                console.log('AI Agent: Job search performed successfully');
                await this.updateStatus('Job search completed, waiting for results...', 'success');
                
                // Wait for search results to load
                console.log('AI Agent: Waiting for search results to load...');
                await this.updateStatus('Waiting for search results...', 'info');
                await this.delay(10000); // Wait 10 seconds for results
                
                // Verify we have results
                const resultsCheck = await chrome.tabs.sendMessage(targetTab.id, { 
                    action: 'extractJobListings' 
                });
                
                if (resultsCheck && resultsCheck.jobs && resultsCheck.jobs.length > 0) {
                    console.log(`AI Agent: Found ${resultsCheck.jobs.length} job results`);
                    await this.updateStatus(`Found ${resultsCheck.jobs.length} job results`, 'success');
                } else {
                    console.log('AI Agent: No job results found yet, waiting more...');
                    await this.updateStatus('No results yet, waiting more...', 'warning');
                    await this.delay(5000); // Wait 5 more seconds
                }
                
                return true;
            } else {
                console.log('AI Agent: Job search failed');
                await this.updateStatus('Job search failed', 'error');
                return false;
            }
        } catch (error) {
            console.error('AI Agent: Error performing job search:', error);
            await this.updateStatus(`Search error: ${error.message}`, 'error');
            return false;
        }
    }

    async waitForPageContent() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Waiting for page content to load...');
            await this.updateStatus('Waiting for page content to load...', 'info');
            
            // Wait for the page to fully load
            await this.delay(5000);
            
            // Check if we're on a proper LinkedIn jobs page
            const currentPage = await this.getCurrentLinkedInPage();
            if (currentPage.type === 'jobSearch') {
                console.log('AI Agent: Page content loaded, ready to extract jobs');
                await this.updateStatus('Page content loaded, ready to extract jobs', 'success');
                return true;
            } else {
                console.log('AI Agent: Page not ready yet, waiting more...');
                await this.updateStatus('Page not ready yet, waiting more...', 'warning');
                await this.delay(5000);
                return false;
            }
        } catch (error) {
            console.error('AI Agent: Error waiting for page content:', error);
            return false;
        }
    }

    async aiJobSearchLoop(settings) {
        console.log('AI Job Search loop started with settings:', settings);
        await this.updateStatus('Job search loop started', 'info');
        
        // Wait for page content to load first
        await this.waitForPageContent();
        
        let iterationCount = 0;
        let noNewJobsIterations = 0;
        const maxNoNewJobsIterations = 3;
        
        while (this.isRunning) {
            try {
                iterationCount++;
                console.log(`AI Agent: Starting iteration ${iterationCount}...`);
                await this.updateStatus(`Starting iteration ${iterationCount}...`, 'info');
                
                // Get current LinkedIn page
                const currentPage = await this.getCurrentLinkedInPage();
                console.log('AI Agent: Current page type:', currentPage.type);
                await this.updateStatus(`Current page: ${currentPage.type}`, 'info');
                
                if (currentPage.type === 'jobSearch') {
                    console.log('AI Agent: On job search page, extracting listings...');
                    await this.updateStatus('Extracting job listings...', 'info');
                    
                    // Make sure the page is fully loaded
                    if (!await this.waitForPageContent()) {
                        console.log('AI Agent: Page not ready, waiting for next iteration...');
                        await this.updateStatus('Page not ready, waiting...', 'warning');
                        await this.delay(10000);
                        continue;
                    }
                    
                    // First, perform a job search if we haven't found jobs yet
                    let jobs = await this.extractJobListings();
                    if (jobs.length === 0) {
                        console.log('AI Agent: No jobs found, performing search...');
                        await this.updateStatus('No jobs found, performing search...', 'info');
                        
                        const searchSuccess = await this.performJobSearch();
                        if (searchSuccess) {
                            // Wait a bit more for search results
                            await this.delay(5000);
                            
                            // Try to extract jobs again
                            const newJobs = await this.extractJobListings();
                            if (newJobs.length > 0) {
                                console.log(`AI Agent: Found ${newJobs.length} jobs after search`);
                                await this.updateStatus(`Found ${newJobs.length} jobs after search`, 'success');
                                jobs = newJobs; // replace instead of push to avoid duplicates
                            }
                        }
                    }
                    
                    console.log(`AI Agent: Total jobs found: ${jobs.length}`);
                    await this.updateStatus(`Total jobs found: ${jobs.length}`, 'success');
                    
                    if (jobs.length === 0) {
                        noNewJobsIterations++;
                        console.log('AI Agent: Still no jobs found, waiting and trying again...');
                        await this.updateStatus(`Still no jobs found (${noNewJobsIterations}/${maxNoNewJobsIterations}), waiting...`, 'warning');
                        if (noNewJobsIterations >= maxNoNewJobsIterations) {
                            this.isRunning = false;
                            await this.updateStatus('No new jobs detected for multiple iterations. Stopping.', 'success');
                            break;
                        }
                        await this.delay(10000); // Wait 10 seconds and try again
                        continue;
                    } else {
                        noNewJobsIterations = 0; // reset when we find jobs
                    }
                    
                    // Analyze each job with AI
                    for (let i = 0; i < jobs.length && this.isRunning; i++) {
                        const job = jobs[i];
                        const key = job.link || `${job.title}|${job.company}|${job.location}`;
                        if (this.processedJobLinks.has(key)) {
                            continue;
                        }
                        console.log(`AI Agent: Analyzing job ${i + 1}/${jobs.length}: ${job.title} at ${job.company}`);
                        await this.updateStatus(`Analyzing job ${i + 1}/${jobs.length}: ${job.title}`, 'info');
                        
                        const analysis = await this.analyzeJobWithAI(job);
                        console.log(`AI Agent: Analysis result:`, analysis);
                        
                        if (analysis.shouldApply && analysis.confidence > settings.confidenceThreshold) {
                            // Check submission mode before applying
                            const { aiAgent } = await chrome.storage.sync.get('aiAgent');
                            const submissionMode = aiAgent?.aiSubmissionMode !== false; // Default to true
                            
                            if (!submissionMode) {
                                console.log('🧪 Test mode enabled - filling form but NOT submitting application');
                                await this.updateStatus(`🧪 Test mode: Filling form for "${job.title}" (NO SUBMISSION)`, 'info');
                            } else {
                                console.log('✅ Live mode - filling form AND submitting application');
                                await this.updateStatus(`✅ Live mode: Applying to "${job.title}"`, 'success');
                            }
                            
                            console.log(`AI Agent: Job matches criteria! ${submissionMode ? 'Applying to' : 'Filling form for'}: ${job.title}`);
                            
                            // Apply to the job (with test mode flag)
                            await this.applyToJob(job, analysis);
                            
                            // Wait between applications
                            await this.delay(settings.applyDelay * 1000);
                        } else {
                            const reason = (analysis.reasoning || '').toString().slice(0, 180);
                            console.log(`AI Agent: Job doesn't match. Score: ${analysis.score}, Conf: ${analysis.confidence}. Reason: ${reason}`);
                            await this.updateStatus(`No match: ${job.title}. Reason: ${reason || 'AI said not a fit'}`, 'warning');
                        }
                    }
                    
                    // Move to next page if available
                    console.log('AI Agent: Attempting to navigate to next page...');
                    await this.updateStatus('Moving to next page...', 'info');
                    await this.navigateToNextPage();
                    
                } else if (currentPage.type === 'individualJob') {
                    console.log('AI Agent: On individual job page, analyzing...');
                    await this.updateStatus('On individual job page, analyzing...', 'info');
                    
                    // Analyze individual job page
                    const jobData = await this.extractIndividualJobData();
                    if (jobData) {
                        const analysis = await this.analyzeJobWithAI(jobData);
                        console.log(`AI Agent: Individual job analysis:`, analysis);
                        
                        if (analysis.shouldApply && analysis.confidence > settings.confidenceThreshold) {
                            await this.updateStatus(`Individual job matches! Applying...`, 'success');
                            await this.applyToJob(jobData, analysis);
                        }
                        else {
                            const reason = (analysis.reasoning || '').toString().slice(0, 180);
                            await this.updateStatus(`Individual job not a match. Reason: ${reason || 'AI said not a fit'}`, 'warning');
                        }
                    }
                    
                    // Go back to search results
                    console.log('AI Agent: Going back to search results...');
                    await this.updateStatus('Going back to search results...', 'info');
                    await this.goBackToSearchResults();
                    
                } else {
                    console.log('AI Agent: Unknown page type, waiting...');
                    await this.updateStatus('Unknown page type, waiting...', 'warning');
                    await this.delay(15000); // Wait 15 seconds for unknown pages
                }
                
                // Wait before next iteration
                console.log(`AI Agent: Waiting ${settings.searchDelay} seconds before next iteration...`);
                await this.updateStatus(`Waiting ${settings.searchDelay} seconds...`, 'info');
                await this.delay(settings.searchDelay * 1000);
                
            } catch (error) {
                console.error('AI Agent: Error in job search loop:', error);
                await this.updateStatus(`Error in iteration ${iterationCount}: ${error.message}`, 'error');
                await this.delay(30000); // Wait 30 seconds on error
            }
        }
        
        console.log('AI Agent: Job search loop stopped');
        await this.updateStatus('Job search loop stopped', 'info');
    }

    async getCurrentLinkedInPage() {
        try {
            this.updateLastActivity();
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) return { type: 'unknown' };

            const tab = tabs[0];
            const url = tab.url;

            if (url.includes('/jobs/') && url.includes('/view/')) {
                return { type: 'individualJob', url };
            } else if (url.includes('/jobs/')) {
                return { type: 'jobSearch', url };
            } else {
                return { type: 'unknown', url };
            }
        } catch (error) {
            console.error('Error getting current page:', error);
            return { type: 'unknown' };
        }
    }

    async extractJobListings() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Attempting to extract job listings...');
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                console.log('AI Agent: No active tabs found');
                return [];
            }

            console.log('AI Agent: Sending message to content script...');
            const response = await chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'extractJobListings' 
            });
            
            console.log('AI Agent: Content script response:', response);
            
            if (response && response.jobs) {
                console.log(`AI Agent: Successfully extracted ${response.jobs.length} jobs`);
                // De-duplicate by link and filter already processed
                const unique = [];
                const seen = new Set();
                for (const j of response.jobs) {
                    const key = j.link || `${j.title}|${j.company}|${j.location}`;
                    if (!seen.has(key) && !this.processedJobLinks.has(key)) {
                        seen.add(key);
                        unique.push(j);
                    }
                }
                return unique;
            } else {
                console.log('AI Agent: No jobs found in response or invalid response format');
                return [];
            }
            
        } catch (error) {
            console.error('AI Agent: Error extracting job listings:', error);
            
            // If content script is not ready, wait a bit and try again
            if (error.message.includes('Could not establish connection')) {
                console.log('AI Agent: Content script not ready, waiting...');
                await this.delay(5000);
                return this.extractJobListings(); // Retry once
            }
            
            return [];
        }
    }

    async extractIndividualJobData() {
        try {
            this.updateLastActivity();
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) return null;

            const response = await chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'extractIndividualJobData' 
            });
            
            return response.jobData;
        } catch (error) {
            console.error('Error extracting individual job data:', error);
            return null;
        }
    }

    async fetchJobDetailsUntilReady(baseJob, maxAttempts = 6) {
		try {
			this.updateLastActivity();
			const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tabs.length) return baseJob;
			const tabId = tabs[0].id;
			let best = { ...baseJob };
			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				await this.updateStatus(`Fetching job details (attempt ${attempt}/${maxAttempts})...`, 'info');
				let resp = null;
				try { resp = await chrome.tabs.sendMessage(tabId, { action: 'prepareJobForDeepAnalysis' }); } catch (_) {}
				const prepared = resp?.jobData || {};
				const merged = { ...best, ...prepared };
				const descLen = (merged.description || '').trim().length;
				if (descLen >= 200) {
					await this.updateStatus(`Job details ready (description ${descLen} chars)`, 'success');
					return merged;
				}
				// Try explicit expansion + scroll then re-extract
				try { await chrome.tabs.sendMessage(tabId, { action: 'expandJobDescription' }); } catch (_) {}
				try { await chrome.tabs.sendMessage(tabId, { action: 'testScroll' }); } catch (_) {}
				await this.delay(900);
				let r2 = null;
				try { r2 = await chrome.tabs.sendMessage(tabId, { action: 'extractIndividualJobData' }); } catch (_) {}
				best = { ...merged, ...(r2?.jobData || {}) };
			}
			const finalLen = (best.description || '').trim().length;
			await this.updateStatus(`Proceeding with partial job details (description ${finalLen} chars)`, 'warning');
			return best;
		} catch (_) {
			return baseJob;
		}
	}

    async analyzeJobWithAI(jobData) {
        try {
            this.updateLastActivity();
            if (!this.geminiApiKey) {
                return {
                    shouldApply: false,
                    confidence: 0,
                    reasoning: 'AI unavailable: Gemini API key is missing. Configure it in AI Agent settings.',
                    score: 0
                };
            }

            // Stage 1: shallow screening with limited fields
            const stage1Prompt = this.createStage1Prompt(jobData);
            const stage1Text = await this.callGeminiAPI(stage1Prompt);
            const stage1 = this.parseAIResponse(stage1Text || '') || { shouldApply: false, confidence: 0.5, reasoning: 'Stage 1: AI not available', score: 50 };
            if (!stage1.shouldApply) {
                this.markJobProcessed(jobData);
                return { ...stage1, reasoning: `Stage 1: ${stage1.reasoning}` };
            }

            // Save current search URL to return later
            await this.persistSearchUrl();

            // Prepare and ensure full job details with retries
            let jobDetails = await this.openAndExtractJobDetails(jobData);
            const initialLen = (jobDetails.description || '').trim().length;
            if (initialLen < 200) {
                await this.updateStatus('Job description still short after initial prep; continuing to fetch details...', 'warning');
                jobDetails = await this.fetchJobDetailsUntilReady(jobDetails, 6);
            }

            // Append resume content for deep analysis
            const resume = await this.getResumeContent();
            jobDetails.resume = resume || '';

            // Stage 2: deep screening with full description + resume
            const stage2Prompt = this.createStage2Prompt(jobDetails);
            const stage2Text = await this.callGeminiAPI(stage2Prompt);
            const stage2 = this.parseAIResponse(stage2Text || '') || { shouldApply: false, confidence: 0.5, reasoning: 'Stage 2: AI not available', score: 50 };
            stage2.reasoning = `Stage 2: ${stage2.reasoning}`;
            this.markJobProcessed(jobData);
            return stage2;
        } catch (error) {
            this.markJobProcessed(jobData);
            return {
                shouldApply: false,
                confidence: 0,
                reasoning: `AI failure: ${error.message}`,
                score: 0
            };
        }
    }

    async persistSearchUrl() {
        try {
            this.updateLastActivity();
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length) {
                const url = tabs[0].url || '';
                if (url.includes('/jobs/')) {
                    await chrome.storage.local.set({ lastSearchUrl: url });
                }
            }
        } catch (_) {}
    }

    async openAndExtractJobDetails(job) {
        try {
            this.updateLastActivity();
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) return job;
            const tabId = tabs[0].id;

            // Navigate if we have a link
            if (job.link) {
                await chrome.tabs.update(tabId, { url: job.link });
                await this.delay(2500);
            }

            // Use robust fetch loop until ready
            const prepared = await this.fetchJobDetailsUntilReady(job, 6);
            return { ...job, ...(prepared || {}) };
        } catch (e) {
            return job;
        }
    }

    async getResumeContent() {
        try {
            this.updateLastActivity();
            const sync = await chrome.storage.sync.get('resumeContent');
            if (sync?.resumeContent) return sync.resumeContent;
            const local = await chrome.storage.local.get('resumeContent');
            return local?.resumeContent || '';
        } catch (_) {
            return '';
        }
    }

    createStage1Prompt(job) {
        this.updateLastActivity();
        const preferences = this.preferences || {};
        return `You are a recruiter. Do a fast, surface-level fit screen based ONLY on title/company/location and brief description.
Return JSON: {"shouldApply": boolean, "confidence": number(0-1), "reasoning": string, "score": number(0-100)}.

CANDIDATE PREFERENCES:
- Desired Titles: ${preferences.jobTitles || 'Any'}
- Keywords: ${preferences.keywords || 'Any'}
- Exclude: ${preferences.excludeKeywords || 'None'}
- Locations: ${preferences.locationPreference || 'Any'}

JOB CARD:
- Title: ${job.title || ''}
- Company: ${job.company || ''}
- Location: ${job.location || ''}
- Snippet: ${(job.description || '').slice(0, 300)}
`;
    }

    createStage2Prompt(job) {
        this.updateLastActivity();
        const profile = this.profile || {};
        const preferences = this.preferences || {};
        const resume = job.resume || '';
        return `You are a technical recruiter. Perform a deep fit evaluation using the FULL job description and the candidate resume.
        Return JSON: {"shouldApply": boolean, "confidence": number(0-1), "reasoning": string, "score": number(0-100)}.

        CANDIDATE PROFILE:
        - Name: ${profile.fullName || 'Unknown'}
        - Current Company: ${profile.currentCompany || 'Unknown'}
        - Location: ${profile.location || 'Unknown'}
        - Experience level: ${preferences.experienceLevel || 'Any'}
        - Preferences: titles=${preferences.jobTitles || 'Any'}; keywords=${preferences.keywords || 'Any'}; exclude=${preferences.excludeKeywords || 'None'}; locations=${preferences.locationPreference || 'Any'}

        RESUME (raw text):
        ${resume.slice(0, 6000)}

        JOB DESCRIPTION (full text):
        ${(job.description || '').slice(0, 8000)}
        `;
    }

    async callGeminiAPI(prompt) {
        try {
            this.updateLastActivity();
            if (!this.geminiApiKey || String(this.geminiApiKey).trim() === '') {
                throw new Error('Gemini API key not configured');
            }
            const model = 'gemini-2.0-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(this.geminiApiKey)}`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: prompt }] }
                    ]
                })
            });
            const data = await resp.json().catch(() => null);
            if (!resp.ok) {
                const msg = data?.error?.message || `${resp.status} ${resp.statusText}`;
                throw new Error(`Gemini API error: ${msg}`);
            }
            // Extract text across all parts if available
            const text = (data?.candidates?.[0]?.content?.parts || [])
                .map(p => p?.text)
                .filter(Boolean)
                .join(' ');
            return text || '';
        } catch (error) {
            console.error('JobnickAI: Error calling Gemini API:', error);
            throw error;
        }
    }

    parseAIResponse(response) {
        try {
            this.updateLastActivity();
            // If response is fenced with ```json ... ``` remove fences
            const fenced = response.match(/```json([\s\S]*?)```/i);
            const raw = fenced ? fenced[1] : response;
            // Extract first JSON object
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            const jsonText = jsonMatch ? jsonMatch[0] : raw;
            const parsed = JSON.parse(jsonText);
            
            return {
                shouldApply: !!parsed.shouldApply,
                confidence: Number(parsed.confidence) || 0.7,
                reasoning: parsed.reasoning || 'AI provided no reasoning',
                score: Number(parsed.score) || Math.round((Number(parsed.confidence) || 0.7) * 100)
            };
        } catch (error) {
            // Fallback parsing for non-JSON responses
            try {
                this.updateLastActivity();
                const lc = String(response).toLowerCase();
                const yes = lc.includes('yes') || lc.includes('apply');
                const conf = this.extractConfidence(response) || (yes ? 0.7 : 0.4);
                return {
                    shouldApply: yes,
                    confidence: conf,
                    reasoning: response.slice(0, 500),
                    score: Math.round(conf * 100)
                };
            } catch {
                return null;
            }
        }
    }

    extractConfidence(text) {
        this.updateLastActivity();
        // Try to extract confidence from text
        const confidenceMatch = text.match(/(\d+(?:\.\d+)?)/);
        if (confidenceMatch) {
            const num = parseFloat(confidenceMatch[1]);
            if (num >= 0 && num <= 1) return num;
        }
        return 0.5; // Default confidence
    }

    heuristicAnalysis(jobData) {
        this.updateLastActivity();
        const preferences = this.preferences || {};
        const text = `${jobData.title || ''} ${jobData.company || ''} ${jobData.location || ''} ${jobData.description || ''}`.toLowerCase();
        const reasons = [];
        let score = 0;

        // Title matching
        if (preferences.jobTitles) {
            const titles = preferences.jobTitles.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
            const matchedTitles = titles.filter(t => text.includes(t));
            if (matchedTitles.length) {
                score += 30; reasons.push(`Title matches: ${matchedTitles.join(', ')}`);
            } else {
                reasons.push('Title not matching preferred titles');
            }
        }

        // Keywords
        if (preferences.keywords) {
            const kws = preferences.keywords.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
            const matches = kws.filter(k => text.includes(k));
            const part = kws.length ? (matches.length / kws.length) : 0;
            score += Math.round(part * 40);
            if (matches.length) reasons.push(`Matched keywords: ${matches.join(', ')}`);
        }

        // Exclude keywords
        if (preferences.excludeKeywords) {
            const ex = preferences.excludeKeywords.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
            const bad = ex.filter(k => text.includes(k));
            if (bad.length) { score -= 25; reasons.push(`Contains excluded keywords: ${bad.join(', ')}`); }
        }

        // Location
        if (preferences.locationPreference) {
            const locs = preferences.locationPreference.toLowerCase().split(',').map(s => s.trim());
            if (locs.some(l => text.includes(l))) { score += 15; reasons.push('Location matches preference'); }
        }

        // Normalize score
        const norm = Math.max(0, Math.min(100, score));
        const shouldApply = norm >= 60;
        const confidence = shouldApply ? 0.75 : 0.55;

        return {
            shouldApply,
            confidence,
            reasoning: reasons.join(' | ') || 'Rule-based evaluation with limited info',
            score: norm
        };
    }

    async applyToJob(jobData, analysis) {
        try {
            this.updateLastActivity();
            console.log(`Applying to job: ${jobData.title} (Score: ${analysis.score})`);
            
            // Get AI submission mode setting
            const { aiAgent } = await chrome.storage.sync.get('aiAgent');
            const submissionMode = aiAgent?.aiSubmissionMode !== false; // Default to true
            
            if (!submissionMode) {
                console.log('🧪 Test mode enabled - filling forms but not submitting');
                await this.updateStatus(`Test mode: Filling form for "${jobData.title}" without submission`, 'info');
            }
            
            // Send application request to content script
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) return;

            const response = await chrome.tabs.sendMessage(tabs[0].id, {
                action: 'applyToJobWithAI',
                jobData: jobData,
                profile: this.profile,
                testMode: !submissionMode // Pass test mode flag to content script
            });

            if (response.success) {
                const modeText = submissionMode ? 'applied to' : 'filled form for (test mode)';
                console.log(`Successfully ${modeText}: ${jobData.title}`);
                await this.updateApplicationCount();
            } else {
                console.log(`Failed to ${submissionMode ? 'apply to' : 'fill form for'}: ${jobData.title}`);
            }

        } catch (error) {
            console.error('Error applying to job:', error);
        }
    }

    async navigateToNextPage() {
        try {
            this.updateLastActivity();
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) return;

            await chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'navigateToNextPage' 
            });
        } catch (error) {
            console.error('Error navigating to next page:', error);
        }
    }

    async goBackToSearchResults() {
        try {
            this.updateLastActivity();
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) return;

            await chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'goBackToSearchResults' 
            });
        } catch (error) {
            console.error('Error going back to search results:', error);
        }
    }

    async setGeminiApiKey(apiKey) {
        this.updateLastActivity();
        this.geminiApiKey = apiKey;
        await chrome.storage.sync.set({ geminiApiKey: apiKey });
        console.log('Gemini API key saved');
    }

    async updateApplicationCount() {
        try {
            this.updateLastActivity();
            const result = await chrome.storage.local.get('applicationCount');
            const currentCount = result.applicationCount || 0;
            await chrome.storage.local.set({ applicationCount: currentCount + 1 });
        } catch (error) {
            console.error('Error updating application count:', error);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getCurrentTab() {
        try {
            this.updateLastActivity();
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found');
            }
            return tabs[0];
        } catch (error) {
            console.error('Error getting current tab:', error);
            throw error;
        }
    }

    async navigateToLinkedInJobs() {
        try {
            this.updateLastActivity();
            const currentTab = await this.getCurrentTab();
            
            // Navigate to LinkedIn Jobs
            const linkedInJobsUrl = 'https://www.linkedin.com/jobs/';
            await chrome.tabs.update(currentTab.id, { url: linkedInJobsUrl });
            
            // Wait for page to load
            await this.delay(5000);
            
            console.log('Successfully navigated to LinkedIn Jobs');
        } catch (error) {
            console.error('Error navigating to LinkedIn Jobs:', error);
            throw error;
        }
    }

    markJobProcessed(job) {
        try {
            this.updateLastActivity();
            const key = job.link || `${job.title}|${job.company}|${job.location}`;
            if (key) {
                this.processedJobLinks.add(key);
                this.saveProcessedJobs();
            }
        } catch (_) {}
    }

    async saveProcessedJobs() {
        try {
            this.updateLastActivity();
            await chrome.storage.local.set({ processedJobLinks: Array.from(this.processedJobLinks) });
        } catch (_) {}
    }

    async loadProcessedJobs() {
        try {
            this.updateLastActivity();
            const res = await chrome.storage.local.get('processedJobLinks');
            const arr = res?.processedJobLinks || [];
            this.processedJobLinks = new Set(arr);
        } catch (_) {
            this.processedJobLinks = new Set();
        }
    }

    async createJobSearchTab() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Creating dedicated job search tab...');
            await this.updateStatus('Creating dedicated job search tab...', 'info');
            
            // Create a new tab with LinkedIn Jobs
            const newTab = await chrome.tabs.create({ 
                url: 'https://www.linkedin.com/jobs/',
                active: true 
            });
            
            console.log(`AI Agent: Created new tab with ID: ${newTab.id}`);
            await this.updateStatus('New job search tab created', 'success');
            
            // Add to tracking system
            await this.addJobSearchTab(newTab);
            
            // Wait for the page to load
            await this.updateStatus('Waiting for page to load...', 'info');
            await this.delay(8000);
            
            // Wait for content script to be ready
            await this.updateStatus('Waiting for page to be ready...', 'info');
            let contentScriptReady = false;
            let attempts = 0;
            const maxAttempts = 15;
            
            while (!contentScriptReady && attempts < maxAttempts) {
                try {
                    const response = await chrome.tabs.sendMessage(newTab.id, { action: 'ping' });
                    if (response && response.ready) {
                        contentScriptReady = true;
                        console.log('AI Agent: Content script is ready in new tab');
                        await this.updateStatus('New tab is ready for job search', 'success');
                        await this.updateJobSearchTabStatus(newTab.id, 'ready', true);
                        break;
                    }
                } catch (error) {
                    console.log(`AI Agent: Content script not ready yet in new tab (attempt ${attempts + 1}/${maxAttempts})`);
                }
                
                attempts++;
                await this.delay(2000);
            }
            
            if (!contentScriptReady) {
                console.log('AI Agent: Content script not ready after maximum attempts in new tab, proceeding anyway...');
                await this.updateStatus('New tab may not be fully ready, proceeding...', 'warning');
                await this.updateJobSearchTabStatus(newTab.id, 'partial', true);
            }
            
            return newTab;
        } catch (error) {
            console.error('AI Agent: Error creating job search tab:', error);
            await this.updateStatus(`Error creating tab: ${error.message}`, 'error');
            throw error;
        }
    }

    async ensureJobSearchTab() {
        try {
            this.updateLastActivity();
            
            // Check if we already have a job search tab
            if (this.jobSearchTabs.size > 0) {
                // Reuse existing tab
                const existingTabId = this.currentJobSearchTabId || Array.from(this.jobSearchTabs.keys())[0];
                const existingTab = await chrome.tabs.get(existingTabId);
                console.log(`AI Agent: Reusing existing job search tab: ${existingTab.id}`);
                await this.updateStatus('Using existing job search tab', 'info');
                return existingTab;
            }
            
            // No existing tab - create new one
            console.log('AI Agent: No existing job search tab found - creating new one...');
            await this.updateStatus('Creating new job search tab...', 'info');
            
            const newTab = await this.createJobSearchTab();
            
            console.log(`AI Agent: New job search tab created with ID: ${newTab.id}`);
            await this.updateStatus('New job search tab created and ready', 'success');
            
            return newTab;
        } catch (error) {
            console.error('AI Agent: Error ensuring job search tab:', error);
            await this.updateStatus(`Error ensuring job search tab: ${error.message}`, 'error');
            throw error;
        }
    }

    async addJobSearchTab(tab) {
        try {
            this.updateLastActivity();
            const tabInfo = {
                id: tab.id,
                url: tab.url,
                createdAt: Date.now(),
                status: 'ready',
                lastActivity: Date.now()
            };
            
            this.jobSearchTabs.set(tab.id, tabInfo);
            this.currentJobSearchTabId = tab.id;
            
            console.log(`AI Agent: Added job search tab ${tab.id} to tracking`);
            return tabInfo;
        } catch (error) {
            console.error('AI Agent: Error adding job search tab to tracking:', error);
        }
    }

    async removeJobSearchTab(tabId) {
        try {
            this.updateLastActivity();
            if (this.jobSearchTabs.has(tabId)) {
                this.jobSearchTabs.delete(tabId);
                console.log(`AI Agent: Removed job search tab ${tabId} from tracking`);
                
                // If this was the current tab, clear the reference
                if (this.currentJobSearchTabId === tabId) {
                    this.currentJobSearchTabId = null;
                    
                    // Set another tab as current if available
                    if (this.jobSearchTabs.size > 0) {
                        const firstTab = this.jobSearchTabs.keys().next().value;
                        this.currentJobSearchTabId = firstTab;
                        console.log(`AI Agent: Set tab ${firstTab} as new current job search tab`);
                    }
                }
            }
        } catch (error) {
            console.error('AI Agent: Error removing job search tab from tracking:', error);
        }
    }

    async updateJobSearchTabStatus(tabId, status, activity = null) {
        try {
            this.updateLastActivity();
            const tabInfo = this.jobSearchTabs.get(tabId);
            if (tabInfo) {
                tabInfo.status = status;
                if (activity) {
                    tabInfo.lastActivity = Date.now();
                }
                console.log(`AI Agent: Updated tab ${tabId} status to: ${status}`);
            }
        } catch (error) {
            console.error('AI Agent: Error updating job search tab status:', error);
        }
    }

    async getJobSearchTabsInfo() {
        try {
            this.updateLastActivity();
            const tabsInfo = [];
            for (const [tabId, info] of this.jobSearchTabs) {
                tabsInfo.push({
                    tabId,
                    ...info,
                    isCurrent: tabId === this.currentJobSearchTabId
                });
            }
            return tabsInfo;
        } catch (error) {
            console.error('AI Agent: Error getting job search tabs info:', error);
            return [];
        }
    }

    async getAllOpenTabsInfo() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Getting all open tabs info...');
            
            const allTabs = await chrome.tabs.query({});
            const tabsInfo = allTabs.map(tab => ({
                id: tab.id,
                url: tab.url,
                title: tab.title,
                active: tab.active,
                isJobSearchTab: this.jobSearchTabs.has(tab.id),
                isLinkedInJobs: tab.url.includes('linkedin.com/jobs'),
                status: this.jobSearchTabs.get(tab.id)?.status || 'unknown'
            }));
            
            console.log(`AI Agent: Found ${tabsInfo.length} open tabs`);
            return tabsInfo;
        } catch (error) {
            console.error('AI Agent: Error getting all open tabs info:', error);
            return [];
        }
    }

    async closeAllJobSearchTabs() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Closing all job search tabs...');
            await this.updateStatus('Closing all job search tabs...', 'info');
            
            const tabsToClose = Array.from(this.jobSearchTabs.keys());
            let closedCount = 0;
            
            for (const tabId of tabsToClose) {
                try {
                    await chrome.tabs.remove(tabId);
                    console.log(`AI Agent: Closed job search tab ${tabId}`);
                    closedCount++;
                } catch (error) {
                    console.log(`AI Agent: Could not close tab ${tabId}: ${error.message}`);
                }
            }
            
            // Clear tracking
            this.jobSearchTabs.clear();
            this.currentJobSearchTabId = null;
            
            console.log(`AI Agent: Closed ${closedCount} job search tabs`);
            await this.updateStatus(`Closed ${closedCount} job search tabs`, 'success');
            
            return closedCount;
        } catch (error) {
            console.error('AI Agent: Error closing all job search tabs:', error);
            await this.updateStatus(`Error closing tabs: ${error.message}`, 'error');
            return 0;
        }
    }

    async resetJobSearchTabs() {
        try {
            this.updateLastActivity();
            console.log('AI Agent: Resetting job search tabs...');
            await this.updateStatus('Resetting job search tabs...', 'info');
            
            // Close all existing job search tabs
            const closedCount = await this.closeAllJobSearchTabs();
            
            // Clear tracking
            this.jobSearchTabs.clear();
            this.currentJobSearchTabId = null;
            
            console.log(`AI Agent: Reset completed - closed ${closedCount} tabs`);
            await this.updateStatus(`Reset completed - next search will create new tab`, 'success');
            
            return { success: true, closedCount };
        } catch (error) {
            console.error('AI Agent: Error resetting job search tabs:', error);
            await this.updateStatus(`Error resetting tabs: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async getJobSearchTabsDetailedStatus() {
        try {
            this.updateLastActivity();
            const status = {
                totalTabs: this.jobSearchTabs.size,
                currentTabId: this.currentJobSearchTabId,
                tabs: []
            };
            
            for (const [tabId, info] of this.jobSearchTabs) {
                try {
                    const tab = await chrome.tabs.get(tabId);
                    status.tabs.push({
                        id: tabId,
                        url: tab.url,
                        title: tab.title,
                        active: tab.active,
                        status: info.status,
                        createdAt: info.createdAt,
                        lastActivity: info.lastActivity,
                        age: Date.now() - info.createdAt,
                        isCurrent: tabId === this.currentJobSearchTabId
                    });
                } catch (error) {
                    // Tab no longer exists
                    status.tabs.push({
                        id: tabId,
                        status: 'closed',
                        error: 'Tab no longer exists'
                    });
                }
            }
            
            return {
                success: true,
                status: status
            };
        } catch (error) {
            console.error('AI Agent: Error getting detailed job search tabs status:', error);
            return { success: false, error: error.message };
        }
    }
}

// Initialize the AI Agent
// const jobnickAI = new JobnickAI();

// console.log('Jobnick AI Agent loaded and ready!'); 