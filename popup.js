// Popup functionality for Jobnick extension
class PopupManager {
    constructor() {
        this.currentTab = 'profile';
        this.debugMode = false;
        this.autoSaveTimeout = null; // For debouncing auto-save
        this.init();
    }

    init() {
        this.setupTabSwitching();
        this.setupFormHandling();
        // Removed automation controls
        this.loadSavedData();
        this.startStatusUpdates();
        this.setupAIStatusListener();
        this.setupAIControls();
        this.setupHistoryControls();
        this.renderHistoryTable();
        this.refreshAiApplicationsFromHistory();
    }

    setupAIStatusListener() {
        // Guard to avoid multiple listeners
        if (this._aiStatusListenerAttached) return;
        this._aiStatusListenerAttached = true;

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'updateAIStatus' && message.status) {
                const { message: msg, type } = message.status;
                this.logDebug(`AI: ${msg}`, type || 'info');
                sendResponse && sendResponse({ success: true });
            }
            if (message.action === 'historyUpdated') {
                this.renderHistoryTable();
                sendResponse && sendResponse({ success: true });
            }
        });
    }

    startStatusUpdates() {
        // Update AI status every 3 seconds
        setInterval(() => {
            if (this.currentTab === 'aiAgent') {
                this.updateAIStatus();
            }
        }, 3000);
    }

    setupTabSwitching() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                // Don't await to prevent blocking UI
                this.switchTab(targetTab).catch(e => console.warn('Tab switch error:', e));
            });
        });
    }

    async switchTab(targetTab) {
        // If leaving AI Agent tab, auto-save in background (debounced)
        if (this.currentTab === 'aiAgent') {
            // Clear any pending save and schedule a new one
            if (this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
            }
            this.autoSaveTimeout = setTimeout(() => {
                this.saveAIAgentData().catch(e => console.warn('Background save failed:', e));
            }, 100); // Very short delay to allow for quick tab switches
        }
        
        // Immediately update UI - don't wait for anything
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        document.querySelector(`[data-tab="${targetTab}"]`).classList.add('active');
        document.getElementById(targetTab).classList.add('active');

        this.currentTab = targetTab;
        
        // When entering AI Agent tab, reload data in background
        if (targetTab === 'aiAgent') {
            // Run these in background without blocking the tab switch
            this.reloadAIAgentFromStorage().catch(e => console.warn('AI Agent reload failed:', e));
            this.updateAIStatus();
        }
    }

    setupFormHandling() {
        // Profile form (safe)
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProfileData();
            });
        }

        // Preferences form (safe)
        const preferencesForm = document.getElementById('preferencesForm');
        if (preferencesForm) {
            preferencesForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.savePreferencesData();
            });
        }

        // AI Agent form (safe)
        const aiAgentForm = document.getElementById('aiAgentForm');
        if (aiAgentForm) {
            aiAgentForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveAIAgentData();
            });
            // AI Agent - auto save on change/input/blur
            const autoSaveFields = ['geminiApiKey','aiSearchDelay','aiConfidenceThreshold','maxDailyAIApplications'];
            const debouncedSaveAI = this.debounce(() => this.saveAIAgentData(), 400);
            autoSaveFields.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('input', debouncedSaveAI);
                el.addEventListener('change', () => this.saveAIAgentData());
                el.addEventListener('blur', () => this.saveAIAgentData());
            });
        }

        // Optional backup save button (if exists)
        const saveBtn = document.getElementById('saveAIAgent');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveAIAgentData();
            });
        }

        // Also update status when API key field changes, if field exists
        const geminiApiKeyField = document.getElementById('geminiApiKey');
        if (geminiApiKeyField) {
            geminiApiKeyField.addEventListener('input', async () => {
                const apiKey = geminiApiKeyField.value;
                this.updateAPIKeyStatus(apiKey);
                this.hideWarningBanners();
            });
        }

        // Read resume file content and persist for deep analysis (if input exists)
        const resumeInput = document.getElementById('resumeFile');
        if (resumeInput) {
            resumeInput.addEventListener('change', async () => {
                const file = resumeInput.files?.[0];
                if (!file) return;
                try {
                    let text = '';
                    const isPdf = (file.type === 'application/pdf') || file.name.toLowerCase().endsWith('.pdf');
                    if (isPdf) {
                        this.logDebug('PDF resume detected. Extracting text using Gemini...', 'info');
                        try {
                            text = await this.extractPdfTextWithGemini(file);
                        } catch (err) {
                            const fallback = await file.text();
                            if (!fallback || fallback.length < 50) {
                                this.logDebug(`PDF extraction failed (${err?.message || err}). Please set your API key and re-upload to extract PDF text properly.`, 'warning');
                                this.showNotification('Set your Gemini API key in AI Agent tab, then re-upload the PDF resume to extract text', 'warning');
                                return;
                            }
                            this.logDebug(`PDF extraction failed: ${err?.message || err}. Saved fallback raw text.`, 'warning');
                            text = fallback;
                        }
                    } else {
                        text = await file.text();
                    }
                    
                    // Save text content for AI analysis
                    await chrome.storage.sync.set({ resumeContent: text });
                    try { await chrome.storage.local.set({ resumeContent: text }); } catch (_) {}
                    
                    // Save binary file data for automatic attachment during applications
                    try {
                        const buf = await file.arrayBuffer();
                        const base64 = this.arrayBufferToBase64(buf);
                        const meta = { 
                            name: file.name || 'resume.pdf', 
                            type: file.type || 'application/pdf', 
                            base64 
                        };
                        await chrome.storage.local.set({ resumeFile: meta });
                        this.logDebug(`Saved resume file locally: ${meta.name}, ${meta.type}, size ${buf.byteLength} bytes`, 'success');
                    } catch (e) {
                        this.logDebug(`Failed saving resume file: ${e?.message || e}`, 'error');
                    }
                    
                    this.logDebug(`Saved resume content (${(text || '').length} chars) from ${file.name}`, 'success');
                    // Update status label immediately
                    const resumeEl = document.getElementById('resumeStatus');
                    if (resumeEl) {
                        const len = (text || '').length;
                        resumeEl.textContent = len > 0 ? `Stored (${len} chars)` : 'Not uploaded';
                        resumeEl.style.color = len > 0 ? '#28a745' : '#dc3545';
                        resumeEl.style.fontWeight = '600';
                    }
                    
                    // Update resume file status in AI tab
                    this.updateResumeFileStatus();
                } catch (e) { console.warn('Failed to read resume file', e); }
            });
        }

        // Listen to storage changes to refresh the form/status if updated elsewhere
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'sync' && area !== 'local') return;
            if (changes.aiAgent?.newValue) {
                this.populateAIAgentForm(changes.aiAgent.newValue);
            }
            if (changes.geminiApiKey?.newValue) {
                this.updateAPIKeyStatus(changes.geminiApiKey.newValue);
            }
        });
    }

    async extractPdfTextWithGemini(file) {
        let apiKey = document.getElementById('geminiApiKey')?.value?.trim();
        if (!apiKey) {
            const stored = await chrome.storage.sync.get(['geminiApiKey','aiAgent']);
            apiKey = stored?.geminiApiKey?.trim()
                  || stored?.aiAgent?.geminiApiKey?.trim()
                  || '';
        }
        if (!apiKey) {
            const local = await chrome.storage.local.get(['geminiApiKey','aiAgent']);
            apiKey = local?.geminiApiKey?.trim()
                  || local?.aiAgent?.geminiApiKey?.trim()
                  || '';
        }
        if (!apiKey) throw new Error('Gemini API key not configured');
        
        const arrayBuffer = await file.arrayBuffer();
        const base64 = this.arrayBufferToBase64(arrayBuffer);
        
        // Prefer a document-capable model for PDF parsing
        const tryModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'];
        let lastErr = null;
        for (const model of tryModels) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
                const body = {
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: 'Extract the raw, plain text content from this PDF resume. Return only the text without any extra commentary.' },
                                { inline_data: { mime_type: 'application/pdf', data: base64 } }
                            ]
                        }
                    ]
                };
                const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const data = await resp.json().catch(() => null);
                if (!resp.ok) {
                    const msg = data?.error?.message || `${resp.status} ${resp.statusText}`;
                    throw new Error(msg);
                }
                const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p?.text).filter(Boolean).join(' ') || '';
                if (text && text.trim().length > 0) {
                    return text;
                }
                lastErr = new Error('Empty text from model');
            } catch (e) {
                lastErr = e;
                continue;
            }
        }
        throw lastErr || new Error('Failed to extract PDF text');
    }
    
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    setupAutomationControls() {
        const startBtn = document.getElementById('startAutomation');
        const stopBtn = document.getElementById('stopAutomation');
        const testBtn = document.getElementById('testApplication');
        const autoApplyCheckbox = document.getElementById('autoApply');

        startBtn.addEventListener('click', () => this.startAutomation());
        stopBtn.addEventListener('click', () => this.stopAutomation());
        testBtn.addEventListener('click', () => this.testApplication());
        autoApplyCheckbox.addEventListener('change', (e) => this.toggleAutoApply(e.target.checked));

        // AI Agent controls
        const startAISearchBtn = document.getElementById('startAISearch');
        const stopAISearchBtn = document.getElementById('stopAISearch');
        const testAIBtn = document.getElementById('testAI');
        const toggleDebugBtn = document.getElementById('toggleDebug');

        startAISearchBtn.addEventListener('click', () => this.startAISearch());
        stopAISearchBtn.addEventListener('click', () => this.stopAISearch());
        testAIBtn.addEventListener('click', () => this.testAI());
        toggleDebugBtn.addEventListener('click', () => this.toggleDebugMode());

        // Debug controls
        const clearDebugLogBtn = document.getElementById('clearDebugLog');
        const exportDebugLogBtn = document.getElementById('exportDebugLog');
        const testGeminiAPIBtn = document.getElementById('testGeminiAPI');

        if (clearDebugLogBtn) clearDebugLogBtn.addEventListener('click', () => this.clearDebugLog());
        if (exportDebugLogBtn) exportDebugLogBtn.addEventListener('click', () => this.exportDebugLog());
        if (testGeminiAPIBtn) testGeminiAPIBtn.addEventListener('click', () => this.testGeminiAPI());
    }

    async saveProfileData() {
        const profileData = {
            fullName: document.getElementById('fullName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            location: document.getElementById('location').value,
            currentCompany: document.getElementById('currentCompany').value,
            linkedinUrl: document.getElementById('linkedinUrl').value,
            resumeFile: this.getResumeFileInfo(),
            coverLetterFile: this.getCoverLetterFileInfo()
        };

        try {
            await chrome.storage.sync.set({ profile: profileData });
            this.showNotification('Profile saved successfully!', 'success');
        } catch (error) {
            this.showNotification('Error saving profile data', 'error');
            console.error('Error saving profile:', error);
        }
    }

    getResumeFileInfo() {
        const fileInput = document.getElementById('resumeFile');
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            return {
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified
            };
        }
        return null;
    }

    getCoverLetterFileInfo() {
        const fileInput = document.getElementById('coverLetterFile');
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            return {
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified
            };
        }
        return null;
    }

    async savePreferencesData() {
        const preferencesData = {
            jobTitles: document.getElementById('jobTitles').value,
            keywords: document.getElementById('keywords').value,
            excludeKeywords: document.getElementById('excludeKeywords').value,
            locationPreference: document.getElementById('locationPreference').value,
            companySize: document.getElementById('companySize').value,
            experienceFilters: Array.from(document.querySelectorAll('#experienceFilters .exp-filter:checked')).map(i => i.value),
            datePosted: document.getElementById('datePosted')?.value || 'any',
            jobTypeFilters: Array.from(document.querySelectorAll('#jobTypeFilters .jt-filter:checked')).map(i => i.value)
        };

        try {
            await chrome.storage.sync.set({ preferences: preferencesData });
            this.showNotification('Preferences saved successfully!', 'success');
        } catch (error) {
            this.showNotification('Error saving preferences', 'error');
            console.error('Error saving preferences:', error);
        }
    }

    async saveAIAgentData() {
        const aiAgentData = {
            geminiApiKey: document.getElementById('geminiApiKey')?.value || '',
            aiSearchDelay: parseInt(document.getElementById('aiSearchDelay')?.value) || 30,
            aiConfidenceThreshold: parseFloat(document.getElementById('aiConfidenceThreshold')?.value) || 0.7,
            maxDailyAIApplications: parseInt(document.getElementById('maxDailyAIApplications')?.value) || 15,
            _lastSavedAt: Date.now()
        };

        try {
            await new Promise((resolve, reject) => {
                chrome.storage.sync.set(
                    { aiAgent: aiAgentData, geminiApiKey: aiAgentData.geminiApiKey },
                    () => (chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve())
                );
            });
            try { await chrome.storage.local.set({ aiAgent: aiAgentData, geminiApiKey: aiAgentData.geminiApiKey }); } catch (_) {}

            this.showNotification('AI Agent settings saved successfully!', 'success');
            this.updateAPIKeyStatus(aiAgentData.geminiApiKey);
            // Ensure background has the fresh key
            try { await chrome.runtime.sendMessage({ action: 'setGeminiApiKey', apiKey: aiAgentData.geminiApiKey }); } catch(_) {}

            const verify = await chrome.storage.sync.get('aiAgent');
            this.logDebug(`Saved aiAgent: ${JSON.stringify(verify?.aiAgent || {})}`, 'info');
            if (verify?.aiAgent) this.populateAIAgentForm(verify.aiAgent);
            // Additional verification logs for sync/local
            const after = await chrome.storage.sync.get(['aiAgent','geminiApiKey']);
            const afterLocal = await chrome.storage.local.get(['aiAgent','geminiApiKey']);
            this.logDebug(`Verify sync aiAgent: ${JSON.stringify(after?.aiAgent || {})}`, 'info');
            this.logDebug(`Verify local aiAgent: ${JSON.stringify(afterLocal?.aiAgent || {})}`, 'info');
        } catch (error) {
            this.logDebug(`Error saving AI Agent settings: ${error?.message || error}`, 'error');
            this.showNotification('Error saving AI Agent settings', 'error');
        }
    }

    async startAISearch() {
        try {
            // Try current API key from field; if blank, pull from storage
            let currentApiKey = (document.getElementById('geminiApiKey')?.value || '').trim();
            if (!currentApiKey) {
                const stored = await chrome.storage.sync.get(['geminiApiKey', 'aiAgent']);
                currentApiKey = stored?.geminiApiKey?.trim()
                    || stored?.aiAgent?.geminiApiKey?.trim()
                    || '';
                if (!currentApiKey) {
                    const local = await chrome.storage.local.get(['geminiApiKey', 'aiAgent']);
                    currentApiKey = local?.geminiApiKey?.trim()
                        || local?.aiAgent?.geminiApiKey?.trim()
                        || '';
                }
            }
            
            if (!currentApiKey) {
                this.logDebug('Attempted to start AI search without API key', 'error');
                this.showNotification('Please configure your Gemini API key first', 'warning');
                return;
            }

            // Removed persistence here - saving is now handled by saveAIAgentData form submit

            // Preflight: check resume presence
            try {
                let { resumeContent } = await chrome.storage.sync.get('resumeContent');
                if (!resumeContent) { const localRes = await chrome.storage.local.get('resumeContent'); resumeContent = localRes?.resumeContent; }
                let len = (resumeContent || '').length;
                if (!len || len < 50) {
                    // If a PDF is currently selected, try extracting now with Gemini
                    const resumeInput = document.getElementById('resumeFile');
                    const file = resumeInput?.files?.[0];
                    const isPdf = file && ((file.type === 'application/pdf') || file.name.toLowerCase().endsWith('.pdf'));
                    if (isPdf) {
                        this.logDebug('Resume short; attempting on-the-fly PDF extraction before starting...', 'info');
                        try {
                            const text = await this.extractPdfTextWithGemini(file);
                            await chrome.storage.sync.set({ resumeContent: text });
                            try { await chrome.storage.local.set({ resumeContent: text }); } catch (_) {}
                            len = (text || '').length;
                            this.logDebug(`PDF resume extracted on start (${len} chars)`, 'success');
                        } catch (err) {
                            this.logDebug(`On-the-fly PDF extraction failed: ${err?.message || err}`, 'warning');
                        }
                    }
                    if (!len || len < 50) {
                        this.logDebug('Resume content missing or short. For best results upload a .txt resume.', 'warning');
                        this.showNotification('Tip: Upload your resume as a .txt file for better AI matching', 'info');
                    } else {
                        this.logDebug(`Resume detected (${len} chars)`, 'success');
                    }
                }
            } catch (_) {}

            this.logDebug('Starting AI Job Search...', 'info');
            this.updateLastAction('Starting AI Search');

            const aiAgentData = await chrome.storage.sync.get('aiAgent');
            const storedAgent = aiAgentData?.aiAgent || {};
            const settings = {
                applyDelay: storedAgent.aiSearchDelay ?? 30,
                searchDelay: storedAgent.aiSearchDelay ?? 30,
                maxApplications: storedAgent.maxDailyAIApplications ?? 15,
                confidenceThreshold: storedAgent.aiConfidenceThreshold ?? 0.7
            };

            // Ensure the background agent has the key
            await chrome.runtime.sendMessage({
                action: 'setGeminiApiKey',
                apiKey: currentApiKey
            });

            // Start the AI job search
            await chrome.runtime.sendMessage({
                action: 'startAIJobSearch',
                settings: settings
            });

            this.updateAIStatus('AI Search Running');
            this.toggleAISearchButtons(true);
            this.showNotification('AI Job Search started successfully!', 'success');
            
            this.logDebug('AI Job Search started successfully', 'success');
            this.updateLastAction('AI Search Started');
            
            // Hide any warning banners
            this.hideWarningBanners();
            
        } catch (error) {
            this.logDebug(`Error starting AI search: ${error.message}`, 'error');
            this.incrementErrorCount();
            this.showNotification('Error starting AI search', 'error');
            console.error('Error starting AI search:', error);
        }
    }

    async stopAISearch() {
        try {
            this.logDebug('Stopping AI Job Search...', 'info');
            this.updateLastAction('Stopping AI Search');
            
            await chrome.runtime.sendMessage({ action: 'stopAIJobSearch' });
            
            this.updateAIStatus('Ready');
            this.toggleAISearchButtons(false);
            this.showNotification('AI Job Search stopped', 'info');
            
            this.logDebug('AI Job Search stopped successfully', 'success');
            this.updateLastAction('AI Search Stopped');
        } catch (error) {
            this.logDebug(`Error stopping AI search: ${error.message}`, 'error');
            this.incrementErrorCount();
            this.showNotification('Error stopping AI search', 'error');
            console.error('Error stopping AI search:', error);
        }
    }

    async testAI() {
        try {
            // Check current API key from form field
            const currentApiKey = document.getElementById('geminiApiKey').value;
            
            if (!currentApiKey || currentApiKey.trim() === '') {
                this.logDebug('Attempted to test AI without API key', 'error');
                this.showNotification('Please configure your Gemini API key first', 'warning');
                return;
            }

            this.logDebug('Testing AI functionality...', 'info');
            this.updateLastAction('Testing AI');

            // Get current tab to test AI analysis
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0 || !tabs[0].url.includes('linkedin.com/jobs')) {
                this.logDebug('Not on LinkedIn jobs page for AI test', 'warning');
                this.showNotification('Please navigate to a LinkedIn job page first', 'warning');
                return;
            }

            this.showNotification('Testing AI analysis...', 'info');
            
            // Send test message to AI agent
            const response = await chrome.runtime.sendMessage({
                action: 'testAI'
            });

            if (response.success) {
                this.logDebug('AI test completed successfully', 'success');
                this.updateLastAction('AI Test Success');
                this.showNotification('AI test completed successfully!', 'success');
            } else {
                this.logDebug('AI test failed', 'error');
                this.updateLastAction('AI Test Failed');
                this.incrementErrorCount();
                this.showNotification('AI test failed', 'error');
            }
        } catch (error) {
            this.logDebug(`Error testing AI: ${error.message}`, 'error');
            this.incrementErrorCount();
            this.showNotification('Error testing AI', 'error');
            console.error('Error testing AI:', error);
        }
    }

    updateAIStatus(status = null) {
        if (status) {
            const el = document.getElementById('aiAgentStatus');
            if (el) el.textContent = status;
        }
        this.updateAIStatusCounts();
    }

    async updateAIStatusCounts() {
        try {
            const result = await chrome.storage.local.get(['jobsAnalyzedCount', 'aiApplicationsCount']);
            document.getElementById('jobsAnalyzedCount').textContent = result.jobsAnalyzedCount || 0;
            document.getElementById('aiApplicationsCount').textContent = result.aiApplicationsCount || 0;

            // Update resume status from stored text
            let { resumeContent } = await chrome.storage.sync.get('resumeContent');
            const len = (resumeContent || '').length;
            const resumeEl = document.getElementById('resumeStatus');
            if (resumeEl) {
                if (len > 0) {
                    resumeEl.textContent = `Stored (${len} chars)`;
                    resumeEl.style.color = '#28a745';
                    resumeEl.style.fontWeight = '600';
                } else {
                    resumeEl.textContent = 'Not uploaded';
                    resumeEl.style.color = '#dc3545';
                    resumeEl.style.fontWeight = '600';
                }
            }
        } catch (error) {
            console.error('Error updating AI status counts:', error);
        }
    }

    toggleAISearchButtons(isRunning) {
        const startBtn = document.getElementById('startAISearch');
        const stopBtn = document.getElementById('stopAISearch');
        
        startBtn.disabled = isRunning;
        stopBtn.disabled = !isRunning;
    }

    updateResumeFileStatus() {
        chrome.storage.local.get('resumeFile', (result) => {
            const resumeFileStatusEl = document.getElementById('resumeFileStatus');
            if (!resumeFileStatusEl) return;

            if (result.resumeFile?.name) {
                const sizeKB = result.resumeFile.base64 ? Math.round(result.resumeFile.base64.length * 0.75 / 1024) : 0;
                resumeFileStatusEl.textContent = `${result.resumeFile.name} (${sizeKB}KB)`;
                resumeFileStatusEl.className = 'status-value status-success';
            } else {
                resumeFileStatusEl.textContent = 'Not uploaded';
                resumeFileStatusEl.className = 'status-value status-error';
            }
        });
    }

    async loadSavedData() {
        try {
            // Try sync first
            let result = await chrome.storage.sync.get([
                'profile', 'preferences', 'automation',
                'aiAgent', 'geminiApiKey', 'resumeContent'
            ]);

            // If some parts are missing, complement from local
            if (!result.aiAgent || !result.geminiApiKey || !result.resumeContent) {
                const local = await chrome.storage.local.get([
                    'profile', 'preferences', 'automation',
                    'aiAgent', 'geminiApiKey', 'resumeContent'
                ]);
                result = {
                    ...result,
                    profile: result.profile || local.profile,
                    preferences: result.preferences || local.preferences,
                    automation: result.automation || local.automation,
                    aiAgent: result.aiAgent || local.aiAgent,
                    geminiApiKey: result.geminiApiKey || local.geminiApiKey,
                    resumeContent: result.resumeContent || local.resumeContent,
                };
            }

            if (result.profile) this.populateProfileForm(result.profile);
            if (result.preferences) this.populatePreferencesForm(result.preferences);
            if (result.automation) this.populateAutomationForm?.(result.automation);

            if (result.aiAgent) {
                this.populateAIAgentForm(result.aiAgent);
                this.updateAPIKeyStatus(result.aiAgent?.geminiApiKey || result.geminiApiKey || '');
            } else {
                // Even if no aiAgent object, status might be known by flat key
                this.updateAPIKeyStatus(result.geminiApiKey || '');
            }
            
            // Update resume file status
            this.updateResumeFileStatus();
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }

    async reloadAIAgentFromStorage() {
        try {
            let sync = await chrome.storage.sync.get(['aiAgent','geminiApiKey']);
            if (!sync?.aiAgent) {
                const local = await chrome.storage.local.get(['aiAgent','geminiApiKey']);
                sync = { ...sync, ...local };
            }
            const agent = sync?.aiAgent || {};
            const key = agent?.geminiApiKey || sync?.geminiApiKey || '';

            if (Object.keys(agent).length) {
                this.populateAIAgentForm({ ...agent, geminiApiKey: key });
            }
            this.updateAPIKeyStatus(key);
        } catch (e) {
            this.logDebug(`reloadAIAgentFromStorage error: ${e?.message || e}`, 'error');
        }
    }

    populateProfileForm(profile) {
        Object.keys(profile).forEach(key => {
            const element = document.getElementById(key);
            if (element && key !== 'resumeFile' && key !== 'coverLetterFile' && key !== 'resume' && key !== 'coverLetter') {
                element.value = profile[key];
            }
        });
        
        // Handle resume file info display
        if (profile.resumeFile) {
            this.displayResumeFileInfo(profile.resumeFile);
        }
        
        // Handle cover letter file info display
        if (profile.coverLetterFile) {
            this.displayCoverLetterFileInfo(profile.coverLetterFile);
        }
    }

    displayResumeFileInfo(fileInfo) {
        const fileInput = document.getElementById('resumeFile');
        if (fileInfo && fileInfo.name) {
            // Create a display element for the uploaded file
            const fileDisplay = document.createElement('div');
            fileDisplay.className = 'file-display';
            fileDisplay.innerHTML = `
                <span class="file-name">📄 ${fileInfo.name}</span>
                <small class="file-size">(${this.formatFileSize(fileInfo.size)})</small>
            `;
            
            // Insert after the file input
            fileInput.parentNode.insertBefore(fileDisplay, fileInput.nextSibling);
        }
    }

    displayCoverLetterFileInfo(fileInfo) {
        const fileInput = document.getElementById('coverLetterFile');
        if (fileInfo && fileInfo.name) {
            // Create a display element for the uploaded file
            const fileDisplay = document.createElement('div');
            fileDisplay.className = 'file-display cover-letter-display';
            fileDisplay.innerHTML = `
                <span class="file-name">📝 ${fileInfo.name}</span>
                <small class="file-size">(${this.formatFileSize(fileInfo.size)})</small>
            `;
            
            // Insert after the file input
            fileInput.parentNode.insertBefore(fileDisplay, fileInput.nextSibling);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    populatePreferencesForm(preferences) {
        Object.keys(preferences).forEach(key => {
            const element = document.getElementById(key);
            if (element && typeof preferences[key] !== 'object') {
                element.value = preferences[key];
            }
        });
        // Experience filters
        if (Array.isArray(preferences.experienceFilters)) {
            preferences.experienceFilters.forEach(v => {
                const cb = document.querySelector(`#experienceFilters .exp-filter[value="${v}"]`);
                if (cb) cb.checked = true;
            });
        }
        if (preferences.datePosted) {
            const sel = document.getElementById('datePosted');
            if (sel) sel.value = preferences.datePosted;
        }
        if (Array.isArray(preferences.jobTypeFilters)) {
            preferences.jobTypeFilters.forEach(v => {
                const cb = document.querySelector(`#jobTypeFilters .jt-filter[value="${v}"]`);
                if (cb) cb.checked = true;
            });
        }
    }

    populateAutomationForm(automation) {
        if (automation.applyDelay) {
            document.getElementById('applyDelay').value = automation.applyDelay;
        }
        if (automation.maxApplications) {
            document.getElementById('maxApplications').value = automation.maxApplications;
        }
        if (automation.autoApply !== undefined) {
            document.getElementById('autoApply').checked = automation.autoApply;
        }
    }

    populateAIAgentForm(aiAgent) {
        const geminiApiKeyField = document.getElementById('geminiApiKey');
        const aiSearchDelayField = document.getElementById('aiSearchDelay');
        const aiConfidenceThresholdField = document.getElementById('aiConfidenceThreshold');
        const maxDailyAIApplicationsField = document.getElementById('maxDailyAIApplications');

        if (geminiApiKeyField && aiAgent.geminiApiKey) geminiApiKeyField.value = aiAgent.geminiApiKey;
        if (aiSearchDelayField && aiAgent.aiSearchDelay !== undefined) aiSearchDelayField.value = parseInt(aiAgent.aiSearchDelay);
        if (aiConfidenceThresholdField && aiAgent.aiConfidenceThreshold !== undefined) aiConfidenceThresholdField.value = parseFloat(aiAgent.aiConfidenceThreshold);
        if (maxDailyAIApplicationsField && aiAgent.maxDailyAIApplications !== undefined) maxDailyAIApplicationsField.value = parseInt(aiAgent.maxDailyAIApplications);

        // Update API key status and hide warnings when configured
        this.updateAPIKeyStatus(aiAgent.geminiApiKey);
        if (aiAgent.geminiApiKey && aiAgent.geminiApiKey.trim() !== '') this.hideWarningBanners();
    }

    hideWarningBanners() {
        // Hide any warning banners or messages
        const warningElements = document.querySelectorAll('.warning-banner, .alert-warning, .notification-warning');
        warningElements.forEach(element => {
            element.style.display = 'none';
        });
    }

    // Debug Functions
    toggleDebugMode() {
        const debugPanel = document.getElementById('debugPanel');
        const toggleBtn = document.getElementById('toggleDebug');
        
        if (debugPanel.style.display === 'none') {
            debugPanel.style.display = 'block';
            toggleBtn.textContent = '🐛 Hide Debug';
            toggleBtn.classList.add('btn-warning');
            this.logDebug('Debug mode enabled', 'info');
            this.startDebugUpdates();
        } else {
            debugPanel.style.display = 'none';
            toggleBtn.textContent = '🐛 Toggle Debug Mode';
            toggleBtn.classList.remove('btn-warning');
            this.stopDebugUpdates();
        }
    }

    logDebug(message, type = 'info') {
        const debugLog = document.getElementById('debugLog');
        if (!debugLog) return;

        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-${type}`;
        logEntry.innerHTML = `[${timestamp}] ${message}`;
        
        debugLog.appendChild(logEntry);
        debugLog.scrollTop = debugLog.scrollHeight;

        // Keep only last 100 log entries
        while (debugLog.children.length > 10000) {
            debugLog.removeChild(debugLog.firstChild);
        }
    }

    clearDebugLog() {
        const debugLog = document.getElementById('debugLog');
        if (debugLog) {
            debugLog.innerHTML = '';
            this.logDebug('Debug log cleared', 'info');
        }
    }

    exportDebugLog() {
        const debugLog = document.getElementById('debugLog');
        if (!debugLog) return;

        const logText = debugLog.innerText;
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `jobnick-debug-log-${new Date().toISOString().slice(0, 19)}.txt`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.logDebug('Debug log exported', 'success');
    }

async testGeminiAPI() {
  try {
    const apiKey = document.getElementById('geminiApiKey').value?.trim();
    if (!apiKey) {
      this.logDebug('No API key configured for testing', 'error');
      this.showNotification('Please configure your Gemini API key first', 'warning');
      return;
    }

    this.logDebug('Testing Gemini API connection...', 'info');

    const model = 'gemini-2.0-flash'; // או 'gemini-2.0-pro'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello! This is a test message from Jobnick. Please respond with "API connection successful" if you can read this.' }]
          }
        ]
      })
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      const msg = data?.error?.message || `${resp.status} ${resp.statusText}`;
      this.logDebug(`Gemini API test failed: ${msg}`, 'error');
      this.showNotification(`Gemini API test failed, ${msg}`, 'error');
      return;
    }

    // שליפת הטקסט מהתגובה בפורמט העדכני
    const aiResponse =
      data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        ?.filter(Boolean)
        ?.join(' ')
      ?? '';

    this.logDebug(`Gemini API test successful: ${aiResponse}`, 'success');
    this.showNotification('Gemini API connection successful!', 'success');
  } catch (error) {
    this.logDebug(`Gemini API test error: ${error?.message || error}`, 'error');
    this.showNotification('Error testing Gemini API', 'error');
  }
}

    startDebugUpdates() {
        // Update debug status every 2 seconds
        this.debugUpdateInterval = setInterval(() => {
            this.updateDebugStatus();
        }, 2000);
    }

    stopDebugUpdates() {
        if (this.debugUpdateInterval) {
            clearInterval(this.debugUpdateInterval);
            this.debugUpdateInterval = null;
        }
    }

    async updateDebugStatus() {
        try {
            // Update current page
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                const currentPage = this.getPageType(tabs[0].url);
                document.getElementById('debugCurrentPage').textContent = currentPage;
            }

            // Update AI Agent state
            const aiAgentStatus = document.getElementById('aiAgentStatus');
            if (aiAgentStatus) {
                document.getElementById('debugAIState').textContent = aiAgentStatus.textContent;
            }

            // Update last action (this will be updated by other functions)
            // Update error count
            const errorCount = this.debugErrorCount || 0;
            document.getElementById('debugErrorCount').textContent = errorCount;
        } catch (error) {
            this.logDebug(`Error updating debug status: ${error.message}`, 'error');
        }
    }

    getPageType(url) {
        if (url.includes('/jobs/') && url.includes('/view/')) {
            return 'Individual Job';
        } else if (url.includes('/jobs/')) {
            return 'Job Search';
        } else if (url.includes('linkedin.com')) {
            return 'LinkedIn (Other)';
        } else {
            return 'Other Site';
        }
    }

    updateLastAction(action) {
        const lastActionElement = document.getElementById('debugLastAction');
        if (lastActionElement) {
            lastActionElement.textContent = action;
        }
    }

    incrementErrorCount() {
        this.debugErrorCount = (this.debugErrorCount || 0) + 1;
        const errorCountElement = document.getElementById('debugErrorCount');
        if (errorCountElement) {
            errorCountElement.textContent = this.debugErrorCount;
        }
    }

    updateAPIKeyStatus(apiKey) {
        const statusElement = document.getElementById('apiKeyStatus');
        if (!statusElement) return;
        
        if (apiKey && apiKey.trim() !== '') {
            statusElement.textContent = 'Configured ✓';
            statusElement.style.color = '#28a745';
            statusElement.style.fontWeight = '600';
            
            // Hide warning banners when API key is configured
            this.hideWarningBanners();
        } else {
            statusElement.textContent = 'Not configured ✗';
            statusElement.style.color = '#dc3545';
            statusElement.style.fontWeight = '600';
        }
    }

    async startAutomation() {
        const applyDelay = parseInt(document.getElementById('applyDelay').value);
        const maxApplications = parseInt(document.getElementById('maxApplications').value);
        const autoApply = document.getElementById('autoApply').checked;

        if (!autoApply) {
            this.showNotification('Please enable auto-apply first', 'warning');
            return;
        }

        try {
            // Save automation settings
            await chrome.storage.sync.set({
                automation: {
                    applyDelay,
                    maxApplications,
                    autoApply,
                    isRunning: true
                }
            });

            // Send message to background script to start automation
            await chrome.runtime.sendMessage({
                action: 'startAutomation',
                settings: { applyDelay, maxApplications }
            });

            this.isAutomationRunning = true;
            this.updateAutomationUI();
            this.showNotification('Automation started successfully!', 'success');
        } catch (error) {
            this.showNotification('Error starting automation', 'error');
            console.error('Error starting automation:', error);
        }
    }

    async stopAutomation() {
        try {
            await chrome.storage.sync.set({
                automation: { isRunning: false }
            });

            await chrome.runtime.sendMessage({ action: 'stopAutomation' });

            this.isAutomationRunning = false;
            this.updateAutomationUI();
            this.showNotification('Automation stopped', 'info');
        } catch (error) {
            this.showNotification('Error stopping automation', 'error');
            console.error('Error stopping automation:', error);
        }
    }

    async testApplication() {
        try {
            const result = await chrome.tabs.query({ active: true, currentWindow: true });
            if (result[0] && result[0].url.includes('linkedin.com/jobs')) {
                await chrome.tabs.sendMessage(result[0].id, { action: 'testApplication' });
                this.showNotification('Test application sent to current tab', 'info');
            } else {
                this.showNotification('Please navigate to a LinkedIn job page first', 'warning');
            }
        } catch (error) {
            this.showNotification('Error testing application', 'error');
            console.error('Error testing application:', error);
        }
    }

    async toggleAutoApply(enabled) {
        try {
            const automation = await chrome.storage.sync.get('automation') || {};
            automation.autoApply = enabled;
            await chrome.storage.sync.set({ automation });
        } catch (error) {
            console.error('Error toggling auto-apply:', error);
        }
    }

    updateAutomationUI() {
        const startBtn = document.getElementById('startAutomation');
        const stopBtn = document.getElementById('stopAutomation');
        const statusText = document.getElementById('statusText');

        if (this.isAutomationRunning) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusText.textContent = 'Automation is running';
            statusText.style.color = '#28a745';
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            statusText.textContent = 'Ready to start';
            statusText.style.color = '#6c757d';
        }
    }

    async updateApplicationCount() {
        try {
            const result = await chrome.storage.local.get('applicationCount');
            const count = result.applicationCount || 0;
            document.getElementById('applicationCount').textContent = count;
        } catch (error) {
            console.error('Error updating application count:', error);
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;

        // Set background color based on type
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        notification.style.background = colors[type] || colors.info;

        // Add to page
        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    async appendHistoryEntry(entry) {
        try {
            const result = await chrome.storage.local.get('applicationHistory');
            const history = result.applicationHistory || [];
            history.unshift(entry);
            await chrome.storage.local.set({ applicationHistory: history });
            this.renderHistoryTable();
        } catch (e) { console.error('Error appending history entry', e); }
    }

    async renderHistoryTable() {
        try {
            const { applicationHistory = [] } = await chrome.storage.local.get('applicationHistory');
            const tbody = document.querySelector('#historyTable tbody');
            const count = document.getElementById('historyCount');
            if (!tbody) return;
            tbody.innerHTML = '';
            applicationHistory.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(item.timestamp).toLocaleString()}</td>
                    <td title="${item.title || ''}">${item.title || ''}</td>
                    <td>${item.company || ''}</td>
                    <td>${item.location || ''}</td>
                    <td>${item.status || 'Submitted'}</td>
                    <td>${item.link ? `<a href="${item.link}" target="_blank">Open</a>` : ''}</td>
                `;
                tbody.appendChild(tr);
            });
            if (count) count.textContent = `${applicationHistory.length} records`;
        } catch (e) { console.error('Error rendering history', e); }
    }

    setupHistoryControls() {
        const exportBtn = document.getElementById('exportHistory');
        const clearBtn = document.getElementById('clearHistory');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportHistory());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearHistory());
    }

    async exportHistory() {
        const { applicationHistory = [] } = await chrome.storage.local.get('applicationHistory');
        const blob = new Blob([JSON.stringify(applicationHistory, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jobnick-history-${new Date().toISOString().slice(0,19)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async clearHistory() {
        await chrome.storage.local.set({ applicationHistory: [] });
        this.renderHistoryTable();
    }

    async refreshAiApplicationsFromHistory() {
        try {
            const { applicationHistory = [] } = await chrome.storage.local.get('applicationHistory');
            const el = document.getElementById('aiApplicationsCount');
            if (el) el.textContent = applicationHistory.length || 0;
        } catch(e){}
    }

    setupAIControls() {
        const startAISearchBtn = document.getElementById('startAISearch');
        const stopAISearchBtn = document.getElementById('stopAISearch');
        const testAIBtn = document.getElementById('testAI');
        const toggleDebugBtn = document.getElementById('toggleDebug');

        if (startAISearchBtn) startAISearchBtn.addEventListener('click', () => this.startAISearch());
        if (stopAISearchBtn) stopAISearchBtn.addEventListener('click', () => this.stopAISearch());
        if (testAIBtn) testAIBtn.addEventListener('click', () => this.testAI());
        if (toggleDebugBtn) toggleDebugBtn.addEventListener('click', () => this.toggleDebugMode());

        // Debug controls
        const clearDebugLogBtn = document.getElementById('clearDebugLog');
        const exportDebugLogBtn = document.getElementById('exportDebugLog');
        const testGeminiAPIBtn = document.getElementById('testGeminiAPI');
        const testResumeParseBtn = document.getElementById('testResumeParse');
        const testScrollBtn = document.getElementById('testScroll');
        const testSearchPrefsBtn = document.getElementById('testSearchPrefs');
        const testApplyFlowBtn = document.getElementById('testApplyFlow');
        const testCurrentPageBtn = document.getElementById('testCurrentPage');
        const testApplyUrlInput = document.getElementById('testApplyUrl');
        const debugResumeLocationsBtn = document.getElementById('debugResumeLocations');
        const autoAttachResumeBtn = document.getElementById('autoAttachResume');
        const checkStorageStatusBtn = document.getElementById('checkStorageStatus');
        const testAttachResumeClickBtn = document.getElementById('testAttachResumeClick');
        const analyzePageForResumeBtn = document.getElementById('analyzePageForResume');
        const testAIResumeDetectionBtn = document.getElementById('testAIResumeDetection');

        if (clearDebugLogBtn) clearDebugLogBtn.addEventListener('click', () => this.clearDebugLog());
        if (exportDebugLogBtn) exportDebugLogBtn.addEventListener('click', () => this.exportDebugLog());
        if (testGeminiAPIBtn) testGeminiAPIBtn.addEventListener('click', () => this.testGeminiAPI());
        if (testResumeParseBtn) testResumeParseBtn.addEventListener('click', () => this.testResumeParsing());
        if (testScrollBtn) testScrollBtn.addEventListener('click', () => this.testScrollAction());
        if (testSearchPrefsBtn) testSearchPrefsBtn.addEventListener('click', () => this.testSearchByPreferences());
        // if (testApplyFlowBtn) testApplyFlowBtn.addEventListener('click', () => this.testApplyFlow());
        // if (testCurrentPageBtn) testCurrentPageBtn.addEventListener('click', () => this.testCurrentPage());
        if (debugResumeLocationsBtn) debugResumeLocationsBtn.addEventListener('click', () => this.debugResumeLocations());
        if (autoAttachResumeBtn) autoAttachResumeBtn.addEventListener('click', () => this.autoAttachResume());
        if (checkStorageStatusBtn) checkStorageStatusBtn.addEventListener('click', () => this.checkStorageStatus());
        if (testAttachResumeClickBtn) testAttachResumeClickBtn.addEventListener('click', () => this.testAttachResumeClick());
        if (analyzePageForResumeBtn) analyzePageForResumeBtn.addEventListener('click', () => this.analyzePageForResume());
        if (testAIResumeDetectionBtn) testAIResumeDetectionBtn.addEventListener('click', () => this.testAIResumeDetection());

        // Quick Action Buttons
        const quickUploadResumeBtn = document.getElementById('quickUploadResume');
        const quickTestUploadBtn = document.getElementById('quickTestUpload');
        
        if (quickUploadResumeBtn) quickUploadResumeBtn.addEventListener('click', () => this.quickUploadResume());
        if (quickTestUploadBtn) quickTestUploadBtn.addEventListener('click', () => this.quickTestUpload());
    }

    async testResumeParsing() {
        try {
            this.logDebug('Testing resume parsing...', 'info');
            const resumeInput = document.getElementById('resumeFile');
            const file = resumeInput?.files?.[0];
            let text = '';
            if (file) {
                const isPdf = (file.type === 'application/pdf') || file.name.toLowerCase().endsWith('.pdf');
                if (isPdf) {
                    text = await this.extractPdfTextWithGemini(file);
                } else {
                    text = await file.text();
                }
                await chrome.storage.sync.set({ resumeContent: text });
                try { await chrome.storage.local.set({ resumeContent: text }); } catch (_) {}
                this.logDebug(`Resume parsed (${(text || '').length} chars).`, 'success');
            } else {
                const { resumeContent } = await chrome.storage.sync.get('resumeContent');
                text = resumeContent || '';
                this.logDebug(`Using saved resume (${(text || '').length} chars).`, 'info');
            }

            if (!text || text.trim().length < 20) {
                this.logDebug('Resume text is empty or too short to analyze. Please upload a PDF/TXT and try again.', 'warning');
                this.showNotification('Resume text is empty or too short. Re-upload your resume (PDF/TXT) and try again.', 'warning');
                return;
            }

            // Send a quick summarization to Gemini to verify readability
            const apiKey = document.getElementById('geminiApiKey')?.value?.trim();
            if (!apiKey) {
                this.logDebug('No API key configured for resume insight test', 'warning');
                return;
            }
            const model = 'gemini-2.0-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const prompt = `Summarize this resume in one short paragraph with 3-5 key strengths.\n\nRESUME:\n${text.slice(0, 6000)}`;
            const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) });
            const data = await resp.json().catch(() => null);
            if (!resp.ok) {
                const msg = data?.error?.message || `${resp.status} ${resp.statusText}`;
                this.logDebug(`Resume insight test failed: ${msg}`, 'error');
                return;
            }
            const aiText = (data?.candidates?.[0]?.content?.parts || []).map(p => p?.text).filter(Boolean).join(' ') || '';
            this.logDebug(`Resume insight: ${aiText.slice(0, 200)}`, 'success');
        } catch (e) {
            this.logDebug(`Resume parsing test error: ${e?.message || e}`, 'error');
        }
    }

    async testScrollAction() {
        try {
            this.logDebug('Testing page scroll...', 'info');
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) { this.logDebug('No active tab', 'error'); return; }
            const res = await chrome.tabs.sendMessage(tabs[0].id, { action: 'testScroll' });
            if (res?.result?.success) this.logDebug('Scroll test completed', 'success');
            else this.logDebug(`Scroll test failed: ${res?.result?.error || 'unknown'}`, 'error');
        } catch (e) {
            this.logDebug(`Scroll test error: ${e?.message || e}`, 'error');
        }
    }

    async testSearchByPreferences() {
        try {
            this.logDebug('Triggering search by current preferences...', 'info');
            // Read preferences from form (not from storage to allow quick tests)
            const prefs = {
                jobTitles: document.getElementById('jobTitles')?.value || '',
                keywords: document.getElementById('keywords')?.value || '',
                locationPreference: document.getElementById('locationPreference')?.value || '',
                experienceFilters: Array.from(document.querySelectorAll('#experienceFilters .exp-filter:checked')).map(i => i.value),
                datePosted: document.getElementById('datePosted')?.value || 'any',
                jobTypeFilters: Array.from(document.querySelectorAll('#jobTypeFilters .jt-filter:checked')).map(i => i.value)
            };
            const query = [prefs.jobTitles, prefs.keywords].filter(Boolean).join(', ');
            const searchData = {
                query,
                location: prefs.locationPreference,
                experienceFilters: prefs.experienceFilters,
                datePosted: prefs.datePosted,
                jobTypeFilters: prefs.jobTypeFilters
            };

            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url.includes('linkedin.com')) {
                this.logDebug('Opening LinkedIn Jobs...', 'info');
                if (tab) await chrome.tabs.update(tab.id, { url: 'https://www.linkedin.com/jobs/' });
                else tab = (await chrome.tabs.create({ url: 'https://www.linkedin.com/jobs/' })) || tab;
                await new Promise(r => setTimeout(r, 5000));
            }
            // Wait for content script readiness
            const ready = await chrome.tabs.sendMessage(tab.id, { action: 'ping' }).catch(() => null);
            if (!ready?.ready) {
                await new Promise(r => setTimeout(r, 1500));
            }
            await chrome.tabs.sendMessage(tab.id, { action: 'performJobSearch', searchData });
            this.logDebug('Search by preferences dispatched', 'success');
        } catch (e) {
            this.logDebug(`Search by preferences error: ${e?.message || e}`, 'error');
        }
    }

    async testApplyFlow() {
        try {
            const defaultUrl = 'https://www.doorloop.com/job-post?job=A7.A54';
            const url = (document.getElementById('testApplyUrl')?.value || '').trim() || defaultUrl;
            this.logDebug(`Testing Apply flow on: ${url}`, 'info');
            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) { tab = await chrome.tabs.create({ url }); await new Promise(r => setTimeout(r, 5000)); }
            else { await chrome.tabs.update(tab.id, { url }); await new Promise(r => setTimeout(r, 5000)); }

            // Try content-script route first across all frames
            let usedInjection = false;
            let res = null;
            try {
                const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
                for (const f of frames) {
                    try {
                        const r = await chrome.tabs.sendMessage(tab.id, { action: 'testApplyFlow' }, { frameId: f.frameId });
                        if (r?.success) { res = r; break; }
                    } catch (_) {}
                }
                if (!res) usedInjection = true;
            } catch (_) {
                usedInjection = true;
            }

            if (usedInjection) {
                this.logDebug('Content script not available on this site or frames. Falling back to injected apply flow (all frames).', 'warning');
                const { profile = {} } = await chrome.storage.sync.get('profile');
                const inj = await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    args: [profile],
                    func: (p) => {
                        const setVal = (el, val) => { try { if (el.isContentEditable) { el.textContent = val; el.dispatchEvent(new InputEvent('input', { bubbles: true })); } else { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); } el.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} };
                        const isVisible = (el) => el && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().width > 0;
                        const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], select')).filter(isVisible);
                        inputs.forEach(el => {
                            const name = (el.getAttribute('name')||'').toLowerCase();
                            const ph   = (el.getAttribute('placeholder')||'').toLowerCase();
                            const aria = (el.getAttribute('aria-label')||'').toLowerCase();
                            const blob = `${name} ${ph} ${aria}`;
                            if (/email|mail/.test(blob)) setVal(el, p.email||'');
                            else if (/phone|טל/.test(blob)) setVal(el, p.phone||'');
                            else if (/first.*name/.test(blob)) setVal(el, (p.firstName || (p.fullName||'').split(' ')[0] || ''));
                            else if (/last.*name/.test(blob)) setVal(el, (p.lastName || (p.fullName||'').split(' ').slice(1).join(' ') || ''));
                            else if (/full.*name|name/.test(blob)) setVal(el, p.fullName||'');
                            else if (/github/.test(blob)) setVal(el, p.githubUrl||'');
                            else if (/website|site/.test(blob)) setVal(el, p.websiteUrl||'');
                            else if (/portfolio/.test(blob)) setVal(el, p.portfolioUrl||'');
                            else if (/linkedin/.test(blob)) setVal(el, p.linkedinUrl||'');
                            else if (/company|employer/.test(blob)) setVal(el, p.currentCompany||'');
                            else if (/location|city|address/.test(blob)) setVal(el, p.location||'');
                        });
                        const btn = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], a')).find(b => { const t=((b.textContent||'')+(b.getAttribute('aria-label')||'')).toLowerCase(); return /apply|submit|send application|שלח|הגש|להגיש/.test(t) });
                        try { btn?.click(); } catch(_) {}
                        return { success: true };
                    }
                });
                res = inj?.find(x => x?.result)?.result || { success: true };
            }

            if (res?.success) this.logDebug('Test Apply flow completed', 'success');
            else this.logDebug(`Test Apply flow failed: ${res?.error || 'unknown'}`, 'error');
        } catch (e) {
            this.logDebug(`Test Apply flow error: ${e?.message || e}`, 'error');
        }
    }

    async debugResumeLocations() {
        try {
            this.logDebug('Scanning current page for resume upload locations...', 'info');
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) { 
                this.logDebug('No active tab found', 'error'); 
                return; 
            }

            const result = await chrome.tabs.sendMessage(tabs[0].id, { action: 'debugResumeLocations' });
            if (result?.success) {
                const counts = result.result;
                if (counts.inputs === 0 && counts.zones === 0 && counts.triggers === 0) {
                    this.logDebug('❌ No resume upload locations detected on this page', 'warning');
                    this.showNotification('No resume upload locations found on this page', 'warning');
                } else {
                    this.logDebug(`✅ Found ${counts.inputs + counts.zones + counts.triggers} total resume upload locations`, 'success');
                    this.showNotification('Resume locations detected - check debug log for details', 'success');
                }
            } else {
                this.logDebug('Failed to scan page for resume locations', 'error');
            }
        } catch (e) {
            this.logDebug(`Resume location scan error: ${e?.message || e}`, 'error');
        }
    }

    async autoAttachResume() {
        try {
            this.logDebug('🎯 Auto Attach Resume - Starting...', 'info');
            
            // Enhanced storage debugging
            this.logDebug('🔍 Checking storage for resume file...', 'info');
            const { resumeFile } = await chrome.storage.local.get('resumeFile');
            const syncResult = await chrome.storage.sync.get('resumeContent');
            const localResult = await chrome.storage.local.get('resumeContent');
            
            this.logDebug(`Storage debug: resumeFile=${!!resumeFile?.base64}, syncContent=${!!syncResult?.resumeContent}, localContent=${!!localResult?.resumeContent}`, 'info');
            
            if (resumeFile?.base64) {
                this.logDebug(`📁 Binary resume file found: ${resumeFile.name} (${Math.round(resumeFile.base64.length * 0.75 / 1024)}KB)`, 'success');
            } else if (syncResult?.resumeContent || localResult?.resumeContent) {
                this.logDebug(`📄 Text resume content found: ${(syncResult?.resumeContent || localResult?.resumeContent || '').length} chars`, 'success');
            } else {
                this.logDebug('❌ No resume file or content found in storage. Please upload a resume first.', 'warning');
                this.showNotification('No resume file found. Please upload your resume in Profile Setup first.', 'warning');
                
                // Show storage diagnostic info
                const diagnostic = await this.diagnoseStorageIssue();
                this.logDebug(`Storage diagnostic: ${diagnostic}`, 'info');
                return;
            }

            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) { 
                this.logDebug('No active tab found', 'error'); 
                return; 
            }

            const tab = tabs[0];
            this.logDebug(`🌐 Current page: ${tab.url}`, 'info');

            // Enhanced scanning with more detailed feedback
            const scanResult = await chrome.tabs.sendMessage(tab.id, { action: 'debugResumeLocations' });
            if (!scanResult?.success || !scanResult.result) {
                this.logDebug('❌ Failed to scan page for resume locations', 'error');
                
                // Try enhanced scanning
                const enhancedScan = await this.performEnhancedPageScan(tab.id);
                if (!enhancedScan.success) {
                    this.showNotification('Page scanning failed - check if content script is loaded', 'error');
                    return;
                }
            }

            const counts = scanResult?.result || { inputs: 0, zones: 0, triggers: 0 };
            if (counts.inputs === 0 && counts.zones === 0 && counts.triggers === 0) {
                this.logDebug('❌ No resume upload locations detected on this page', 'warning');
                this.showNotification('No resume upload locations found on this page', 'warning');
                
                // Suggest manual scan
                this.logDebug('💡 Try the "Scan Resume Locations" button to see detailed analysis', 'info');
                return;
            }

            this.logDebug(`🔍 Found ${counts.inputs} file inputs, ${counts.zones} drop zones, ${counts.triggers} trigger buttons`, 'info');

            // Now attempt to attach the resume
            let attachResult = null;
            try {
                attachResult = await chrome.tabs.sendMessage(tab.id, { action: 'autoAttachResume' });
            } catch (connectionError) {
                if (connectionError.message?.includes('Could not establish connection') || 
                    connectionError.message?.includes('Receiving end does not exist')) {
                    
                    this.logDebug('🔄 Content script not available for auto-attach. Please refresh the page and try again.', 'warning');
                    this.showContentScriptGuide();
                    this.showNotification('Content script not loaded - check debug log for troubleshooting steps', 'warning');
                    return;
                } else {
                    throw connectionError;
                }
            }
            
            if (attachResult?.success && attachResult?.attached) {
                this.logDebug(`✅ Resume successfully attached to ${attachResult.method}!`, 'success');
                this.showNotification(`✅ Resume attached successfully via ${attachResult.method}!`, 'success');
            } else if (attachResult?.success && !attachResult?.attached) {
                this.logDebug(`⚠️ Resume attachment attempted but may require manual action. ${attachResult.message || ''}`, 'warning');
                this.showNotification('Resume attachment attempted - please check the page', 'warning');
            } else {
                this.logDebug(`❌ Resume attachment failed: ${attachResult?.error || 'Unknown error'}`, 'error');
                this.showNotification('Resume attachment failed - check debug log', 'error');
            }

        } catch (e) {
            this.logDebug(`Auto attach resume error: ${e?.message || e}`, 'error');
            this.showNotification('Error during auto-attach', 'error');
        }
    }

    async diagnoseStorageIssue() {
        try {
            // Check if user has uploaded any resume
            const resumeInput = document.getElementById('resumeFile');
            const hasFileSelected = resumeInput?.files?.length > 0;
            
            // Check storage permissions
            const syncStorage = await chrome.storage.sync.get(null);
            const localStorage = await chrome.storage.local.get(null);
            
            const syncKeys = Object.keys(syncStorage);
            const localKeys = Object.keys(localStorage);
            
            return `File selected: ${hasFileSelected}, Sync keys: [${syncKeys.join(', ')}], Local keys: [${localKeys.join(', ')}]`;
        } catch (e) {
            return `Diagnostic failed: ${e?.message || e}`;
        }
    }

    async performEnhancedPageScan(tabId) {
        try {
            // Try to inject a simple scanner if content script isn't responding
            const result = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    const fileInputs = document.querySelectorAll('input[type="file"]');
                    const uploadAreas = document.querySelectorAll('[class*="upload"], [class*="file"], [class*="attach"], [class*="resume"], [class*="cv"]');
                    const uploadButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
                        .filter(el => /upload|attach|browse|choose|file|resume|cv/i.test(el.textContent + ' ' + (el.getAttribute('aria-label') || '')));
                    
                    return {
                        fileInputs: fileInputs.length,
                        uploadAreas: uploadAreas.length,
                        uploadButtons: uploadButtons.length,
                        pageUrl: window.location.href,
                        hasFormElements: document.querySelector('form') !== null
                    };
                }
            });
            
            const scanData = result[0]?.result;
            if (scanData) {
                this.logDebug(`📊 Enhanced scan results: ${scanData.fileInputs} file inputs, ${scanData.uploadAreas} upload areas, ${scanData.uploadButtons} upload buttons, hasForm: ${scanData.hasFormElements}`, 'info');
                return { success: true, data: scanData };
            }
            
            return { success: false, error: 'No scan data returned' };
        } catch (e) {
            this.logDebug(`Enhanced scan failed: ${e?.message || e}`, 'error');
            return { success: false, error: e?.message || e };
        }
    }

    async checkStorageStatus() {
        try {
            this.logDebug('🔍 Checking storage status...', 'info');
            
            // Check current file input
            const resumeInput = document.getElementById('resumeFile');
            const currentlySelected = resumeInput?.files?.length > 0;
            if (currentlySelected) {
                const file = resumeInput.files[0];
                this.logDebug(`📂 Currently selected file: ${file.name} (${Math.round(file.size / 1024)}KB, ${file.type})`, 'info');
            } else {
                this.logDebug('📂 No file currently selected in input', 'warning');
            }
            
            // Check sync storage
            const syncStorage = await chrome.storage.sync.get(null);
            const resumeContentSync = syncStorage.resumeContent;
            if (resumeContentSync) {
                this.logDebug(`📄 Sync storage - resumeContent: ${resumeContentSync.length} characters`, 'success');
            } else {
                this.logDebug('📄 Sync storage - no resumeContent found', 'warning');
            }
            
            // Check local storage
            const localStorage = await chrome.storage.local.get(null);
            const resumeContentLocal = localStorage.resumeContent;
            const resumeFileLocal = localStorage.resumeFile;
            
            if (resumeContentLocal) {
                this.logDebug(`📄 Local storage - resumeContent: ${resumeContentLocal.length} characters`, 'success');
            } else {
                this.logDebug('📄 Local storage - no resumeContent found', 'warning');
            }
            
            if (resumeFileLocal?.base64) {
                const sizeKB = Math.round(resumeFileLocal.base64.length * 0.75 / 1024);
                this.logDebug(`📁 Local storage - resumeFile: ${resumeFileLocal.name} (${sizeKB}KB, ${resumeFileLocal.type})`, 'success');
            } else {
                this.logDebug('📁 Local storage - no resumeFile found', 'warning');
            }
            
            // Summary
            const hasAnyResume = resumeContentSync || resumeContentLocal || resumeFileLocal?.base64;
            if (hasAnyResume) {
                this.logDebug('✅ Storage check: Resume data found - you should be able to auto-attach', 'success');
                this.showNotification('Resume data found in storage', 'success');
            } else {
                this.logDebug('❌ Storage check: No resume data found anywhere', 'error');
                this.showNotification('No resume data found - please upload a resume in Profile Setup', 'warning');
                
                // Provide guidance
                this.logDebug('💡 To fix: Go to Profile Setup tab → Select a resume file → Click Save Profile', 'info');
            }
            
            // Additional diagnostics
            this.logDebug(`🔧 Storage keys - Sync: [${Object.keys(syncStorage).join(', ')}]`, 'info');
            this.logDebug(`🔧 Storage keys - Local: [${Object.keys(localStorage).join(', ')}]`, 'info');
            
            // Check if extension has storage permissions
            try {
                await chrome.storage.sync.set({ testKey: 'test' });
                await chrome.storage.sync.remove('testKey');
                this.logDebug('🔒 Storage permissions: OK', 'success');
            } catch (e) {
                this.logDebug(`🔒 Storage permissions: ERROR - ${e.message}`, 'error');
            }
            
        } catch (e) {
            this.logDebug(`Storage check error: ${e?.message || e}`, 'error');
            this.showNotification('Error checking storage', 'error');
        }
    }

    async testAttachResumeClick() {
        try {
            this.logDebug('🎯 Testing "Attach Resume" click detection...', 'info');
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) { 
                this.logDebug('No active tab found', 'error'); 
                return; 
            }

            // First try to communicate with the content script
            let result = null;
            try {
                result = await chrome.tabs.sendMessage(tabs[0].id, { action: 'testAttachResumeClick' });
            } catch (connectionError) {
                // Handle content script connection errors
                if (connectionError.message?.includes('Could not establish connection') || 
                    connectionError.message?.includes('Receiving end does not exist')) {
                    
                    this.logDebug('🔄 Content script not available, using script injection fallback...', 'warning');
                    
                    // Fallback: inject a simple script to find and click attach resume elements
                    try {
                        const injectionResult = await chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id, allFrames: true },
                            func: () => {
                                const isVisible = (el) => {
                                    if (!el) return false;
                                    const rect = el.getBoundingClientRect();
                                    const style = getComputedStyle(el);
                                    return rect.width > 0 && rect.height > 0 && 
                                           style.visibility !== 'hidden' && 
                                           style.display !== 'none';
                                };

                                const allElements = Array.from(document.querySelectorAll('*')).filter(isVisible);
                                const resumeElements = allElements.filter(el => {
                                    const text = (el.textContent || '').trim().toLowerCase();
                                    return text.length < 100 && text.length > 1 && 
                                           (/attach\s*resume|upload\s*resume|choose\s*file|browse\s*file|select\s*file|resume|attach|upload|cv/i.test(text));
                                });

                                if (resumeElements.length > 0) {
                                    // Try to click the first promising element
                                    const element = resumeElements[0];
                                    try {
                                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        element.click();
                                        return { 
                                            success: true, 
                                            found: true, 
                                            method: 'injection',
                                            text: element.textContent.trim().slice(0, 50),
                                            count: resumeElements.length
                                        };
                                    } catch (e) {
                                        return { 
                                            success: true, 
                                            found: true, 
                                            clicked: false, 
                                            method: 'injection',
                                            error: e.message,
                                            count: resumeElements.length
                                        };
                                    }
                                } else {
                                    return { 
                                        success: true, 
                                        found: false, 
                                        method: 'injection',
                                        count: 0
                                    };
                                }
                            }
                        });

                        result = injectionResult[0]?.result || { success: false, error: 'Injection failed' };
                        
                    } catch (injectionError) {
                        this.logDebug(`❌ Script injection also failed: ${injectionError?.message || injectionError}`, 'error');
                        this.showNotification('Content script not available and injection failed', 'error');
                        return;
                    }
                } else {
                    throw connectionError; // Re-throw if it's a different error
                }
            }
            
            if (result?.success) {
                if (result.found) {
                    const method = result.method === 'injection' ? ' (via injection)' : '';
                    const clickStatus = result.clicked === false ? ' - click failed' : '';
                    this.logDebug(`✅ Successfully found "Attach Resume" element${method}${clickStatus}!`, result.clicked === false ? 'warning' : 'success');
                    
                    if (result.text) {
                        this.logDebug(`   Element text: "${result.text}"`, 'info');
                    }
                    if (result.count > 1) {
                        this.logDebug(`   Found ${result.count} potential elements total`, 'info');
                    }
                    
                    const notificationText = result.clicked === false ? 
                        'Found "Attach Resume" but click failed - check debug log' :
                        'Found and clicked "Attach Resume" - check page for file dialog';
                    this.showNotification(notificationText, result.clicked === false ? 'warning' : 'success');
                } else {
                    const method = result.method === 'injection' ? ' (via injection)' : '';
                    this.logDebug(`❌ No "Attach Resume" elements found on this page${method}`, 'warning');
                    this.showNotification('No "Attach Resume" text found on this page', 'warning');
                }
            } else {
                this.logDebug(`❌ Failed to test attach resume click: ${result?.error || 'Unknown error'}`, 'error');
                this.showNotification('Error testing attach resume click', 'error');
            }
        } catch (e) {
            this.logDebug(`Test attach resume click error: ${e?.message || e}`, 'error');
            this.showNotification('Error during test', 'error');
        }
    }

    debounce(fn, wait = 400) {
		let t;
		return (...args) => {
			clearTimeout(t);
			t = setTimeout(() => fn.apply(this, args), wait);
		};
	}

    async analyzePageForResume() {
        try {
            this.logDebug('🔍 Starting comprehensive page analysis for resume detection...', 'info');
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) { 
                this.logDebug('No active tab found', 'error'); 
                return; 
            }

            let result = null;
            try {
                result = await chrome.tabs.sendMessage(tabs[0].id, { action: 'analyzePageForResume' });
            } catch (connectionError) {
                if (connectionError.message?.includes('Could not establish connection') || 
                    connectionError.message?.includes('Receiving end does not exist')) {
                    
                    this.logDebug('🔄 Content script not available for page analysis. Please refresh the page and try again.', 'warning');
                    this.showContentScriptGuide();
                    this.showNotification('Content script not loaded - check debug log for troubleshooting steps', 'warning');
                    return;
                } else {
                    throw connectionError;
                }
            }
            
            if (result?.success) {
                this.logDebug('✅ Page analysis completed - check debug log for detailed results', 'success');
                this.showNotification('Page analysis completed - check debug log', 'success');
            } else {
                this.logDebug('❌ Failed to analyze page', 'error');
                this.showNotification('Page analysis failed', 'error');
            }
        } catch (e) {
            this.logDebug(`Page analysis error: ${e?.message || e}`, 'error');
            this.showNotification('Error during page analysis', 'error');
        }
    }

    async testAIResumeDetection() {
        try {
            this.logDebug('🤖 Testing AI-powered resume detection...', 'info');
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) { 
                this.logDebug('No active tab found', 'error'); 
                return; 
            }

            // בדיקת מפתח API
            const apiKey = document.getElementById('geminiApiKey')?.value?.trim();
            if (!apiKey) {
                this.logDebug('❌ No Gemini API key configured for AI testing', 'warning');
                this.showNotification('Please configure Gemini API key first', 'warning');
                return;
            }

            let result = null;
            try {
                this.logDebug('popup.js');
                this.logDebug('🔍 Sending page to AI for analysis...', 'info');
                result = await chrome.tabs.sendMessage(tabs[0].id, { action: 'testAIResumeDetection' });
            } catch (connectionError) {
                if (connectionError.message?.includes('Could not establish connection') || 
                    connectionError.message?.includes('Receiving end does not exist')) {
                    
                    this.logDebug('🔄 Content script not available for AI analysis. Please refresh the page and try again.', 'warning');
                    this.showContentScriptGuide();
                    this.showNotification('Content script not loaded - check debug log for troubleshooting steps', 'warning');
                    return;
                } else {
                    throw connectionError;
                }
            }
            
            if (result?.success) {
                const analysis = result.analysis;
                if (analysis && analysis.pageAnalysis) {
                    this.logDebug(`🤖 AI Page Analysis:`, 'success');
                    this.logDebug(`  📄 Page Type: ${analysis.pageAnalysis.isJobApplication ? 'Job Application' : 'Other'}`, 'info');
                    this.logDebug(`  📋 Resume Required: ${analysis.pageAnalysis.requiresResume ? 'Yes' : 'No'}`, 'info');
                    this.logDebug(`  🎯 Confidence: ${analysis.pageAnalysis.confidence}%`, 'info');
                    this.logDebug(`  📝 Summary: ${analysis.pageAnalysis.summary}`, 'info');
                    
                    if (analysis.resumeUploadAreas && analysis.resumeUploadAreas.length > 0) {
                        this.logDebug(`🎯 AI found ${analysis.resumeUploadAreas.length} resume upload areas:`, 'success');
                        analysis.resumeUploadAreas.forEach((area, index) => {
                            this.logDebug(`  ${index + 1}. ${area.description} (${area.confidence}% confidence)`, 'info');
                            this.logDebug(`     Type: ${area.elementType}, Method: ${area.instructions}`, 'info');
                            if (area.reasoning) {
                                this.logDebug(`     Reasoning: ${area.reasoning}`, 'info');
                            }
                        });
                        this.showNotification(`AI found ${analysis.resumeUploadAreas.length} upload areas`, 'success');
                    } else {
                        this.logDebug('❌ AI found no resume upload areas on this page', 'warning');
                        this.showNotification('AI found no resume upload areas', 'warning');
                    }
                } else {
                    this.logDebug('❌ AI analysis failed or returned invalid format', 'error');
                    this.showNotification('AI analysis failed', 'error');
                }
            } else {
                this.logDebug(`❌ Failed to test AI resume detection: ${result?.error || 'Unknown error'}`, 'error');
                this.showNotification('AI detection test failed', 'error');
            }
        } catch (e) {
            this.logDebug(`AI detection test error: ${e?.message || e}`, 'error');
            this.showNotification('Error during AI test', 'error');
        }
    }

    async checkContentScriptAvailability(tabId) {
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            return true;
        } catch (e) {
            return false;
        }
    }

    showContentScriptGuide() {
        this.logDebug('📋 Content Script Troubleshooting Guide:', 'info');
        this.logDebug('1. 🔄 Refresh the current page (F5 or Ctrl+R)', 'info');
        this.logDebug('2. 🌐 Make sure you\'re on a webpage (not chrome:// or extension pages)', 'info');
        this.logDebug('3. 🔧 Check if the Jobnick extension is enabled in chrome://extensions/', 'info');
        this.logDebug('4. 📄 Some pages block content scripts - try a different job page', 'info');
        this.logDebug('5. 🚀 For immediate testing, use a job page like LinkedIn or external job sites', 'info');
    }

    async testCurrentPage() {
        try {
            this.logDebug('🌐 Testing Apply flow on current page...', 'info');
            
            // Get current tab URL
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) { 
                this.logDebug('No active tab found', 'error'); 
                return; 
            }
            
            const currentTab = tabs[0];
            const currentUrl = currentTab.url;
            
            this.logDebug(`Current page URL: ${currentUrl}`, 'info');
            
            // Check if we're on a valid page (not extension pages or chrome:// pages)
            if (currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://')) {
                this.logDebug('❌ Cannot test apply flow on browser internal pages', 'warning');
                this.showNotification('Please navigate to a job application page first', 'warning');
                return;
            }

            // Enhanced content script detection and injection
            let res = null;
            let usedInjection = false;
            
            // First, try to check if our content script is available
            this.logDebug('🔍 Checking content script availability...', 'info');
            try {
                // Simple ping to see if content script responds
                const pingResult = await chrome.tabs.sendMessage(currentTab.id, { action: 'ping' });
                if (pingResult?.ready) {
                    this.logDebug('✅ Content script is available and ready', 'success');
                    // Try the apply flow through content script
                    try {
                        const frames = await chrome.webNavigation.getAllFrames({ tabId: currentTab.id });
                        for (const f of frames) {
                            try {
                                const r = await chrome.tabs.sendMessage(currentTab.id, { action: 'testApplyFlow' }, { frameId: f.frameId });
                                if (r?.success) { res = r; break; }
                            } catch (_) {}
                        }
                    } catch (_) {}
                } else {
                    throw new Error('Content script not responding properly');
                }
            } catch (contentScriptError) {
                this.logDebug(`⚠️ Content script not available: ${contentScriptError.message}`, 'warning');
                
                // Check if it's a permissions issue
                if (contentScriptError.message?.includes('Cannot access') || 
                    contentScriptError.message?.includes('frame')) {
                    this.logDebug('🚫 This might be a permissions issue or restricted frame', 'warning');
                }
                
                // Try to inject the content script manually
                this.logDebug('🔧 Attempting manual content script injection...', 'info');
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: currentTab.id, allFrames: true },
                        files: ['ai_agent.js', 'content.js', 'simple-popup.js', 'popup.js', 'background.js', 'settings.js']
                    });
                    
                    // Wait a moment for injection to complete
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Try again after injection
                    try {
                        const pingAfterInjection = await chrome.tabs.sendMessage(currentTab.id, { action: 'ping' });
                        if (pingAfterInjection?.ready) {
                            this.logDebug('✅ Content script injected successfully and ready', 'success');
                            // Try the apply flow through content script
                            const frames = await chrome.webNavigation.getAllFrames({ tabId: currentTab.id });
                            for (const f of frames) {
                                try {
                                    const r = await chrome.tabs.sendMessage(currentTab.id, { action: 'testApplyFlow' }, { frameId: f.frameId });
                                    if (r?.success) { res = r; break; }
                                } catch (_) {}
                            }
                        } else {
                            throw new Error('Content script injection failed - not responding to ping');
                        }
                    } catch (pingError) {
                        throw new Error(`Content script still not responding after injection: ${pingError.message}`);
                    }
                } catch (injectionError) {
                    this.logDebug(`❌ Content script injection failed: ${injectionError.message}`, 'warning');
                    if (injectionError.message?.includes('Cannot access')) {
                        this.logDebug('🚫 Site may be blocking script injection (CSP, sandboxed frame, etc.)', 'warning');
                    }
                    usedInjection = true; // Fall back to inline script injection
                }
            }

            // If content script method failed, use inline script injection
            if (!res) {
                usedInjection = true;
                this.logDebug('🔄 Using inline script injection fallback...', 'warning');
                const { profile = {} } = await chrome.storage.sync.get('profile');
                const inj = await chrome.scripting.executeScript({
                    target: { tabId: currentTab.id, allFrames: true },
                    args: [profile],
                    func: (p) => {
                        const setVal = (el, val) => { 
                            try { 
                                if (el.isContentEditable) { 
                                    el.textContent = val; 
                                    el.dispatchEvent(new InputEvent('input', { bubbles: true })); 
                                } else { 
                                    el.value = val; 
                                    el.dispatchEvent(new Event('input', { bubbles: true })); 
                                } 
                                el.dispatchEvent(new Event('change', { bubbles: true })); 
                            } catch(_) {} 
                        };
                        
                        const isVisible = (el) => el && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().width > 0;
                        
                        const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], select')).filter(isVisible);
                        let filledCount = 0;
                        
                        inputs.forEach(el => {
                            const name = (el.getAttribute('name')||'').toLowerCase();
                            const ph   = (el.getAttribute('placeholder')||'').toLowerCase();
                            const aria = (el.getAttribute('aria-label')||'').toLowerCase();
                            const id   = (el.getAttribute('id')||'').toLowerCase();
                            const blob = `${name} ${ph} ${aria} ${id}`;
                            
                            let filled = false;
                            if (/email|mail/.test(blob) && p.email) { setVal(el, p.email); filled = true; }
                            else if (/phone|טל/.test(blob) && p.phone) { setVal(el, p.phone); filled = true; }
                            else if (/first.*name/.test(blob) && p.fullName) { setVal(el, (p.firstName || (p.fullName||'').split(' ')[0] || '')); filled = true; }
                            else if (/last.*name/.test(blob) && p.fullName) { setVal(el, (p.lastName || (p.fullName||'').split(' ').slice(1).join(' ') || '')); filled = true; }
                            else if (/full.*name|^name$/.test(blob) && p.fullName) { setVal(el, p.fullName); filled = true; }
                            else if (/github/.test(blob) && p.githubUrl) { setVal(el, p.githubUrl); filled = true; }
                            else if (/website|site/.test(blob) && p.websiteUrl) { setVal(el, p.websiteUrl); filled = true; }
                            else if (/portfolio/.test(blob) && p.portfolioUrl) { setVal(el, p.portfolioUrl); filled = true; }
                            else if (/linkedin/.test(blob) && p.linkedinUrl) { setVal(el, p.linkedinUrl); filled = true; }
                            else if (/company|employer/.test(blob) && p.currentCompany) { setVal(el, p.currentCompany); filled = true; }
                            else if (/location|city|address/.test(blob) && p.location) { setVal(el, p.location); filled = true; }
                            
                            if (filled) filledCount++;
                        });
                        
                        // Look for apply/submit buttons
                        const btn = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], a')).find(b => { 
                            const t=((b.textContent||'')+(b.getAttribute('aria-label')||'')).toLowerCase(); 
                            return /apply|submit|send application|שלח|הגש|להגיש/.test(t); 
                        });
                        
                        let buttonClicked = false;
                        if (btn) {
                            try { 
                                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                btn.click(); 
                                buttonClicked = true;
                            } catch(_) {}
                        }
                        
                        return { 
                            success: true, 
                            filledFields: filledCount,
                            totalFields: inputs.length,
                            buttonFound: !!btn,
                            buttonClicked: buttonClicked,
                            pageUrl: window.location.href,
                            method: 'inline-injection'
                        };
                    }
                });
                res = inj?.find(x => x?.result)?.result || { success: false, error: 'Injection failed' };
            }

            if (res?.success) {
                const method = usedInjection ? ' (via inline injection)' : ' (via content script)';
                this.logDebug(`✅ Test Apply flow completed on current page${method}`, 'success');
                if (res.filledFields !== undefined) {
                    this.logDebug(`   📝 Filled ${res.filledFields}/${res.totalFields} form fields`, 'info');
                }
                if (res.buttonFound !== undefined) {
                    this.logDebug(`   🔘 Submit button found: ${res.buttonFound ? 'Yes' : 'No'}`, res.buttonFound ? 'success' : 'warning');
                    if (res.buttonFound && res.buttonClicked !== undefined) {
                        this.logDebug(`   👆 Button clicked: ${res.buttonClicked ? 'Yes' : 'No'}`, res.buttonClicked ? 'success' : 'warning');
                    }
                }
                this.showNotification('Apply flow test completed on current page', 'success');
            } else {
                this.logDebug(`❌ Test Apply flow failed: ${res?.error || 'Unknown error'}`, 'error');
                this.showNotification('Apply flow test failed', 'error');
            }
        } catch (e) {
            this.logDebug(`Test current page error: ${e?.message || e}`, 'error');
            this.showNotification('Error during current page test', 'error');
        }
    }

    async quickUploadResume() {
        try {
            this.logDebug('🚀 Quick Upload Resume - Starting...', 'info');
            this.showNotification('Starting resume upload...', 'info');
            
            // Check if we have a resume file
            const { resumeFile } = await chrome.storage.local.get('resumeFile');
            if (!resumeFile?.base64) {
                this.logDebug('❌ No resume file found in storage', 'error');
                this.showNotification('Please upload your resume in Profile Setup first', 'warning');
                
                // Auto-switch to profile tab
                this.switchTab('profile');
                return;
            }

            this.logDebug(`📄 Resume found: ${resumeFile.name} (${Math.round(resumeFile.base64.length * 0.75 / 1024)}KB)`, 'success');

            // Get current tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) { 
                this.logDebug('No active tab found', 'error'); 
                this.showNotification('No active tab found', 'error');
                return; 
            }

            const tab = tabs[0];
            const currentUrl = tab.url;

            // Check if we're on a valid page
            if (currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://')) {
                this.logDebug('❌ Cannot upload resume on browser internal pages', 'warning');
                this.showNotification('Please navigate to a job application page first', 'warning');
                return;
            }

            this.logDebug(`🌐 Current page: ${currentUrl}`, 'info');

            // First scan for upload locations
            let scanResult = null;
            try {
                scanResult = await chrome.tabs.sendMessage(tab.id, { action: 'debugResumeLocations' });
            } catch (connectionError) {
                this.logDebug('⚠️ Content script not available, attempting injection...', 'warning');
                
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id, allFrames: true },
                        files: ['ai_agent.js', 'content.js', 'simple-popup.js', 'popup.js', 'background.js', 'settings.js']
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    scanResult = await chrome.tabs.sendMessage(tab.id, { action: 'debugResumeLocations' });
                } catch (injectionError) {
                    this.logDebug('❌ Failed to inject content script', 'error');
                    this.showNotification('Failed to load upload functionality', 'error');
                    return;
                }
            }

            const counts = scanResult?.result || { inputs: 0, zones: 0, triggers: 0 };
            if (counts.inputs === 0 && counts.zones === 0 && counts.triggers === 0) {
                this.logDebug('❌ No resume upload locations detected on this page', 'warning');
                this.showNotification('No resume upload locations found on this page', 'warning');
                return;
            }

            this.logDebug(`🎯 Found ${counts.inputs} file inputs, ${counts.zones} drop zones, ${counts.triggers} triggers`, 'info');

            // Now attempt the upload
            let uploadResult = null;
            try {
                uploadResult = await chrome.tabs.sendMessage(tab.id, { action: 'autoAttachResume' });
            } catch (connectionError) {
                this.logDebug('❌ Upload failed - connection error', 'error');
                this.showNotification('Upload failed - please refresh the page and try again', 'error');
                return;
            }

            if (uploadResult?.success && uploadResult?.attached) {
                this.logDebug(`✅ Resume uploaded successfully via ${uploadResult.method}!`, 'success');
                this.showNotification(`✅ Resume uploaded successfully!`, 'success');
            } else if (uploadResult?.success && !uploadResult?.attached) {
                this.logDebug(`⚠️ Upload attempted but may require manual action: ${uploadResult.message || ''}`, 'warning');
                this.showNotification('Upload attempted - please check the page for any file dialogs', 'warning');
            } else {
                this.logDebug(`❌ Resume upload failed: ${uploadResult?.error || 'Unknown error'}`, 'error');
                this.showNotification('Resume upload failed - try manual upload', 'error');
            }

        } catch (e) {
            this.logDebug(`Quick upload error: ${e?.message || e}`, 'error');
            this.showNotification('Error during quick upload', 'error');
        }
    }

    async quickTestUpload() {
        try {
            this.logDebug('🧪 Quick Test Upload - Starting comprehensive test...', 'info');
            this.showNotification('Starting upload system test...', 'info');
            
            // Enable debug mode if not already enabled
            const debugPanel = document.getElementById('debugPanel');
            if (debugPanel.style.display === 'none') {
                this.toggleDebugMode();
            }

            // Test 1: Check storage
            this.logDebug('📋 Test 1: Checking storage status...', 'info');
            await this.checkStorageStatus();
            
            // Test 2: Scan current page
            this.logDebug('📋 Test 2: Scanning current page for upload locations...', 'info');
            await this.debugResumeLocations();
            
            // Test 3: AI-powered detection (if API key available)
            const apiKey = document.getElementById('geminiApiKey')?.value?.trim();
            if (apiKey) {
                this.logDebug('📋 Test 3: Testing AI-powered upload detection...', 'info');
                await this.testAIResumeDetection();
            } else {
                this.logDebug('📋 Test 3: Skipped AI detection (no API key)', 'warning');
            }
            
            // Test 4: Test current page apply flow
            this.logDebug('📋 Test 4: Testing apply flow on current page...', 'info');
            await this.testCurrentPage();
            
            // Test 5: Attempt resume attachment
            this.logDebug('📋 Test 5: Testing resume attachment...', 'info');
            await this.autoAttachResume();

            this.logDebug('✅ Upload system test completed - review results above', 'success');
            this.showNotification('Upload system test completed - check debug log for details', 'success');

        } catch (e) {
            this.logDebug(`Quick test error: ${e?.message || e}`, 'error');
            this.showNotification('Error during upload test', 'error');
        }
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const popupManager = new PopupManager();
    
    // Save on popup close/hide to persist edits
    window.addEventListener('beforeunload', () => {
        try { popupManager.saveAIAgentData(); } catch(_) {}
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            try { popupManager.saveAIAgentData(); } catch(_) {}
        }
    });
    
    // Force initial status update after a short delay
    setTimeout(() => {
        popupManager.updateAIStatus();
    }, 100);

    const card      = document.querySelector(".card");
    const statusBox = document.getElementById("statusMessage");
  
    function showOnlyStatus() {
        if (!card || !statusBox) return;
        // הסתר את כל הילדים של ה־card חוץ מהסטטוס
        Array.from(card.children).forEach(child => {
            if (child !== statusBox) child.style.display = "none";
        });
        // ודא שהסטטוס מוצג
        statusBox.style.display = "flex"; // הוא flex כברירת מחדל בעיצוב שלך
        statusBox.classList.add("ready");
        const textEl = document.getElementById("statusText");
        if (textEl) textEl.textContent = "Processing...";
        }
}); 


(function attachAutoClose() {
    const IDS = ['fillJobBtn', 'messageRecruiter', 'settingsBtn'];
  
    function minimizeAndClose() {
      // micro animation + programmatic close (must be user-gesture)
      document.body.classList.add('minimizing');
      setTimeout(() => {
        try { window.close(); } catch (_) {}
      }, 120);
    }
  
    IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      // capture:true כדי לוודא שה‑window.close() יישאר מחובר לאירוע המשתמש
      el.addEventListener('click', () => {
        // נותן לקוד המקורי לרוץ קודם ואז סוגר
        setTimeout(minimizeAndClose, 0);
      }, { capture: true });
  
      // תמיכה במקלדת (Enter / Space)
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          setTimeout(minimizeAndClose, 0);
        }
      }, { capture: true });
    });
})();