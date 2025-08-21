// Content script for Jobnick extension
class LinkedInJobManager {
    constructor() {
        this.profile = null;
        this.preferences = null;
        this.currentJob = null;
        this.jobList = [];
        this.init();
    }

    async init() {
        await this.loadProfileAndPreferences();
        this.setupMessageListeners();
        this.observePageChanges();
        this.analyzeCurrentPage();
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

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'getNextJob':
                    const nextJob = await this.getNextJob();
                    sendResponse({ success: true, job: nextJob });
                    break;
                    
                case 'applyToJob':
                    const result = await this.applyToJob(message.job);
                    sendResponse({ success: true, result });
                    break;
                    
                case 'getJobList':
                    const jobList = await this.getJobList();
                    sendResponse({ success: true, jobList });
                    break;
                    
                case 'testApplication':
                    const testResult = await this.testApplication();
                    sendResponse({ success: true, result: testResult });
                    break;

                case 'extractJobListings':
                    const jobs = await this.extractJobListingsForAI();
                    sendResponse({ success: true, jobs });
                    break;

                case 'extractIndividualJobData':
                    const jobData = await this.extractIndividualJobDataForAI();
                    sendResponse({ success: true, jobData });
                    break;

                case 'applyToJobWithAI':
                    this.sendDebug('applyToJobWithAI');
                    this.sendDebug(`message.jobData: ${JSON.stringify(message.jobData)}`);
                    const aiResult = await this.applyToJobWithAI(message.jobData, message.profile, message.testMode);
                    sendResponse({ success: true, result: aiResult });
                    break;

                case 'navigateToNextPage':
                    await this.navigateToNextPage();
                    sendResponse({ success: true });
                    break;

                case 'goBackToSearchResults':
                    await this.goBackToSearchResults();
                    sendResponse({ success: true });
                    break;

                case 'performJobSearch':
                    const searchResult = await this.performJobSearch(message.searchData);
                    sendResponse({ success: true, result: searchResult });
                    break;
                case 'expandJobDescription':
                    await this.expandJobDescription();
                    sendResponse({ success: true });
                    break;

                case 'ping':
                    sendResponse({ success: true, ready: true });
                    break;

                case 'testAI':
                    const testAIResult = await this.testAIFunctionality();
                    sendResponse({ success: true, result: testAIResult });
                    break;
                    
                case 'testScroll':
                    const scrollRes = await this.testScrollDown();
                    sendResponse({ success: true, result: scrollRes });
                    break;

                case 'prepareJobForDeepAnalysis':
                    const prepped = await this.prepareJobForDeepAnalysis();
                    sendResponse({ success: true, jobData: prepped });
                    break;
                    
                case 'testApplyFlow':
                    const ok = await this.testApplyOnCurrentPage();
                    sendResponse({ success: ok.success, error: ok.error });
                    break;
                    
                case 'debugResumeLocations':
                    const debugResult = await this.debugResumeLocations();
                    sendResponse({ success: true, result: debugResult });
                    break;
                case 'autoAttachResume':
                    const autoAttachResult = await this.autoAttachResumeOnPage();
                    sendResponse({ success: true, ...autoAttachResult });
                    break;
                case 'testAttachResumeClick':
                    // Prefer zero-interaction network upload first
                    try {
                        this.sendDebug('🚀 Quick Upload Resume - Starting (network-first)...', 'info');
                        const netFirst = await this.autoUploadResumeNetwork();
                        if (netFirst?.uploaded) {
                            this.sendDebug('✅ Network upload completed — no dialog opened', 'success');
                            sendResponse({ success: true, result: netFirst, method: 'network' });
                            break;
                        }
                        this.sendDebug('⚠️ Network upload did not complete, falling back to UI click routine', 'warning');
                    } catch (_) {}
                    // Fallback: legacy click path
                    const found = await this.findAndClickAttachResume(document);
                    sendResponse({ success: true, found: found, method: 'ui-fallback' });
                    break;
                case 'analyzePageForResume':
                    const analysis = this.analyzePageForAttachResume(document);
                    sendResponse({ success: true, analysis: analysis });
                    break;
                case 'testAIResumeDetection':
                    const aiAnalysis = await this.testAIResumeDetectionOnPage();
                    sendResponse({ success: true, analysis: aiAnalysis });
                    break;
                    
                case 'testResumeFileStatus':
                    const fileStatus = await this.testResumeFileStatus();
                    sendResponse({ success: true, status: fileStatus });
                    break;
                    
                case 'autoUploadNetwork':
                    const networkResult = await this.autoUploadResumeNetwork();
                    sendResponse({ success: true, result: networkResult });
                    break;
                    
                case 'quickTestUpload':
                    try {
                        this.sendDebug('🎯 Fill Job initiated from popup - starting comprehensive application process', 'info');
                        this.popupShowStatus('Job application started');
                        // Load profile data first
                        await this.loadProfileAndPreferences();
                        
                        // Use the complete test apply flow which includes:
                        // 1. Profile data filling (name, email, phone, etc.)
                        // 2. Resume upload via network or file attachment
                        // 3. Form submission
                        const comprehensiveResult = await this.testApplyOnCurrentPage();
                        
                        if (comprehensiveResult.success) {
                            this.sendDebug('✅ Fill Job completed successfully!', 'success');
                            sendResponse({ 
                                success: true, 
                                result: {
                                    ...comprehensiveResult,
                                    message: 'Job application filled and submitted successfully!'
                                }
                            });
                        } else {
                            this.sendDebug(`❌ Fill Job failed: ${comprehensiveResult.error || 'Unknown error'}`, 'error');
                            sendResponse({ 
                                success: false, 
                                error: comprehensiveResult.error || 'Job filling process failed'
                            });
                        }
                    } catch (error) {
                        this.sendDebug(`❌ Fill Job error: ${error.message}`, 'error');
                        sendResponse({ success: false, error: error.message });
                    }
                    break;
                    
                case 'extractFromCurrentPageGeneric':
                    try {
                        const url = window.location.href;
                        const job = await this.extractJobFromURLWithAI(url);
                        sendResponse({ success: true, job });
                    } catch (e) {
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case 'recruiterScanAndDraft':
                    (async () => {
                        try {
                          const res = await this.recruiterScanAndDraft(message.payload || {});
                          sendResponse({ success: true, result: res });
                        } catch (e) {
                          sendResponse({ success: false, error: e?.message || String(e) });
                        }
                      })();
                      return true; // async

                case 'referralScanAndDraft':
                    (async () => {
                        try {
                          const res = await this.referralScanAndDraft(message.payload || {});
                          sendResponse({ success: true, result: res });
                        } catch (e) {
                          sendResponse({ success: false, error: e?.message || String(e) });
                        }
                      })();
                      return true; // async
                    
                  
                default:
                    sendResponse({ success: false, error: 'Unknown action 3: '+message.action });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    observePageChanges() {
        // Observe DOM changes to detect new job listings
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    this.analyzeCurrentPage();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    sendDebug(message, type = 'info') {
        try {
            // Prevent huge logs: trim to 300 chars
            const safeMessage = typeof message === 'string' && message.length > 300
                ? message.slice(0, 300) + '…'
                : message;
            chrome.runtime.sendMessage({
                action: 'updateAIStatus',
                status: { message: safeMessage, type, timestamp: Date.now() }
            });
        } catch (e) {
            // Fallback to console without large payloads
            const safe = typeof message === 'string' && message.length > 300
                ? message.slice(0, 300) + '…'
                : message;
            console.log('[Debug]', safe);
        }
    }

    async analyzeCurrentPage() {
        const currentUrl = window.location.href;
        
        if (currentUrl.includes('/jobs/') && currentUrl.includes('/view/')) {
            // Individual job page
            this.analyzeJobPage();
        } else if (currentUrl.includes('/jobs/') && !currentUrl.includes('/view/')) {
            // Job search results page
            this.analyzeJobSearchPage();
        }
    }

    analyzeJobPage() {
        try {
            const jobData = this.extractJobData();
            if (jobData) {
                this.currentJob = jobData;
                this.evaluateJobFit(jobData);
            }
        } catch (error) {
            console.error('Error analyzing job page:', error);
        }
    }

    analyzeJobSearchPage() {
        try {
            const jobCards = this.extractJobCards();
            this.jobList = jobCards;
            // console.log(`Found ${jobCards.length} job listings`);
        } catch (error) {
            console.error('Error analyzing job search page:', error);
        }
    }

    extractJobData() {
        try {
            // Extract job title
            const titleElement = document.querySelector('h1.job-details-jobs-unified-top-card__job-title') ||
                               document.querySelector('.job-details-jobs-unified-top-card__job-title') ||
                               document.querySelector('h1');
            
            const title = titleElement ? titleElement.textContent.trim() : '';

            // Extract company name
            const companyElement = document.querySelector('.job-details-jobs-unified-top-card__company-name') ||
                                 document.querySelector('[data-job-id] .job-card-container__company-name') ||
                                 document.querySelector('.job-card-container__company-name');
            
            const company = companyElement ? companyElement.textContent.trim() : '';

            // Extract location
            const locationElement = document.querySelector('.job-details-jobs-unified-top-card__bullet') ||
                                  document.querySelector('.job-card-container__metadata-item') ||
                                  document.querySelector('.job-card-container__location');
            
            const location = locationElement ? locationElement.textContent.trim() : '';

            // Extract job description
            const descriptionElement = document.querySelector('.jobs-description__content') ||
                                    document.querySelector('.job-details-jobs-unified-top-card__job-description') ||
                                    document.querySelector('.jobs-box__html-content');
            
            const description = descriptionElement ? descriptionElement.textContent.trim() : '';
            // Extract job ID from URL
            const jobId = this.extractJobIdFromUrl();
            // Extract apply button
            const applyButton = this.findApplyButton();
            return {
                id: jobId,
                title: title,
                company: company,
                location: location,
                description: description,
                url: window.location.href,
                applyButton: applyButton,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Error extracting job data:', error);
            return null;
        }
    }

    extractJobCards() {
        try {
            const jobCards = document.querySelectorAll('.job-card-container, .job-card-list__entity, .jobs-search__job-details');
            const jobs = [];

            jobCards.forEach((card, index) => {
                try {
                    const getFirst = (root, selectors) => {
                        for (const s of selectors) { const el = root.querySelector(s); if (el) return el; }
                        return null;
                    };

                    // Link first (often contains both href and text)
                    const linkElement = getFirst(card, [
                        'a.base-card__full-link',
                        'a[href*="/jobs/view/"]',
                        '.job-card-container__link',
                        'a'
                    ]);

                    // Title from dedicated node or fallback to link text/aria-label
                    let titleElement = getFirst(card, [
                        '.job-card-list__title',
                        '.base-search-card__title',
                        '.job-search-card__title',
                        '.job-title',
                        '[data-test-id*="title"]',
                        'h3'
                    ]);
                    let title = titleElement ? titleElement.textContent.trim() : '';
                    if (!title && linkElement) {
                        title = (linkElement.textContent || linkElement.getAttribute('aria-label') || '').trim();
                    }

                    // Company - try multiple variants including lockup subtitle
                    const companyElement = getFirst(card, [
                        '.job-card-container__company-name',
                        '.base-search-card__subtitle',
                        '.base-search-card__subtitle a',
                        '.artdeco-entity-lockup__subtitle',
                        '.artdeco-entity-lockup__subtitle a',
                        '.job-card-list__subtitle',
                        '.job-card-container__subtitle',
                        'h4 a'
                    ]);
                    const company = companyElement ? companyElement.textContent.trim() : '';

                    // Location - several possible places
                    const locationElement = getFirst(card, [
                        '.job-card-container__metadata-item',
                        '.job-card-container__location',
                        '.job-card-list__metadata-item',
                        '.job-search-card__location',
                        '.base-search-card__metadata span',
                        '.artdeco-entity-lockup__caption',
                        '.location'
                    ]);
                    const location = locationElement ? locationElement.textContent.trim() : '';

                    const link = linkElement ? linkElement.href : '';

                    if (title || link) {
                        const job = { id: `job-${index}`, title: title || '(no title)', company, location, link, timestamp: Date.now() };
                        jobs.push(job);
                        // Per-card debug for first 5
                        if (index < 0) {
                            this.sendDebug(`Card#${index+1}: title="${job.title}" company="${job.company||'-'}" loc="${job.location||'-'}"`, 'info');
                        }
                    }
                } catch (error) {
                    console.error('Extractor: error processing card', error);
                }
            });

            return jobs;
        } catch (error) {
            console.error('Error extracting job cards:', error);
            return [];
        }
    }

    extractJobIdFromUrl() {
        const url = window.location.href;
        const match = url.match(/\/jobs\/view\/(\d+)/);
        return match ? match[1] : `job-${Date.now()}`;
    }

    findApplyButton() {
        try {
            const isVisible = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
            const textOf = (el) => ((el.textContent || '') + ' ' + (el.getAttribute?.('aria-label') || '')).trim().toLowerCase();

            // Prefer explicit LinkedIn apply classes/selectors first
            const explicit = [
                '.jobs-apply-button--top-card button',
                'button.jobs-apply-button',
                'button[aria-label*="Easy Apply"]',
                'button[data-control-name="jobdetails_topcard_inapply"]'
            ];
            for (const sel of explicit) {
                const btn = document.querySelector(sel);
                if (btn && isVisible(btn)) return btn;
            }

            // Fallback: scan buttons/links for text match
            const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'))
                .filter(isVisible)
                .filter(el => {
                    const t = textOf(el);
                    return (
                        t.includes('easy apply') ||
                        t.includes('apply now') ||
                        t === 'apply' || t.includes(' apply') ||
                        t.includes('הגש') || t.includes('הגשת') // basic Hebrew variants
                    ) && !t.includes('applied');
                });
            // Prioritize Easy Apply
            candidates.sort((a, b) => {
                const ta = textOf(a), tb = textOf(b);
                const ea = ta.includes('easy apply') ? 1 : 0;
                const eb = tb.includes('easy apply') ? 1 : 0;
                return eb - ea;
            });
            return candidates[0] || null;
        } catch (_) {
            return null;
        }
    }

    // Generic job extraction from any job page (not just LinkedIn)
    async extractGenericJobFromDOM() {
        // Deprecated path -> route to URL-based AI extraction
        this.sendDebug('extractGenericJobFromDOM');
        return this.extractJobFromURLWithAI(window.location.href);
    }

    evaluateJobFit(jobData) {
        if (!this.preferences || !this.profile) {
            console.log('No preferences or profile loaded');
            return false;
        }

        let score = 0;
        const maxScore = 100;

        // Check job title match
        if (this.preferences.jobTitles) {
            const desiredTitles = this.preferences.jobTitles.toLowerCase().split(',').map(t => t.trim());
            const jobTitle = jobData.title.toLowerCase();
            
            if (desiredTitles.some(title => jobTitle.includes(title))) {
                score += 30;
            }
        }

        // Check keywords match
        if (this.preferences.keywords) {
            const keywords = this.preferences.keywords.toLowerCase().split(',').map(k => k.trim());
            const jobText = (jobData.title + ' ' + jobData.description).toLowerCase();
            
            const matchedKeywords = keywords.filter(keyword => jobText.includes(keyword));
            score += (matchedKeywords.length / keywords.length) * 25;
        }

        // Check exclude keywords
        if (this.preferences.excludeKeywords) {
            const excludeKeywords = this.preferences.excludeKeywords.toLowerCase().split(',').map(k => k.trim());
            const jobText = (jobData.title + ' ' + jobData.description).toLowerCase();
            
            if (excludeKeywords.some(keyword => jobText.includes(keyword))) {
                score -= 20;
            }
        }

        // Check location preference
        if (this.preferences.locationPreference) {
            const preferredLocations = this.preferences.locationPreference.toLowerCase().split(',').map(l => l.trim());
            const jobLocation = jobData.location.toLowerCase();
            
            if (preferredLocations.some(location => jobLocation.includes(location))) {
                score += 20;
            }
        }

        // Check experience level
        if (this.preferences.experienceLevel && this.preferences.experienceLevel !== 'any') {
            const jobText = (jobData.title + ' ' + jobData.description).toLowerCase();
            
            if (this.preferences.experienceLevel === 'entry' && 
                (jobText.includes('senior') || jobText.includes('lead') || jobText.includes('manager'))) {
                score -= 15;
            } else if (this.preferences.experienceLevel === 'senior' && 
                       jobText.includes('entry') || jobText.includes('junior')) {
                score -= 15;
            }
        }

        jobData.fitScore = Math.max(0, Math.min(maxScore, score));
        jobData.isGoodFit = score >= 60; // Consider jobs with 60+ score as good fits

        // console.log(`Job fit evaluation for "${jobData.title}": ${score}/${maxScore} - ${jobData.isGoodFit ? 'Good fit' : 'Not a good fit'}`);
        
        return jobData.isGoodFit;
    }

    async getNextJob() {
        // Filter jobs by fit score and return the best one
        const goodFitJobs = this.jobList.filter(job => job.isGoodFit !== false);
        
        if (goodFitJobs.length === 0) {
            return null;
        }

        // Sort by fit score (highest first) and return the first one
        goodFitJobs.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));
        return goodFitJobs[0];
    }

    async getJobList() {
        return this.jobList;
    }

    async applyToJob(job) {
        try {
            if (!job.applyButton) {
                return { success: false, error: 'Apply button not found' };
            }

            // Click the apply button
            job.applyButton.click();
            
            // Wait for the application form to appear
            await this.waitForApplicationForm();
            
            // Fill out the application form
            const formResult = await this.fillApplicationForm();
            
            if (formResult.success) {
                // Submit the application
                const submitResult = await this.submitApplication();
                return submitResult;
            }
            
            return formResult;
        } catch (error) {
            console.error('Error applying to job:', error);
            return { success: false, error: error.message };
        }
    }

    async waitForApplicationForm(timeoutMs = 12000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                const form = document.querySelector('.jobs-easy-apply-modal, .jobs-apply-modal, .jobs-apply-form, form[action*="easyApply"], div[role="dialog"][aria-label*="Easy Apply" i]');
                if (form) {
                    resolve(true);
                    return;
                }
                if (Date.now() - start > timeoutMs) {
                    resolve(false);
                    return;
                }
                setTimeout(check, 400);
            };
            check();
        });
    }

    async fillApplicationForm() {
        try {
            // Wait a bit for the form to fully load
            await this.delay(2000);
            
            // Fill out form fields based on profile data
            const formFields = document.querySelectorAll('input, textarea, select');
            
            for (const field of formFields) {
                await this.fillField(field);
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error filling application form:', error);
            return { success: false, error: error.message };
        }
    }

    async fillField(field) {
        try {
            const fieldType = field.type || field.tagName.toLowerCase();
            const fieldName = field.name || field.id || '';
            const fieldLabel = this.getFieldLabel(field);
            
            let valueToFill = '';
            
            // Determine what value to fill based on field type and label
            if (fieldType === 'text' || fieldType === 'email') {
                valueToFill = this.getFieldValue(fieldName, fieldLabel);
            } else if (fieldType === 'textarea') {
                valueToFill = this.getFieldValue(fieldName, fieldLabel);
            } else if (fieldType === 'select-one') {
                valueToFill = this.getFieldValue(fieldName, fieldLabel);
            }
            
            if (valueToFill) {
                // Fill the field
                if (fieldType === 'select-one') {
                    field.value = valueToFill;
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    field.value = valueToFill;
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                // console.log(`Filled field "${fieldLabel}" with value: ${valueToFill}`);
            }
        } catch (error) {
            console.error('Error filling field:', error);
        }
    }

    getFieldLabel(field) {
        // Try to get the field label
        const label = field.getAttribute('aria-label') ||
                     field.getAttribute('placeholder') ||
                     field.getAttribute('title') ||
                     '';
        
        return label.toLowerCase();
    }

    getFieldValue(fieldName, fieldLabel) {
        if (!this.profile) return '';
        
        const label = fieldLabel.toLowerCase();
        const name = fieldName.toLowerCase();
        
        // Map common field labels to profile data
        if (label.includes('name') || name.includes('name')) {
            return this.profile.fullName || '';
        } else if (label.includes('email') || name.includes('email')) {
            return this.profile.email || '';
        } else if (label.includes('phone') || name.includes('phone')) {
            return this.profile.phone || '';
        } else if (label.includes('location') || name.includes('location')) {
            return this.profile.location || '';
        } else if (label.includes('resume') || label.includes('cv') || label.includes('experience')) {
            return this.profile.resume || '';
        } else if (label.includes('cover') || label.includes('letter') || label.includes('motivation')) {
            return this.profile.coverLetter || '';
        }
        
        return '';
    }

    async submitApplication() {
        try {
            // Prevent duplicate submissions
            try {
                const { applicationHistory = [] } = await chrome.storage.local.get('applicationHistory');
                const link = this.currentJob?.url || this.currentJob?.link || window.location.href;
                const title = (this.currentJob?.title || '').trim().toLowerCase();
                const company = (this.currentJob?.company || '').trim().toLowerCase();
                const exists = applicationHistory.some(h => {
                    const hLink = (h.link || '').trim();
                    const hTitle = (h.title || '').trim().toLowerCase();
                    const hCompany = (h.company || '').trim().toLowerCase();
                    return (hLink && link && hLink === link) || (hTitle === title && hCompany === company && title);
                });
                if (exists) {
                    this.sendDebug('Duplicate application detected. Skipping submission.', 'warning');
                    return { success: true, message: 'Skipped duplicate application' };
                }
            } catch(_) {}

            // Look for submit button
            const submitButton = document.querySelector('button[aria-label*="Submit"]') ||
                               document.querySelector('button[aria-label*="Send"]') ||
                               document.querySelector('button:contains("Submit")') ||
                               document.querySelector('button:contains("Send")');
            
            if (submitButton) {
                submitButton.click();
                
                // Wait for submission confirmation
                await this.waitForSubmissionConfirmation();
                
                // Save history entry
                const entry = {
                    timestamp: Date.now(),
                    title: this.currentJob?.title || '',
                    company: this.currentJob?.company || '',
                    location: this.currentJob?.location || '',
                    link: this.currentJob?.url || this.currentJob?.link || window.location.href,
                    status: 'Submitted'
                };
                try {
                    const existing = await chrome.storage.local.get('applicationHistory');
                    const history = existing.applicationHistory || [];
                    history.unshift(entry);
                    await chrome.storage.local.set({ applicationHistory: history });
                    chrome.runtime.sendMessage({ action: 'historyUpdated' });
                } catch (e) { console.warn('History save failed', e); }
                
                return { success: true, message: 'Application submitted successfully' };
            } else {
                return { success: false, error: 'Submit button not found' };
            }
        } catch (error) {
            console.error('Error submitting application:', error);
            return { success: false, error: error.message };
        }
    }

    async waitForSubmissionConfirmation() {
        return new Promise((resolve) => {
            const checkConfirmation = () => {
                const confirmation = document.querySelector('.jobs-easy-apply-content__success-message') ||
                                   document.querySelector('.jobs-apply-success') ||
                                   document.querySelector('[data-test-id="apply-success"]');
                
                if (confirmation) {
                    resolve();
                } else {
                    setTimeout(checkConfirmation, 500);
                }
            };
            checkConfirmation();
        });
    }

    async testApplication() {
        try {
            // console.log('Testing application functionality...');
            
            // Check if we're on a job page
            if (!this.currentJob) {
                return { success: false, error: 'No job currently loaded' };
            }
            
            // Simulate application process without actually submitting
            const result = await this.applyToJob(this.currentJob);
            
            return { success: true, message: 'Test application completed', result };
        } catch (error) {
            console.error('Error in test application:', error);
            return { success: false, error: error.message };
        }
    }

    async extractJobListingsForAI() {
        try {
            this.sendDebug('Extractor: starting job extraction...', 'info');
            
            // Wait a bit for the page to fully load
            await this.delay(1500);
            
            const selectorGroups = [
                { name: 'job-card-container', sel: '.job-card-container' },
                { name: 'job-card-list__entity', sel: '.job-card-list__entity' },
                { name: 'jobs-search__job-details', sel: '.jobs-search__job-details' },
                { name: 'base-card', sel: '.base-card' },
                { name: 'base-search-card', sel: '.base-search-card' },
                { name: 'job-search-card', sel: '.job-search-card' },
                { name: 'job-result-card', sel: '.job-result-card' },
                { name: 'results list item', sel: '.jobs-search-results__list-item, li.jobs-search-results__list-item' },
                { name: 'scaffold list li', sel: 'ul.scaffold-layout__list li' }
            ];
            
            // Try to find cards with retries and scrolls
            let jobCards = [];
            for (let attempt = 0; attempt < 3 && jobCards.length === 0; attempt++) {
                for (const g of selectorGroups) {
                    const found = document.querySelectorAll(g.sel);
                    if (found.length > 0) { jobCards = found; break; }
                }
                if (jobCards.length === 0) {
                    // Scroll to load more
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    await this.delay(1200);
                }
            }
            
            if (jobCards.length === 0) {
                this.sendDebug('Extractor: no job cards found after retries', 'warning');
                return [];
            }
            
            const jobs = [];
            
            const getFirst = (root, selectors) => {
                for (const s of selectors) { const el = root.querySelector(s); if (el) return el; }
                return null;
            };

            jobCards.forEach((card, index) => {
                try {
                    // Link first (often contains both href and text)
                    const linkElement = getFirst(card, [
                        'a.base-card__full-link',
                        'a[href*="/jobs/view/"]',
                        '.job-card-container__link',
                        'a'
                    ]);

                    // Title from dedicated node or fallback to link text/aria-label
                    let titleElement = getFirst(card, [
                        '.job-card-list__title',
                        '.base-search-card__title',
                        '.job-search-card__title',
                        '.job-title',
                        '[data-test-id*="title"]',
                        'h3'
                    ]);
                    let title = titleElement ? titleElement.textContent.trim() : '';
                    if (!title && linkElement) {
                        title = (linkElement.textContent || linkElement.getAttribute('aria-label') || '').trim();
                    }

                    // Company - try multiple variants including lockup subtitle
                    const companyElement = getFirst(card, [
                        '.job-card-container__company-name',
                        '.base-search-card__subtitle',
                        '.base-search-card__subtitle a',
                        '.artdeco-entity-lockup__subtitle',
                        '.artdeco-entity-lockup__subtitle a',
                        '.job-card-list__subtitle',
                        '.job-card-container__subtitle',
                        'h4 a'
                    ]);
                    const company = companyElement ? companyElement.textContent.trim() : '';

                    // Location - several possible places
                    const locationElement = getFirst(card, [
                        '.job-card-container__metadata-item',
                        '.job-card-container__location',
                        '.job-card-list__metadata-item',
                        '.job-search-card__location',
                        '.base-search-card__metadata span',
                        '.artdeco-entity-lockup__caption',
                        '.location'
                    ]);
                    const location = locationElement ? locationElement.textContent.trim() : '';

                    const link = linkElement ? linkElement.href : '';

                    if (title || link) {
                        const job = { id: `job-${index}`, title: title || '(no title)', company, location, link, timestamp: Date.now() };
                        jobs.push(job);
                        // Suppress per-card debug lines
                    }
                } catch (error) {
                    console.error('Extractor: error processing card', error);
                }
            });

            // Concise summary only
            this.sendDebug(`Extractor: extracted ${jobs.length} jobs.`, jobs.length ? 'success' : 'warning');
            return jobs;
        } catch (error) {
            console.error('Content Script: Error extracting job listings for AI:', error);
            this.sendDebug(`Extractor error: ${error.message}`, 'error');
            return [];
        }
    }

    async extractIndividualJobDataForAI() {
        try {
            const jobData = this.extractJobData();
            if (jobData) {
                // Add more detailed information for AI analysis
                jobData.description = this.extractJobDescription();
                jobData.requirements = this.extractJobRequirements();
                jobData.benefits = this.extractJobBenefits();
                jobData.salary = this.extractJobSalary();
            }
            return jobData;
        } catch (error) {
            console.error('Error extracting individual job data for AI:', error);
            return null;
        }
    }

    extractJobDescription() {
        try {
            const descriptionElement = document.querySelector('.jobs-description__content') ||
                                    document.querySelector('.job-details-jobs-unified-top-card__job-description') ||
                                    document.querySelector('.jobs-box__html-content');
            
            return descriptionElement ? descriptionElement.textContent.trim() : '';
        } catch (error) {
            console.error('Error extracting job description:', error);
            return '';
        }
    }

    extractJobRequirements() {
        try {
            const requirementsElements = document.querySelectorAll('.jobs-box__group, .jobs-description__section');
            let requirements = '';
            
            requirementsElements.forEach(element => {
                const text = element.textContent.trim();
                if (text.toLowerCase().includes('requirement') || 
                    text.toLowerCase().includes('qualification') ||
                    text.toLowerCase().includes('experience')) {
                    requirements += text + ' ';
                }
            });
            
            return requirements.trim();
        } catch (error) {
            console.error('Error extracting job requirements:', error);
            return '';
        }
    }

    extractJobBenefits() {
        try {
            const benefitsElements = document.querySelectorAll('.jobs-box__group, .jobs-description__section');
            let benefits = '';
            
            benefitsElements.forEach(element => {
                const text = element.textContent.trim();
                if (text.toLowerCase().includes('benefit') || 
                    text.toLowerCase().includes('perk') ||
                    text.toLowerCase().includes('offer')) {
                    benefits += text + ' ';
                }
            });
            
            return benefits.trim();
        } catch (error) {
            console.error('Error extracting job benefits:', error);
            return '';
        }
    }

    extractJobSalary() {
        try {
            const salaryElement = document.querySelector('[data-test-id="job-details-salary"]') ||
                                document.querySelector('.job-details-jobs-unified-top-card__salary') ||
                                document.querySelector('.job-details-jobs-unified-top-card__compensation');
            
            return salaryElement ? salaryElement.textContent.trim() : '';
        } catch (error) {
            console.error('Error extracting job salary:', error);
            return '';
        }
    }

    async applyToJobWithAI(jobData, profile, testMode = false) {
        try {
            this.sendDebug(`Apply: navigating if needed and locating Apply button for "${jobData.title || 'Unknown'}" (Test mode: ${testMode})`, 'info');

            // Find the Easy Apply button
            const applyButton = this.findApplyButton();
                if (!applyButton) {
                return { success: false, error: 'No Easy Apply button found' };
            }

            this.sendDebug(`Apply: found apply button of type "${applyButton.tagName}" with text "${this.textOf(applyButton)}"`, 'info');

            // Close any annoying overlays that might block clicks
            try {
                const close = document.querySelector('.jobs-job-board-list__no-results-cta button') || 
                            document.querySelector('button[aria-label*="Close" i]') ||
                            document.querySelector('.artdeco-modal__dismiss');
                if (close && close.offsetParent) close.click();
            } catch(_) {}

            // Click robustly
            // try { applyButton.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
            await this.delay(300);
            try { applyButton.click(); } catch(_) {
                try { applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch(_) {}
            }

            // Close sign-in gate overlays if present
            const closeOverlay = () => {
                const close = document.querySelector('button[aria-label*="Dismiss" i], button[aria-label*="Close" i], .artdeco-modal__dismiss');
                try { close?.click(); } catch(_) {}
            };

            // Wait for Easy Apply modal, retry once if needed
            let formReady = await this.waitForApplicationForm(14000);
            if (!formReady) {
                closeOverlay();
                try { applyButton.click(); } catch(_) {}
                formReady = await this.waitForApplicationForm(8000);
                if (!formReady) {
                    return { success: false, error: 'Easy Apply form did not open' };
                }
            }

            // Try to attach resume to LinkedIn Easy Apply form
            try {
                const resumeAttached = await this.attachResumeInDoc(document);
                if (resumeAttached) {
                    this.sendDebug('✅ Resume attached to LinkedIn Easy Apply form', 'success');
                }
            } catch (e) {
                this.sendDebug(`Resume attachment failed: ${e?.message || e}`, 'warning');
            }

            const formResult = await this.fillApplicationFormWithProfile(profile);
            if (formResult.success) {
                if (testMode) {
                    this.sendDebug('🧪 Test mode: Form filled successfully but skipping submission', 'info');
                    
                    // Record test mode activity to history
                    await this.recordFormFilling(jobData, 'Test Mode - Filled Only', 'LinkedIn Easy Apply', {
                        fieldsFilled: formResult.fieldsFilled || 0,
                        testMode: true
                    });
                    
                    return { 
                        success: true, 
                        message: 'Form filled successfully (test mode - not submitted)',
                        testMode: true
                    };
                } else {
                const submitResult = await this.submitApplication();
                    
                    // Record successful submission to history
                    if (submitResult.success) {
                        await this.recordFormFilling(jobData, 'Submitted Successfully', 'LinkedIn Easy Apply', {
                            fieldsFilled: formResult.fieldsFilled || 0,
                            submitted: true
                        });
                    } else {
                        await this.recordFormFilling(jobData, 'Filled but Submission Failed', 'LinkedIn Easy Apply', {
                            fieldsFilled: formResult.fieldsFilled || 0,
                            submissionError: submitResult.error || 'Unknown error'
                        });
                    }
                    
                return submitResult;
                }
            }
            return formResult;
        } catch (error) {
            console.error('Error applying to job with AI:', error);
            return { success: false, error: error.message };
        }
    }

    async fillApplicationFormWithProfile(profile) {
        try {
            // Wait a bit for the form to fully load
            await this.delay(2000);
            
            // Fill out form fields based on profile data
            const formFields = document.querySelectorAll('input, textarea, select');
            
            for (const field of formFields) {
                await this.fillFieldWithProfile(field, profile);
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error filling application form with profile:', error);
            return { success: false, error: error.message };
        }
    }

    async fillFieldWithProfile(field, profile) {
        try {
            const fieldType = field.type || field.tagName.toLowerCase();
            const fieldName = field.name || field.id || '';
            const fieldLabel = this.getFieldLabel(field);
            
            let valueToFill = '';
                        // 🔹 אם זה שדה תשובה ארוכה ונראה כמו שאלה כללית — נבקש תשובה מה‑AI
            const isEmpty = (field.isContentEditable ? (field.textContent || '') : (field.value || '')).trim().length === 0;
            if (isEmpty && this.isLongAnswerField(field)) {
                const q = this.extractQuestionText(field);
                if (this.looksLikeGeneralQuestion(q)) {
                    const ai = await this.answerWithAI(q);
                    if (ai) {
                        if (fieldType === 'select-one') {
                            // לא רלוונטי כאן, אבל נשמור על מבנה אחיד
                        } else if (field.isContentEditable) {
                            field.textContent = ai;
                            field.dispatchEvent(new InputEvent('input', { bubbles: true }));
                            field.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            field.value = ai;
                            field.dispatchEvent(new Event('input', { bubbles: true }));
                            field.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        return; // מילאנו עם AI — אין צורך בהמשך המיפוי
                    }
                }
            }
            
            // Determine what value to fill based on field type and label
            if (fieldType === 'text' || fieldType === 'email') {
                valueToFill = this.getFieldValueFromProfile(fieldName, fieldLabel, profile);
            } else if (fieldType === 'textarea') {
                valueToFill = this.getFieldValueFromProfile(fieldName, fieldLabel, profile);
            } else if (fieldType === 'select-one') {
                valueToFill = this.getFieldValueFromProfile(fieldName, fieldLabel, profile);
            }
            
            if (valueToFill) {
                // Fill the field
                if (fieldType === 'select-one') {
                    field.value = valueToFill;
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    field.value = valueToFill;
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                // console.log(`AI Agent filled field "${fieldLabel}" with value: ${valueToFill}`);
            }
        } catch (error) {
            console.error('Error filling field with profile:', error);
        }
    }

    getFieldValueFromProfile(fieldName, fieldLabel, profile) {
        const label = fieldLabel.toLowerCase();
        const name = fieldName.toLowerCase();
        
        // Map common field labels to profile data
        if (label.includes('name') || name.includes('name')) {
            return profile.fullName || '';
        } else if (label.includes('email') || name.includes('email')) {
            return profile.email || '';
        } else if (label.includes('phone') || name.includes('phone')) {
            return profile.phone || '';
        } else if (label.includes('location') || name.includes('location')) {
            return profile.location || '';
        } else if (label.includes('company') || name.includes('company')) {
            return profile.currentCompany || '';
        } else if (label.includes('linkedin') || name.includes('linkedin')) {
            return profile.linkedinUrl || profile.linkedin || '';
        }
        
        return '';
    }

    async navigateToNextPage() {
        try {
            // Prefer pagination next button
            const nextBtn = document.querySelector('.artdeco-pagination__button--next:not([disabled]) button, .artdeco-pagination__button--next:not([aria-disabled="true"])');
            if (nextBtn) {
                nextBtn.click();
                await this.delay(2000);
                return true;
            }

            // If no explicit next, scroll the left results list
            const listPane = document.querySelector('.jobs-search-results-list, .jobs-search-results__list, .scaffold-layout__list, .jobs-search-two-pane__job-results, .jobs-search-results');
            if (listPane) {
                listPane.scrollTo({ top: listPane.scrollTop + listPane.clientHeight * 0.9, behavior: 'smooth' });
                await this.delay(1200);
                return true;
            }

            // Fallback: page down the whole page
            window.scrollTo({ top: window.scrollY + window.innerHeight * 0.9, behavior: 'smooth' });
            await this.delay(1200);
            return true;
        } catch (error) {
            console.error('Error navigating to next page:', error);
            return false;
        }
    }

    async goBackToSearchResults() {
        try {
            // Go back to search results
            window.history.back();
            await this.delay(2000); // Wait for page to load
            return true;
        } catch (error) {
            console.error('Error going back to search results:', error);
            return false;
        }
    }

    async performJobSearch(searchData) {
        try {
            // console.log('Content Script: Performing job search with:', searchData);
            this.sendDebug(`Search: performing with query="${searchData.query}" location="${searchData.location||''}"`, 'info');
            
            const findFirst = (selectors) => {
                for (const s of selectors) {
                    const el = document.querySelector(s);
                    if (el) return el;
                }
                return null;
            };

            const setNativeValue = (element, value) => {
                try {
                    const { set } = Object.getOwnPropertyDescriptor(element, 'value') || {};
                    const prototype = Object.getPrototypeOf(element);
                    const { set: protoSet } = Object.getOwnPropertyDescriptor(prototype, 'value') || {};
                    if (protoSet) protoSet.call(element, value); else element.value = value;
                } catch (e) {
                    element.value = value;
                }
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            };

            // Robust selectors for LinkedIn jobs search box
            const keywordSelectors = [
                'input[aria-label="Search by title, skill, or company"]',
                'input[aria-label="Search by title, skill, or company (required)"]',
                'input[placeholder*="Title, skill"]',
                'input.jobs-search-box__text-input',
                'input[name="keywords"]',
                'input[id^="jobs-search-box-keyword-id-ember"]'
            ];
            const locationSelectors = [
                'input[aria-label="City, state, or zip code"]',
                'input[aria-label="Search location"]',
                'input[placeholder*="City"], input[placeholder*="location"]',
                'input[name="location"]',
                'input[id^="jobs-search-box-location-id-ember"]'
            ];
            const buttonSelectors = [
                'button[aria-label="Search"]',
                'button[aria-label*="Search"]',
                'button.jobs-search-box__submit-button'
            ];

            // Try to locate inputs
            const keywordInput = findFirst(keywordSelectors);
            const locationInput = findFirst(locationSelectors);
            
            if (!keywordInput && !locationInput) {
                this.sendDebug('Search: inputs not found, using URL fallback', 'warning');
                const base = 'https://www.linkedin.com/jobs/search/?';
                const params = new URLSearchParams();
                if (searchData.query) params.set('keywords', searchData.query);
                if (searchData.location) params.set('location', searchData.location);
                // Experience filters
                if (Array.isArray(searchData.experienceFilters) && searchData.experienceFilters.length) {
                    // Map our values to LinkedIn experience codes (f_E ranges)
                    const map = { internship: '1', entry: '2', associate: '3', mid: '4', director: '5', executive: '6' };
                    const codes = searchData.experienceFilters.map(v => map[v]).filter(Boolean);
                    if (codes.length) params.set('f_E', codes.join(','));
                }
                // Date posted filter
                if (searchData.datePosted && searchData.datePosted !== 'any') {
                    const dpMap = { past24h: 'r86400', pastWeek: 'r604800', pastMonth: 'r2592000' };
                    const dp = dpMap[searchData.datePosted];
                    if (dp) params.set('f_TPR', dp);
                }
                window.location.href = base + params.toString();
                await this.delay(3000);
                return { success: true, method: 'url' };
            }

            if (keywordInput && searchData.query) {
                keywordInput.focus();
                setNativeValue(keywordInput, searchData.query);
            }

            if (locationInput && searchData.location) {
                locationInput.focus();
                setNativeValue(locationInput, searchData.location);
            }

            // Small wait for React to process
            await this.delay(300);

            // Click the search button if exists
            const searchButton = findFirst(buttonSelectors);
            if (searchButton) {
                searchButton.click();
                await this.delay(2000);
                // After search, enforce filters by URL update if any filter provided
                if ((Array.isArray(searchData.experienceFilters) && searchData.experienceFilters.length) || (searchData.datePosted && searchData.datePosted !== 'any') || (Array.isArray(searchData.jobTypeFilters) && searchData.jobTypeFilters.length)) {
                    const url = new URL(window.location.href);
                    if (Array.isArray(searchData.experienceFilters) && searchData.experienceFilters.length) {
                        const map = { internship: '1', entry: '2', associate: '3', mid: '4', director: '5', executive: '6' };
                        const codes = searchData.experienceFilters.map(v => map[v]).filter(Boolean);
                        if (codes.length) url.searchParams.set('f_E', codes.join(','));
                    } else { url.searchParams.delete('f_E'); }
                    if (searchData.datePosted && searchData.datePosted !== 'any') {
                        const dpMap = { past24h: 'r86400', pastWeek: 'r604800', pastMonth: 'r2592000' };
                        const dp = dpMap[searchData.datePosted];
                        if (dp) url.searchParams.set('f_TPR', dp);
                    } else { url.searchParams.delete('f_TPR'); }
                    if (Array.isArray(searchData.jobTypeFilters) && searchData.jobTypeFilters.length) {
                        // LinkedIn uses f_JT with codes: F,P,C,T,I,V,O
                        url.searchParams.set('f_JT', searchData.jobTypeFilters.join(','));
                    } else { url.searchParams.delete('f_JT'); }
                    window.location.href = url.toString();
                    await this.delay(3000);
                }
                this.sendDebug('Search: triggered via button', 'success');
                return { success: true, method: 'button' };
            }

            // Fallback: press Enter in the keyword input
            const targetInput = keywordInput || locationInput;
            if (targetInput) {
                targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                targetInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                await this.delay(2000);
                if ((Array.isArray(searchData.experienceFilters) && searchData.experienceFilters.length) || (searchData.datePosted && searchData.datePosted !== 'any') || (Array.isArray(searchData.jobTypeFilters) && searchData.jobTypeFilters.length)) {
                    const url = new URL(window.location.href);
                    if (Array.isArray(searchData.experienceFilters) && searchData.experienceFilters.length) {
                        const map = { internship: '1', entry: '2', associate: '3', mid: '4', director: '5', executive: '6' };
                        const codes = searchData.experienceFilters.map(v => map[v]).filter(Boolean);
                        if (codes.length) url.searchParams.set('f_E', codes.join(','));
                    } else { url.searchParams.delete('f_E'); }
                    if (searchData.datePosted && searchData.datePosted !== 'any') {
                        const dpMap = { past24h: 'r86400', pastWeek: 'r604800', pastMonth: 'r2592000' };
                        const dp = dpMap[searchData.datePosted];
                        if (dp) url.searchParams.set('f_TPR', dp);
                    } else { url.searchParams.delete('f_TPR'); }
                    if (Array.isArray(searchData.jobTypeFilters) && searchData.jobTypeFilters.length) {
                        url.searchParams.set('f_JT', searchData.jobTypeFilters.join(','));
                    } else { url.searchParams.delete('f_JT'); }
                    window.location.href = url.toString();
                    await this.delay(3000);
                }
                this.sendDebug('Search: triggered via Enter', 'success');
                return { success: true, method: 'enter' };
            }

            // Last resort: URL fallback
            const base = 'https://www.linkedin.com/jobs/search/?';
            const params = new URLSearchParams();
            if (searchData.query) params.set('keywords', searchData.query);
            if (searchData.location) params.set('location', searchData.location);
            if (Array.isArray(searchData.experienceFilters) && searchData.experienceFilters.length) {
                const map = { internship: '1', entry: '2', associate: '3', mid: '4', director: '5', executive: '6' };
                const codes = searchData.experienceFilters.map(v => map[v]).filter(Boolean);
                if (codes.length) params.set('f_E', codes.join(','));
            }
            if (searchData.datePosted && searchData.datePosted !== 'any') {
                const dpMap = { past24h: 'r86400', pastWeek: 'r604800', pastMonth: 'r2592000' };
                const dp = dpMap[searchData.datePosted];
                if (dp) params.set('f_TPR', dp);
            }
            if (Array.isArray(searchData.jobTypeFilters) && searchData.jobTypeFilters.length) {
                params.set('f_JT', searchData.jobTypeFilters.join(','));
            }
            window.location.href = base + params.toString();
            await this.delay(3000);
            this.sendDebug('Search: triggered via URL fallback', 'success');
            return { success: true, method: 'url-fallback' };
            
        } catch (error) {
            console.error('Content Script: Error performing job search:', error);
            this.sendDebug(`Search error: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async scrollPage() {
        try {
            // Scroll the left results list instead of job description pane
            const list = document.querySelector('.jobs-search-results-list, .scaffold-layout__list-detail, .jobs-search-two-pane__job-results, .jobs-search__results-list, body');
            if (list) {
                list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }
            await this.delay(1000);
            return { success: true };
        } catch (error) {
            console.error('Content Script: Error scrolling page:', error);
            return { success: false, error: error.message };
        }
    }

    async testAIFunctionality() {
        try {
            // console.log('Testing AI functionality...');
            
            // Test job data extraction
            const currentUrl = window.location.href;
            let testResult = { success: true, tests: [] };
            
            if (currentUrl.includes('/jobs/') && currentUrl.includes('/view/')) {
                // Test individual job extraction
                const jobData = await this.extractIndividualJobDataForAI();
                if (jobData) {
                    testResult.tests.push('Individual job extraction: SUCCESS');
                    testResult.jobData = jobData;
                } else {
                    testResult.tests.push('Individual job extraction: FAILED');
                    testResult.success = false;
                }
            } else if (currentUrl.includes('/jobs/')) {
                // Test job listings extraction
                const jobs = await this.extractJobListingsForAI();
                if (jobs.length > 0) {
                    testResult.tests.push(`Job listings extraction: SUCCESS (${jobs.length} jobs found)`);
                    testResult.jobs = jobs;
                } else {
                    testResult.tests.push('Job listings extraction: FAILED');
                    testResult.success = false;
                }
            } else {
                testResult.tests.push('Not on LinkedIn jobs page');
                testResult.success = false;
            }
            
            return testResult;
        } catch (error) {
            console.error('Error testing AI functionality:', error);
            return { success: false, error: error.message };
        }
    }

    async expandJobDescription() {
        try {
            // Wait for the job description section to be visible
            await this.delay(800);
            const descriptionSection = document.querySelector('.jobs-description__content, .job-details-jobs-unified-top-card__job-description, .jobs-box__html-content, .jobs-description, [data-test-description-section]');
            if (!descriptionSection) {
                this.sendDebug('Description expansion: Job description section not found', 'warning');
                return { success: false, error: 'Job description section not found' };
            }

            // Scroll to the description section to reveal controls
            descriptionSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(700);

            // Helper to match text/aria-label
            const isSeeMore = (el) => {
                const s = ((el.textContent || '') + ' ' + (el.getAttribute?.('aria-label') || '')).toLowerCase();
                return (
                    s.includes('see more') ||
                    s.includes('show more') ||
                    s.includes('read more') ||
                    s.trim() === 'more' ||
                    s.includes('expand') ||
                    s.includes('הצג עוד') || // Hebrew: show more
                    s.includes('ראה עוד')    // Hebrew: see more
                );
            };

            let seeMoreButton = null;

            // Try scoped buttons/links first
            const scoped = Array.from(descriptionSection.querySelectorAll('button, a, .artdeco-button'));
            seeMoreButton = scoped.find(isSeeMore) || null;

            // If not found, try global (some UIs render controls outside section)
            if (!seeMoreButton) {
                const globalCandidates = Array.from(document.querySelectorAll('button, a, .artdeco-button'));
                seeMoreButton = globalCandidates.find(isSeeMore) || null;
            }

            // If still not found, try scrolling inside the description to reveal lazy content
            if (!seeMoreButton) {
                for (let i = 0; i < 4 && !seeMoreButton; i++) {
                    descriptionSection.scrollBy?.(0, 400);
                    await this.delay(350);
                    const scoped2 = Array.from(descriptionSection.querySelectorAll('button, a, .artdeco-button'));
                    seeMoreButton = scoped2.find(isSeeMore) || null;
                }
            }

            if (!seeMoreButton) {
                this.sendDebug('Description expansion: "See more" button not found', 'warning');
                return { success: false, error: 'See more button not found' };
            }

            // Ensure clickable
            if (seeMoreButton.scrollIntoView) {
                seeMoreButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.delay(350);
            }

            // Click the "See more" button
            seeMoreButton.click();
            await this.delay(900); // Wait for content to expand
            this.sendDebug('Description expansion: Job description expanded', 'success');
            return { success: true };
        } catch (error) {
            console.error('Error expanding job description:', error);
            return { success: false, error: error.message };
        }
    }

    async testScrollDown() {
        try {
            const container = document.querySelector('.jobs-search-results-list, .scaffold-layout__list-detail, .jobs-search-two-pane__job-results, .jobs-search__results-list, body');
            const target = container || document.scrollingElement || document.body;
            let total = 0;
            for (let i = 0; i < 10; i++) {
                total += 500;
                target.scrollBy?.(0, 500);
                window.scrollBy(0, 500);
                await this.delay(300);
            }
            this.sendDebug(`Test scroll: scrolled down approximately ${total}px`, 'success');
            return { success: true };
        } catch (e) {
            this.sendDebug(`Test scroll failed: ${e.message}`, 'error');
            return { success: false, error: e.message };
        }
    }

    async prepareJobForDeepAnalysis() {
        try {
            // Ensure description is expanded
            await this.expandJobDescription();
            
            // Scroll the description area and page to force lazy content load
            const desc = document.querySelector('.jobs-description__content, .job-details-jobs-unified-top-card__job-description, .jobs-box__html-content, .jobs-description, [data-test-description-section]');
            if (desc) {
                desc.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.delay(400);
                for (let i = 0; i < 5; i++) {
                    desc.scrollBy?.(0, 500);
                    await this.delay(200);
                }
            }
            window.scrollBy(0, window.innerHeight * 0.8);
            await this.delay(400);
            window.scrollBy(0, window.innerHeight * 0.8);
            await this.delay(500);
            
            // Re-extract detailed job data
            const jobData = await this.extractIndividualJobDataForAI();
            if (!jobData || !jobData.description || jobData.description.length < 100) {
                this.sendDebug('Deep prep: description still short, attempting another expansion cycle', 'warning');
                await this.expandJobDescription();
                await this.delay(600);
                return await this.extractIndividualJobDataForAI();
            }
            return jobData;
        } catch (e) {
            this.sendDebug(`Deep prep failed: ${e.message}`, 'error');
            return await this.extractIndividualJobDataForAI();
        }
    }

    async testApplyOnCurrentPage() {
        try {
            this.sendDebug('Test Apply Flow: Starting test on current page...', 'info');

            const href = window.location.href || '';
            this.sendDebug(`href: ${href}`);
            const isLinkedIn = /linkedin\.com/.test(href);
            this.sendDebug(`isLinkedIn: ${isLinkedIn}`);

            // Try to ensure we have some job context if on LinkedIn
            if (isLinkedIn && !this.currentJob) {
                try { this.currentJob = await this.extractIndividualJobDataForAI(); } catch (_) {}
            }

            // Prefer using detected Apply button if present
            const applyButton = this.findApplyButton();
            if (applyButton && applyButton.href && (/^https?:\/\//.test(applyButton.href))) {
                this.sendDebug(`Test Apply Flow: Found external apply link at ${applyButton.href}. Navigating...`, 'info');
                window.location.href = applyButton.href;
                await this.delay(3000);
                this.sendDebug('Test Apply Flow: External site loaded. Attempting to fill and submit form...', 'info');
                const generic = await this.applyOnGenericExternalSite();
                return generic;
            }

            // If on LinkedIn, attempt Easy Apply path with whatever data we have
            if (isLinkedIn) {
                this.sendDebug('Test Apply Flow: Attempting LinkedIn Easy Apply...', 'info');
                
                // Check submission mode setting
                const { aiAgent } = await chrome.storage.sync.get('aiAgent');
                const testMode = aiAgent?.aiSubmissionMode === true; // Default to true
                
                if (testMode) {
                    this.sendDebug('🧪 Test mode enabled - filling form but NOT submitting', 'info');
                } else {
                    this.sendDebug('✅ Live mode - filling form AND submitting', 'info');
                }
                
                const applyResult = await this.applyToJobWithAI(this.currentJob || {}, this.profile, !testMode);
                if (applyResult.success) {
                    const modeText = testMode ? 'filled (test mode)' : 'submitted';
                    this.sendDebug(`Test Apply Flow: LinkedIn Easy Apply ${modeText}!`, 'success');
                    return { success: true, message: `LinkedIn Easy Apply ${modeText}`, testMode: !testMode };
                }
                this.sendDebug('Test Apply Flow: LinkedIn Easy Apply failed, falling back to generic routine.', 'warning');
            }

            // Fallback: run a generic external-site apply routine on any page
            const res = await this.applyOnGenericExternalSite();
            return res;
        } catch (error) {
            console.error('Error in testApplyOnCurrentPage:', error);
            return { success: false, error: error.message };
        }
    }

    async applyOnGenericExternalSite() {
        try {
            // Check submission mode setting first
            const { aiAgent } = await chrome.storage.sync.get('aiAgent');
            const testMode = aiAgent?.aiSubmissionMode === true; // Default to true
            
            if (testMode) {
                this.sendDebug('🧪 Test mode enabled - will fill forms but NOT submit', 'info');
            } else {
                this.sendDebug('✅ Live mode - will fill forms AND submit', 'info');
            }
            
            // שלב 0: נסה העלאה רשתית אוטומטית לפני הכל
            this.sendDebug('🌐 Phase 0: Attempting network-based automatic upload...', 'info');
            const networkUpload = await this.autoUploadResumeNetwork();
            
            if (networkUpload.uploaded) {
                this.sendDebug('✅ Network upload successful! Proceeding to form filling and submission...', 'success');
                
                // אם ההעלאה הרשתית הצליחה, נמשיך למלא את הטופס ולהגיש
                const fillResult = await this.fillAndSubmitAfterNetworkUpload();
                return {
                    success: true,
                    method: 'network-upload',
                    uploadResult: networkUpload,
                    submitResult: fillResult
                };
            } else {
                this.sendDebug(`⚠️ Network upload failed: ${networkUpload.reason}. Falling back to traditional methods...`, 'warning');
            }

            // שלב 1: פרה־טעינה של כל התוכן (שיטה מסורתית)
            // await this.preloadEntirePage();

            // שלב 2: איסוף דפי יעד — מסמך ראשי + iframes מאותו מקור
            const docs = [document];
            const frames = Array.from(document.querySelectorAll('iframe')).filter(this.isVisible.bind(this));
            for (const frame of frames) {
                try {
                    const doc = frame.contentDocument || frame.contentWindow?.document;
                    if (doc) docs.push(doc);
                } catch(_) {} // cross-origin
            }

            // שלב 2.5: ניסיון הצמדת קורות חיים אוטומטית - ENHANCED
            this.sendDebug('🔍 Searching for resume upload locations...', 'info');
            const resumeAttached = await this.attachResumeAcrossDocs();
            if (resumeAttached) {
                this.sendDebug('✅ Resume successfully attached before form filling', 'success');
            }

            // נתוני פרופיל
            const p = this.profile || {};
            // אם יש טקסט קו״ח שמור, נוסיף ל־profile.coverLetter כדי לתת תוכן ל־textarea
            try {
                let { resumeContent } = await chrome.storage.sync.get('resumeContent');
                if (!resumeContent) { const l = await chrome.storage.local.get('resumeContent'); resumeContent = l?.resumeContent; }
                if (resumeContent && !p.coverLetter) p.coverLetter = resumeContent.slice(0, 2000);
            } catch(_) {}

            // שלב 3: איתור מועמדי טפסים, ניקוד וקפיצה ממוקדת
            let totalFilled = 0;
            let submitAttempted = false;
            
            for (const doc of docs) {
                const candidates = this.clusterForms(doc)
                    .map(root => ({ root, score: this.scoreFormCandidate(root) }))
                    .sort((a,b) => b.score - a.score);

                for (const cand of candidates) {
                    // אם המועמד מתוך iframe – נגלול גם את ה־iframe (אם ניתן)
                    try { cand.root.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); } catch(_) {}
                    await this.delay(250);

                    const filled = await this.goToAndFillForm(cand.root, p);
                    totalFilled += filled;

                    // Try to attach resume again within this specific form if not done by network
                    if (!networkUpload.uploaded && !resumeAttached) {
                        await this.attachResumeInDoc(doc);
                    }

                    // נסה ל־Submit מתוך אותה מכולה
                    const submit =
                        cand.root.querySelector('button[type="submit"], input[type="submit"]') ||
                        Array.from(cand.root.querySelectorAll('button, a, [role="button"], input[type="button"]'))
                             .find(b => /apply|apply now|send application|submit|שלח|להגיש|הגש/i.test(this.textOf(b)));
                    
                    if (submit) {
                        if (testMode) {
                            this.sendDebug('🧪 Test mode: Found submit button but skipping submission', 'info');
                            submitAttempted = true;
                        } else {
                        try { 
                            submit.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
                            await this.delay(200); 
                            submit.click(); 
                            submitAttempted = true;
                            this.sendDebug('📤 Submitted application form', 'info');
                            
                            // Wait a moment to see if there are any error messages
                            await this.delay(1000);
                            
                            // Check for resume required errors
                            if (this.resumeSeemsRequired(doc)) {
                                const retrySuccess = await this.handleResumeRequiredError();
                                if (retrySuccess) {
                                    this.sendDebug(`Generic Apply (with network fallback): filled ~${totalFilled} fields, handled resume requirement, and submitted`, 'success');
                                    return { success: true, method: 'traditional-with-resume-retry' };
                                }
                            } else if (totalFilled > 0 || networkUpload.uploaded) {
                                this.sendDebug(`Generic Apply (hybrid): network_upload=${networkUpload.uploaded}, filled ~${totalFilled} fields, submitted successfully`, 'success');
                                return { 
                                    success: true, 
                                    method: 'hybrid',
                                    networkUpload: networkUpload.uploaded,
                                    fieldsFileld: totalFilled
                                };
                            }
                        } catch(_) {}
                        }
                    }
                }
            }

            // אם הגענו לכאן — לא נמצאה לחיצת Submit; ננסה חיפוש גלובלי אחרון
            if (!submitAttempted) {
                // Try one more time to attach resume before global submit if network didn't work
                if (!networkUpload.uploaded && !resumeAttached) {
                    await this.attachResumeAcrossDocs();
                }
                
                const btn = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]'))
                    .filter(this.isVisible.bind(this))
                    .find(el => /apply|submit|send application|שלח|להגיש|הגש/i.test(this.textOf(el)));
                
                if (btn) {
                    if (testMode) {
                        this.sendDebug('🧪 Test mode: Found global submit button but skipping submission', 'info');
                    } else {
                    try { 
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
                        await this.delay(200); 
                        btn.click(); 
                        
                        // Wait and check for errors
                        await this.delay(1000);
                        if (this.resumeSeemsRequired()) {
                            await this.handleResumeRequiredError();
                        }
                        
                        if (totalFilled > 0 || networkUpload.uploaded) {
                            this.sendDebug(`Generic Apply (fallback): network_upload=${networkUpload.uploaded}, filled ~${totalFilled} fields, submitted via global button`, 'success');
                            return { 
                                success: true, 
                                method: 'fallback-global',
                                networkUpload: networkUpload.uploaded,
                                fieldsFileld: totalFilled
                            };
                        }
                    } catch(_) {}
                    }
                }
            }

            // לא נמצאו טפסים או כפתורי הגשה
            if (networkUpload.uploaded) {
                if (testMode) {
                    this.sendDebug('🧪 Test mode: Network upload succeeded, forms filled but not submitted', 'success');
                    
                    // Record test mode activity to history
                    const extracted = await this.extractGenericJobFromDOM();
                    const jobCtx = this.currentJob || extracted;
                    await this.recordFormFilling(jobCtx, 'Test Mode - Network Upload + Forms Filled', 'Generic External Site', {
                        networkUpload: true,
                        totalFilled: totalFilled,
                        testMode: true
                    });
                    
                    return { 
                        success: true, 
                        method: 'test-mode-network-only',
                        message: 'Resume uploaded and forms filled successfully (test mode - no submission)',
                        testMode: true
                    };
                } else {
                this.sendDebug('Network upload succeeded but no submit mechanism found', 'warning');
                    
                    // Record activity to history
                    const extracted = await this.extractGenericJobFromDOM();
                    const jobCtx = this.currentJob || extracted;
                    await this.recordFormFilling(jobCtx, 'Network Upload + Forms Filled (No Submit)', 'Generic External Site', {
                        networkUpload: true,
                        totalFilled: totalFilled,
                        submitted: false
                    });
                    
                return { 
                    success: true, 
                    method: 'network-only',
                    message: 'Resume uploaded successfully via network, but could not submit form'
                };
                }
            } else {
                if (testMode) {
                    this.sendDebug('🧪 Test mode: Forms filled but no submission attempted', 'success');
                    this.sendDebug(`currentJob: ${JSON.stringify(this.currentJob)}`);
                    const extracted = await this.extractGenericJobFromDOM();
                    this.sendDebug(`extractGenericJobFromDOM: ${JSON.stringify(extracted)}`);
                    // Record test mode activity to history
                    const jobCtx = this.currentJob || extracted;
                    await this.recordFormFilling(jobCtx, 'Test Mode - Forms Filled Only', 'Generic External Site', {
                        totalFilled: totalFilled,
                        testMode: true
                    });
                    
                    return { 
                        success: true, 
                        method: 'test-mode-fill-only',
                        message: 'Forms filled successfully (test mode - no submission)',
                        testMode: true
                };
            } else {
                this.sendDebug('Generic Apply: no upload or submit mechanisms found', 'warning');
                    
                    // Record failed attempt to history
                    const extracted = await this.extractGenericJobFromDOM();
                    const jobCtx = this.currentJob || extracted;
                    await this.recordFormFilling(jobCtx, 'No Forms or Submit Found', 'Generic External Site', {
                        totalFilled: totalFilled,
                        submitted: false,
                        error: 'No apply/submit controls found'
                    });
                    
            return { success: false, error: 'No apply/submit controls found' };
                }
            }
        } catch (e) {
            console.error('Error in applyOnGenericExternalSite:', e);
            return { success: false, error: e?.message || 'Generic apply failed' };
        }
    }
    
    // מילוי והגשה לאחר העלאה רשתית מוצלחת
    async fillAndSubmitAfterNetworkUpload() {
        try {
            this.sendDebug('📝 Starting form filling after network upload...', 'info');
            
            const profile = this.profile || {};
            
            // איסוף כל הטפסים הנראים
            const visibleForms = Array.from(document.querySelectorAll('form')).filter(this.isVisible.bind(this));
            let totalFilled = 0;
            
            // מיון טפסים לפי רלוונטיות (טפסי מועמדות ראשונים)
            const allScoredForms = visibleForms.map(form => ({
                form: form,
                score: this.scoreJobApplicationForm(form)
            }));
            
            const scoredForms = allScoredForms.filter(item => item.score > 0).sort((a, b) => b.score - a.score);
            const filteredOutForms = allScoredForms.filter(item => item.score <= 0);
            
            this.sendDebug(`📊 Found ${scoredForms.length} relevant job application forms out of ${visibleForms.length} total forms`, 'info');
            
            if (filteredOutForms.length > 0) {
                this.sendDebug(`🚫 Filtered out ${filteredOutForms.length} irrelevant forms (newsletters, marketing, etc.)`, 'info');
            }
            
            // מילוי הטפסים הרלוונטיים בלבד (לא ניוזלטרים!)
            for (const { form, score } of scoredForms) {
                this.sendDebug(`📝 Filling job application form (relevance score: ${score})...`, 'info');
                    
                    const filled = await this.goToAndFillForm(form, profile);
                    totalFilled += filled;
                    
                    this.sendDebug(`   Filled ${filled} fields in this form`, 'info');
                
                // אם מילאנו הרבה שדות בטופס הזה, סביר שזה הטופס העיקרי
                if (filled >= 3) {
                    this.sendDebug(`✅ Main application form detected and filled, skipping remaining forms`, 'info');
                    break;
                }
            }
            
            this.sendDebug(`📊 Total fields filled: ${totalFilled}`, 'info');
            
            // ניסיון הגשה
            const submitButton = Array.from(document.querySelectorAll('button, input[type="submit"], a, [role="button"]'))
                .filter(this.isVisible.bind(this))
                .find(btn => /apply|submit|send|הגש|שלח/i.test(this.textOf(btn)));
            
            if (submitButton) {
                // Check submission mode before clicking
                const { aiAgent } = await chrome.storage.sync.get('aiAgent');
                const testMode = aiAgent?.aiSubmissionMode === true;  
                if (testMode) {
                    this.sendDebug('🧪 Test mode: Found submit button but skipping submission', 'info');
                    
                    // Record test mode activity to history
                    const extracted = await this.extractGenericJobFromDOM();
                    const jobCtx = this.currentJob || extracted;
                    await this.recordFormFilling(jobCtx, 'Test Mode - Forms Filled (Submit Skipped)', 'Network Upload + Form Fill', {
                        fieldsFilled: totalFilled,
                        testMode: true,
                        submitButtonFound: true
                    });
                    
                    return { 
                        success: true, 
                        fieldsFileld: totalFilled,
                        submitted: false,
                        message: 'Form filled successfully (test mode - no submission)',
                        testMode: true
                    };
                } else {
                this.sendDebug(`🚀 Found submit button, clicking...`, 'info');
                
                submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.delay(300);
                submitButton.click();
                
                await this.delay(1000);
                
                this.sendDebug(`✅ Form submitted after network upload`, 'success');
                    
                    // Record successful submission to history
                    const extracted = await this.extractGenericJobFromDOM();
                    const jobCtx = this.currentJob || extracted;
                    await this.recordFormFilling(jobCtx, 'Submitted Successfully', 'Network Upload + Form Fill', {
                        fieldsFilled: totalFilled,
                        submitted: true,
                        method: 'submit button click'
                    });
                    
                return { 
                    success: true, 
                    fieldsFileld: totalFilled,
                    submitted: true
                };
                }
            } else {
                this.sendDebug(`⚠️ No submit button found after network upload`, 'warning');
                return { 
                    success: true, 
                    fieldsFileld: totalFilled,
                    submitted: false,
                    message: 'Form filled but no submit button found'
                };
            }
            
        } catch (error) {
            this.sendDebug(`❌ Error in form filling after network upload: ${error.message}`, 'error');
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    // === SMART PRELOAD & FORM LOCATION HELPERS ===
    isVisible(el) {
        if (!el) return false;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity||'1') === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    textOf(el) {
        return ((el?.textContent || '') + ' ' + (el?.getAttribute?.('aria-label') || '')).toLowerCase();
    }

    setNative(element, value) {
        try {
            element.focus?.();
            if (element.isContentEditable || element.getAttribute?.('contenteditable') === 'true') {
                element.textContent = value;
                element.dispatchEvent(new InputEvent('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            const { set } = Object.getOwnPropertyDescriptor(element, 'value') || {};
            const proto = Object.getPrototypeOf(element);
            const { set: pSet } = Object.getOwnPropertyDescriptor(proto, 'value') || {};
            if (pSet) pSet.call(element, value); else if (set) set.call(element, value); else element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } catch(_) { try { element.value = value; } catch(_) {} }
    }

    isInViewport(el, margin = 80) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top >= margin && r.bottom <= (window.innerHeight - margin);
    }

    async preloadEntirePage(maxRounds = 12) {
        // 1) פותח <details>, לוחץ See more / Expand / הצג עוד
        const tryExpandOnce = () => {
            let clicked = 0;
            document.querySelectorAll('details:not([open])').forEach(d => { d.open = true; clicked++; });
            const isExpand = (el) => {
                const t = this.textOf(el);
                return /see more|show more|expand|read more|more|load more|view more|הצג עוד|ראה עוד/i.test(t);
            };
            const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], .artdeco-button'));
            candidates.filter(this.isVisible).filter(isExpand).slice(0,10).forEach(b => { try{ b.click(); clicked++; }catch(_){} });
            return clicked;
        };

        let lastH = 0;
        for (let i = 0; i < maxRounds; i++) {
            // נסה להרחיב
            tryExpandOnce();
            // גלול עד הסוף
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
            await this.delay(600);
            // אם לא גדל, נשבור
            const h = document.body.scrollHeight;
            if (h <= lastH) break;
            lastH = h;
        }
        // חזרה לראש
        window.scrollTo({ top: 0, behavior: 'auto' });
        await this.delay(200);
    }

    getAllVisibleInputsFromDoc(doc) {
        const sel = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]';
        return Array.from(doc.querySelectorAll(sel)).filter(this.isVisible.bind(this));
    }

    clusterForms(doc) {
        // החזר רשימת "מועמדי טפסים": <form> נראים, או מכולות גדולות סביב שדות
        const candidates = [];
        const forms = Array.from(doc.querySelectorAll('form')).filter(this.isVisible.bind(this));
        forms.forEach(f => candidates.push(f));

        if (!forms.length) {
            // אין form מפורש — נאתר מכולות עם הרבה שדות
            const inputs = this.getAllVisibleInputsFromDoc(doc);
            const parents = new Map();
            inputs.forEach(inp => {
                const container = inp.closest('[class*="form" i], .form-group, .w-form, .w-input, .field, [role="form"]') || inp.parentElement;
                if (container) {
                    const arr = parents.get(container) || [];
                    arr.push(inp);
                    parents.set(container, arr);
                }
            });
            parents.forEach((arr, root) => {
                if (arr.length >= 2) candidates.push(root);
            });
        }
        // ניקוי כפילויות
        return Array.from(new Set(candidates));
    }

    scoreJobApplicationForm(form) {
        let score = 0;
        const formText = (form.textContent || '').toLowerCase();
        const formHTML = form.innerHTML.toLowerCase();
        
        // ניוזלטרים ורישומים שיווקיים - ניקוד שלילי חזק
        const newsletterIndicators = [
            /newsletter|subscription|subscribe|mailing.?list|updates|news/i,
            /stay.?(informed|updated)|keep.?me.?(informed|updated)/i,
            /email.?(updates|notifications|alerts)/i,
            /marketing.?(email|communication)/i,
            /promotional.?(email|content)/i,
            /sign.?up.?(for|to).?(our|email|newsletter)/i,
            /get.?(updates|news|notifications)/i,
            /join.?(our|mailing)/i
        ];
        
        for (const pattern of newsletterIndicators) {
            if (pattern.test(formText)) {
                this.sendDebug(`❌ Newsletter/marketing form detected: ${pattern}`, 'warning');
                return -10; // ניקוד שלילי חזק
            }
        }
        
        // אינדיקטורים לטפסי מועמדות חזקים
        const jobApplicationIndicators = [
            { pattern: /application|apply.?(for|to)|job.?application/i, points: 15 },
            { pattern: /resume|cv|curriculum.?vitae/i, points: 12 },
            { pattern: /cover.?letter/i, points: 10 },
            { pattern: /position|role|opportunity/i, points: 8 },
            { pattern: /career|employment|hiring|recruitment/i, points: 6 },
            { pattern: /experience|skills|qualifications/i, points: 5 },
            { pattern: /salary|compensation|benefits/i, points: 4 }
        ];
        
        for (const { pattern, points } of jobApplicationIndicators) {
            if (pattern.test(formText)) {
                score += points;
                this.sendDebug(`✅ Job application indicator: ${pattern} (+${points})`, 'info');
            }
        }
        
        // בדיקת שדות טופס
        const inputs = form.querySelectorAll('input, textarea, select');
        
        // שדות שמאפיינים טפסי מועמדות
        const jobFieldIndicators = [
            { pattern: /first.?name|given.?name|שם.?פרטי/i, points: 3 },
            { pattern: /last.?name|family.?name|surname|שם.?משפחה/i, points: 3 },
            { pattern: /phone|טלפון|טל/i, points: 4 },
            { pattern: /resume|cv|upload|file/i, points: 8 },
            { pattern: /experience|שנות.?ניסיון/i, points: 6 },
            { pattern: /linkedin|portfolio|website/i, points: 5 }
        ];
        
        for (const input of inputs) {
            const inputText = [
                input.name || '',
                input.placeholder || '',
                input.getAttribute('aria-label') || '',
                input.id || '',
                input.closest('label')?.textContent || ''
            ].join(' ').toLowerCase();
            
            // עדכון: email לבד אינו מספיק - ניוזלטרים גם דורשים אותו
            if (/email|אימייל/.test(inputText)) {
                // אימייל מקבל ניקוד נמוך יותר כי גם ניוזלטרים דורשים אותו
                score += 1;
            }
            
            for (const { pattern, points } of jobFieldIndicators) {
                if (pattern.test(inputText)) {
                    score += points;
                }
            }
        }
        
        // כפתורי הגשה שמאפיינים מועמדות
        const submitButtons = form.querySelectorAll('button, input[type="submit"], a[role="button"]');
        for (const btn of submitButtons) {
            const btnText = (btn.textContent || btn.value || '').toLowerCase();
            if (/apply|submit.?application|send.?application|הגש|שלח.?מועמדות/i.test(btnText)) {
                score += 10;
            } else if (/subscribe|sign.?up|join|get.?updates/i.test(btnText)) {
                score -= 8; // ניקוד שלילי לכפתורי רישום
            }
        }
        
        // אם יש פחות מ-2 שדות, זה כנראה לא טופס מועמדות רציני
        if (inputs.length < 2) {
            score -= 5;
        }
        
        // בונוס לטפסים ארוכים יותר (מועמדות נוטות להיות ארוכות יותר)
        if (inputs.length >= 4) {
            score += 3;
        }
        if (inputs.length >= 6) {
            score += 5;
        }
        
        this.sendDebug(`📊 Form score: ${score} (${inputs.length} fields)`, score > 0 ? 'info' : 'warning');
        return score;
    }

    scoreFormCandidate(root) {
        let score = 0;
        const inputs = root.querySelectorAll('input, textarea, select, [contenteditable="true"]');
        score += Math.min(20, inputs.length); // יותר שדות → יותר ניקוד
        // כפתור הגשה?
        const hasSubmit = root.querySelector('button[type="submit"], input[type="submit"]') ||
            Array.from(root.querySelectorAll('button, a, [role="button"]'))
                .some(b => /apply|submit|send|שלח|הגש|להגיש/i.test(this.textOf(b)));
        if (hasSubmit) score += 10;
        // האם יש תיבות "email/phone/name"
        const blob = (root.textContent || '').toLowerCase();
        if (/mail|email/.test(blob)) score += 3;
        if (/phone|טל/.test(blob)) score += 3;
        if (/name|שם/.test(blob)) score += 3;
        return score;
    }

    async chooseValueFor(el, profile = {}) {
        const name = (el.getAttribute?.('name') || '').toLowerCase();
        const ph   = (el.getAttribute?.('placeholder') || '').toLowerCase();
        const aria = (el.getAttribute?.('aria-label') || '').toLowerCase();
        const id   = (el.getAttribute?.('id') || '').toLowerCase();
        const labFor = (id ? (el.ownerDocument.querySelector(`label[for="${id}"]`)?.textContent || '') : '').toLowerCase();
        const ownLbl = (el.closest('label')?.textContent || '').toLowerCase();
        const around = (el.closest('[class*="field" i], [class*="form" i], .w-input, .w-form, .form-group')?.textContent || '').toLowerCase();
        const blob = `${name} ${ph} ${aria} ${labFor} ${ownLbl} ${around}`;

        const fullName = (profile.fullName || '').trim();
        const firstName = (profile.firstName || (fullName.split(' ')[0] || '')).trim();
        const lastName  = (profile.lastName  || (fullName.split(' ').slice(1).join(' ') || '')).trim();

        // first name:
        if ((aria.includes('first')  && aria.includes('name') ) || (ph.includes('first') && ph.includes('name')) || (id.includes('first') && id.includes('name')) || (name.includes('first') && name.includes('name')) || (labFor.includes('first') && labFor.includes('name'))) {
            return firstName;
        }
        // last name:
        if ((aria.includes('last')  && aria.includes('name') ) || (ph.includes('last') && ph.includes('name')) || (id.includes('last') && id.includes('name')) || (name.includes('last') && name.includes('name')) || (labFor.includes('last') && labFor.includes('name'))) {
            return lastName;
        }
        // full name or name:
        if ((aria.includes('full') && aria.includes('name')) || (ph.includes('full') && ph.includes('name')) || (id.includes('full') && id.includes('name')) || (name.includes('full') && name.includes('name')) || (labFor.includes('full') && labFor.includes('name'))) {
            return fullName || `${firstName} ${lastName}`.trim();
        }
        if ((aria.includes('name')) || (ph.includes('name')) || (id.includes('name')) || (name.includes('name')) || (labFor.includes('name'))) {
            return fullName || `${firstName} ${lastName}`.trim();
        }
        // email:
        if (aria.includes('mail') || ph.includes('mail') || id.includes('mail') || name.includes('mail') || labFor.includes('mail')) {
            return profile.email || '';
        }
        // phone:
        if (aria === 'phone' || ph === 'phone' || id === 'phone' || name === 'phone' || labFor === 'phone') {
            return profile.phone || '';
        }
        // company:
        if (aria === 'company' || ph === 'company' || id === 'company' || name === 'company' || labFor === 'company') {
            return profile.currentCompany || profile.company || '';
        }
        // linkedin:
        if (aria.includes('linkedin') || ph.includes('linkedin') || id.includes('linkedin') || name.includes('linkedin') || labFor.includes('linkedin')) {
            return profile.linkedin || profile.linkedinUrl || '';
        }
        // github:
        if (aria.includes('github') || ph.includes('github') || id.includes('github') || name.includes('github') || labFor.includes('github')) {
            return profile.github || profile.githubUrl || '';
        }
        // portfolio:
        if (aria.includes('portfolio') || ph.includes('portfolio') || id.includes('portfolio') || name.includes('portfolio') || labFor.includes('portfolio')) {
            return profile.portfolio || '';
        }
        // website:
        if (aria.includes('website') || ph.includes('website') || id.includes('website') || name.includes('website') || labFor.includes('website')) {
            return profile.website || profile.portfolio || '';
        }
        // city:
        if (aria.includes('city') || ph.includes('city') || id.includes('city') || name.includes('city') || labFor.includes('city')) {
            return profile.city || '';
        }
        // country:
        if (aria === 'country' || ph === 'country' || id === 'country' || name === 'country' || labFor === 'country') {
            return profile.country || '';
        }
        try {
            if (this.isLongAnswerField(el)) {
                const q = this.extractQuestionText(el);
                if (this.looksLikeGeneralQuestion(q) && !this.isRegularQuestion(q)) {
                    const ai = await this.answerWithAI(q);
                    return ai;
                }
            }
        } catch(_) {}
        return '';
    }

    async goToAndFillForm(root, profile) {
        // גלילה מדויקת לטופס
        try {
            const r = root.getBoundingClientRect();
            const y = window.scrollY + r.top - 120;
            window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
            await this.delay(450);
        } catch(_) {
            root.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            await this.delay(450);
        }

        // מילוי
        let filled = 0;
        const inputs = Array.from(root.querySelectorAll('input, textarea, select, [contenteditable="true"]'))
            .filter(this.isVisible.bind(this))
            .filter(el => (el.type || '').toLowerCase() !== 'password' && (el.type || '').toLowerCase() !== 'file');

            for (const el of inputs) {
                if ((el.tagName || '').toLowerCase() === 'select') {
                    if (!el.value && el.options && el.options.length) {
                        try { el.selectedIndex = Math.min(1, el.options.length - 1); el.dispatchEvent(new Event('change', { bubbles: true })); filled++; } catch(_) {}
                    }
                    continue;
                }
                if ((el.type || '').toLowerCase() === 'checkbox') {
                    const t = this.textOf(el) + ' ' + (el.closest('label')?.textContent || '').toLowerCase();
                    if (/agree|terms|consent|privacy|תנאים|הסכמה/.test(t)) { try { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); filled++; } catch(_) {} }
                    continue;
                }
                const cur = el.isContentEditable ? (el.textContent || '').trim() : (el.value || '').trim();
                if (cur) continue;
    
                // 🔹 נפילה חזרה למיפוי מתוך פרופיל
                const val = await this.chooseValueFor(el, profile);
                if (val) {
                    this.setNative(el, val);
                    filled++;
                    await this.delay(40);
                }
            }
    
        return filled;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
        // === AI long-answer helpers ===
    isLongAnswerField(field) {
            const tag = (field.tagName || '').toLowerCase();
            const type = (field.type || '').toLowerCase();
            // טקסט ארוך: textarea או input טקסט ארוך
            return tag === 'textarea' || (type === 'text' && (field.maxLength || 500) >= 200);
        }
    isRegularQuestion(text) {
        const regularQuestions = [
            'First Name',
            'Last Name',
            'Email',
            'Phone',
            'name',
            'email',
            'phone',
            'Name',
            'Email',
            'LinkedIn',
            'linkedin',
            'Linkedin Profile',
            'Linkedin Profile URL',
            'Linkedin URL'];
        return regularQuestions.some(q => text.includes(q));
    }

    extractQuestionText(field) {
            const parts = [];
            const aria = field.getAttribute('aria-label') || '';
            const ph = field.getAttribute('placeholder') || '';
            const title = field.getAttribute('title') || '';
            const id = field.id ? (field.ownerDocument.querySelector(`label[for="${field.id}"]`)?.textContent || '') : '';
            const wrap = field.closest('label, [role="group"], .form-group, .field, .question, [data-test*="question"], [class*="question" i]');
            const wrapTxt = wrap ? (wrap.textContent || '') : '';
            [aria, ph, title, id, wrapTxt]
                .map(t => (t || '').trim())
                .filter(Boolean)
                .forEach(t => parts.push(t));
            const q = parts.join(' ').replace(/\s+/g,' ').trim();
            return q.slice(0, 600);
        }
    
    looksLikeGeneralQuestion(text) {
            const t = (text || '').toLowerCase();
            // אנגלית + עברית
            const cues = [
                'why do you want', 'why are you applying', 'tell us about', 'describe', 'what makes you', 'cover letter',
                'motivation', 'strengths', 'weaknesses', 'about yourself', 'how would you',
                'למה', 'מדוע', 'ספר', 'ספרי', 'תאר', 'תארי', 'מה גורם', 'מוטיבציה', 'מכתב מקדים', 'על עצמך', 'עלייך', 'עליך', 'כיצד היית'
            ];
            const finish_with_question_mark = /[\?؟]$/.test(t);
            return cues.some(k => t.includes(k)) || finish_with_question_mark || t.length > 40;
        }
    
    // === ENHANCED RESUME FILE ATTACHMENT HELPERS ===
    async getStoredResumeFile() {
        // Return File from storage.local, or fallback to text from resumeContent
        try {
            const { resumeFile } = await chrome.storage.local.get('resumeFile');
            if (resumeFile?.base64) {
                const bstr = atob(resumeFile.base64);
                const u8 = new Uint8Array(bstr.length);
                for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
                const blob = new Blob([u8], { type: resumeFile.type || 'application/pdf' });
                return new File([blob], resumeFile.name || 'resume.pdf', { type: resumeFile.type || 'application/pdf' });
            }
        } catch (_) {}

        try {
            let { resumeContent } = await chrome.storage.sync.get('resumeContent');
            if (!resumeContent) {
                const l = await chrome.storage.local.get('resumeContent');
                resumeContent = l?.resumeContent;
            }
            if (resumeContent && resumeContent.trim()) {
                const blob = new Blob([resumeContent], { type: 'text/plain' });
                return new File([blob], 'resume.txt', { type: 'text/plain' });
            }
        } catch (_) {}
        return null;
    }

    // איסוף אלמנטים גם מתוך Shadow DOM
    getAllRoots(doc = document) {
        const roots = [doc];
        const stack = Array.from(doc.querySelectorAll('*'));
        for (const el of stack) {
            const sr = el.shadowRoot;
            if (sr) {
                roots.push(sr);
                stack.push(...sr.querySelectorAll('*'));
            }
        }
        return roots;
    }

    findResumeTargets(doc = document) {
        const roots = this.getAllRoots(doc);
        const inputs = [];
        const zones = [];
        const triggers = [];

        const isVisible = this.isVisible.bind(this);
        const textOf = this.textOf.bind(this);

        for (const root of roots) {
            // קלטי קובץ - Enhanced detection
            const allFileInputs = Array.from(root.querySelectorAll('input'))
                .filter(inp => inp.type === 'file' || ['resume', 'cover_letter'].includes(inp.name));
            
            // First, try to find resume-specific inputs
            const resumeSpecificInputs = allFileInputs.filter(el => {
                const t = [
                    el.getAttribute('name') || '',
                    el.id || '',
                    el.getAttribute('accept') || '',
                    el.closest('label')?.textContent || '',
                    el.getAttribute('aria-label') || '',
                    el.getAttribute('placeholder') || ''
                ].join(' ').toLowerCase();
                return (
                    /resume|cv|קורות|קובץ קו"ח|curriculum|vitae|attach/.test(t) ||
                    (el.accept || '').includes('application/pdf') ||
                    (el.accept || '').includes('.pdf') ||
                    (el.accept || '').includes('.doc') ||
                    (el.accept || '').includes('.docx') ||
                    (el.accept || '').includes('text/') ||
                    el.accept === '*/*' || 
                    el.accept === ''
                );
            });
            
            // If no resume-specific inputs found, include ALL visible file inputs
            if (resumeSpecificInputs.length === 0 && allFileInputs.length > 0) {
                this.sendDebug(`Found ${allFileInputs.length} generic file inputs - including all as potential resume targets`, 'info');
                inputs.push(...allFileInputs);
            } else {
                inputs.push(...resumeSpecificInputs);
            }

            // אזורי Drop וטקסט "Attach Resume" - Enhanced detection
            const allElements = Array.from(root.querySelectorAll('*')).filter(isVisible);
            
            // חיפוש רחב יותר לטקסט "Attach Resume" או דומה
            const resumeTextElements = allElements.filter(el => {
                const text = (el.textContent || '').trim();
                const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
                
                // חיפוש גמיש יותר - הוספת "Choose File" ודפוסים נוספים
                const resumePatterns = [
                    /attach\s*resume/i,
                    /upload\s*resume/i,
                    /resume\s*upload/i,
                    /add\s*resume/i,
                    /browse\s*resume/i,
                    /choose\s*resume/i,
                    /select\s*resume/i,
                    /choose\s*file/i,        // הוספה חדשה
                    /browse\s*file/i,        // הוספה חדשה
                    /select\s*file/i,        // הוספה חדשה
                    /upload\s*file/i,        // הוספה חדשה
                    /add\s*file/i,           // הוספה חדשה
                    /^attach$/i,  // רק "Attach"
                    /^resume$/i,  // רק "Resume"
                    /^choose\s*file$/i,      // הוספה חדשה
                    /^browse$/i,             // הוספה חדשה
                    /^upload$/i,             // הוספה חדשה
                    /^file$/i,               // הוספה חדשה
                    /צרף\s*קורות/i,
                    /העלה\s*קורות/i,
                    /בחר\s*קובץ/i            // הוספה חדשה בעברית
                ];
                
                const hasResumeText = resumePatterns.some(pattern => pattern.test(normalizedText));
                
                // גם אם זה לא בדיוק clickable, אם יש text כזה זה עדיין מעניין
                if (hasResumeText && text.length < 100) { // הרחבתי מ-50 ל-100
                    return true;
                }
                
                return false;
            });
            
            zones.push(...resumeTextElements);

            // חיפוש drop zones מסורתיים
            const dropZoneSel = [
                '[data-dropzone]', '.dropzone', '[class*="dropzone" i]',
                '[class*="upload" i]', '[class*="file-upload" i]',
                '[class*="resume" i]', '[class*="cv" i]',
                '[aria-label*="resume" i]', '[aria-label*="upload" i]', '[aria-label*="cv" i]',
                '.file-input-wrapper', '.upload-area', '.attachment-zone',
                '[class*="attach" i]', '[class*="document" i]', '[class*="file" i]',
                '[data-upload]', '[data-file]', '[data-attach]', '.drop-area', '.file-drop'
            ].join(', ');

            const dropZones = Array.from(root.querySelectorAll(dropZoneSel))
                .filter(isVisible)
                .filter(el => {
                    const elementText = textOf(el);
                    const parentText = textOf(el.parentElement || el);
                    const combinedText = `${elementText} ${parentText}`;
                    
                    return /attach|upload|drop|browse|choose|select|resume|cv|קורות|צרף|העלה|בחר|drag.*drop|choose.*file|document|file/i.test(combinedText);
                });
            zones.push(...dropZones);

            // If no specific zones found, look for generic upload-looking areas
            if (dropZones.length === 0 && resumeTextElements.length === 0) {
                const genericUploadAreas = Array.from(root.querySelectorAll('div, section, area, span, p'))
                    .filter(isVisible)
                    .filter(el => {
                        const style = getComputedStyle(el);
                        const hasUploadStyling = style.border?.includes('dashed') || 
                                               style.border?.includes('dotted') ||
                                               /upload|drop|file|attach|resume/i.test(el.className);
                        const hasUploadText = /drag.*drop|upload|choose.*file|select.*file|attach.*resume|resume.*required/i.test(textOf(el));
                        const isClickableArea = style.cursor === 'pointer' || el.onclick;
                        
                        return (hasUploadStyling || hasUploadText || isClickableArea) && textOf(el).length < 200;
                    });
                zones.push(...genericUploadAreas);
            }

            // כפתורים/לינקים שפותחים דיאלוג קובץ - Enhanced detection
            const uploadTriggers = Array.from(root.querySelectorAll('button, [role="button"], a, label, .btn, .button, input[type="button"], span, div'))
                .filter(isVisible)
                .filter(el => {
                    const elementText = textOf(el);
                    return /attach\s*resume|upload\s*resume|browse|choose\s*file|select\s*file|add\s*resume|resume|cv|צרף\s*קורות|העלה\s*קורות|בחר\s*קובץ|upload|attach|add.*file|browse.*file|choose.*file|select.*file/i.test(elementText);
                });
            triggers.push(...uploadTriggers);

            // Look for elements that contain "Resume is required" or similar text
            const requiredResumeAreas = Array.from(root.querySelectorAll('*'))
                .filter(isVisible)
                .filter(el => {
                    const text = textOf(el);
                    return /resume\s*is\s*required|resume.*required|required.*resume|צרף.*קורות.*חיים|חובה.*קורות/i.test(text);
                })
                .map(el => {
                    // Look for nearby file inputs or clickable elements
                    const nearbyInputs = el.parentElement?.querySelectorAll('input[type="file"]') || [];
                    const nearbyClickables = el.parentElement?.querySelectorAll('[onclick], [role="button"], button, a, span, div') || [];
                    return [...nearbyInputs, ...nearbyClickables];
                })
                .flat()
                .filter(isVisible);
            
            triggers.push(...requiredResumeAreas);
        }

        return { inputs, zones, triggers };
    }

    // הצמדה אמיתית של קובץ – עקיפה ל-readOnly + Drop אמיתי
    async attachFileToInput(input, file) {
        try {
            this.sendDebug(`🔗 Attempting to attach ${file.name} to input ${input.tagName}#${input.id || input.name || 'unnamed'} (No drag-drop mode)`, 'info');
            
            // Store initial state for comparison
            const initialValue = input.value;
            
            // Method A: Direct property approach with DataTransfer (preferred method)
            let propertyAttemptWorked = false;
            try {
                this.sendDebug('   🔹 Trying direct property approach with DataTransfer', 'info');
                const dt = new DataTransfer();
                dt.items.add(file);
                
                // Set files property directly
                let reverted = false;
                const originalDescriptor = Object.getOwnPropertyDescriptor(input, 'files');
                try {
                Object.defineProperty(input, 'files', { 
                    configurable: true, 
                    enumerable: true, 
                        get: () => dt.files 
                    });
                } catch(_) {}
                
                // Focus and trigger events
                try { input.focus(); } catch(_) {}
                try {
                const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                Object.defineProperty(changeEvent, 'target', { value: input });
                input.dispatchEvent(changeEvent);
                } catch(_) {}
                try {
                    const inputEvent = new InputEvent('input', { bubbles: true, cancelable: true, data: file.name });
                input.dispatchEvent(inputEvent);
                } catch(_) {}
                await this.delay(300);

                const ok = await this.verifyFileAttachment(input, file, initialValue);
                propertyAttemptWorked = ok;
                
                // Revert any own descriptor to reduce side effects
                try {
                    if (originalDescriptor) {
                        Object.defineProperty(input, 'files', originalDescriptor);
                    } else {
                        delete input.files;
                    }
                    reverted = true;
                } catch(_) {}
                
                if (propertyAttemptWorked) {
                    this.sendDebug(`✅ Direct property approach verified`, 'success');
                            return true;
                        }
                
                if (!reverted) {
                    this.sendDebug(`   ℹ️ Could not fully revert files descriptor; proceeding`, 'info');
                }
            } catch (e) {
                this.sendDebug(`   ❌ Direct property approach failed: ${e.message}`, 'warning');
            }

            // Method B: Alternative direct file assignment
            try {
                this.sendDebug('   🔹 Trying alternative file assignment', 'info');
                
                // Create a new DataTransfer and assign directly
                const dt = new DataTransfer();
                dt.items.add(file);
                
                // Try direct assignment
                try {
                    input.files = dt.files;
                } catch(_) {}
                
                // Trigger events
                try { input.focus(); } catch(_) {}
                try {
                    const event = new Event('change', { bubbles: true });
                    input.dispatchEvent(event);
                } catch(_) {}
                
                await this.delay(200);
                
                const ok = await this.verifyFileAttachment(input, file, initialValue);
                if (ok) {
                    this.sendDebug(`✅ Alternative file assignment verified`, 'success');
                    return true;
                }
            } catch (e) {
                this.sendDebug(`   ❌ Alternative file assignment failed: ${e.message}`, 'warning');
            }

            // Method C: Network-based upload as fallback
            try {
                this.sendDebug('   🔹 Trying network-based upload approach', 'info');
                const networkResult = await this.autoUploadResumeNetwork();
                if (networkResult?.uploaded) {
                    this.sendDebug(`✅ Network-based upload successful`, 'success');
                    return true;
                }
            } catch (e) {
                this.sendDebug(`   ❌ Network-based upload failed: ${e.message}`, 'warning');
            }

            // Method D: Open dialog (manual) as last fallback
            try {
                this.sendDebug('   🔹 Opening file dialog for manual selection', 'info');
                input.focus();
                input.click();
                await this.delay(100);
                this.sendDebug(`📂 Opened file dialog - manual selection may be required`, 'info');
                return false;
            } catch (e) {
                this.sendDebug(`❌ Could not trigger file dialog: ${e.message}`, 'warning');
            }

            this.sendDebug(`❌ All attachment methods failed for this input`, 'error');
            return false;

        } catch (error) {
            this.sendDebug(`❌ Fatal error in attachFileToInput: ${error.message}`, 'error');
            return false;
        }
    }

    // New function to verify if file attachment actually worked (hardened)
    async verifyFileAttachment(input, expectedFile, initialValue) {
        try {
            await this.delay(220);
            
            // Robust check: ensure we didn't just spoof an own 'files' descriptor
            const ownDesc = Object.getOwnPropertyDescriptor(input, 'files');
            const hasOwnFilesProp = !!ownDesc;
            if (hasOwnFilesProp) {
                this.sendDebug('   ⚠️ Input has own files descriptor (possible spoof). Will require stronger verification.', 'warning');
            }
            
            // Check 1: FormData snapshot from the containing form contains the file (strongest signal)
            let formContainsFile = false;
            let formMatchByName = false;
            let formMatchBySize = false;
            const form = input.closest('form');
            if (form) {
                try {
                    const fd = new FormData(form);
                    for (const [key, val] of fd.entries()) {
                        if (val instanceof File) {
                            formContainsFile = true;
                            if (val.name === expectedFile.name) formMatchByName = true;
                            if (val.size === expectedFile.size) formMatchBySize = true;
                        }
                    }
                    this.sendDebug(`   🧾 FormData check: containsFile=${formContainsFile}, nameMatch=${formMatchByName}, sizeMatch=${formMatchBySize}`, 'info');
                } catch (e) {
                    this.sendDebug(`   ℹ️ FormData snapshot failed: ${e.message}`, 'info');
                }
            }
            
            // Check 2: input.files
            const hasFiles = input.files && input.files.length > 0;
            const inputNameMatch = hasFiles && input.files[0].name === expectedFile.name;
            const inputSizeMatch = hasFiles && input.files[0].size === expectedFile.size;
            this.sendDebug(`   📁 Input.files: ${hasFiles ? input.files.length : 0}, nameMatch=${!!inputNameMatch}, sizeMatch=${!!inputSizeMatch}`, 'info');
            
            // Check 3: Value change and UI indicators
            const valueChanged = input.value !== initialValue && input.value.trim() !== '';
            const container = input.closest('.upload-area, .file-upload, form, [class*="upload"], [class*="file"]') || input.parentElement;
            let uiIndicator = false;
            if (container) {
                const containerText = container.textContent || '';
                uiIndicator = containerText.includes(expectedFile.name) || /uploaded|attached|selected/i.test(containerText);
            }
            this.sendDebug(`   🖼️ UI: valueChanged=${valueChanged}, uiIndicator=${uiIndicator}`, 'info');
            
            // Decision: require strong evidence when own descriptor detected
            if (hasOwnFilesProp) {
                const strong = (formContainsFile && (formMatchByName || formMatchBySize)) || (hasFiles && inputNameMatch && inputSizeMatch && uiIndicator);
                if (!strong) {
                    this.sendDebug(`   ❌ Strong verification failed (own files descriptor present)`, 'warning');
                    return false;
                }
                this.sendDebug(`   ✅ Strong verification passed`, 'success');
                return true;
            }
            
            // Standard decision
            if ((formContainsFile && (formMatchByName || formMatchBySize)) || (hasFiles && (inputNameMatch || inputSizeMatch))) {
                this.sendDebug(`   ✅ Verification passed`, 'success');
            return true;
            }
            
            this.sendDebug(`   ❌ Verification failed`, 'warning');
            return false;
            
        } catch (e) {
            this.sendDebug(`❌ Verification error: ${e.message}`, 'error');
            return false;
        }
    }

    async attachResumeInDoc(doc = document) {
        const file = await this.getStoredResumeFile();
        if (!file) {
            this.sendDebug('No resume file found in storage', 'warning');
            return false;
        }

        this.sendDebug(`📄 Starting resume attachment: ${file.name} (${file.type}, ${Math.round(file.size/1024)}KB) - No drag-drop mode`, 'info');

        // First, try network-based upload as primary method
        try {
            this.sendDebug('🌐 Attempting network-based upload first...', 'info');
            const networkResult = await this.autoUploadResumeNetwork();
            if (networkResult?.uploaded) {
                this.sendDebug(`✅ Network-based upload successful!`, 'success');
                    return true;
                }
            } catch (e) {
            this.sendDebug(`❌ Network upload failed: ${e.message}`, 'warning');
        }

        // Second, try specialized handlers for known ATS platforms
        const platformResult = await this.tryPlatformSpecificUpload(doc, file);
        if (platformResult) {
            this.sendDebug(`✅ Platform-specific upload successful!`, 'success');
            return true;
        }

        const { inputs, triggers } = this.findResumeTargets(doc);
        this.sendDebug(`🔍 Found resume targets: ${inputs.length} inputs, ${triggers.length} triggers (skipping drop zones)`, 'info');

        // Try direct file inputs with enhanced approach
        for (const inp of inputs) {
            try { 
                inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
                await this.delay(300);
            } catch (_) {}
            
            if (await this.attachFileToInput(inp, file)) {
                this.sendDebug(`✅ Attached resume to file input: ${file.name}`, 'success');
                // Try to finalize and verify upload
                await this.finalizeUploadInDoc(doc, inp, file);
                return true;
            }
        }

        // Try clicking triggers and use network upload
        for (const trigger of triggers) {
            try {
                trigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.delay(300);
                trigger.click();
                this.sendDebug(`📂 Clicked trigger button`, 'info');
                
                // After opening dialog, try network fallback
                await this.delay(500);
                const net = await this.autoUploadResumeNetwork();
                if (net?.uploaded) {
                    this.sendDebug('✅ Network fallback after trigger click succeeded', 'success');
                    return true;
                }
                
                // Try to find newly created file inputs after trigger click
                await this.delay(1000);
                const newInputs = doc.querySelectorAll('input[type="file"]');
                for (const newInput of newInputs) {
                    if (await this.attachFileToInput(newInput, file)) {
                        this.sendDebug(`✅ Attached resume to newly created input after trigger`, 'success');
                        await this.finalizeUploadInDoc(doc, newInput, file);
                        return true;
                    }
                }
                
                return false; // Manual action may be required
            } catch (_) {}
        }

        this.sendDebug('❌ No working resume attachment method found', 'warning');
        return false;
    }

    async tryPlatformSpecificUpload(doc, file) {
        try {
            const url = window.location.href.toLowerCase();
            const domain = window.location.hostname.toLowerCase();
            
            this.sendDebug(`🔍 Checking for platform-specific upload handlers on ${domain}`, 'info');

            // Greenhouse ATS
            if (domain.includes('greenhouse') || url.includes('greenhouse')) {
                return await this.handleGreenhouseUpload(doc, file);
            }

            // Lever ATS  
            if (domain.includes('lever') || url.includes('lever')) {
                return await this.handleLeverUpload(doc, file);
            }

            // Workday
            if (domain.includes('workday') || url.includes('workday')) {
                return await this.handleWorkdayUpload(doc, file);
            }

            // BambooHR
            if (domain.includes('bamboohr') || url.includes('bamboohr')) {
                return await this.handleBambooUpload(doc, file);
            }

            // SmartRecruiters
            if (domain.includes('smartrecruiters') || url.includes('smartrecruiters')) {
                return await this.handleSmartRecruitersUpload(doc, file);
            }

            // JazzHR
            if (domain.includes('jazz') || url.includes('jazz')) {
                return await this.handleJazzUpload(doc, file);
            }

            // Generic ATS patterns
            if (this.isGenericATSPlatform(doc, url)) {
                return await this.handleGenericATSUpload(doc, file);
            }


            return false;
        } catch (e) {
            this.sendDebug(`Platform-specific upload error: ${e?.message || e}`, 'warning');
            return false;
        }
    }

    async handleGenericATSUpload(doc, file) {
        try {
            this.sendDebug('�� Trying generic ATS upload patterns...', 'info');
            
            // Common ATS selectors
            const atsSelectors = [
                'input[type="file"][name*="resume"]',
                'input[type="file"][name*="cv"]', 
                'input[type="file"][id*="resume"]',
                'input[type="file"][id*="cv"]',
                'input[type="file"][data-test*="resume"]',
                'input[type="file"][data-testid*="resume"]',
                'input[type="file"][class*="resume"]',
                'input[type="file"][class*="cv"]',
                '.resume-upload input[type="file"]',
                '.cv-upload input[type="file"]',
                '.document-upload input[type="file"]',
                '[data-field="resume"] input[type="file"]',
                '[data-field="cv"] input[type="file"]'
            ];

            for (const selector of atsSelectors) {
                const input = doc.querySelector(selector);
                if (input && this.isVisible(input)) {
                    if (await this.attachFileToInput(input, file)) {
                        this.sendDebug(`✅ Generic ATS upload successful via ${selector}`, 'success');
                        return true;
                    }
                }
            }

            return false;
        } catch (e) {
            this.sendDebug(`Generic ATS upload error: ${e?.message || e}`, 'warning');
            return false;
        }
    }

    isGenericATSPlatform(doc, url) {
        const atsIndicators = [
            'applicant tracking',
            'application form',
            'job application',
            'upload resume',
            'upload cv',
            'attach resume',
            'careers',
            'apply now'
        ];

        const pageText = doc.body.textContent.toLowerCase();
        return atsIndicators.some(indicator => pageText.includes(indicator)) ||
               url.includes('apply') || url.includes('career') || url.includes('job');
    }

    // Placeholder functions for other ATS platforms - can be expanded later
    async handleGreenhouseUpload(doc, file) {
        return await this.handleGenericATSUpload(doc, file);
    }

    async handleLeverUpload(doc, file) {
        return await this.handleGenericATSUpload(doc, file);
    }

    async handleWorkdayUpload(doc, file) {
        return await this.handleGenericATSUpload(doc, file);
    }

    async handleBambooUpload(doc, file) {
        return await this.handleGenericATSUpload(doc, file);
    }

    async handleSmartRecruitersUpload(doc, file) {
        return await this.handleGenericATSUpload(doc, file);
    }

    async handleJazzUpload(doc, file) {
        return await this.handleGenericATSUpload(doc, file);
    }

    async attachResumeAcrossDocs() {
        let attached = false;
        
        // Try main document
        attached = await this.attachResumeInDoc(document) || attached;

        // Try same-origin iframes
        const iframes = Array.from(document.querySelectorAll('iframe')).filter(this.isVisible.bind(this));
        for (const frame of iframes) {
            try {
                const doc = frame.contentDocument || frame.contentWindow?.document;
                if (doc) {
                    attached = (await this.attachResumeInDoc(doc)) || attached;
                }
            } catch (_) {
                // Cross-origin iframe, skip
            }
        }
        
        return attached;
    }

    resumeSeemsRequired(doc = document) {
        const txt = (doc.body?.innerText || '').toLowerCase();
        const errorMessages = [
            'resume is required', 'attach resume', 'required resume', 'resume required',
            'cv required', 'cv is required', 'upload resume', 'please attach resume',
            'חובה לצרף קורות', 'נדרש לצרף קורות', 'חסר קורות חיים', 'יש לצרף קורות',
            'curriculum vitae required', 'please upload cv'
        ];
        return errorMessages.some(msg => txt.includes(msg));
    }

    async handleResumeRequiredError() {
        this.sendDebug('🔄 Resume required error detected - retrying attachment', 'warning');
        const attached = await this.attachResumeAcrossDocs();
        
        if (attached) {
            // Try submitting again after attachment
            await this.delay(500);
            const submitBtn = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
                .find(btn => /submit|apply|send|הגש|שלח|continue/i.test(this.textOf(btn)));
            
            if (submitBtn) {
                try {
                    submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.delay(200);
                    submitBtn.click();
                    this.sendDebug('🔄 Resubmitted after resume attachment', 'info');
                    return true;
                } catch (_) {}
            }
        }
        
        return false;
    }

    async debugResumeLocations() {
        try {
            this.sendDebug('🔍 Starting comprehensive resume upload locations scan...', 'info');
            
            // Page overview
            this.sendDebug(`📄 Page Overview:`, 'info');
            this.sendDebug(`   URL: ${window.location.href}`, 'info');
            this.sendDebug(`   Title: "${document.title}"`, 'info');
            this.sendDebug(`   Domain: ${window.location.hostname}`, 'info');
            
            const { inputs, zones, triggers } = this.findResumeTargets(document);
            
            this.sendDebug(`📊 Scan Results Summary:`, 'info');
            this.sendDebug(`   📁 File inputs: ${inputs.length}`, 'info');
            this.sendDebug(`   🎯 Drop zones: ${zones.length}`, 'info');
            this.sendDebug(`   🔘 Trigger buttons: ${triggers.length}`, 'info');
            
            // Enhanced logging with much more details for file inputs
            if (inputs.length > 0) {
                this.sendDebug(`📁 DETAILED FILE INPUTS ANALYSIS:`, 'success');
            inputs.forEach((inp, i) => {
                const name = inp.getAttribute('name') || 'none';
                const id = inp.id || 'none';
                    const accept = inp.getAttribute('accept') || 'any';
                    const multiple = inp.multiple;
                    const required = inp.required;
                    const disabled = inp.disabled;
                    const readOnly = inp.readOnly;
                    const visible = this.isVisible(inp);
                    const parentTag = inp.parentElement?.tagName || 'none';
                    const parentClass = inp.parentElement?.className || 'none';
                    const parentId = inp.parentElement?.id || 'none';
                    
                    // Get label information
                    let labelText = 'none';
                    const label = inp.closest('label') || document.querySelector(`label[for="${inp.id}"]`);
                    if (label) {
                        labelText = label.textContent?.trim().slice(0, 50) || 'empty';
                    }
                    
                    const ariaLabel = inp.getAttribute('aria-label')?.slice(0, 50) || 'none';
                    const placeholder = inp.getAttribute('placeholder')?.slice(0, 50) || 'none';
                    
                    // Check container context
                    const container = inp.closest('form, div, section') || inp.parentElement;
                    const containerText = container?.textContent?.trim().slice(0, 100) || 'none';
                    const containerClass = container?.className || 'none';
                    
                    // Style information
                    const style = getComputedStyle(inp);
                    const display = style.display;
                    const visibility = style.visibility;
                    const opacity = style.opacity;
                    const position = style.position;
                    const width = style.width;
                    const height = style.height;
                    
                    this.sendDebug(`   📁${i+1}. FILE INPUT DETAILS:`, 'info');
                    this.sendDebug(`      🔸 Basic: name="${name}" id="${id}" accept="${accept}"`, 'info');
                    this.sendDebug(`      🔸 State: visible=${visible}, disabled=${disabled}, readOnly=${readOnly}, required=${required}, multiple=${multiple}`, 'info');
                    this.sendDebug(`      🔸 Labels: label="${labelText}", aria="${ariaLabel}", placeholder="${placeholder}"`, 'info');
                    this.sendDebug(`      🔸 Parent: ${parentTag}.${parentClass}#${parentId}`, 'info');
                    this.sendDebug(`      🔸 Container: class="${containerClass}" text="${containerText}..."`, 'info');
                    this.sendDebug(`      🔸 Styles: display=${display}, visibility=${visibility}, opacity=${opacity}, position=${position}`, 'info');
                    this.sendDebug(`      🔸 Size: ${width} x ${height}`, 'info');
                    
                    // Try to test if this input is actually usable
                    if (visible && !disabled) {
                        this.sendDebug(`      ✅ INPUT APPEARS USABLE - would attempt attachment`, 'success');
                    } else {
                        this.sendDebug(`      ❌ INPUT NOT USABLE - visible=${visible}, disabled=${disabled}`, 'warning');
                    }
                });
            } else {
                this.sendDebug(`❌ NO FILE INPUTS FOUND`, 'warning');
            }
            
            // Enhanced logging for drop zones
            if (zones.length > 0) {
                this.sendDebug(`🎯 DETAILED DROP ZONES ANALYSIS:`, 'success');
            zones.forEach((zone, i) => {
                const tagName = zone.tagName?.toLowerCase() || 'unknown';
                    const className = zone.className || 'none';
                    const id = zone.id || 'none';
                    const text = (zone.textContent || '').trim();
                    const visible = this.isVisible(zone);
                    const clickable = !!zone.onclick || getComputedStyle(zone).cursor === 'pointer';
                    
                    // Style analysis
                    const style = getComputedStyle(zone);
                    const border = style.border;
                    const backgroundColor = style.backgroundColor;
                    const cursor = style.cursor;
                    const position = style.position;
                    
                    // Check for data attributes
                    const dataAttrs = Array.from(zone.attributes)
                        .filter(attr => attr.name.startsWith('data-'))
                        .map(attr => `${attr.name}="${attr.value}"`)
                        .join(', ') || 'none';
                    
                    // Check for nested file inputs
                    const nestedInputs = zone.querySelectorAll('input[type="file"]').length;
                    
                    this.sendDebug(`   🎯${i+1}. DROP ZONE DETAILS:`, 'info');
                    this.sendDebug(`      🔸 Element: ${tagName}.${className}#${id}`, 'info');
                    this.sendDebug(`      🔸 State: visible=${visible}, clickable=${clickable}`, 'info');
                    this.sendDebug(`      🔸 Text: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`, 'info');
                    this.sendDebug(`      🔸 Styles: border="${border}", bg="${backgroundColor}", cursor="${cursor}"`, 'info');
                    this.sendDebug(`      🔸 Data: ${dataAttrs}`, 'info');
                    this.sendDebug(`      🔸 Contains ${nestedInputs} file inputs`, 'info');
                    
                    if (visible && (clickable || nestedInputs > 0)) {
                        this.sendDebug(`      ✅ ZONE APPEARS USABLE - would attempt drop`, 'success');
                    } else {
                        this.sendDebug(`      ❌ ZONE NOT IDEAL - visible=${visible}, clickable=${clickable}, inputs=${nestedInputs}`, 'warning');
                    }
                });
            } else {
                this.sendDebug(`❌ NO DROP ZONES FOUND`, 'warning');
            }
            
            // Enhanced logging for trigger buttons with "Choose File" analysis
            if (triggers.length > 0) {
                this.sendDebug(`🔘 DETAILED TRIGGER BUTTONS ANALYSIS:`, 'success');
            triggers.forEach((trigger, i) => {
                const tagName = trigger.tagName?.toLowerCase() || 'unknown';
                    const text = (trigger.textContent || '').trim();
                const className = trigger.className || 'none';
                    const id = trigger.id || 'none';
                    const visible = this.isVisible(trigger);
                    const hasOnClick = !!trigger.onclick;
                    const cursor = getComputedStyle(trigger).cursor;
                    const role = trigger.getAttribute('role') || 'none';
                    
                    // Check if it's a label with 'for' attribute
                    const forAttr = trigger.getAttribute('for') || 'none';
                    const ariaLabel = trigger.getAttribute('aria-label') || 'none';
                    
                    // Analyze text content for "Choose File" patterns
                    const lowerText = text.toLowerCase();
                    const isChooseFile = /choose\s*file|browse\s*file|select\s*file|upload\s*file|attach\s*file/i.test(lowerText);
                    const isResumeRelated = /resume|cv|attach\s*resume|upload\s*resume/i.test(lowerText);
                    const isShortRelevant = (lowerText === 'choose' || lowerText === 'browse' || lowerText === 'upload' || lowerText === 'attach' || lowerText === 'file');
                    
                    // Check nearby file inputs
                    let nearbyInputInfo = 'none';
                    const nearbyInput = trigger.querySelector('input[type="file"]') || 
                                      trigger.parentElement?.querySelector('input[type="file"]') ||
                                      (forAttr !== 'none' ? document.getElementById(forAttr) : null);
                    if (nearbyInput) {
                        nearbyInputInfo = `${nearbyInput.tagName}#${nearbyInput.id || nearbyInput.name || 'unnamed'}`;
                    }
                    
                    this.sendDebug(`   🔘${i+1}. TRIGGER BUTTON DETAILS:`, 'info');
                    this.sendDebug(`      🔸 Element: ${tagName}.${className}#${id}`, 'info');
                    this.sendDebug(`      🔸 Text: "${text}"`, 'info');
                    this.sendDebug(`      🔸 State: visible=${visible}, onClick=${hasOnClick}, cursor="${cursor}", role="${role}"`, 'info');
                    this.sendDebug(`      🔸 Labels: for="${forAttr}", aria="${ariaLabel}"`, 'info');
                    this.sendDebug(`      🔸 Nearby input: ${nearbyInputInfo}`, 'info');
                    this.sendDebug(`      🔸 Patterns: chooseFile=${isChooseFile}, resume=${isResumeRelated}, short=${isShortRelevant}`, 'info');
                    
                    if (visible && (hasOnClick || cursor === 'pointer' || forAttr !== 'none' || nearbyInput)) {
                        this.sendDebug(`      ✅ TRIGGER APPEARS USABLE - would attempt click`, 'success');
                    } else {
                        this.sendDebug(`      ❌ TRIGGER NOT IDEAL - needs manual investigation`, 'warning');
                    }
                });
            } else {
                this.sendDebug(`❌ NO TRIGGER BUTTONS FOUND`, 'warning');
            }
            
            // Additional page analysis with enhanced detail
            const allFileInputs = document.querySelectorAll('input[type="file"]');
            const visibleFileInputs = Array.from(allFileInputs).filter(this.isVisible.bind(this));
            const enabledFileInputs = Array.from(allFileInputs).filter(inp => !inp.disabled);
            const formsOnPage = document.querySelectorAll('form');
            const iframes = document.querySelectorAll('iframe');
            
            // Text analysis
            const bodyText = document.body.innerText || '';
            const uploadsInText = bodyText.match(/upload|attach|resume|cv|file|document|choose.*file|browse.*file|select.*file/gi)?.length || 0;
            const resumeRequiredText = this.resumeSeemsRequired(document);
            
            // jeen.ai specific analysis
            const isJeenAi = window.location.hostname.includes('jeen.ai');
            let jeenAiSpecific = '';
            if (isJeenAi) {
                const careerPagePattern = /career|job|position|apply/i.test(window.location.href);
                const hasApplicationForm = Array.from(formsOnPage).some(form => 
                    /application|apply|career|job/i.test(form.textContent || form.className || form.id)
                );
                jeenAiSpecific = `career_page=${careerPagePattern}, app_form=${hasApplicationForm}`;
            }
            
            this.sendDebug(`📋 COMPREHENSIVE PAGE ANALYSIS:`, 'info');
            this.sendDebug(`   🔢 Total elements: ${document.querySelectorAll('*').length}`, 'info');
            this.sendDebug(`   📁 File inputs: ${allFileInputs.length} total, ${visibleFileInputs.length} visible, ${enabledFileInputs.length} enabled`, 'info');
            this.sendDebug(`   📋 Forms: ${formsOnPage.length}`, 'info');
            this.sendDebug(`   🖼️ Iframes: ${iframes.length}`, 'info');
            this.sendDebug(`   📝 Upload-related text mentions: ${uploadsInText}`, 'info');
            this.sendDebug(`   ⚠️ Resume seems required: ${resumeRequiredText}`, 'info');
            if (isJeenAi) {
                this.sendDebug(`   🎯 jeen.ai specific: ${jeenAiSpecific}`, 'info');
            }
            
            // Recommendations based on findings
            this.sendDebug(`💡 RECOMMENDATIONS:`, 'info');
            
            if (inputs.length > 0) {
                const usableInputs = inputs.filter(inp => this.isVisible(inp) && !inp.disabled);
                if (usableInputs.length > 0) {
                    this.sendDebug(`   ✅ ${usableInputs.length} usable file inputs found - direct attachment should work`, 'success');
                } else {
                    this.sendDebug(`   ⚠️ File inputs found but none are usable - may need special handling`, 'warning');
                }
            }
            
            if (zones.length > 0) {
                this.sendDebug(`   🎯 ${zones.length} drop zones found - drag-drop attachment possible`, 'info');
            }
            
            if (triggers.length > 0) {
                const chooseFileButtons = triggers.filter(t => /choose.*file|browse.*file|select.*file/i.test(t.textContent || ''));
                if (chooseFileButtons.length > 0) {
                    this.sendDebug(`   🔘 ${chooseFileButtons.length} "Choose File" buttons found - click to open dialog`, 'info');
                } else {
                    this.sendDebug(`   🔘 ${triggers.length} trigger buttons found but may need investigation`, 'warning');
                }
            }
            
            if (inputs.length === 0 && zones.length === 0 && triggers.length === 0) {
                this.sendDebug(`   ❌ No upload mechanisms found`, 'error');
                this.sendDebug(`   💡 Possible reasons:`, 'info');
                this.sendDebug(`      • Upload functionality not loaded yet`, 'info');
                this.sendDebug(`      • Upload is in a popup/modal that isn't open`, 'info');
                this.sendDebug(`      • Upload fields are dynamically created`, 'info');
                this.sendDebug(`      • Page uses non-standard upload methods`, 'info');
                this.sendDebug(`      • Upload requires user action first (e.g., clicking a button)`, 'info');
                
                if (allFileInputs.length > 0) {
                    this.sendDebug(`   💡 Found ${allFileInputs.length} file inputs that don't match resume patterns`, 'info');
                    this.sendDebug(`      Consider expanding search criteria or checking these inputs`, 'info');
                }
            }
            
            // Test file availability
            let hasResumeFile = false;
            try {
                const file = await this.getStoredResumeFile();
                hasResumeFile = !!file;
                if (file) {
                    this.sendDebug(`   📄 Resume file ready: ${file.name} (${Math.round(file.size/1024)}KB, ${file.type})`, 'success');
                } else {
                    this.sendDebug(`   ❌ No resume file found in storage`, 'error');
                }
        } catch (e) {
                this.sendDebug(`   ❌ Error checking resume file: ${e.message}`, 'error');
            }
            
            return { 
                inputs: inputs.length, 
                zones: zones.length, 
                triggers: triggers.length,
                usableInputs: inputs.filter(inp => this.isVisible(inp) && !inp.disabled).length,
                hasResumeFile,
                pageType: isJeenAi ? 'jeen.ai' : 'unknown'
            };
        } catch (e) {
            this.sendDebug(`❌ Debug scan error: ${e?.message || e}`, 'error');
            return { inputs: 0, zones: 0, triggers: 0, usableInputs: 0, hasResumeFile: false, pageType: 'error' };
        }
    }

    async autoAttachResumeOnPage() {
        try {
            this.sendDebug('🎯 Auto Attach Resume: Starting (No drag-drop mode)...', 'info');
            
            const file = await this.getStoredResumeFile();
            if (!file) {
                this.sendDebug('❌ No resume file found in storage', 'warning');
                return { success: false, error: 'No resume file found in storage' };
            }

            this.sendDebug(`📁 Resume found: ${file.name} (${file.type})`, 'info');

            // Try network-based upload first
            try {
                this.sendDebug('🌐 Attempting network-based upload first...', 'info');
                const networkResult = await this.autoUploadResumeNetwork();
                if (networkResult?.uploaded) {
                    this.sendDebug(`✅ Network-based upload successful!`, 'success');
                    return { 
                        success: true, 
                        attached: true, 
                        method: 'network upload', 
                        message: 'Resume uploaded successfully via network',
                        details: ['✅ Network upload completed'] 
                    };
                }
            } catch (e) {
                this.sendDebug(`❌ Network upload failed: ${e.message}`, 'warning');
            }

            const { inputs, triggers } = this.findResumeTargets(document);
            this.sendDebug(`🔍 Found resume targets: ${inputs.length} inputs, ${triggers.length} triggers (skipping drop zones)`, 'info');

            let attached = false;
            let method = '';
            let details = [];

            // Try file inputs with enhanced approach
            for (const input of inputs) {
                try {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.delay(300);
                    
                    if (await this.attachFileToInput(input, file)) {
                        attached = true;
                        method = 'file input (direct)';
                        details.push(`✅ File input: ${input.name || input.id || 'unnamed'}`);
                        this.sendDebug(`✅ Successfully attached to file input: ${input.name || input.id}`, 'success');
                        break;
                    } else {
                        details.push(`❌ File input failed: ${input.name || input.id || 'unnamed'}`);
                    }
                } catch (e) {
                    details.push(`❌ File input error: ${e?.message || e}`);
                }
            }

            // Try trigger buttons with network upload fallback
            if (!attached && triggers.length > 0) {
                try {
                    const trigger = triggers[0]; // Try first trigger
                    trigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.delay(300);
                    trigger.click();
                    
                    // Try network upload after triggering
                    await this.delay(500);
                    const networkResult = await this.autoUploadResumeNetwork();
                    if (networkResult?.uploaded) {
                        method = 'trigger + network upload';
                        details.push(`✅ Trigger clicked and network upload successful`);
                        this.sendDebug(`✅ Network upload successful after trigger click`, 'success');
                        return { 
                            success: true, 
                            attached: true, 
                            method, 
                            message: 'Resume uploaded successfully after trigger click',
                            details 
                        };
                    }
                    
                    // Try to find newly created file inputs
                    await this.delay(1000);
                    const newInputs = document.querySelectorAll('input[type="file"]');
                    for (const newInput of newInputs) {
                        if (await this.attachFileToInput(newInput, file)) {
                            attached = true;
                            method = 'trigger + new input';
                            details.push(`✅ New input after trigger: ${newInput.name || newInput.id || 'unnamed'}`);
                            this.sendDebug(`✅ Successfully attached to new input after trigger`, 'success');
                            break;
                        }
                    }
                    
                    if (!attached) {
                    method = 'trigger button (manual)';
                    details.push(`📂 Trigger clicked: ${this.textOf(trigger).slice(0, 30)}...`);
                        this.sendDebug(`📂 Clicked trigger button - manual file selection may be required`, 'info');
                    
                    return { 
                        success: true, 
                        attached: false, 
                        method, 
                        message: 'File dialog opened - please manually select your resume',
                        details 
                    };
                    }
                } catch (e) {
                    details.push(`❌ Trigger error: ${e?.message || e}`);
                }
            }

            // Special attempt to find and click "Attach Resume" text
            if (!attached) {
                this.sendDebug('🔍 Trying specialized "Attach Resume" detection...', 'info');
                const clickedAttach = await this.findAndClickAttachResume(document);
                if (clickedAttach) {
                    // Try network upload after clicking attach resume
                    await this.delay(500);
                    const networkResult = await this.autoUploadResumeNetwork();
                    if (networkResult?.uploaded) {
                        method = 'attach resume + network';
                        details.push(`✅ Clicked "Attach Resume" and network upload successful`);
                        this.sendDebug(`✅ Network upload successful after clicking "Attach Resume"`, 'success');
                        return { 
                            success: true, 
                            attached: true, 
                            method, 
                            message: 'Resume uploaded successfully after clicking "Attach Resume"',
                            details 
                        };
                    }
                    
                    method = 'attach resume text click';
                    details.push(`✅ Clicked "Attach Resume" text element`);
                    this.sendDebug(`📂 Clicked "Attach Resume" - file dialog should open`, 'info');
                    
                    return { 
                        success: true, 
                        attached: false, 
                        method, 
                        message: 'Clicked "Attach Resume" - please manually select your resume file',
                        details 
                    };
                }
            }

            if (attached) {
                this.sendDebug(`✅ Resume attachment completed via ${method}!`, 'success');
                return { success: true, attached: true, method, details };
            } else {
                this.sendDebug('❌ No successful attachment method found', 'warning');
                return { 
                    success: true, 
                    attached: false, 
                    method: 'none', 
                    message: 'No working attachment method found',
                    details 
                };
            }

        } catch (error) {
            this.sendDebug(`Auto attach error: ${error?.message || error}`, 'error');
            return { success: false, error: error?.message || error };
        }
    }

    // מוצא ולוחץ על אלמנטים עם טקסט "Attach Resume"
    async findAndClickAttachResume(doc = document) {
        try {
            this.sendDebug('🔍 Searching for "Attach Resume" text elements...', 'info');
            
            // קבלת הקובץ מהאחסון
            const storedFile = await this.getStoredResumeFile();
            if (!storedFile) {
                this.sendDebug('❌ No resume file found in storage - cannot proceed', 'error');
                return false;
            }
            
            this.sendDebug(`📄 Resume file ready: ${storedFile.name} (${Math.round(storedFile.size/1024)}KB)`, 'success');
            
            // ניתוח מקיף של הדף תחילה
            const analysisResults = this.analyzePageForAttachResume(doc);
            
            // שילוב ניתוח AI עם חיפוש מסורתי
            let found = await this.findResumeElementsWithAI(doc);
            
            // אם AI לא מצא או נכשל, חזור לשיטה המסורתית
            if (found.length === 0) {
                this.sendDebug('🔄 AI found no elements, falling back to pattern matching...', 'info');
                found = this.findResumeElementsWithPatterns(doc);
            }

            this.sendDebug(`🎯 Total candidates found: ${found.length}`, 'info');

            // נסה ללחוץ על כל המועמדים בסדר עדיפות
            const sortedCandidates = this.sortResumeElements(found);

            for (let i = 0; i < sortedCandidates.length; i++) {
                const element = sortedCandidates[i];
                const text = element.textContent?.trim() || '';
                
                this.sendDebug(`🖱️ Attempting candidate ${i+1}/${sortedCandidates.length}: "${text}"`, 'info');
                
                const success = await this.attemptClickElementWithAutoAttach(element, doc, storedFile);
                if (success) {
                    this.sendDebug('✅ Successfully clicked and attached resume!', 'success');
                    return true;
                }
            }
            
            if (found.length === 0) {
                this.sendDebug('❌ No "Attach Resume" elements found using any method', 'warning');
            } else {
                this.sendDebug(`⚠️ Found ${found.length} candidates but none successfully attached resume`, 'warning');
            }
            
            return false;
        } catch (e) {
            this.sendDebug(`Error in findAndClickAttachResume: ${e.message}`, 'error');
            return false;
        }
    }

    // ניסיון לחיצה על אלמנט עם הצמדה אוטומטית של קובץ
    async attemptClickElementWithAutoAttach(element, doc, file) {
        try {
            const text = element.textContent?.trim() || '';
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(200);
            
            this.sendDebug(`🖱️ Clicking element: "${text}" (${element.tagName}.${element.className})`, 'info');
            
            // שמירת מצב התחלתי של הדף
            const initialInputs = Array.from(doc.querySelectorAll('input[type="file"]'));
            const initialInputCount = initialInputs.length;
            
            this.sendDebug(`   📊 Initial state: ${initialInputCount} file inputs on page`, 'info');
            
            // שיטה מיוחדת: אם זה label עם for attribute
            const forAttr = element.getAttribute('for');
            if (forAttr) {
                const targetInput = doc.getElementById(forAttr);
                if (targetInput && targetInput.type === 'file') {
                    this.sendDebug(`   🎯 Found target input via label for="${forAttr}"`, 'success');
                    const attached = await this.enhancedJeenAiAttachment(targetInput, file);
                    if (attached) {
                        this.sendDebug(`   ✅ Auto-attached via label target`, 'success');
                        return true;
                    }
                }
            }
            
            // חיפוש file input בקרבה לפני הלחיצה
            let nearbyFileInput = element.querySelector('input[type="file"]') || 
                                element.parentElement?.querySelector('input[type="file"]') ||
                                element.closest('label, div, span, form')?.querySelector('input[type="file"]');
            
            if (nearbyFileInput) {
                this.sendDebug(`   🎯 Found nearby file input BEFORE click`, 'info');
                // נסה להצמיד ישירות ללא לחיצה
                const attached = await this.enhancedJeenAiAttachment(nearbyFileInput, file);
                if (attached) {
                    this.sendDebug(`   ✅ Auto-attached to nearby input without clicking`, 'success');
                    return true;
                }
            }
            
            // ביצוע הלחיצה עם מעקב אחר שינויים
            let clickSuccess = false;
            const clickMethods = [
                {
                    name: 'Direct click()',
                    method: () => element.click()
                },
                {
                    name: 'MouseEvent click',
                    method: () => {
                        const clickEvent = new MouseEvent('click', { 
                            bubbles: true, 
                            cancelable: true, 
                            view: window 
                        });
                        element.dispatchEvent(clickEvent);
                    }
                },
                {
                    name: 'Event click',
                    method: () => {
                        const clickEvent = new Event('click', { bubbles: true });
                        element.dispatchEvent(clickEvent);
                    }
                },
                {
                    name: 'Focus + Enter',
                    method: () => {
                        element.focus();
                        const enterEvent = new KeyboardEvent('keydown', { 
                            key: 'Enter', 
                            code: 'Enter', 
                            keyCode: 13, 
                            bubbles: true 
                        });
                        element.dispatchEvent(enterEvent);
                    }
                }
            ];
            
            for (let k = 0; k < clickMethods.length && !clickSuccess; k++) {
                const clickMethod = clickMethods[k];
                try {
                    this.sendDebug(`   🔸 Trying ${clickMethod.name}...`, 'info');
                    clickMethod.method();
                    await this.delay(1000); // המתנה ארוכה יותר לתגובה
                    
                    // בדיקה אם הלחיצה פתחה חלון בחירת קבצים או הוסיפה אלמנטים חדשים
                    const newInputs = Array.from(doc.querySelectorAll('input[type="file"]'));
                    const newInputCount = newInputs.length;
                    
                    this.sendDebug(`     📊 After click: ${newInputCount} file inputs (was ${initialInputCount})`, 'info');
                    
                    // בדיקה 1: האם נוספו inputs חדשים?
                    if (newInputCount > initialInputCount) {
                        this.sendDebug(`     ✅ New file inputs appeared after click`, 'success');
                        
                        // נסה להצמיד לכל הקלטים החדשים
                        for (const newInput of newInputs) {
                            if (!initialInputs.includes(newInput) && this.isVisible(newInput)) {
                                this.sendDebug(`     🎯 Attempting attachment to new input`, 'info');
                                const attached = await this.enhancedJeenAiAttachment(newInput, file);
                                if (attached) {
                                    this.sendDebug(`     ✅ Successfully attached to new input!`, 'success');
                                    clickSuccess = true;
                                    return true;
                                }
                            }
                        }
                    }
                    // בדיקה 2: האם אלמנטים קיימים הפכו לנראים?
                    for (const input of newInputs) {
                        if (this.isVisible(input) && !input.disabled) {
                            // בדוק אם האלמנט הזה לא היה נגיש קודם
                            const wasAccessible = initialInputs.some(initial => 
                                initial === input && this.isVisible(initial) && !initial.disabled
                            );
                            
                            if (!wasAccessible) {
                                this.sendDebug(`     🎯 Found newly accessible input`, 'info');
                                const attached = await this.enhancedJeenAiAttachment(input, file);
                                if (attached) {
                                    this.sendDebug(`     ✅ Successfully attached to newly accessible input!`, 'success');
                                    clickSuccess = true;
                                    return true;
                                }
                            }
                        }
                    }
                    // בדיקה 3: חיפוש מחודש לאלמנט file input קרוב
                    nearbyFileInput = element.querySelector('input[type="file"]') || 
                                    element.parentElement?.querySelector('input[type="file"]') ||
                                    element.closest('label, div, span, form, section')?.querySelector('input[type="file"]');
                    
                    if (nearbyFileInput && this.isVisible(nearbyFileInput)) {
                        this.sendDebug(`     🎯 Found nearby input after click`, 'info');
                        const attached = await this.enhancedJeenAiAttachment(nearbyFileInput, file);
                        if (attached) {
                            this.sendDebug(`     ✅ Successfully attached to nearby input after click!`, 'success');
                            clickSuccess = true;
                            return true;
                        }
                    }
                    // בדיקה 4: חיפוש גלובלי לכל הקלטים הנגישים
                    const allAccessibleInputs = Array.from(doc.querySelectorAll('input[type="file"]'))
                        .filter(inp => this.isVisible(inp) && !inp.disabled);
                    
                    this.sendDebug(`     📋 Found ${allAccessibleInputs.length} accessible file inputs`, 'info');
                    
                    for (const accessibleInput of allAccessibleInputs) {
                        // נסה רק אם עוד לא ניסינו את הקלט הזה
                        try {
                            const attached = await this.enhancedJeenAiAttachment(accessibleInput, file);
                            if (attached) {
                                this.sendDebug(`     ✅ Successfully attached to accessible input!`, 'success');
                                clickSuccess = true;
                                return true;
                            }
                        } catch (e) {
                            this.sendDebug(`     ⚠️ Failed to attach to input: ${e.message}`, 'warning');
                        }
                    }
                    
                    // בדיקה 5: האם נפתח דיאלוג קבצים? (לא ניתן לזהות ישירות, אבל נמתין)
                    this.sendDebug(`     📂 Click completed with ${clickMethod.name} - checking for file dialog`, 'info');
                    
                    // אם הגענו לכאן, הלחיצה הצליחה אבל לא מצאנו input להצמדה
                    clickSuccess = true;
                    break;
                    
                } catch (e) {
                    this.sendDebug(`     ❌ ${clickMethod.name} failed: ${e.message}`, 'warning');
                }
            }
            
            if (clickSuccess) {
                this.sendDebug(`   📂 Element clicked successfully but no automatic attachment - may require manual file selection`, 'info');
                // גם אם לא הצלחנו להצמיד אוטומטית, הלחיצה הצליחה
                return true;
            } else {
                this.sendDebug(`   ❌ All click methods failed for this element`, 'error');
                return false;
            }
            
        } catch (e) {
            this.sendDebug(`❌ Error clicking element with auto-attach: ${e.message}`, 'error');
            return false;
        }
    }

    // חיפוש אלמנטים באמצעות AI
    async findResumeElementsWithAI(doc) {
        try {
            this.sendDebug('🤖 Using AI to find resume upload elements...', 'info');
            
            const pageInfo = this.extractPageInfoForAI(doc);
            const aiResult = await this.callGeminiForPageAnalysis(pageInfo);
            
            if (aiResult && aiResult.resumeUploadAreas && aiResult.resumeUploadAreas.length > 0) {
                const aiElements = this.findElementsByAIGuidance(doc, aiResult.resumeUploadAreas);
                
                // הוספת מידע AI לאלמנטים
                return aiElements.map(el => ({
                    element: el,
                    confidence: 90, // ביטחון גבוה לתוצאות AI
                    source: 'ai',
                    method: 'ai-guided'
                }));
            }
            
            return [];
        } catch (e) {
            this.sendDebug(`AI element search error: ${e?.message || e}`, 'warning');
            return [];
        }
    }

    // חיפוש אלמנטים עם תבניות מסורתיות
    findResumeElementsWithPatterns(doc) {
        const allElements = Array.from(doc.querySelectorAll('*')).filter(this.isVisible.bind(this));
        let found = [];

        // שלב 1: חיפוש מדויק
        found = allElements.filter(el => {
            const text = (el.textContent || '').trim();
            const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
            
            const exactPatterns = [
                /attach\s*resume/i, /upload\s*resume/i, /resume\s*upload/i,
                /add\s*resume/i, /browse\s*resume/i, /choose\s*resume/i,
                /select\s*resume/i, /choose\s*file/i, /browse\s*file/i,
                /select\s*file/i, /upload\s*file/i, /add\s*file/i,
                /^attach$/i, /^resume$/i, /^choose\s*file$/i,
                /^browse$/i, /^upload$/i, /^file$/i,
                /צרף\s*קורות/i, /העלה\s*קורות/i, /בחר\s*קובץ/i
            ];
            
            const isMatch = exactPatterns.some(pattern => pattern.test(normalizedText));
            
            if (isMatch && text.length < 100) {
                return { element: el, confidence: 85, source: 'pattern', method: 'exact-match' };
            }
            return false;
        }).filter(Boolean);

        // שלב 2: חיפוש רחב אם לא נמצא
        if (found.length === 0) {
            found = allElements.filter(el => {
                const text = (el.textContent || '').trim();
                const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
                
                const broadMatches = [
                    /resume/i, /attach/i, /upload/i, /cv/i, /choose/i,
                    /browse/i, /file/i, /select/i, /קורות/i, /צרף/i,
                    /בחר/i, /קובץ/i
                ];
                
                const isShortAndRelevant = text.length <= 50 && text.length >= 2 && 
                    broadMatches.some(pattern => pattern.test(normalizedText));
                
                if (isShortAndRelevant) {
                    return { element: el, confidence: 60, source: 'pattern', method: 'broad-match' };
                }
                return false;
            }).filter(Boolean);
        }

        // שלב 3: חיפוש לפי סטיילינג
        if (found.length === 0) {
            found = allElements.filter(el => {
                const text = (el.textContent || '').trim();
                if (text.length > 100 || text.length < 2) return false;
                
                const style = getComputedStyle(el);
                const hasSpecialStyling = (
                    style.cursor === 'pointer' || style.color.includes('rgb') ||
                    style.backgroundColor.includes('rgb') || style.textDecoration === 'underline' ||
                    el.getAttribute('role') === 'button' || el.onclick ||
                    el.getAttribute('onclick') || /pointer|hand/.test(style.cursor)
                );
                
                const hasRelevantKeyword = /resume|attach|upload|cv|file|document|צרף|קורות/i.test(text);
                
                if (hasSpecialStyling && hasRelevantKeyword) {
                    return { element: el, confidence: 70, source: 'pattern', method: 'style-match' };
                }
                return false;
            }).filter(Boolean);
        }

        return found;
    }

    // מיון אלמנטים לפי עדיפות
    sortResumeElements(found) {
        return found.sort((a, b) => {
            // תן עדיפות לתוצאות AI
            if (a.source === 'ai' && b.source !== 'ai') return -1;
            if (b.source === 'ai' && a.source !== 'ai') return 1;
            
            // אחר כך לפי ביטחון
            const confidenceA = a.confidence || 0;
            const confidenceB = b.confidence || 0;
            if (confidenceA !== confidenceB) return confidenceB - confidenceA;
            
            // לבסוף לפי תוכן הטקסט
            const aText = (a.element?.textContent || '').toLowerCase();
            const bText = (b.element?.textContent || '').toLowerCase();
            
            const aScore = /attach.*resume|resume.*attach/.test(aText) ? 10 : 
                          /attach|resume/.test(aText) ? 5 : 1;
            const bScore = /attach.*resume|resume.*attach/.test(bText) ? 10 : 
                          /attach|resume/.test(bText) ? 5 : 1;
            
            return bScore - aScore;
        }).map(item => item.element || item);
    }

    // ניסיון לחיצה על אלמנט
    async attemptClickElement(element, doc) {
        try {
            const text = element.textContent?.trim() || '';
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(200);
            
            this.sendDebug(`🖱️ Attempting to click: "${text}" (${element.tagName}.${element.className})`, 'info');
            
            // שיטה מיוחדת: אם זה label עם for attribute
            const forAttr = element.getAttribute('for');
            if (forAttr) {
                const targetInput = doc.getElementById(forAttr);
                if (targetInput && targetInput.type === 'file') {
                    try {
                        targetInput.click();
                        this.sendDebug(`✅ Clicked associated file input via label`, 'success');
                        await this.delay(500);
                        return true;
                    } catch (e) {
                        this.sendDebug(`❌ Label->input click failed: ${e.message}`, 'warning');
                    }
                }
            }
            
            // חיפוש file input בקרבה
            const nearbyFileInput = element.querySelector('input[type="file"]') || 
                                  element.parentElement?.querySelector('input[type="file"]') ||
                                  element.closest('label, div, span')?.querySelector('input[type="file"]');
            if (nearbyFileInput) {
                try {
                    nearbyFileInput.click();
                    this.sendDebug(`✅ Clicked nearby file input`, 'success');
                    await this.delay(500);
                    return true;
                } catch (e) {
                    this.sendDebug(`❌ Nearby input click failed: ${e.message}`, 'warning');
                }
            }
            
            // לחיצה רגילה
            try {
                element.click();
                this.sendDebug(`✅ Click method 1 successful`, 'success');
                await this.delay(500);
                return true;
            } catch (e) {
                this.sendDebug(`❌ Click method 1 failed: ${e.message}`, 'warning');
            }
            
            // onclick handler
            if (element.onclick) {
                try {
                    element.onclick();
                    this.sendDebug(`✅ onclick handler executed`, 'success');
                    await this.delay(500);
                    return true;
                } catch (e) {
                    this.sendDebug(`❌ onclick handler failed: ${e.message}`, 'warning');
                }
            }
            
            // Mouse event
            try {
                const clickEvent = new MouseEvent('click', {
                    bubbles: true, cancelable: true, view: window
                });
                element.dispatchEvent(clickEvent);
                this.sendDebug(`✅ Mouse event dispatched`, 'success');
                await this.delay(500);
                return true;
            } catch (e) {
                this.sendDebug(`❌ Mouse event failed: ${e.message}`, 'warning');
            }
            
            return false;
        } catch (e) {
            this.sendDebug(`❌ Error clicking element: ${e.message}`, 'error');
            return false;
        }
    }

    // פונקציה מקיפה לניתוח הדף
    analyzePageForAttachResume(doc = document) {
        try {
            this.sendDebug('🔍 Starting comprehensive page analysis...', 'info');
            
            // איסוף כל הטקסט בדף
            const allText = doc.body.innerText || '';
            const resumeCount = (allText.match(/resume/gi) || []).length;
            const attachCount = (allText.match(/attach/gi) || []).length;
            const uploadCount = (allText.match(/upload/gi) || []).length;
            
            this.sendDebug(`📊 Page text analysis: ${resumeCount} "resume", ${attachCount} "attach", ${uploadCount} "upload" mentions`, 'info');
            
            // חיפוש אלמנטים עם טקסט רלוונטי - הרחבה
            const allElements = Array.from(doc.querySelectorAll('*')).filter(this.isVisible.bind(this));
            const textElements = [];
            
            allElements.forEach(el => {
                const text = (el.textContent || '').trim();
                if (text.length > 0 && text.length < 200) { // הרחבתי את הגבול
                    const lowerText = text.toLowerCase();
                    const patterns = [
                        /resume/i,
                        /attach/i,
                        /upload/i,
                        /cv/i,
                        /file/i,
                        /document/i,
                        /browse/i,
                        /choose/i,               // הוספה חדשה
                        /select/i,               // הוספה חדשה
                        /קורות/i,
                        /צרף/i,
                        /העלה/i,
                        /בחר/i,                  // הוספה חדשה בעברית
                        /קובץ/i                  // הוספה חדשה בעברית
                    ];
                    
                    if (patterns.some(pattern => pattern.test(lowerText))) {
                        const style = getComputedStyle(el);
                        textElements.push({
                            element: el,
                            text: text,
                            tag: el.tagName,
                            className: el.className || '',
                            id: el.id || '',
                            visible: this.isVisible(el),
                            clickable: !!(el.onclick || el.getAttribute('onclick') || 
                                        style.cursor === 'pointer' || el.getAttribute('role') === 'button' ||
                                        el.tabIndex >= 0),
                            color: style.color,
                            backgroundColor: style.backgroundColor,
                            cursor: style.cursor,
                            hasPointerCursor: /pointer|hand/.test(style.cursor)
                        });
                    }
                }
            });
            
            this.sendDebug(`📋 Found ${textElements.length} elements with relevant text:`, 'info');
            
            // טריגר לניתוח AI
            this.analyzePageWithAI(doc, textElements);
            
            // קיבוץ לפי סוגים
            const exactAttachResume = textElements.filter(item => 
                /attach\s*resume/i.test(item.text.toLowerCase())
            );
            const resumeOnly = textElements.filter(item => 
                /^resume$/i.test(item.text.trim()) || item.text.toLowerCase().includes('resume')
            );
            const attachOnly = textElements.filter(item => 
                /^attach$/i.test(item.text.trim()) || item.text.toLowerCase().includes('attach')
            );
            const clickableElements = textElements.filter(item => item.clickable || item.hasPointerCursor);
            
            this.sendDebug(`🔍 Element breakdown:`, 'info');
            this.sendDebug(`  📌 Exact "Attach Resume": ${exactAttachResume.length}`, exactAttachResume.length > 0 ? 'success' : 'info');
            this.sendDebug(`  📄 "Resume" elements: ${resumeOnly.length}`, resumeOnly.length > 0 ? 'success' : 'info');
            this.sendDebug(`  📎 "Attach" elements: ${attachOnly.length}`, attachOnly.length > 0 ? 'success' : 'info');
            this.sendDebug(`  🖱️ Clickable elements: ${clickableElements.length}`, clickableElements.length > 0 ? 'success' : 'info');
            
            // הצגת המועמדים הטובים ביותר
            const topCandidates = [
                ...exactAttachResume,
                ...clickableElements.filter(item => /resume|attach/i.test(item.text))
            ].slice(0, 10);
            
            if (topCandidates.length > 0) {
                this.sendDebug(`🎯 Top candidates for clicking:`, 'success');
                topCandidates.forEach((item, index) => {
                    const visibleText = item.visible ? '✅' : '❌';
                    const clickableText = item.clickable ? '🖱️' : (item.hasPointerCursor ? '👆' : '⭕');
                    const colorInfo = item.color !== 'rgb(0, 0, 0)' ? ` (${item.color})` : '';
                    this.sendDebug(`  ${index + 1}. ${visibleText}${clickableText} "${item.text}"${colorInfo} (${item.tag}.${item.className || 'no-class'})`, 'info');
                });
            } else {
                this.sendDebug('❌ No strong candidates found', 'warning');
                
                // הצגת כל האלמנטים כדי לעזור בדיבוג
                if (textElements.length > 0) {
                    this.sendDebug('📝 All relevant elements found:', 'info');
                    textElements.slice(0, 15).forEach((item, index) => {
                        const visibleText = item.visible ? '✅' : '❌';
                        const clickableText = item.clickable ? '🖱️' : (item.hasPointerCursor ? '👆' : '⭕');
                        this.sendDebug(`  ${index + 1}. ${visibleText}${clickableText} "${item.text}" (${item.tag})`, 'info');
                    });
                    if (textElements.length > 15) {
                        this.sendDebug(`  ... and ${textElements.length - 15} more`, 'info');
                    }
                }
            }
            
            // בדיקות נוספות לדיבוג
            const fileInputs = doc.querySelectorAll('input[type="file"]');
            const forms = doc.querySelectorAll('form');
            const buttons = doc.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
            
            this.sendDebug(`🔧 Technical analysis: ${fileInputs.length} file inputs, ${forms.length} forms, ${buttons.length} buttons/clickables`, 'info');
            
            // חיפוש ב-iframes
            const iframes = doc.querySelectorAll('iframe');
            if (iframes.length > 0) {
                this.sendDebug(`🖼️ Found ${iframes.length} iframes - some content might be inside them`, 'info');
            }
            
            return textElements;
        } catch (e) {
            this.sendDebug(`Error analyzing page: ${e.message}`, 'error');
            return [];
        }
    }

    // ניתוח דף באמצעות AI
    async analyzePageWithAI(doc = document, textElements = []) {
        try {
            this.sendDebug('🤖 Starting AI-powered page analysis...', 'info');
            
            // איסוף מידע על הדף
            const pageInfo = this.extractPageInfoForAI(doc);
            
            // קריאה ל-AI עם המידע
            const aiInsights = await this.callGeminiForPageAnalysis(pageInfo);
            
            if (aiInsights && aiInsights.resumeUploadAreas) {
                this.sendDebug(`🎯 AI found ${aiInsights.resumeUploadAreas.length} potential resume upload areas`, 'success');
                aiInsights.resumeUploadAreas.forEach((area, index) => {
                    this.sendDebug(`  AI-${index + 1}: ${area.description} (confidence: ${area.confidence})`, 'info');
                });
                
                // חיפוש האלמנטים שה-AI זיהה
                this.findElementsByAIGuidance(doc, aiInsights.resumeUploadAreas);
            } else {
                this.sendDebug('🤖 AI analysis completed but found no specific resume upload areas', 'warning');
            }
            
        } catch (e) {
            this.sendDebug(`AI analysis error: ${e?.message || e}`, 'error');
        }
    }

    // חילוץ מידע על הדף עבור AI
    extractPageInfoForAI(doc = document) {
        // חילוץ התוכן הרלוונטי של הדף
        const forms = Array.from(doc.querySelectorAll('form')).map(form => ({
            html: form.outerHTML.slice(0, 1000), // הגבלת גודל
            text: form.textContent?.trim().slice(0, 500) || '',
            inputCount: form.querySelectorAll('input').length,
            hasFileInput: !!form.querySelector('input[type="file"]')
        }));

        const clickableElements = Array.from(doc.querySelectorAll('button, a, [role="button"], span, div'))
            .filter(this.isVisible.bind(this))
            .slice(0, 50) // הגבלה למנוע זרימת מידע
            .map(el => ({
                tag: el.tagName,
                text: (el.textContent || '').trim().slice(0, 100),
                className: el.className || '',
                id: el.id || '',
                hasOnClick: !!el.onclick,
                cursor: getComputedStyle(el).cursor
            }));

        const fileInputs = Array.from(doc.querySelectorAll('input[type="file"]')).map(input => ({
            name: input.name || '',
            id: input.id || '',
            accept: input.accept || '',
            ariaLabel: input.getAttribute('aria-label') || '',
            parentText: input.parentElement?.textContent?.trim().slice(0, 100) || '',
            visible: this.isVisible(input)
        }));

        return {
            url: window.location.href,
            title: document.title,
            pageType: this.detectPageType(),
            forms: forms,
            clickableElements: clickableElements,
            fileInputs: fileInputs,
            bodyText: doc.body.textContent?.slice(0, 3000) || '', // הגבלת גודל
            hasIframes: doc.querySelectorAll('iframe').length > 0
        };
    }

    // זיהוי סוג הדף
    detectPageType() {
        const url = window.location.href.toLowerCase();
        const title = document.title.toLowerCase();
        const text = document.body.textContent?.toLowerCase() || '';

        if (url.includes('linkedin.com/jobs')) return 'linkedin-job';
        if (url.includes('indeed.com') || url.includes('glassdoor.com')) return 'job-board';
        if (text.includes('application') && (text.includes('job') || text.includes('position'))) return 'job-application';
        if (text.includes('apply') || text.includes('career')) return 'career-page';
        return 'unknown';
    }

    // קריאה ל-Gemini API לניתוח הדף
    async callGeminiForPageAnalysis(pageInfo) {
        try {
            // קבלת מפתח API
            let apiKey = '';
            try {
                const stored = await chrome.storage.sync.get(['geminiApiKey', 'aiAgent']);
                apiKey = stored?.geminiApiKey?.trim() || stored?.aiAgent?.geminiApiKey?.trim() || '';
                if (!apiKey) {
                    const local = await chrome.storage.local.get(['geminiApiKey', 'aiAgent']);
                    apiKey = local?.geminiApiKey?.trim() || local?.aiAgent?.geminiApiKey?.trim() || '';
                }
            } catch (_) {}

            if (!apiKey) {
                this.sendDebug('🤖 No Gemini API key found for AI analysis', 'warning');
                return null;
            }

            const prompt = `
Analyze the following webpage and identify locations where a user can upload a resume/CV:

Page Information:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}
- Page Type: ${pageInfo.pageType}
- Number of Forms: ${pageInfo.forms.length}
- Number of Clickable Elements: ${pageInfo.clickableElements.length}
- Number of File Inputs: ${pageInfo.fileInputs.length}

Page Content (excerpt):
${pageInfo.bodyText}

Important Clickable Elements:
${pageInfo.clickableElements.slice(0, 20).map(el => `- ${el.tag}: "${el.text}" (class: ${el.className})`).join('\n')}

File Inputs:
${pageInfo.fileInputs.map(input => `- name: ${input.name}, accept: ${input.accept}, label: ${input.ariaLabel}, parent: ${input.parentText}`).join('\n')}

Forms:
${pageInfo.forms.slice(0, 3).map((form, i) => `Form ${i+1}: ${form.text.slice(0, 200)}...`).join('\n')}

Instructions:
1. Identify where the user can upload a resume/CV
2. Provide a confidence score (0-100) for each location
3. Describe how to reach each location (which element to click, what to look for)
4. Identify texts that suggest a resume is required

Return your response in JSON format with this structure:
{
  "resumeUploadAreas": [
    {
      "description": "Description of the location",
      "confidence": 85,
      "elementType": "button|input|link|text",
      "elementIdentifier": "class/id/text that identifies the element",
      "instructions": "How to reach this location",
      "reasoning": "Why you think this is a resume upload location"
    }
  ],
  "pageAnalysis": {
    "isJobApplication": true/false,
    "requiresResume": true/false,
    "confidence": 0-100,
    "summary": "Brief summary of the page"
  }
}
`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2048
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            if (content) {
                // ניסיון לחלץ JSON מהתשובה
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const aiResult = JSON.parse(jsonMatch[0]);
                    this.sendDebug(`🤖 AI Analysis: ${aiResult.pageAnalysis?.summary || 'Analysis completed'}`, 'success');
                    return aiResult;
                }
            }

            this.sendDebug('🤖 AI returned invalid format', 'warning');
            return null;

        } catch (e) {
            this.sendDebug(`AI analysis error: ${e?.message || e}`, 'error');
            return null;
        }
    }
    // Extract structured job data using LLM/AI
    async extractJobWithLLM(rawText, url) {
        try {
            // Get API key
            let apiKey = '';
            try {
                const stored = await chrome.storage.sync.get(['geminiApiKey', 'aiAgent']);
                apiKey = stored?.geminiApiKey?.trim() || stored?.aiAgent?.geminiApiKey?.trim() || '';
                if (!apiKey) {
                    const local = await chrome.storage.local.get(['geminiApiKey', 'aiAgent']);
                    apiKey = local?.geminiApiKey?.trim() || local?.aiAgent?.geminiApiKey?.trim() || '';
                }
            } catch (_) {}

            if (!apiKey) {
                this.sendDebug('🤖 No Gemini API key found for job extraction', 'warning');
                // Fallback to basic extraction
                return this.extractBasicJobData(rawText);
            }

            const prompt = `
                You are a structured job data extractor. Return ONLY one JSON object matching this JSON Schema.
                If a field is missing or unclear, return null. Do not invent information.

                Required fields: company, role.

                Text to analyze:
                """${rawText.slice(0, 20000)}"""
                url: ${url}

                Role is the job title.
                Company is the company name.

                for example:
                {
                    "company": "Google",
                    "role": "Software Engineer",
                }
                

                Return valid JSON only.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2048
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            if (content) {
                // Try to extract JSON from response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const aiResult = JSON.parse(jsonMatch[0]);
                    this.sendDebug(`🤖 Job extraction completed: ${aiResult.role} at ${aiResult.company}`, 'success');
                    return aiResult;
                }
            }

            this.sendDebug('🤖 AI returned invalid format, falling back to basic extraction', 'warning');
            return this.extractBasicJobData(rawText);

        } catch (e) {
            this.sendDebug(`AI extraction error: ${e?.message || e}, falling back to basic extraction`, 'error');
            return this.extractBasicJobData(rawText);
        }
    }


    async extractJobFromURLWithAI(url = window.location.href) {
        this.sendDebug(`🌐 Fetching HTML for AI from: ${url}`, 'info');
        const root = document.querySelector('main') || document.body;
        const text = (root.innerText || '').trim();
        this.sendDebug(`🌐 Text: ${text}`, 'info'); 
        const llm = await this.extractJobWithLLM(text, url);

        // נחזיר את האובייקט במבנה הקיים אצלכם (עם apply_url)
        return {
            ...llm,
            title: llm?.title || llm?.role || 'Unknown Job',
            role: llm?.role || llm?.title || null,
            apply_url: llm?.apply_url || url
            };
    }


    // Basic job data extraction as fallback
    extractBasicJobData(rawText) {
        try {
            const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
            
            // Simple extraction logic
            let company = null;
            let role = null;
            let location = null;
            
            // Look for common patterns
            for (const line of lines) {
                if (!role && (line.includes('Engineer') || line.includes('Developer') || line.includes('Manager') || line.includes('Analyst'))) {
                    role = line;
                }
                if (!company && (line.includes('Inc') || line.includes('Ltd') || line.includes('Corp') || line.includes('AI') || line.includes('Tech'))) {
                    company = line;
                }
                if (!location && (line.includes('Tel Aviv') || line.includes('Israel') || line.includes('Remote'))) {
                    location = line;
                }
            }

            return {
                company: company || 'Unknown Company',
                role: role || 'Unknown Role',
                location: location || 'Unknown Location',
                department: null,
                job_type: null,
                seniority: null,
                salary: null,
                apply_url: null,
                responsibilities: [],
                requirements: [],
                benefits: null,
                raw_text_sample: rawText.slice(0, 500)
            };
        } catch (error) {
            console.error('Error in basic job extraction:', error);
            return {
                company: 'Unknown Company',
                role: 'Unknown Role',
                location: 'Unknown Location',
                department: null,
                job_type: null,
                seniority: null,
                salary: null,
                apply_url: null,
                responsibilities: [],
                requirements: [],
                benefits: null,
                raw_text_sample: rawText.slice(0, 200)
            };
        }
    }
    // חיפוש אלמנטים לפי הנחיות AI
    findElementsByAIGuidance(doc, aiAreas) {
        const foundElements = [];

        for (const area of aiAreas) {
            try {
                let elements = [];
                
                // חיפוש לפי סוג האלמנט וזיהוי
                switch (area.elementType) {
                    case 'button':
                        elements = Array.from(doc.querySelectorAll('button, [role="button"]'))
                            .filter(el => this.elementMatchesIdentifier(el, area.elementIdentifier));
                        break;
                    case 'input':
                        elements = Array.from(doc.querySelectorAll('input'))
                            .filter(el => this.elementMatchesIdentifier(el, area.elementIdentifier));
                        break;
                    case 'link':
                        elements = Array.from(doc.querySelectorAll('a'))
                            .filter(el => this.elementMatchesIdentifier(el, area.elementIdentifier));
                        break;
                    case 'text':
                        elements = Array.from(doc.querySelectorAll('*'))
                            .filter(el => this.isVisible(el) && this.elementMatchesIdentifier(el, area.elementIdentifier));
                        break;
                    default:
                        // חיפוש כללי
                        elements = Array.from(doc.querySelectorAll('*'))
                            .filter(el => this.isVisible(el) && this.elementMatchesIdentifier(el, area.elementIdentifier));
                }

                if (elements.length > 0) {
                    foundElements.push(...elements);
                    this.sendDebug(`🎯 AI found ${elements.length} elements for: ${area.description}`, 'success');
                } else {
                    this.sendDebug(`❌ AI couldn't locate: ${area.description}`, 'warning');
                }
            } catch (e) {
                this.sendDebug(`Error processing AI guidance: ${e.message}`, 'error');
            }
        }

        return foundElements;
    }

    // בדיקה אם אלמנט תואם לזיהוי של AI
    elementMatchesIdentifier(element, identifier) {
        if (!element || !identifier) return false;

        const text = (element.textContent || '').trim().toLowerCase();
        const className = (element.className || '').toLowerCase();
        const id = (element.id || '').toLowerCase();
        const identifierLower = identifier.toLowerCase();

        // בדיקות שונות לזיהוי
        return (
            text.includes(identifierLower) ||
            className.includes(identifierLower) ||
            id.includes(identifierLower) ||
            identifierLower.includes(text) ||
            identifierLower.includes(className) ||
            identifierLower.includes(id)
        );
    }

    async testAIResumeDetectionOnPage() {
        try {
            this.sendDebug('🤖 Starting AI-powered resume detection test...', 'info');
            
            // איסוף מידע על הדף
            const pageInfo = this.extractPageInfoForAI(document);
            
            // קריאה ל-AI לניתוח
            const aiResult = await this.callGeminiForPageAnalysis(pageInfo);
            
            if (aiResult) {
                this.sendDebug('✅ AI analysis completed successfully', 'success');
                return aiResult;
            } else {
                this.sendDebug('❌ AI analysis failed or returned no results', 'warning');
                return {
                    pageAnalysis: {
                        isJobApplication: false,
                        requiresResume: false,
                        confidence: 0,
                        summary: 'AI analysis failed'
                    },
                    resumeUploadAreas: []
                };
            }
        } catch (e) {
            this.sendDebug(`AI resume detection error: ${e?.message || e}`, 'error');
            return {
                pageAnalysis: {
                    isJobApplication: false,
                    requiresResume: false,
                    confidence: 0,
                    summary: `Error: ${e?.message || 'Unknown error'}`
                },
                resumeUploadAreas: []
            };
        }
    }

    async testAIResumeDetection() {
        // זה פונקציה כפולה - נמחק אותה
        return await this.testAIResumeDetectionOnPage();
    }

    async testResumeFileStatus() {
        try {
            this.sendDebug('🧪 Starting comprehensive resume file status test...', 'info');
            
            let testResults = {
                hasFile: false,
                fileDetails: null,
                storageLocation: 'none',
                canCreateFile: false,
                browserSupport: {},
                errors: []
            };
            
            // Test 1: Check chrome.storage.local for resumeFile
            this.sendDebug('📁 Test 1: Checking chrome.storage.local for resumeFile...', 'info');
            try {
                const localData = await chrome.storage.local.get('resumeFile');
                if (localData.resumeFile) {
                    this.sendDebug(`   ✅ Found resumeFile in local storage`, 'success');
                    this.sendDebug(`     Name: ${localData.resumeFile.name || 'unknown'}`, 'info');
                    this.sendDebug(`     Type: ${localData.resumeFile.type || 'unknown'}`, 'info');
                    this.sendDebug(`     Base64 length: ${localData.resumeFile.base64?.length || 0} chars`, 'info');
                    this.sendDebug(`     Estimated size: ${Math.round((localData.resumeFile.base64?.length || 0) * 0.75 / 1024)}KB`, 'info');
                    
                    testResults.hasFile = true;
                    testResults.fileDetails = localData.resumeFile;
                    testResults.storageLocation = 'chrome.storage.local';
                } else {
                    this.sendDebug(`   ❌ No resumeFile found in local storage`, 'warning');
                }
            } catch (e) {
                this.sendDebug(`   ❌ Error accessing local storage: ${e.message}`, 'error');
                testResults.errors.push(`Local storage error: ${e.message}`);
            }
            
            // Test 2: Check chrome.storage.sync for resumeContent (fallback)
            this.sendDebug('📄 Test 2: Checking chrome.storage.sync for resumeContent...', 'info');
            try {
                const syncData = await chrome.storage.sync.get('resumeContent');
                if (syncData.resumeContent) {
                    this.sendDebug(`   ✅ Found resumeContent in sync storage`, 'success');
                    this.sendDebug(`     Content length: ${syncData.resumeContent.length} chars`, 'info');
                    this.sendDebug(`     Content preview: "${syncData.resumeContent.slice(0, 100)}..."`, 'info');
                    
                    if (!testResults.hasFile) {
                        testResults.hasFile = true;
                        testResults.fileDetails = { 
                            name: 'resume.txt', 
                            type: 'text/plain', 
                            content: syncData.resumeContent 
                        };
                        testResults.storageLocation = 'chrome.storage.sync';
                    }
                } else {
                    this.sendDebug(`   ❌ No resumeContent found in sync storage`, 'warning');
                }
            } catch (e) {
                this.sendDebug(`   ❌ Error accessing sync storage: ${e.message}`, 'error');
                testResults.errors.push(`Sync storage error: ${e.message}`);
            }
            
            // Test 3: Check chrome.storage.local for resumeContent (alternative location)
            this.sendDebug('📄 Test 3: Checking chrome.storage.local for resumeContent...', 'info');
            try {
                const localContentData = await chrome.storage.local.get('resumeContent');
                if (localContentData.resumeContent) {
                    this.sendDebug(`   ✅ Found resumeContent in local storage`, 'success');
                    this.sendDebug(`     Content length: ${localContentData.resumeContent.length} chars`, 'info');
                    
                    if (!testResults.hasFile) {
                        testResults.hasFile = true;
                        testResults.fileDetails = { 
                            name: 'resume.txt', 
                            type: 'text/plain', 
                            content: localContentData.resumeContent 
                        };
                        testResults.storageLocation = 'chrome.storage.local (content)';
                    }
                } else {
                    this.sendDebug(`   ❌ No resumeContent found in local storage`, 'warning');
                }
            } catch (e) {
                this.sendDebug(`   ❌ Error accessing local storage for content: ${e.message}`, 'error');
                testResults.errors.push(`Local storage content error: ${e.message}`);
            }
            
            // Test 4: Try to create File object from stored data
            this.sendDebug('🔧 Test 4: Attempting to create File object...', 'info');
            try {
                const file = await this.getStoredResumeFile();
                if (file) {
                    testResults.canCreateFile = true;
                    this.sendDebug(`   ✅ Successfully created File object`, 'success');
                    this.sendDebug(`     Name: ${file.name}`, 'info');
                    this.sendDebug(`     Size: ${file.size} bytes (${Math.round(file.size/1024)}KB)`, 'info');
                    this.sendDebug(`     Type: ${file.type}`, 'info');
                    this.sendDebug(`     Last modified: ${new Date(file.lastModified).toISOString()}`, 'info');
                    
                    // Test reading the file content
                    try {
                        if (file.size < 1024 * 1024) { // Only read files smaller than 1MB for testing
                            const reader = new FileReader();
                            const readPromise = new Promise((resolve, reject) => {
                                reader.onload = () => resolve(reader.result);
                                reader.onerror = () => reject(reader.error);
                            });
                            
                            if (file.type.includes('text')) {
                                reader.readAsText(file);
                                const content = await readPromise;
                                this.sendDebug(`     Content preview: "${content.slice(0, 100)}..."`, 'info');
                            } else {
                                reader.readAsArrayBuffer(file);
                                const buffer = await readPromise;
                                this.sendDebug(`     Binary content: ${buffer.byteLength} bytes`, 'info');
                            }
                        } else {
                            this.sendDebug(`     File too large for content test (${file.size} bytes)`, 'info');
                        }
                    } catch (readError) {
                        this.sendDebug(`     ⚠️ File read test failed: ${readError.message}`, 'warning');
                    }
                } else {
                    this.sendDebug(`   ❌ Failed to create File object`, 'error');
                    testResults.errors.push('Cannot create File object from stored data');
                }
            } catch (e) {
                this.sendDebug(`   ❌ Error creating File object: ${e.message}`, 'error');
                testResults.errors.push(`File creation error: ${e.message}`);
            }
            
            // Test 5: Browser API support
            this.sendDebug('🌐 Test 5: Checking browser API support...', 'info');
            
            const apiTests = {
                'File API': typeof File !== 'undefined',
                'FileReader API': typeof FileReader !== 'undefined',
                'DataTransfer API': typeof DataTransfer !== 'undefined',
                'Blob API': typeof Blob !== 'undefined',
                'URL.createObjectURL': typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function',
                'Chrome Storage API': typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined',
                'InputEvent': typeof InputEvent !== 'undefined',
                'CustomEvent': typeof CustomEvent !== 'undefined',
                'MouseEvent': typeof MouseEvent !== 'undefined',
                'DragEvent': typeof DragEvent !== 'undefined'
            };
            
            testResults.browserSupport = apiTests;
            
            Object.entries(apiTests).forEach(([api, supported]) => {
                this.sendDebug(`   ${supported ? '✅' : '❌'} ${api}: ${supported ? 'supported' : 'NOT supported'}`, 
                             supported ? 'success' : 'error');
            });
            
            // Test 6: DataTransfer functionality
            this.sendDebug('📋 Test 6: Testing DataTransfer functionality...', 'info');
            try {
                const dt = new DataTransfer();
                this.sendDebug(`   ✅ DataTransfer created`, 'success');
                
                if (testResults.canCreateFile) {
                    const file = await this.getStoredResumeFile();
                    dt.items.add(file);
                    this.sendDebug(`   ✅ File added to DataTransfer`, 'success');
                    this.sendDebug(`     DataTransfer.files.length: ${dt.files.length}`, 'info');
                    
                    if (dt.files.length > 0) {
                        this.sendDebug(`     DataTransfer.files[0].name: ${dt.files[0].name}`, 'info');
                        this.sendDebug(`     DataTransfer.files[0].size: ${dt.files[0].size}`, 'info');
                    }
                }
            } catch (e) {
                this.sendDebug(`   ❌ DataTransfer test failed: ${e.message}`, 'error');
                testResults.errors.push(`DataTransfer error: ${e.message}`);
            }
            
            // Test 7: File input simulation test
            this.sendDebug('🎯 Test 7: Testing file input property manipulation...', 'info');
            try {
                // Create a temporary file input for testing
                const testInput = document.createElement('input');
                testInput.type = 'file';
                testInput.style.display = 'none';
                document.body.appendChild(testInput);
                
                this.sendDebug(`   ✅ Test input created`, 'success');
                
                if (testResults.canCreateFile) {
                    const file = await this.getStoredResumeFile();
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    
                    // Test different property setting methods
                    const methods = [
                        {
                            name: 'Object.defineProperty',
                            test: () => {
                                Object.defineProperty(testInput, 'files', { 
                                    value: dt.files,
                                    configurable: true 
                                });
                                return testInput.files && testInput.files.length > 0;
                            }
                        },
                        {
                            name: 'Direct assignment (should fail)',
                            test: () => {
                                try {
                                    testInput.files = dt.files;
                                    return testInput.files && testInput.files.length > 0;
                                } catch (e) {
                                    return false; // Expected to fail
                                }
                            }
                        },
                        {
                            name: 'Value property setting',
                            test: () => {
                                testInput.value = file.name;
                                return testInput.value === file.name;
                            }
                        }
                    ];
                    
                    for (const method of methods) {
                        try {
                            const result = method.test();
                            this.sendDebug(`     ${result ? '✅' : '❌'} ${method.name}: ${result ? 'works' : 'failed'}`, 
                                         result ? 'success' : 'warning');
                        } catch (e) {
                            this.sendDebug(`     ❌ ${method.name}: error - ${e.message}`, 'warning');
                        }
                    }
                }
                
                // Clean up test input
                document.body.removeChild(testInput);
                this.sendDebug(`   🧹 Test input cleaned up`, 'info');
                
            } catch (e) {
                this.sendDebug(`   ❌ Input manipulation test failed: ${e.message}`, 'error');
                testResults.errors.push(`Input test error: ${e.message}`);
            }
            
            // Final summary
            this.sendDebug('📊 FINAL TEST RESULTS SUMMARY:', testResults.hasFile ? 'success' : 'error');
            this.sendDebug(`   📄 Has resume file: ${testResults.hasFile}`, testResults.hasFile ? 'success' : 'error');
            this.sendDebug(`   📍 Storage location: ${testResults.storageLocation}`, 'info');
            this.sendDebug(`   🔧 Can create File object: ${testResults.canCreateFile}`, testResults.canCreateFile ? 'success' : 'error');
            this.sendDebug(`   ❌ Errors encountered: ${testResults.errors.length}`, testResults.errors.length === 0 ? 'success' : 'warning');
            
            if (testResults.errors.length > 0) {
                this.sendDebug(`   Error details:`, 'error');
                testResults.errors.forEach((error, i) => {
                    this.sendDebug(`     ${i+1}. ${error}`, 'error');
                });
            }
            
            // Critical browser support check
            const criticalAPIs = ['File API', 'DataTransfer API', 'Chrome Storage API'];
            const missingCritical = criticalAPIs.filter(api => !testResults.browserSupport[api]);
            
            if (missingCritical.length > 0) {
                this.sendDebug(`   ⚠️ CRITICAL: Missing essential APIs: ${missingCritical.join(', ')}`, 'error');
                this.sendDebug(`   This may prevent file attachment from working properly`, 'error');
            } else {
                this.sendDebug(`   ✅ All critical browser APIs are supported`, 'success');
            }
            
            // Recommendations
            this.sendDebug('💡 RECOMMENDATIONS:', 'info');
            
            if (!testResults.hasFile) {
                this.sendDebug(`   📋 No resume file found - please upload a resume first`, 'warning');
                this.sendDebug(`   🔧 Use the extension popup to upload your resume file`, 'info');
            } else if (!testResults.canCreateFile) {
                this.sendDebug(`   🔧 File data exists but cannot create File object - storage may be corrupted`, 'warning');
                this.sendDebug(`   💡 Try re-uploading your resume file`, 'info');
            } else {
                this.sendDebug(`   ✅ Resume file is ready for attachment`, 'success');
                this.sendDebug(`   🎯 File attachment should work on compatible pages`, 'success');
            }
            
            if (testResults.errors.length > 0) {
                this.sendDebug(`   ⚠️ Some tests failed - attachment may not work reliably`, 'warning');
            }
            
            return testResults;
            
        } catch (error) {
            this.sendDebug(`❌ Resume file status test failed: ${error.message}`, 'error');
            return {
                hasFile: false,
                fileDetails: null,
                storageLocation: 'error',
                canCreateFile: false,
                browserSupport: {},
                errors: [error.message]
            };
        }
    }
    

    // === ADVANCED NETWORK-BASED UPLOAD SYSTEM ===
    // העלאה אוטומטיה לגמרי דרך רשת, עוקפת מגבלות file input
    
    // מציאת מסמכים זהי-מקור (כולל iframes)
    getDocsSameOrigin(rootDoc = document) {
        const docs = [rootDoc];
        const iframes = Array.from(rootDoc.querySelectorAll('iframe'));
        for (const frame of iframes) {
            try {
                const doc = frame.contentDocument || frame.contentWindow?.document;
                if (doc) {
                    docs.push(doc);
                    this.sendDebug(`   📄 Added same-origin iframe document`, 'info');
                }
            } catch(_) {
                // Cross-origin iframe, skip
            }
        }
        return docs;
    }
    
    // חילוץ טוקן CSRF מהדף
    extractCsrf(doc) {
        // Meta tags
        const metaSelectors = [
            'meta[name="csrf-token"]',
            'meta[name="X-CSRF-Token"]', 
            'meta[name="csrf"]',
            'meta[name="_token"]',
            'meta[name="authenticity_token"]'
        ];
        
        let metaToken = '';
        for (const selector of metaSelectors) {
            const meta = doc.querySelector(selector);
            if (meta) {
                metaToken = meta.getAttribute('content') || '';
                if (metaToken) {
                    this.sendDebug(`   🔒 Found CSRF meta token: ${metaToken.slice(0, 10)}...`, 'info');
                    break;
                }
            }
        }
        
        // Hidden inputs
        const inputSelectors = [
            'input[name="authenticity_token"]',
            'input[name="csrf_token"]', 
            'input[name="_csrf"]',
            'input[name="__RequestVerificationToken"]',
            'input[name="_token"]'
        ];
        
        let inputName = '';
        let inputValue = '';
        for (const selector of inputSelectors) {
            const input = doc.querySelector(selector);
            if (input) {
                inputName = input.getAttribute('name');
                inputValue = input.value || '';
                if (inputValue) {
                    this.sendDebug(`   🔒 Found CSRF input: ${inputName}=${inputValue.slice(0, 10)}...`, 'info');
                    break;
                }
            }
        }
        
        return { metaToken, inputName, inputValue };
    }
    
    // זיהוי טפסים רלוונטיים להעלאת קורות חיים
    findRelevantUploadForms(doc) {
        const allForms = Array.from(doc.querySelectorAll('form'));
        const relevantForms = [];
        
        for (const form of allForms) {
            if (!this.isVisible(form)) continue;
            
            // בדיקה אם יש file inputs בטופס
            const fileInputs = Array.from(form.querySelectorAll('input'))
                .filter(inp => inp.type === 'file' || ['resume', 'cover_letter'].includes(inp.name));
            if (fileInputs.length === 0) continue;
            
            // בדיקה אם הטופס נראה רלוונטי לקורות חיים
            const formText = (form.textContent || '').toLowerCase();
            const formHTML = form.innerHTML.toLowerCase();
            const relevantKeywords = [
                'resume', 'cv', 'curriculum', 'upload', 'attach', 'file', 'document',
                'קורות', 'העלה', 'צרף', 'מסמך', 'קובץ'
            ];
            
            const isRelevant = relevantKeywords.some(keyword => 
                formText.includes(keyword) || formHTML.includes(keyword)
            );
            
            if (isRelevant) {
                relevantForms.push({
                    form,
                    fileInputs,
                    action: form.getAttribute('action') || location.href,
                    method: (form.getAttribute('method') || 'POST').toUpperCase(),
                    relevanceScore: this.calculateFormRelevanceScore(form, formText)
                });
            }
        }
        
        // מיון לפי רלוונטיות
        return relevantForms.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
    
    // חישוב ציון רלוונטיות לטופס
    calculateFormRelevanceScore(form, formText) {
        let score = 0;
        
        // נקודות עבור מילות מפתח ספציפיות
        if (/resume|cv|curriculum/i.test(formText)) score += 20;
        if (/upload.*resume|attach.*resume|resume.*upload/i.test(formText)) score += 15;
        if (/application|apply|career|job/i.test(formText)) score += 10;
        
        // נקודות עבור file inputs עם שמות רלוונטיים
        const fileInputs = form.querySelectorAll('input[type="file"]');
        for (const input of fileInputs) {
            const name = input.getAttribute('name') || '';
            const id = input.id || '';
            if (/resume|cv|curriculum/i.test(name + id)) score += 15;
            if (/upload|attach|file|document/i.test(name + id)) score += 5;
        }
        
        // נקודות עבור labels מתאימים
        const labels = form.querySelectorAll('label');
        for (const label of labels) {
            const labelText = label.textContent || '';
            if (/resume|cv|curriculum/i.test(labelText)) score += 10;
            if (/upload|attach/i.test(labelText)) score += 5;
        }
        
        return score;
    }
    
    // העלאה אוטומטית דרך רשת
    async autoUploadResumeNetwork() {
        try {
            this.sendDebug('🌐 Starting network-based resume upload...', 'info');
            
            // קבלת קובץ הקורות חיים
            const file = await this.getStoredResumeFile();
            if (!file) {
                this.sendDebug('❌ No stored resume file found', 'error');
                return { uploaded: false, reason: 'no-file' };
            }
            
            this.sendDebug(`📄 Resume file ready: ${file.name} (${Math.round(file.size/1024)}KB, ${file.type})`, 'success');
            
            // איסוף כל המסמכים זהי-מקור
            const docs = this.getDocsSameOrigin(document);
            this.sendDebug(`📚 Scanning ${docs.length} documents (main + same-origin iframes)`, 'info');
            
            const allResults = [];
            let uploadSuccess = false;
            
            for (let docIndex = 0; docIndex < docs.length; docIndex++) {
                const doc = docs[docIndex];
                const docType = docIndex === 0 ? 'main document' : `iframe ${docIndex}`;
                
                this.sendDebug(`📄 Processing ${docType}...`, 'info');
                
                // מציאת טפסים רלוונטיים
                const relevantForms = this.findRelevantUploadForms(doc);
                
                if (relevantForms.length === 0) {
                    this.sendDebug(`   ⚠️ No relevant forms found in ${docType}`, 'warning');
                    continue;
                }
                
                this.sendDebug(`   📋 Found ${relevantForms.length} relevant forms in ${docType}`, 'info');
                
                for (let formIndex = 0; formIndex < relevantForms.length; formIndex++) {
                    const { form, fileInputs, action, method, relevanceScore } = relevantForms[formIndex];
                    
                    this.sendDebug(`   📝 Processing form ${formIndex + 1}/${relevantForms.length} (score: ${relevanceScore})`, 'info');
                    this.sendDebug(`      Action: ${action}`, 'info');
                    this.sendDebug(`      Method: ${method}`, 'info');
                    this.sendDebug(`      File inputs: ${fileInputs.length}`, 'info');
                    
                    // בדיקת same-origin
                    let targetUrl;
                    try {
                        targetUrl = new URL(action, location.href);
                        if (targetUrl.origin !== location.origin) {
                            this.sendDebug(`      ⚠️ Cross-origin action (${targetUrl.origin}), skipping`, 'warning');
                            continue;
                        }
                    } catch (e) {
                        this.sendDebug(`      ❌ Invalid action URL: ${action}`, 'error');
                        continue;
                    }
                    
                    // בניית FormData
                    this.sendDebug(`      🔧 Building FormData...`, 'info');
                    const formData = new FormData(form);
                    
                    // הוספת קובץ לכל file input רלוונטי
                    let fileAdded = false;
                    for (const input of fileInputs) {
                        const fieldName = input.getAttribute('name') || 'resume';
                        
                        this.sendDebug(`        📎 Adding file to field: ${fieldName}`, 'info');
                        
                        try {
                            formData.set(fieldName, file, file.name);
                            fileAdded = true;
                            this.sendDebug(`        ✅ File added to ${fieldName}`, 'success');
                        } catch (e) {
                            try {
                                formData.append(fieldName, file, file.name);
                                fileAdded = true;
                                this.sendDebug(`        ✅ File appended to ${fieldName}`, 'success');
                            } catch (e2) {
                                this.sendDebug(`        ❌ Failed to add file to ${fieldName}: ${e2.message}`, 'error');
                            }
                        }
                    }
                    
                    if (!fileAdded) {
                        this.sendDebug(`      ❌ Could not add file to any input field`, 'error');
                        continue;
                    }
                    
                    // הוספת CSRF tokens
                    const csrf = this.extractCsrf(doc);
                    
                    if (csrf.metaToken && !formData.has('authenticity_token') && !csrf.inputName) {
                        formData.append('authenticity_token', csrf.metaToken);
                        this.sendDebug(`      🔒 Added meta CSRF token`, 'info');
                    } else if (csrf.inputName && csrf.inputValue && !formData.has(csrf.inputName)) {
                        formData.append(csrf.inputName, csrf.inputValue);
                        this.sendDebug(`      🔒 Added input CSRF token: ${csrf.inputName}`, 'info');
                    }
                    
                    // שליחת הטופס
                    this.sendDebug(`      🚀 Sending request to ${targetUrl.href}...`, 'info');
                    
                    try {
                        const response = await fetch(targetUrl.href, {
                            method: method,
                            body: formData,
                            credentials: 'include', // שמירת session cookies
                            headers: {
                                // לא מוסיפים Content-Type - הדפדפן יוסיף boundary אוטומטית
                            }
                        });
                        
                        const result = {
                            docType,
                            formIndex: formIndex + 1,
                            url: targetUrl.href,
                            status: response.status,
                            statusText: response.statusText,
                            ok: response.ok,
                            relevanceScore
                        };
                        
                        allResults.push(result);
                        
                        if (response.ok) {
                            this.sendDebug(`      ✅ Upload successful! Status: ${response.status}`, 'success');
                            
                            // סימון הטופס כמועלה
                            form.setAttribute('data-jobnick-resume-uploaded', '1');
                            
                            // עדכון תצוגה אם יש
                            const fileNameDisplay = form.querySelector('.file-name, .filename, input[type="file"] + span, input[type="file"] ~ .filename');
                            if (fileNameDisplay && !fileNameDisplay.textContent?.trim()) {
                                fileNameDisplay.textContent = file.name;
                                this.sendDebug(`      📝 Updated file name display`, 'info');
                            }
                            
                            // ניסיון לקרוא תגובה לבדיקת שגיאות
                            try {
                                const responseText = await response.text();
                                const hasError = /error|fail|invalid|required/i.test(responseText);
                                
                                if (hasError) {
                                    this.sendDebug(`      ⚠️ Response contains error indicators`, 'warning');
                                    this.sendDebug(`      Response preview: ${responseText.slice(0, 200)}...`, 'info');
                                } else {
                                    uploadSuccess = true;
                                    this.sendDebug(`      🎉 Upload completed successfully via network!`, 'success');
                                    
                                    return {
                                        uploaded: true,
                                        method: 'network',
                                        url: targetUrl.href,
                                        form: formIndex + 1,
                                        document: docType,
                                        allResults
                                    };
                                }
                            } catch (readError) {
                                // לא יכולים לקרוא תגובה, אבל הסטטוס OK אז כנראה בסדר
                                uploadSuccess = true;
                                this.sendDebug(`      ✅ Upload completed (could not read response)`, 'success');
                                
                                return {
                                    uploaded: true,
                                    method: 'network',
                                    url: targetUrl.href,
                                    form: formIndex + 1,
                                    document: docType,
                                    allResults
                                };
                            }
                        } else {
                            this.sendDebug(`      ❌ Upload failed! Status: ${response.status} ${response.statusText}`, 'error');
                            
                            // ניסיון לקרוא שגיאה
                            try {
                                const errorText = await response.text();
                                this.sendDebug(`      Error response: ${errorText.slice(0, 200)}...`, 'error');
                            } catch (readError) {
                                this.sendDebug(`      Could not read error response`, 'warning');
                            }
                        }
                        
                    } catch (fetchError) {
                        this.sendDebug(`      ❌ Network error: ${fetchError.message}`, 'error');
                        
                        allResults.push({
                            docType,
                            formIndex: formIndex + 1,
                            url: targetUrl.href,
                            error: fetchError.message,
                            relevanceScore
                        });
                    }
                }
            }
            
            // סיכום תוצאות
            this.sendDebug(`📊 Network upload summary:`, allResults.length > 0 ? 'info' : 'warning');
            this.sendDebug(`   Total attempts: ${allResults.length}`, 'info');
            this.sendDebug(`   Success: ${uploadSuccess}`, uploadSuccess ? 'success' : 'warning');
            
            // Record resume upload activity to history
            if (uploadSuccess) {
                await this.recordResumeUpload('Success', 'Network Upload', {
                    attempts: allResults.length,
                    successfulForm: allResults.find(r => r.ok)?.formIndex || 'unknown',
                    document: allResults.find(r => r.ok)?.docType || 'unknown',
                    url: allResults.find(r => r.ok)?.url || 'unknown'
                });
            } else {
                await this.recordResumeUpload('Failed', 'Network Upload', {
                    attempts: allResults.length,
                    errors: allResults.map(r => r.error || `${r.status} ${r.statusText}`).filter(Boolean),
                    reason: 'all-attempts-failed'
                });
            }
            
            if (allResults.length > 0) {
                allResults.forEach((result, index) => {
                    const status = result.ok ? '✅' : (result.error ? '❌' : '⚠️');
                    const info = result.ok ? 
                        `${result.status}` : 
                        (result.error ? result.error : `${result.status} ${result.statusText}`);
                    this.sendDebug(`   ${index + 1}. ${status} ${result.docType} form ${result.formIndex}: ${info}`, 
                                   result.ok ? 'success' : 'warning');
                });
            }
            
            return {
                uploaded: uploadSuccess,
                method: uploadSuccess ? 'network' : 'failed',
                attempts: allResults.length,
                results: allResults,
                reason: uploadSuccess ? 'success' : 'all-attempts-failed'
            };
        } catch (error) {
            this.sendDebug(`❌ Network upload system error: ${error.message}`, 'error');
            return {
                uploaded: false,
                method: 'network',
                error: error.message,
                reason: 'system-error'
            };
        }
    }

    // Try to finalize upload by clicking nearby confirmation buttons, then re-verify; fallback to network upload
    async finalizeUploadInDoc(doc, input, file) {
        try {
            this.sendDebug('🧩 Finalizing upload: attempting to click nearby confirmation buttons...', 'info');
            await this.clickUploadConfirmationButtons(doc, input);
            
            // Wait and re-verify
            await this.delay(700);
            const verified = await this.verifyFileAttachment(input, file, '');
            if (verified) {
                this.sendDebug('✅ Upload appears confirmed after clicking confirmation buttons', 'success');
                return true;
            }
            
            // Fallback: try network upload
            this.sendDebug('🌐 Upload not confirmed via UI, attempting network-based upload fallback...', 'warning');
            const net = await this.autoUploadResumeNetwork();
            if (net?.uploaded) {
                this.sendDebug('✅ Network-based upload fallback succeeded', 'success');
                return true;
            }
            this.sendDebug('❌ Network-based upload fallback did not succeed', 'warning');
            return false;
        } catch (e) {
            this.sendDebug(`❌ finalizeUploadInDoc error: ${e?.message || e}`, 'error');
            return false;
        }
    }

    // Click typical upload/attach/confirm buttons near a given input or globally
    async clickUploadConfirmationButtons(doc, relatedInput = null) {
        try {
            const isVisible = this.isVisible.bind(this);
            const candidates = [];
            const selectors = [
                'button', 'input[type="button"]', 'input[type="submit"]', '[role="button"]', 'a', 'span', 'div'
            ].join(',');
            
            const texts = [
                /upload/i, /attach/i, /submit/i, /save/i, /continue/i, /next/i,
                /העלה/i, /צרף/i, /שלח/i, /שמור/i, /המשך/i
            ];
            
            const consider = (el) => {
                if (!isVisible(el)) return false;
                const t = (el.textContent || el.value || el.getAttribute?.('aria-label') || '').trim();
                if (!t || t.length > 60) return false;
                const lower = t.toLowerCase();
                return texts.some(rx => rx.test(lower));
            };
            
            if (relatedInput) {
                const root = relatedInput.closest('form, .upload-area, [class*="upload" i], [class*="file" i]') || doc;
                candidates.push(...Array.from(root.querySelectorAll(selectors)).filter(consider));
            }
            
            if (candidates.length === 0) {
                candidates.push(...Array.from(doc.querySelectorAll(selectors)).filter(consider));
            }
            
            // De-duplicate while preserving order
            const uniq = Array.from(new Set(candidates));
            if (uniq.length === 0) {
                this.sendDebug('ℹ️ No upload confirmation buttons found', 'info');
                return false;
            }
            
            // Click up to first 3 candidates
            for (let i = 0; i < Math.min(3, uniq.length); i++) {
                const el = uniq[i];
                try {
                    const txt = (el.textContent || el.value || '').trim();
                    this.sendDebug(`🖱️ Clicking confirmation button: "${txt}"`, 'info');
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.delay(150);
                    el.click?.();
                    el.dispatchEvent?.(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    await this.delay(500);
                } catch(_) {}
            }
            return true;
        } catch (e) {
            this.sendDebug(`❌ clickUploadConfirmationButtons error: ${e?.message || e}`, 'error');
            return false;
        }
    }

    // DEPRECATED: This method uses drag-and-drop which is being phased out
    // Use direct file property setting and network uploads instead
    async dropFileOnZone(zone, file) {
        try {
            this.sendDebug(`🎯 DEPRECATED: Attempting drag-drop of ${file.name} on ${zone.tagName}#${zone.id || zone.className || 'unnamed'} (Consider using direct attachment methods)`, 'warning');
            
            const dt = new DataTransfer();
            dt.items.add(file);

            // Store initial state for verification
            const initialText = zone.textContent || '';
            const associatedInputs = zone.querySelectorAll('input[type="file"]');
            const initialInputValues = Array.from(associatedInputs).map(inp => inp.value);

            // Method 1: Enhanced drag-drop sequence with comprehensive events
            try {
                const events = [
                    { type: 'dragenter', bubbles: true, cancelable: true },
                    { type: 'dragover', bubbles: true, cancelable: true },
                    { type: 'drop', bubbles: true, cancelable: true }
                ];
                
                for (const eventConfig of events) {
                    // Create DragEvent with proper dataTransfer
                    const ev = new DragEvent(eventConfig.type, {
                        bubbles: eventConfig.bubbles,
                        cancelable: eventConfig.cancelable,
                        dataTransfer: dt
                    });
                    
                    // Override dataTransfer property (it's normally read-only)
                    try {
                        Object.defineProperty(ev, 'dataTransfer', { 
                            value: dt,
                            configurable: true,
                            enumerable: true,
                            writable: false
                        });
                    } catch (_) {}

                    // Prevent default to ensure our handling works
                    zone.addEventListener(eventConfig.type, (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }, { once: true, passive: false });

                    zone.dispatchEvent(ev);
                    await this.delay(eventConfig.type === 'drop' ? 300 : 100);
                }

                // Check if any hidden file input got the file
                const success = await this.verifyDropSuccess(zone, file, initialText, associatedInputs, initialInputValues);
                if (success) {
                    this.sendDebug(`✅ Drop method 1 success: Drag-drop with verification`, 'success');
                    return true;
                }
            } catch (e) {
                this.sendDebug(`❌ Drop method 1 failed: ${e.message}`, 'warning');
            }

            // Method 2: Alternative event approach with File API
            try {
                // Create events with proper dataTransfer simulation
                const dragEnter = new Event('dragenter', { bubbles: true, cancelable: true });
                const dragOver = new Event('dragover', { bubbles: true, cancelable: true });
                const drop = new Event('drop', { bubbles: true, cancelable: true });

                // Add dataTransfer to each event
                [dragEnter, dragOver, drop].forEach(event => {
                    Object.defineProperty(event, 'dataTransfer', {
                        value: dt,
                        configurable: true,
                        enumerable: true,
                        writable: false
                    });
                    
                    // Add files to dataTransfer
                    Object.defineProperty(event, 'files', {
                        value: [file],
                        configurable: true,
                        enumerable: true,
                        writable: false
                    });
                });

                zone.dispatchEvent(dragEnter);
                await this.delay(50);
                zone.dispatchEvent(dragOver);
                await this.delay(50);
                zone.dispatchEvent(drop);
                await this.delay(300);

                const success = await this.verifyDropSuccess(zone, file, initialText, associatedInputs, initialInputValues);
                if (success) {
                    this.sendDebug(`✅ Drop method 2 success: Alternative event approach`, 'success');
                    return true;
                }
            } catch (e) {
                this.sendDebug(`❌ Drop method 2 failed: ${e.message}`, 'warning');
            }

            // Method 3: Custom upload events and API calls
            try {
                // Look for custom event handlers or data attributes
                const customEvents = [
                    'file-dropped', 'fileDropped', 'upload', 'fileUpload', 
                    'file-selected', 'fileSelected', 'files-added', 'filesAdded'
                ];
                
                for (const eventName of customEvents) {
                    try {
                        const customEvent = new CustomEvent(eventName, {
                            bubbles: true,
                            cancelable: true,
                            detail: { 
                                files: [file], 
                                dataTransfer: dt,
                                file: file,
                                name: file.name,
                                size: file.size,
                                type: file.type
                            }
                        });
                        zone.dispatchEvent(customEvent);
                        await this.delay(100);
                    } catch (_) {}
                }

                // Wait for processing and verify
                await this.delay(500);
                const success = await this.verifyDropSuccess(zone, file, initialText, associatedInputs, initialInputValues);
                if (success) {
                    this.sendDebug(`✅ Drop method 3 success: Custom events triggered`, 'success');
                    return true;
                }
            } catch (e) {
                this.sendDebug(`❌ Drop method 3 failed: ${e.message}`, 'warning');
            }

            // Method 4: Direct manipulation of zone's file handling
            try {
                // Some zones have direct file properties or methods
                if (typeof zone.files !== 'undefined') {
                    try {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        Object.defineProperty(zone, 'files', {
                            value: dt.files,
                            configurable: true,
                            enumerable: true,
                            writable: false
                        });
                        
                        // Trigger change detection
                        zone.dispatchEvent(new Event('change', { bubbles: true }));
                        zone.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        await this.delay(200);
                        const success = await this.verifyDropSuccess(zone, file, initialText, associatedInputs, initialInputValues);
                        if (success) {
                            this.sendDebug(`✅ Drop method 4 success: Direct zone file property`, 'success');
                            return true;
                        }
                    } catch (_) {}
                }

                // Look for upload methods on the zone
                const uploadMethods = ['upload', 'uploadFile', 'addFile', 'setFile', 'handleFile', 'selectFile'];
                for (const method of uploadMethods) {
                    if (typeof zone[method] === 'function') {
                        try {
                            zone[method](file);
                            await this.delay(200);
                            const success = await this.verifyDropSuccess(zone, file, initialText, associatedInputs, initialInputValues);
                            if (success) {
                                this.sendDebug(`✅ Drop method 4 success: Called ${method} method`, 'success');
                                return true;
                            }
                        } catch (_) {}
                    }
                }
            } catch (e) {
                this.sendDebug(`❌ Drop method 4 failed: ${e.message}`, 'warning');
            }

            // Method 5: Click zone to trigger manual upload
            try {
                // Look for clickable elements within the zone
                const clickables = zone.querySelectorAll('button, [role="button"], a, input[type="button"], span[onclick], div[onclick]');
                for (const clickable of clickables) {
                    const text = (clickable.textContent || '').toLowerCase();
                    if (/upload|attach|choose|select|browse|file|add/i.test(text)) {
                        try {
                            clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await this.delay(100);
                            clickable.click();
                            await this.delay(200);
                            
                            // Check if this opened a file dialog or triggered upload UI
                            const success = await this.verifyDropSuccess(zone, file, initialText, associatedInputs, initialInputValues);
                            if (success) {
                                this.sendDebug(`✅ Drop method 5 success: Clicked upload element in zone`, 'success');
                                return true;
                            }
                        } catch (_) {}
                    }
                }
                
                // Try clicking the zone itself
                zone.focus();
                zone.click();
                await this.delay(200);
                
                this.sendDebug(`📂 Drop method 5: Clicked zone - may have opened file dialog`, 'info');
                return false; // Not automatic, but might have opened dialog
            } catch (e) {
                this.sendDebug(`❌ Drop method 5 failed: ${e.message}`, 'warning');
            }

            this.sendDebug(`❌ All drop methods failed for this zone`, 'warning');
            return false;

        } catch (error) {
            this.sendDebug(`❌ Fatal error in dropFileOnZone: ${error.message}`, 'error');
            return false;
        }
    }

    // Verify if drop operation was successful
    async verifyDropSuccess(zone, expectedFile, initialText, associatedInputs, initialInputValues) {
        try {
            // Wait for any async processing
            await this.delay(300);
            
            // Check 1: Look for visual changes in the zone
            const currentText = zone.textContent || '';
            const textChanged = currentText !== initialText;
            const hasFileName = currentText.toLowerCase().includes(expectedFile.name.toLowerCase());
            
            if (hasFileName) {
                this.sendDebug(`✅ Drop verification: File name appears in zone text`, 'success');
                return true;
            }
            
            // Check 2: Check associated file inputs
            for (let i = 0; i < associatedInputs.length; i++) {
                const input = associatedInputs[i];
                const initialValue = initialInputValues[i];
                
                if (input.files && input.files.length > 0) {
                    this.sendDebug(`✅ Drop verification: File attached to associated input`, 'success');
                    return true;
                }
                
                if (input.value !== initialValue && input.value.includes(expectedFile.name)) {
                    this.sendDebug(`✅ Drop verification: Input value changed to include filename`, 'success');
                    return true;
                }
            }
            
            // Check 3: Look for new elements that appeared (progress bars, file names, etc.)
            const fileIndicators = zone.querySelectorAll('.file-name, .filename, [class*="file-name"], .upload-status, [class*="upload"], .progress');
            for (const indicator of fileIndicators) {
                if (indicator.textContent && indicator.textContent.includes(expectedFile.name)) {
                    this.sendDebug(`✅ Drop verification: File indicator element found`, 'success');
                    return true;
                }
            }
            
            // Check 4: Look for success/confirmation messages
            const successIndicators = zone.querySelectorAll('.success, .uploaded, .complete, [class*="success"], [class*="complete"]');
            if (successIndicators.length > 0) {
                for (const indicator of successIndicators) {
                    if (indicator.style.display !== 'none' && indicator.textContent.trim()) {
                        this.sendDebug(`✅ Drop verification: Success indicator found`, 'success');
                        return true;
                    }
                }
            }
            
            // Check 5: Zone style/class changes indicating upload
            const classList = Array.from(zone.classList);
            const hasUploadClass = classList.some(cls => 
                /uploaded|selected|complete|success|filled|has-file/i.test(cls)
            );
            
            if (hasUploadClass) {
                this.sendDebug(`✅ Drop verification: Upload-related class detected`, 'success');
                return true;
            }
            
            this.sendDebug(`❌ Drop verification failed: No evidence of successful upload`, 'warning');
            this.sendDebug(`   Text changed: ${textChanged}, Has filename: ${hasFileName}`, 'info');
            this.sendDebug(`   Associated inputs: ${associatedInputs.length}, Upload classes: ${hasUploadClass}`, 'info');
            
            return false;
            
        } catch (e) {
            this.sendDebug(`❌ Drop verification error: ${e.message}`, 'error');
            return false;
        }
    }

    // Record activity to history — successes only
    async recordToHistory(activity) {
        try {
            // 1) אל תכניס כשלונות להיסטוריה
            const status = (activity?.status || '').toLowerCase();
            if (/(fail|failed|error|cancel|cancelled|timeout)/i.test(status)) {
                this.sendDebug(`🛑 Skipping history record (status="${activity.status}")`, 'info');
                return;
            }

            // בתוך recordToHistory(activity)
            const historyEntry = {
                id: Date.now().toString(),
                // שמור גם ISO וגם מ״ס לשקיפות עם submitApplication
                timestamp: new Date().toISOString(),
                ts: Date.now(),
            
                // נירמול שמות מפתחות:
                title: activity.title || activity.jobTitle || activity.role || '',
                jobTitle: activity.jobTitle || activity.title || activity.role || '',
            
                link: activity.link || activity.url || window.location.href,
                url: activity.url || activity.link || window.location.href,
            
                company: activity.company || '',
                location: activity.location || '',
            
                status: activity.status || '',
                type: activity.type || '',
                method: activity.method || '',
                details: activity.details || {},
            
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
            };
            // print historyEntry
            this.sendDebug(`historyEntry: ${JSON.stringify(historyEntry)}`, 'info');

            // 3) טען היסטוריה קיימת והוסף בתחילתה (תיקון ה־spread)
            const { applicationHistory = [] } = await chrome.storage.local.get('applicationHistory');
            const updatedHistory = [historyEntry, ...(applicationHistory || [])];

            // שמור עד 100 רשומות
            if (updatedHistory.length > 100) updatedHistory.splice(100);

            // 4) שמירה
            await chrome.storage.local.set({ applicationHistory: updatedHistory });

            // 5) עדכון פופאפ (לא חובה אם לא פתוח)
            try {
                await chrome.runtime.sendMessage({ 
                    action: 'historyUpdated', 
                    entry: historyEntry 
                });
            } catch (_) {}

            this.sendDebug(
                `📝 Activity recorded to history: ${activity.jobTitle || 'Unknown'} - ${activity.status}`,
                'info'
            );
        } catch (error) {
            this.sendDebug(`❌ Failed to record to history: ${error.message}`, 'error');
        }
    }

    // Record form filling activity
    async recordFormFilling(jobData, status, method, details = {}) {
        const activity = {
            type: 'form_filling',
            jobTitle: jobData.title || jobData.role || 'Unknown Job',
            company: jobData.company || 'Unknown Company',
            location: jobData.location || 'Unknown Location',
            status: status, // 'Filled Only', 'Submitted', 'Test Mode', etc.
            method: method, // 'LinkedIn Easy Apply', 'Generic Form', 'Network Upload', etc.
            url: window.location.href,
            details: details
        };
        
        await this.recordToHistory(activity);
    }

    // Record resume upload activity
    async recordResumeUpload(status, method, details = {}) {
        const activity = {
            type: 'resume_upload',
            jobTitle: 'Resume Upload',
            company: 'N/A',
            location: 'N/A',
            status: status, // 'Success', 'Failed', 'Partial'
            method: method, // 'Network Upload', 'File Input', 'Drag & Drop'
            url: window.location.href,
            details: details
        };
        
        await this.recordToHistory(activity);
    }
    // ===== Recruiter scan & draft (LinkedIn People search) =====
    async draftNoteWithAI({ recruiterName, job = {}, company = '' }) {
        // נתוני משתמש
        const { profileData = {}, profile = {} } = await chrome.storage.sync.get(['profileData', 'profile']);
        const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
        const hebrewMode = await this.isHebrewMode();
        const systemPrompt = hebrewMode ? 'Write the message in Hebrew (עברית). Use Hebrew characters and grammar.' : 'Write the message in English.';
        const p = profileData.fullName ? profileData : (profile || {});
        const myName   = p.fullName || p.name || '';
        const headline = p.headline || p.currentTitle || '';
        const years    = p.yearsExperience || p.experienceYears || '';
        const skills   = Array.isArray(p.skills) ? p.skills.slice(0, 2).join(', ') : (p.keySkills || '');
    
        const jobTitle   = job.title || job.role || '';
        const companyName = company || job.company || '';
        const { resumeFile } = await chrome.storage.local.get('resumeFile');
        const resumeBase64 = resumeFile?.base64 || '';
        const resume_txt = atob(resumeBase64);
    
        // ניסוח בסיסי לגיבוי (כשאין API Key/כשל רשת)
        let fallback =
        `Hi ${recruiterName?.split(' ')[0] || ''}, I applied to the ${jobTitle} role at ${companyName}. `
        + (headline ? `I'm a ${headline}` : '')
        + (years ? ` (${years}y).` : '.')
        + (skills ? ` Focus: ${skills}.` : '')
        + (myName ? ` – ${myName}` : '');
        if (fallback.length > 200) fallback = fallback.slice(0, 200);
    
        if (!geminiApiKey) return fallback;
    
        // קריאה ל-Gemini
        try {
        const model = 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

        const prompt = `
        You are drafting a single LinkedIn invite note.

        CONTEXT, use only if non-empty:
        recruiterName="${recruiterName}"
        jobTitle="${jobTitle}"
        companyName="${companyName}"
        resumeText="${resume_txt || ''}"
        myName="${myName}"

        Write one line, max 200 characters.

        Rules:
        - If recruiterName is present, open with their first name only. Otherwise omit any name.
        - If jobTitle is present, mention it. Otherwise omit.
        - If companyName is present, mention it. Otherwise omit.
        - Be concise, and professional, with self-promotion - i'm the best candidate for the job.
        - Do not mention resume or paste resume text.
        - End with myName exactly.
        - No emojis, no hashtags, no quotes, no newlines, no em or en dashes. Use commas or periods only.
        - Keep it friendly, concise, and professional.
        - ${systemPrompt}
        Return only the note text, nothing else.
        `
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
        });
        const data = await resp.json().catch(() => null);
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join(' ').trim();
        if (!text) return fallback;
        return text.slice(0, 200);
        } catch {
            return fallback;
        }
    }
    // Place near draftNoteWithAI
async draftReferralWithAI({ connectionName = '', job = {}, company = '' }) {
    const { profileData = {}, profile = {} } = await chrome.storage.sync.get(['profileData', 'profile']);
    const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
    const hebrewMode = await this.isHebrewMode();
  
    const you = profileData?.name || profile?.fullName || 'me';
    const role = job.title || job.role || '';
    const comp = company || job.company || '';
    const jobLine = [role, comp].filter(Boolean).join(', ');

    const systemPrompt = hebrewMode
      ? 'Write the message in Hebrew (עברית). Keep it short, friendly, and practical.'
      : 'Write the message in English. Keep it short, friendly, and practical.';
    const { resumeFile } = await chrome.storage.local.get('resumeFile');
    const resumeBase64 = resumeFile?.base64 || '';
    const resume_txt = atob(resumeBase64);
    const userPrompt = `
      You are drafting a short LinkedIn first‑degree connection referral request.

      CONTEXT, use only if non-empty:
      connectionName="${connectionName}"
      jobTitle="${role}"
      companyName="${comp}"
      resumeText="${resume_txt || ''}"
      myName="${you}"

      Write one line, max 200 characters.

      Rules:
      - If connectionName is present, open with their first name only. Otherwise omit any name.
      - If jobTitle is present, mention it. Otherwise omit.
      - If companyName is present, mention it. Otherwise omit.
      - Be concise, and professional, with self-promotion - i'm the best candidate for the job.
      - Do not mention resume or paste resume text.
      - End with myName exactly.
      - No emojis, no hashtags, no quotes, no newlines, no em or en dashes. Use commas or periods only.
      - Keep it friendly, concise, and professional.
      - ${systemPrompt}
      Return only the note text, nothing else.
      `
  
    // Try Gemini if key exists, else fallback template
    try {
      if (geminiApiKey) {
        const text = await this.callGeminiText({ apiKey: geminiApiKey, systemPrompt, userPrompt });
        const cleaned = (text || '').trim();
        if (cleaned) return cleaned;
      }
    } catch(_) {}
  
    // Fallback template
    if (hebrewMode) {
      return connectionName
        ? `היי ${connectionName}, ראיתי משרה של ${jobLine}. אני בעל ניסיון רלוונטי ורוצה להגיש, אשמח אם תוכל לשקול להפנות אותי או להמליץ, תודה!`
        : `היי, ראיתי משרה של ${jobLine}. יש לי ניסיון רלוונטי, אשמח שתגיש אותי למשרה, תודה!`;
    }
    return connectionName
      ? `Hey ${connectionName}, I saw the ${jobLine} role. My background fits well, could you possibly refer or recommend me? Thanks!`
      : `Hey, I saw the ${jobLine} role. My background fits well, could you possibly refer or recommend me? Thanks!`;
    }

    // content.js
    async referralScanAndDraft({ company = '', job = {} } = {}) {
        this.sendDebug(`🔎 Scanning LinkedIn connections for referrals at "${company}"…`, 'info');
        this.popupShowStatus(`🔎 Scanning connections for "${job.title || ''} at ${job.company || ''}`)
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        await sleep(5500); // wait for the page to load
        // helpers (reuse from recruiterScanAndDraft if in scope)
        const waitFor = async (cond, timeout = 8000, step = 150) => {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
            const v = typeof cond === 'function' ? cond() : document.querySelector(cond);
            if (v) return v;
            await sleep(step);
        }
        return null;
        };
        // 1) ודא שאנחנו בטאב People ונטען תוצאות
        try {
        const activeTab = document.querySelector('[data-test-search-vertical-nav] [aria-current="page"]');
        const isPeople = /people/i.test(activeTab?.textContent || '');
        if (!isPeople) {
            const peopleTab = Array.from(document.querySelectorAll('[data-test-search-vertical-nav] a, nav a'))
            .find(a => /people/i.test((a.textContent || '').trim()));
            if (peopleTab) { peopleTab.click(); await sleep(1200); }
        }
        } catch {}
        this.popupShowStatus(`🔎 loading...`);
        // 2) אסוף כרטיסים
        const selectorGroups = [
        'ul.reusable-search__entity-result-list > li',
        'li.reusable-search__result-container',
        'div.entity-result__item',
        '[data-view-name="search-results"] li',
        '.search-results-container li',
        '.scaffold-layout__list li'
        ];
        // const cards = Array.from(document.querySelectorAll('[data-chameleon-result-urn]'));
        const collectCards = () => {
        for (const sel of selectorGroups) {
            const n = document.querySelectorAll(sel);
            if (n && n.length) return Array.from(n);
        }
        return [];
        };
    
        let cards = collectCards();
        for (let i = 0; i < 4 && cards.length === 0; i++) {
            const list = document.querySelector('.reusable-search__entity-result-list, .search-results-container, .scaffold-layout__list') || document.scrollingElement || document.body;
            list.scrollBy?.(0, list.clientHeight || 600);
            await sleep(900);
            cards = collectCards();
          }
        if (!cards.length) {
            this.sendDebug('❌ No search result cards found on page', 'warning');
            return { ok: false, reason: 'no_cards' };
        }
        this.sendDebug(`📋 Found ${cards.length} search result cards`, 'info');
        this.popupShowStatus(`📋 Evaluating cards results...`);
        // 3) פרסר: שם, דרגה, תיאור, חברה בכרטיס
        const pick = (root, sels) => { for (const s of sels) { const el = root.querySelector(s); if (el) return el; } return null; };
      
        const getBtnInfo = (card) => {
            const btn = card.querySelector('button, a[role="button"]');
            const txt = (btn?.innerText || btn?.getAttribute('aria-label') || '').trim().toLowerCase();
          
            const hasMessage = /\bmessage\b|הודעה/.test(txt);
            const hasConnect = /\bconnect\b|התחבר/.test(txt);
          
            // סימוני דילוג
            const isFollow  = /\bfollow(ing)?\b/.test(txt);
            const isPending = /\bpending\b/.test(txt) || /ממתין|הוזמן|בהמתנה/.test(txt);
          
            // פולבק, לפעמים "Pending" יופיע לא בכפתור אלא בכרטיס
            const cardTxt = (card.innerText || '').trim().toLowerCase();
            const cardPending = /\bpending\b/.test(cardTxt) || /ממתין|בהמתנה/.test(cardTxt);
          
            return {
              btn,
              text: txt,
              hasMessage,
              hasConnect,
              isFollow,
              isPending: isPending || cardPending,
              shouldSkip: isFollow || isPending || cardPending
            };
        };

              
        const candidates = cards.map(card => {
            const nameEl = pick(card, [
              '.entity-result__title-text a',
              'a.app-aware-link[href*="/in/"]',
              'span.entity-result__title-text a',
              'h3 a'
            ]);
            const subtitleEl = pick(card, [
              '.entity-result__primary-subtitle',
              '.entity-result__subtitle',
              '.t-14.t-normal.t-black'
            ]);
            const name = (nameEl?.innerText || '').trim();
            const subtitle = (subtitleEl?.innerText || '').trim();
            const text = (card.innerText || '').trim();
            const profile = `${name}\n${subtitle}\n${text}`.trim();
            const btnInfo = getBtnInfo(card);
            return { card, name, subtitle, text, profile, btnInfo };
        }).filter(c => !c.btnInfo.shouldSkip); // דילוג על Follow או Following
        if (!candidates.length) {
            this.sendDebug('❌ No actionable cards after filtering Follow, Following', 'warning');
            return { ok: false, reason: 'no_actionable_cards' };
        }
      
        const parseCard = (card) => {
            const txt = (el) => (el?.textContent || el?.innerText || '').replace(/\s+/g, ' ').trim();
            const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
          
            // name
            const nameNode =
            card.querySelector('span.entity-result__title-text a span[aria-hidden="true"]') ||
            card.querySelector('a.app-aware-link span[aria-hidden="true"]') ||
            card.querySelector('span[aria-hidden="true"]:not(.visually-hidden)') || // ליתר בטחון
            card.querySelector('span.entity-result__title-text');
          
            let name = txt(nameNode);
            
            // ניקוי טקסטי נגישות כמו: "View <Name>’s profile" או "See <Name>'s profile"
            name = name
                .replace(/\b(View|See)\s+.+?[’']s profile\b/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
          
            // degree, תמיכה גם ב-2nd/3rd
            const degreeEl =
              card.querySelector('[data-test-distance-badge]') ||
              card.querySelector('.entity-result__badge, .dist-value') ||
              card.querySelector('[aria-label*="degree"]');
            const degreeRaw = txt(degreeEl) || degreeEl?.getAttribute?.('aria-label') || '';
            const degreeMatch = degreeRaw.match(/\b(1st|2nd|3rd)\b/i);
            const degree = degreeMatch ? degreeMatch[1] : '';
          
            // primary subtitle (e.g., "Machine Learning Engineer at Immunai")
            const primaryEl =
              card.querySelector('.entity-result__primary-subtitle') ||
              card.querySelector('.entity-result__content .t-14');
            const primaryText = txt(primaryEl);
          
            // summary line (e.g., "Current: Data Engineer at Immunai")
            const summaryEl =
              card.querySelector('p.entity-result__summary--2-lines') ||
              card.querySelector('.entity-result__summary') ||
              card.querySelector('.entity-result__content .t-12.t-black--light.mb1');
            const summaryText = txt(summaryEl);
          
            // location, אם קיים
            const locationEl =
              card.querySelector('.entity-result__secondary-subtitle') ||
              card.querySelector('.entity-result__content .t-12.t-normal.t-black--light:not(.mb1)');
            const location = txt(locationEl);
          
            // mutual connections
            const t12s = Array.from(card.querySelectorAll('.t-12, .entity-result__insights, .entity-result__simple-insight'));
            const mutualEl = t12s.find(e => /mutual connection/i.test(txt(e)));
            const mutual = mutualEl ? txt(mutualEl) : '';
          
            // חילוץ title/company
            let title = '', company = '';
            const m1 = primaryText.match(/^(.+?)\s+at\s+(.+?)$/i);
            if (m1) { title = m1[1]; company = m1[2]; }
          
            // חילוץ currentTitle/currentCompany מה-summary
            let currentTitle = '', currentCompany = '';
            const m2 = summaryText.match(/current\s*:\s*([^@]+?)\s+at\s+(.+?)$/i);
            if (m2) { currentTitle = m2[1].trim(); currentCompany = m2[2].trim(); }
          
            // נייצר גם שדות normalized לטובת התאמת חברה
            const headline = norm(primaryText);
            const compText = norm([primaryText, summaryText].filter(Boolean).join(' '));
          
            return {
              name,
              degree,                 // "1st" | "2nd" | "3rd" | ""
              title, company,         // מהשורה הראשית "Role at Company"
              currentTitle, currentCompany, // מהשורה "Current: …"
              location,
              mutual,
              headline, compText,     // לשימוש בדירוג/התאמת חברה
              card, summaryText, primaryText
            };
        };
    
        const targetCompany = norm(company || job.company || '');
    
        let fallbackBest = null;  // נפילה סבירה אם אין התאמת חברה
        const messagePool = [];
        const connectPool = [];
        
        for (const c of candidates) {
            if (!c) break;
            const p = parseCard(c.card);
            const Btn = c.card.querySelector('button.artdeco-button')
            this.sendDebug('Btn='+Btn, 'info');
            const BtnText = (Btn?.innerText || Btn?.getAttribute('aria-label') || '').trim().toLowerCase();
            if (!fallbackBest && p.degree === '1st') {
                fallbackBest = c.card;
            }
            let targetCompany_lower = targetCompany.toLowerCase();
            let p_company        = (p.company        || '').toLowerCase();
            let p_currentCompany = (p.currentCompany || '').toLowerCase();
            let p_summaryText    = (p.summaryText    || '').toLowerCase();
            let p_primaryText    = (p.primaryText    || '').toLowerCase();
            this.sendDebug('p_company='+p_company, 'info');
            this.sendDebug('p_currentCompany='+p_currentCompany, 'info');
            this.sendDebug('p_summaryText='+p_summaryText, 'info');
            this.sendDebug('p_primaryText='+p_primaryText, 'info');
            const companyHit =
            targetCompany_lower === p_company ||
            targetCompany_lower === p_currentCompany ||
            p_company.includes(targetCompany_lower) ||
            p_currentCompany.includes(targetCompany_lower) ||
            p_summaryText.includes('at ' + targetCompany_lower) ||
            p_primaryText.includes('at ' + targetCompany_lower);
            this.sendDebug('companyHit='+companyHit, 'info');
            if (companyHit) {
                if (BtnText.includes('connect')){
                    connectPool.push({ ...c, ok: true, modelName: p.name || '', BtnText: BtnText });
                  }
                  else if (BtnText.includes('message')){
                    messagePool.push({ ...c, ok: true, modelName: p.name || '', BtnText: BtnText });
                  }
                break;
            }
        }
        const top = connectPool[0] || messagePool[0];
        
        if (!top) {
            this.sendDebug('❌ No matching person by AI classification', 'warning');
            this.popupShowStatus('❌ No matching person by AI classification');
            return { ok: false, reason: 'no_matches_ai' };
        }
        const Name = top.name || top.modelName || '';
        const companyLine = top.subtitle || '';
        this.sendDebug(top.btnInfo.text, 'info');
        const pickedMode = top.BtnText.includes('connect') ? 'connect' : 'message';
      
        this.sendDebug(`Picked mode: ${pickedMode}`, 'info');
        this.sendDebug(`Top: ${JSON.stringify(top)}`, 'info');
        // 7) פיצול ברור, טיפול נפרד בכל מקרה
        const findBtnn = (root, label) => Array.from(root.querySelectorAll('button, a[role="button"]')) .find(b => (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase().includes(label));
        const hebrewMode = await this.isHebrewMode();

        // מקרה A, יש Connect
        if (pickedMode === 'connect') {
            this.popupShowStatus(`🔗 Connecting to ${Name}...`);
            const connectBtn = findBtnn(top.card, 'connect');
            try { connectBtn?.click(); } catch {}
            // המתן למודל
            await waitFor(() => document.querySelector('.artdeco-modal'), 6000);
            const modal = document.querySelector('.artdeco-modal');
            if (!modal) {
              // לא נפתח מודל, ננסה פולבק
              const drafted = await this.draftReferralWithAI({ Name, job, company });
              return { ok: true, drafted, Name, companyLine, usedAI: true, mode: 'connect', noteSent: false, testMode: true };
            }
        
            // מצא Add a note
            const addNoteBtn = findBtnn(modal, 'add a note') || findBtnn(modal, 'הוסף תגובה') || findBtnn(modal, 'Add a note');
            this.popupShowStatus(`🔗 Adding note to ${Name}...`);
            if (addNoteBtn) {
              try { addNoteBtn.scrollIntoView({ block: 'center' }); addNoteBtn.click(); } catch {}
              await sleep(250);
            }
            if (!document.querySelector('.artdeco-modal textarea, .artdeco-modal [name="message"]')) {
                try { addNoteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch {}
                await sleep(200);
              }
            
        
            const noteField = await waitFor(() => document.querySelector('.artdeco-modal textarea, .artdeco-modal [name="message"]'), 5000);
            const ta = noteField || document.querySelector('.artdeco-modal textarea, .artdeco-modal [name="message"]');
        
            // נסה שם מהמודל אם חסר
            let NameFromModal = '';
            try {
              const bold = modal.querySelector('strong, b');
              if (bold) NameFromModal = bold.textContent.trim();
            } catch {}
            const finalName = (Name || NameFromModal || '').trim();
            const setTextareaValue = (ta, text) => {
                ta.focus();
                ta.value = text;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
              };
            const drafted = await this.draftReferralWithAI({ Name: finalName, job, company });
            let noteSent = false;
            if (ta) {
              ta.setAttribute('lang', hebrewMode ? 'he' : 'en');
              ta.style.direction = hebrewMode ? 'rtl' : 'ltr';
              const wrapRTL = s => '\u202B' + s + '\u202C';
              const finalDraft = hebrewMode ? wrapRTL(drafted) : drafted;
              setTextareaValue(ta, finalDraft);
              const findSend = (root) =>
                Array.from(root.querySelectorAll('button, a[role="button"]'))
                  .find(b => (/^send\b|שלח/i).test((b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase()));
              const sendBtn = findSend(ta.closest('.artdeco-modal') || modal || document);
        
              const { aiAgent } = await chrome.storage.sync.get('aiAgent');
              const testMode = aiAgent?.aiSubmissionMode === true;
        
              if (!testMode) {
                try { sendBtn?.click(); noteSent = !!sendBtn; } catch {}
                this.sendDebug('🧪 Test Mode: note sent on Connect modal', 'success');
                this.popupShowStatus(`✅ Live Mode: note filled`);
              } else {
                this.sendDebug('✅ Live Mode: note filled but NOT sent', 'info');
                this.popupShowStatus(`✅ Live Mode: note filled but NOT sent`);
              }
        
              this.sendDebug(`Connect flow, name="${finalName || '(no name)'}", noteSent=${noteSent}`, noteSent ? 'success' : 'info');
              return { ok: true, drafted, Name: finalName, companyLine, usedAI: true, mode: 'connect', noteSent, testMode };
            }
        
            // ללא textarea, החזר טיוטה בלבד
            return { ok: true, drafted, Name: finalName, companyLine, usedAI: true, mode: 'connect', noteSent: false, testMode: true };
          }
          // מקרה B, יש Message
          if (pickedMode === 'message') {
            const msgBtn = findBtnn(top.card, 'message');
            this.popupShowStatus(`💬 Sending message to ${Name}...`);
            try { msgBtn?.click(); } catch {}
        
            // המתן לבועת הודעה
            const bubble = await waitFor(findActiveMessageBubble, 6000);

        
            const editor = await waitFor(() => findMessageEditor(bubble), 10000);
        
            const drafted = await this.draftReferralWithAI({ Name, job, company });
            let noteSent = false;
        
            if (editor) {
              editor.setAttribute('dir', hebrewMode ? 'rtl' : 'ltr');
              editor.style.direction = hebrewMode ? 'rtl' : 'ltr';
              const wrapRTL = s => '\u202B' + s + '\u202C';
              const finalDraft = hebrewMode ? wrapRTL(drafted) : drafted;
              await fillContentEditable(editor, finalDraft);
              const { aiAgent } = await chrome.storage.sync.get('aiAgent');
              const testMode = aiAgent?.aiSubmissionMode === true;
        
              const sendBtn =
              bubble?.querySelector('button.msg-form__send-button') ||
              bubble?.querySelector('button[aria-label^="Send" i]') ||
              bubble?.querySelector('[data-control-name*="send" i]');
        
              if (!testMode) {
                try { sendBtn?.click(); noteSent = !!sendBtn; } catch {}
                this.sendDebug('🧪 Test Mode: message sent', 'success');
                this.popupShowStatus(`✅ Live Mode: message filled`);
              } else {
                this.sendDebug('✅ Live Mode: message filled but NOT sent (send is allowed only in Test Mode)', 'info');
                this.popupShowStatus(`✅ Live Mode: message filled but NOT sent`);
              }
        
              this.sendDebug(`Message flow, name="${Name || '(no name)'}", sent=${noteSent}`, noteSent ? 'success' : 'info');
              return { ok: true, drafted, Name, companyLine, usedAI: true, mode: 'message', noteSent, testMode };
            }
        
            // פולבק אם אין עורך
            return { ok: true, drafted, Name, companyLine, usedAI: true, mode: 'message', noteSent: false, testMode: true };
          }
        
          // פולבק כללי
          const drafted = await this.draftReferralWithAI({ Name, job, company });
          return { ok: true, drafted, Name, companyLine, usedAI: true, mode: 'unknown', noteSent: false, testMode: true };
      }
  


    // ===== Recruiter scan & draft (LinkedIn People search) =====
    async recruiterScanAndDraft({ company = '', job = {} } = {}) {
        this.sendDebug(`🔎 Scanning LinkedIn results for HR at "${company}"…`, 'info');
        this.popupShowStatus(`🔎 Scanning LinkedIn results for HR at "${company}"…`);
      
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        // עזר, המתנה לאלמנט או תנאי
        const waitFor = async (cond, timeout = 8000, step = 150) => {
          const t0 = Date.now();
          while (Date.now() - t0 < timeout) {
            const v = typeof cond === 'function' ? cond() : document.querySelector(cond);
            if (v) return v;
            await sleep(step);
          }
          return null;
        };
        const setTextareaValue = (ta, text) => {
            ta.focus();
            ta.value = text;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
        };
        // 1) ודא טאב People
        try {
          const activeTab = document.querySelector('[data-test-search-vertical-nav] [aria-current="page"]');
          const isPeople = /people/i.test(activeTab?.textContent || '');
          if (!isPeople) {
            const peopleTab = Array.from(document.querySelectorAll('[data-test-search-vertical-nav] a, nav a'))
              .find(a => /people/i.test((a.textContent || '').trim()));
            if (peopleTab) { peopleTab.click(); await sleep(1200); }
          }
        } catch {}
      
        // 2) איסוף כרטיסים
        const selectorGroups = [
          'ul.reusable-search__entity-result-list > li',
          'li.reusable-search__result-container',
          'div.entity-result__item',
          '[data-view-name="search-results"] li',
          '.search-results-container li',
          '.scaffold-layout__list li'
        ];
        const collectCards = () => {
          for (const sel of selectorGroups) {
            const n = document.querySelectorAll(sel);
            if (n && n.length) return Array.from(n);
          }
          return [];
        };
      
        let cards = collectCards();
        for (let i = 0; i < 4 && cards.length === 0; i++) {
          const list = document.querySelector('.reusable-search__entity-result-list, .search-results-container, .scaffold-layout__list') || document.scrollingElement || document.body;
          list.scrollBy?.(0, list.clientHeight || 600);
          await sleep(900);
          cards = collectCards();
        }
        if (!cards.length) {
          this.sendDebug('❌ No search result cards found on page', 'warning');
          return { ok: false, reason: 'no_cards' };
        }
        this.sendDebug(`📋 Found ${cards.length} search result cards`, 'info');
        this.popupShowStatus(`📋 Evaluating cards...`);
        // 3) חילוץ שדות מכל כרטיס
        const pick = (root, sels) => { for (const s of sels) { const el = root.querySelector(s); if (el) return el; } return null; };
      
        const getBtnInfo = (card) => {
            const btn = card.querySelector('button, a[role="button"]');
            const txt = (btn?.innerText || btn?.getAttribute('aria-label') || '').trim().toLowerCase();
          
            const hasMessage = /\bmessage\b|הודעה/.test(txt);
            const hasConnect = /\bconnect\b|התחבר/.test(txt);
          
            // סימוני דילוג
            const isFollow  = /\bfollow(ing)?\b/.test(txt);
            const isPending = /\bpending\b/.test(txt) || /ממתין|הוזמן|בהמתנה/.test(txt);
          
            // פולבק, לפעמים "Pending" יופיע לא בכפתור אלא בכרטיס
            const cardTxt = (card.innerText || '').trim().toLowerCase();
            const cardPending = /\bpending\b/.test(cardTxt) || /ממתין|בהמתנה/.test(cardTxt);
          
            return {
              btn,
              text: txt,
              hasMessage,
              hasConnect,
              isFollow,
              isPending: isPending || cardPending,
              shouldSkip: isFollow || isPending || cardPending
            };
        };
          
      
        const candidates = cards.map(card => {
          const nameEl = pick(card, [
            '.entity-result__title-text a',
            'a.app-aware-link[href*="/in/"]',
            'span.entity-result__title-text a',
            'h3 a'
          ]);
          const subtitleEl = pick(card, [
            '.entity-result__primary-subtitle',
            '.entity-result__subtitle',
            '.t-14.t-normal.t-black'
          ]);
          const name = (nameEl?.innerText || '').trim();
          const subtitle = (subtitleEl?.innerText || '').trim();
          const text = (card.innerText || '').trim();
          const profile = `${name}\n${subtitle}\n${text}`.trim();
          const btnInfo = getBtnInfo(card);
          return { card, name, subtitle, text, profile, btnInfo };
        }).filter(c => !c.btnInfo.shouldSkip); // דילוג על Follow או Following
      
        if (!candidates.length) {
          this.sendDebug('❌ No actionable cards after filtering Follow, Following', 'warning');
          return { ok: false, reason: 'no_actionable_cards' };
        }
      
        // 4) טעינת מפתח Gemini
        let geminiApiKey = '';
        try {
          const cfg = await chrome.storage.sync.get(['geminiApiKey']);
          geminiApiKey = cfg?.geminiApiKey || '';
        } catch {}
        if (!geminiApiKey) {
          this.sendDebug('❌ Missing Gemini API key in chrome.storage.sync', 'warning');
          this.popupShowStatus('❌ Missing Gemini API key, please add it to the extension settings');
          return { ok: false, reason: 'missing_api_key' };
        }
      
        // 5) סיווג אך ורק עם AI
        const model = 'gemini-2.0-flash';
        const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
      
        const judgeOne = async (profileText) => {
          this.sendDebug(`Judging profile head="${(profileText||'').slice(0,60)}"`, 'info');
          const prompt = `
      Return ONLY valid minified JSON:
      {"ok": <true|false>, "name": "<person full name or empty string>"}
      
      You are selecting HR or Recruiter or TA or People Ops for company "${company}" from LinkedIn results.
      - ok=true only if likely HR or Recruiter or TA for that company.
      - name is the person's full name if visible in the profile text, else "".
      
      Profile:
      """
      ${profileText}
      """`.trim();
      
          try {
            const resp = await fetch(baseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: 'application/json' }
              })
            });
            const data = await resp.json().catch(() => null);
            const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('')?.trim() || '';
            try {
              const j = JSON.parse(raw);
            //    check if j is array
            if (Array.isArray(j)) {
              return { ok: j[0].ok, name: (j[0].name || '').trim() };
            }
            return { ok: !!j.ok, name: (j.name || '').trim() };
            } catch {
              const lower = raw.toLowerCase();
              const ok = lower.startsWith('y') || /"ok"\s*:\s*true/.test(lower);
              const m = raw.match(/"name"\s*:\s*"([^"]+)"|[,:\-]\s*([A-Z][^\n,]{1,60})/);
              const name = (m && (m[1] || m[2])) ? (m[1] || m[2]).trim() : '';
              return { ok, name };
            }
          } catch {
            return { ok: false, name: '' };
          }
        };
      
        // 6) סיווג כל הכרטיסים, איסוף נפרד ל Message ול Connect
        const messagePool = [];
        const connectPool = [];
        for (const c of candidates) {
          /* eslint-disable no-await-in-loop */
          const { ok, name: aiName } = await judgeOne(c.profile);
          const Btn = c.card.querySelector('button, a[role="button"]'); 
          const BtnText = (Btn?.innerText || Btn?.getAttribute('aria-label') || '').trim().toLowerCase();
          const logName = (c.name || aiName) || '(no name)';
          this.sendDebug(`Judged: ok=${ok} | ${logName} | ${c.subtitle || ''} | ${BtnText || ''}`, ok ? 'success' : 'info');
          if (ok && (BtnText.includes('message') || BtnText.includes('connect'))) {
            if (BtnText.includes('connect')){
              connectPool.push({ ...c, ok: true, modelName: aiName || '', BtnText: BtnText });
            }
            else if (BtnText.includes('message')){
              messagePool.push({ ...c, ok: true, modelName: aiName || '', BtnText: BtnText });
            }
            break;
          }
          /* eslint-enable no-await-in-loop */
        }
      
        // בחר יעד, קודם Connect, אם אין אז Message
        const top = connectPool[0] || messagePool[0];
        if (!top) {
          this.sendDebug('❌ No matching recruiters by AI classification', 'warning');
          this.popupShowStatus('❌ No matching recruiters by AI classification');
          return { ok: false, reason: 'no_matches_ai' };
        }
      
        const recruiterName = top.name || top.modelName || '';
        const companyLine = top.subtitle || '';
        const pickedMode = top.BtnText.includes('connect') ? 'connect' : 'message';
      
        this.sendDebug(`👤 Candidate: ${recruiterName || '(no name)'} at ${companyLine || '(unknown company)'} [AI only, ${pickedMode}]`, 'success');
      
        // 7) פיצול ברור, טיפול נפרד בכל מקרה
        const findBtn = (root, label) => Array.from(root.querySelectorAll('button, a[role="button"]')) .find(b => (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase().includes(label));
        // מקרה A, יש Connect
        if (pickedMode === 'connect') {
          this.popupShowStatus(`🔗 Connecting to ${recruiterName}...`);
          const connectBtn = findBtn(top.card, 'connect');
          try { connectBtn?.click(); } catch {}
          // המתן למודל
          await waitFor(() => document.querySelector('.artdeco-modal'), 6000);
          const modal = document.querySelector('.artdeco-modal');
          if (!modal) {
            // לא נפתח מודל, ננסה פולבק
            const drafted = await this.draftNoteWithAI({ recruiterName, job, company });
            return { ok: true, drafted, recruiterName, companyLine, usedAI: true, mode: 'connect', noteSent: false, testMode: true };
          }
      
          // מצא Add a note
          const addNoteBtn = findBtn(modal, 'add a note') || findBtn(modal, 'הוסף תגובה') || findBtn(modal, 'Add a note');
          this.popupShowStatus(`🔗 Adding note to ${recruiterName}...`);
          if (addNoteBtn) {
            try { addNoteBtn.scrollIntoView({ block: 'center' }); addNoteBtn.click(); } catch {}
            await sleep(250);
          }
          if (!document.querySelector('.artdeco-modal textarea, .artdeco-modal [name="message"]')) {
              try { addNoteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch {}
              await sleep(200);
            }
          
      
          const noteField = await waitFor(() => document.querySelector('.artdeco-modal textarea, .artdeco-modal [name="message"]'), 5000);
          const ta = noteField || document.querySelector('.artdeco-modal textarea, .artdeco-modal [name="message"]');
      
          // נסה שם מהמודל אם חסר
          let recruiterNameFromModal = '';
          try {
            const bold = modal.querySelector('strong, b');
            if (bold) recruiterNameFromModal = bold.textContent.trim();
          } catch {}
          const finalName = (recruiterName || recruiterNameFromModal || '').trim();
      
          const drafted = await this.draftNoteWithAI({ recruiterName: finalName, job, company });
          let noteSent = false;
          const hebrewMode = await this.isHebrewMode();
          if (ta) {
            ta.setAttribute('lang', hebrewMode ? 'he' : 'en');
            ta.style.direction = hebrewMode ? 'rtl' : 'ltr';
            const wrapRTL = s => '\u202B' + s + '\u202C';
            const finalDraft = hebrewMode ? wrapRTL(drafted) : drafted;
            setTextareaValue(ta, finalDraft);
            const findSend = (root) =>
              Array.from(root.querySelectorAll('button, a[role="button"]'))
                .find(b => (/^send\b|שלח/i).test((b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase()));
            const sendBtn = findSend(ta.closest('.artdeco-modal') || modal || document);
      
            const { aiAgent } = await chrome.storage.sync.get('aiAgent');
            const testMode = aiAgent?.aiSubmissionMode === true;
            this.sendDebug('testMode='+testMode, 'info');
            this.sendDebug('aiSubmissionMode='+aiAgent?.aiSubmissionMode, 'info');
            if (!testMode) {
              try { sendBtn?.click(); noteSent = !!sendBtn; } catch {}
              this.sendDebug('🧪 Test Mode: note sent on Connect modal', 'success');
              this.popupShowStatus(`✅ Live Mode: note filled and sent`);
            } else {
              this.sendDebug('✅ Live Mode: note filled but NOT sent', 'info');
              this.popupShowStatus(`✅ Live Mode: note filled but NOT sent`);
            }
      
            this.sendDebug(`Connect flow, name="${finalName || '(no name)'}", noteSent=${noteSent}`, noteSent ? 'success' : 'info');
            return { ok: true, drafted, recruiterName: finalName, companyLine, usedAI: true, mode: 'connect', noteSent, testMode };
          }
      
          // ללא textarea, החזר טיוטה בלבד
          return { ok: true, drafted, recruiterName: finalName, companyLine, usedAI: true, mode: 'connect', noteSent: false, testMode: true };
        }
      
        // מקרה B, יש Message
        if (pickedMode === 'message') {
          const msgBtn = findBtn(top.card, 'message');
          this.popupShowStatus(`💬 Sending message to ${recruiterName}...`);
          try { msgBtn?.click(); } catch {}
      
          const bubble = await waitFor(findActiveMessageBubble, 6000);
          const editor = await waitFor(() => findMessageEditor(bubble), 10000);
          const drafted = await this.draftNoteWithAI({ recruiterName, job, company });
          let noteSent = false;
      
          if (editor) {
            editor.setAttribute('dir', hebrewMode ? 'rtl' : 'ltr');
            editor.style.direction = hebrewMode ? 'rtl' : 'ltr';
            const wrapRTL = s => '\u202B' + s + '\u202C';
            const finalDraft = hebrewMode ? wrapRTL(drafted) : drafted;
            await fillContentEditable(editor, finalDraft);
            const { aiAgent } = await chrome.storage.sync.get('aiAgent');
            const testMode = aiAgent?.aiSubmissionMode === true;
      
            const sendBtn =
              bubble?.querySelector('button.msg-form__send-button') ||
              bubble?.querySelector('button[aria-label^="Send" i]') ||
              bubble?.querySelector('[data-control-name*="send" i]');
      
            if (!testMode) {
              try { sendBtn?.click(); noteSent = !!sendBtn; } catch {}
              this.sendDebug('🧪 Test Mode: message sent', 'success');
              this.popupShowStatus(`✅ Live Mode: message filled and sent`);
            } else {
              this.sendDebug('✅ Live Mode: message filled but NOT sent (send is allowed only in Test Mode)', 'info');
              this.popupShowStatus(`✅ Live Mode: message filled but NOT sent`);
            }
      
            this.sendDebug(`Message flow, name="${recruiterName || '(no name)'}", sent=${noteSent}`, noteSent ? 'success' : 'info');
            return { ok: true, drafted, recruiterName, companyLine, usedAI: true, mode: 'message', noteSent, testMode };
          }
      
          // פולבק אם אין עורך
          return { ok: true, drafted, recruiterName, companyLine, usedAI: true, mode: 'message', noteSent: false, testMode: true };
        }
      
        // פולבק כללי
        const drafted = await this.draftNoteWithAI({ recruiterName, job, company });
        return { ok: true, drafted, recruiterName, companyLine, usedAI: true, mode: 'unknown', noteSent: false, testMode: true };
    }
      
    popupShowStatus(text = 'Working…') {
    try {
    chrome.runtime.sendMessage({ action: 'popupShowStatus', text });
    } catch (_) {}
    }

    popupReset() {
    try {
        chrome.runtime.sendMessage({ action: 'popupReset' });
    } catch (_) {}
    }

    async isHebrewMode() {
        try {
          const { aiAgent } = await chrome.storage.sync.get('aiAgent');
          return aiAgent?.hebrewMessages === true;
        } catch {
          return false;
        }
    }

    async answerWithAI(question) {
        try {
            this.sendDebug('🧪 Test mode: answerWithAI', 'info');
            this.sendDebug('question='+question, 'info');
          const resumeData = await this.getResumeForAI();
          const res = await new Promise((resolve) => {
            try {
              chrome.runtime.sendMessage(
                { action: 'generateAIAnswer', question, resumeData },
                (r) => resolve(r && r.success ? r.answer : null)
              );
            } catch (_) { resolve(null); }
          });
          return res;
        } catch (_) {
          return null;
        }
    }
      
      
    async getResumeForAI() {
        // ננסה קודם קובץ טקסט של קו״ח, אחרת נבנה מ‑profile
        try {
          let { resumeContent } = await chrome.storage.sync.get('resumeContent');
          if (!resumeContent) {
            const l = await chrome.storage.local.get('resumeContent');
            resumeContent = l?.resumeContent;
          }
          if (resumeContent && resumeContent.trim()) return resumeContent;
      
          const { profile, profileData } = await chrome.storage.sync.get(['profile', 'profileData']);
          const p = profileData || profile || {};
          // תקציר נחמד ל‑AI:
          const lines = [
            p.fullName && `Name: ${p.fullName}`,
            p.email && `Email: ${p.email}`,
            p.phone && `Phone: ${p.phone}`,
            p.location && `Location: ${p.location}`,
            p.summary && `Summary: ${p.summary}`,
            p.skills && `Skills: ${Array.isArray(p.skills) ? p.skills.join(', ') : p.skills}`,
            p.experience && `Experience: ${typeof p.experience === 'string' ? p.experience : JSON.stringify(p.experience)}`
          ].filter(Boolean);
          return lines.join('\n');
        } catch {
          return '';
        }
    }
      
}

// Initialize the LinkedIn job manager
const linkedInJobManager = new LinkedInJobManager();
  
function textOf(el) {
    if (!el) return '';
    const parts = [];
  
    // 1) aria-label אם יש
    const a11y = el.getAttribute('aria-label');
    if (a11y) parts.push(a11y);
  
    // 2) כל ה־.artdeco-button__text בעומק, כולל טקסט מצברי
    const spans = el.querySelectorAll('.artdeco-button__text, [class*="button__text"]');
    spans.forEach(s => {
      const t = (s.textContent || '').trim();
      if (t) parts.push(t);
    });
  
    // 3) טקסט גולמי מהכפתור, לפעמים נוסף מאוחר יותר
    const raw = (el.textContent || '').trim();
    if (raw) parts.push(raw);
  
    // 4) טקסט נוד טהור (ילדים שהם טקסט ישיר)
    const direct = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => (n.nodeValue || '').trim())
      .filter(Boolean)
      .join(' ');
    if (direct) parts.push(direct);
  
    // normalize
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}
  
function isVisible(el) {
  if (!el) return false;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
}

// החזר את כפתור הפעולה הראשי בכרטיס, בלי תלות בטקסט

// ממתין לאלמנט עם timeout
async function waitFor(selOrFn, timeout = 6000, step = 80, scope = document) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = typeof selOrFn === 'function' ? selOrFn() : scope.querySelector(selOrFn);
      if (el) return el;
      await new Promise(r => setTimeout(r, step));
    }
    return null;
  }
  
  // מוצא חלון הודעה פעיל
function findActiveMessageBubble() {
// לא ממוזער
return document.querySelector('.msg-overlay-conversation-bubble:not(.msg-overlay-conversation-bubble--minimized)')
    || document.querySelector('.msg-overlay-conversation-bubble')
    || document.querySelector('[data-test-conversation-window]')
    || null;
}
  
  // מוצא את העורך, לא משנה איזה דום קיבלנו
function findMessageEditor(bubble) {
const root = bubble || document;
return (
    // הכי נפוץ
    root.querySelector('.msg-form__contenteditable[contenteditable="true"]') ||
    // וריאציה חדשה
    root.querySelector('[contenteditable="true"][role="textbox"]') ||
    // לפי פלייסהולדר
    root.querySelector('div[aria-label^="Write a message" i]') ||
    root.querySelector('div[data-placeholder^="Write a message" i]') ||
    // עורך פנימי
    root.querySelector('.msg-form__contenteditable .artdeco-text-input--container [contenteditable="true"]') ||
    null
);
}
  
// ממלא עורך בצורה שמפעילה את ריאקט
async function fillContentEditable(el, text) {
    if (!el) return false;

    // פוקוס, גלילה, ניקוי
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.setAttribute('data-gramm', 'false'); // מפחית חיכוך עם Grammarly
    try { document.execCommand('selectAll', false, null); } catch {}
    try { document.execCommand('delete', false, null); } catch {}

    // נסיון ראשון, insertText
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch {}
    if (!ok) {
        // פולבק: קובע textContent ומדליק input אמיתי
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }
    // טריגר נוסף לביטוח
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function isLongAnswerField(field) {
    const tag = (field.tagName || '').toLowerCase();
    const type = (field.type || '').toLowerCase();
    // טקסט ארוך: textarea או input טקסט ארוך
    return tag === 'textarea' || (type === 'text' && (field.maxLength || 500) >= 200);
}
  
function extractQuestionText(field) {
    const parts = [];
    const aria = field.getAttribute('aria-label') || '';
    const ph = field.getAttribute('placeholder') || '';
    const title = field.getAttribute('title') || '';
    const id = field.id ? (field.ownerDocument.querySelector(`label[for="${field.id}"]`)?.textContent || '') : '';
    const wrap = field.closest('label, [role="group"], .form-group, .field, .question, [data-test*="question"], [class*="question" i]');
    const wrapTxt = wrap ? (wrap.textContent || '') : '';
    [aria, ph, title, id, wrapTxt]
        .map(t => (t || '').trim())
        .filter(Boolean)
        .forEach(t => parts.push(t));
    const q = parts.join(' ').replace(/\s+/g,' ').trim();
    return q.slice(0, 600);
}
  
function looksLikeGeneralQuestion(text) {
    const t = (text || '').toLowerCase();
    // אנגלית + עברית
    const cues = [
        'why do you want', 'why are you applying', 'tell us about', 'describe', 'what makes you', 'cover letter',
        'motivation', 'strengths', 'weaknesses', 'about yourself', 'how would you',
        'למה', 'מדוע', 'ספר', 'ספרי', 'תאר', 'תארי', 'מה גורם', 'מוטיבציה', 'מכתב מקדים', 'על עצמך', 'עלייך', 'עליך', 'כיצד היית'
    ];
    const finish_with_question_mark = /[\?؟]$/.test(t);
    return cues.some(k => t.includes(k)) || finish_with_question_mark || t.length > 40; // יחסית פתוח/ארוך
}
