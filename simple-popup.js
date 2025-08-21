// Simple popup for Jobnick extension

let __JOBNICK_POPUP__;

class SimplePopup {
    constructor() {
        __JOBNICK_POPUP__ = this;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateStatus();
    }

    setupEventListeners() {
        // Fill Job button - executes the test upload functionality
        const fillJobBtn = document.getElementById('fillJobBtn');
        if (fillJobBtn) {
            fillJobBtn.addEventListener('click', () => {
              this.showStatusOnly('Processing...');
              this.fillJob();
            });
          }

        // Settings button - opens the full settings window
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }

        const msgBtn = document.getElementById('messageRecruiter');
        if (msgBtn) {
            msgBtn.addEventListener('click', () => this.messageRecruiterFlow());
        }

        const referralBtn = document.getElementById('requestReferral');
        if (referralBtn) {
            referralBtn.addEventListener('click', () => this.requestReferralFlow());
        }
    }

    async fillJob() {
        try {
            const statusEl = document.getElementById('statusText');
            statusEl.textContent = 'Starting smart job filling...';
            
            // Get the current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.showError('No active tab found');
                return;
            }
            // Update status to show what's happening
            statusEl.textContent = 'Analyzing form fields and filling with AI assistance...';
            this.showStatusOnly('Analyzing form fields and filling with AI assistance...');
            // Send message to content script to execute the smart job filling
            chrome.tabs.sendMessage(tab.id, {
                action: 'quickTestUpload'
            }, async (response) => {
                if (chrome.runtime.lastError) {
                    this.showError('Could not connect to page. Please refresh and try again.');
                    return;
                }

                if (response && response.success) {
                    // wait for 1 second
                    await this.delay(4000);
                    this.showStatusOnly('Job application completed successfully with AI!');
                    statusEl.textContent = 'Job application completed successfully with AI!';
                    document.getElementById('statusMessage').className = 'status ready';
                    
                    // Close popup after a longer delay to show success message
                    setTimeout(() => {
                        window.close();
                    }, 2500);
                } else {
                    this.showError(response?.error || 'Smart job filling process failed');
                }
            });

        } catch (error) {
            this.showError(`Error: ${error.message}`);
        }
    }
    async messageRecruiterFlow() {
        try {
          this.showStatusOnly('Detecting job & company...');
          let company = 'Unknown Company';

            // 1) הטאב הפעיל
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) { this.showError('No active tab found'); return; }

            // 2) חילוץ פרטי משרה מהעמוד הנוכחי
            const jobInfo = await new Promise((resolve) => {
                chrome.tabs.sendMessage(
                tab.id,
                { action: 'extractFromCurrentPageGeneric' },
                (res) => resolve(res && res.success ? (res.job || res.data) : null)
                );
            });
            

            if (!jobInfo) {
                this.showError('Could not detect job details on this page');
                return;
            }
            else {  
                await chrome.storage.local.set({ lastExtractedJobInfo: jobInfo });
                company = jobInfo.company;
            }
            if (company === 'Unknown Company') {
                this.showError('Could not detect job details on this page');
                return;
            }
          this.showStatusOnly(`Searching for HR recruiter at ${company}`);
          // 3) מעבר ללינקדאין באותו טאב
          const q = company !== 'Unknown Company' ? `HR ${company}` : 'HR recruiter';
          const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;
          this.showStatusOnly(`Opening LinkedIn, HR ${company || ''}`);
          this.sendDebug(`Opening LinkedIn, HR ${company || ''}`);
      
          await chrome.tabs.update(tab.id, { url });
      
          // 3.1 המתנה לטעינה מלאה
          await this.waitForTabComplete(tab.id, 10000);
          this.sendDebug(`Waiting for LinkedIn page to finish loading`);
      
          // 3.2 וידוא שסקריפט התוכן קיים, אם לא, הזרקה
          let hasCS = await this.pingContentScript(tab.id);
          this.sendDebug(`Content script available: ${hasCS}`);
          if (!hasCS) {
            try {
              this.sendDebug(`Injecting content script`);
              await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                files: ['ai_agent.js', 'content.js', 'simple-popup.js', 'popup.js', 'background.js', 'settings.js']
              });
              await this.delay(800);
              hasCS = await this.pingContentScript(tab.id);
              if (!hasCS) {
                this.showError('Could not load content script on LinkedIn page');
                return;
              }
            } catch (e) {
              this.sendDebug(`Error injecting content script: ${e.message}`);
              this.showError('Could not load content script on LinkedIn page');
              return;
            }
          }
      
          // 4) קריאה לפעולת הסריקה והטיוטה
          const payload = { company, job: jobInfo };
          this.sendDebug(`Calling recruiterScanAndDraft with payload: ${JSON.stringify(payload)}`);
          const result = await this.sendWithRetries(tab.id, { action: 'recruiterScanAndDraft', payload }, 3, 1000);
          this.sendDebug(`RecruiterScanAndDraft result: ${JSON.stringify(result)}`);
      
          if (result && result.success) {
            const data = result.result || result.data || {};
            const drafted = data.drafted ? `\n\n"${data.drafted}"` : '';
            const reason = data.reason ? ` (${data.reason})` : '';
            this.sendDebug(`Recruiter scan completed${reason}${drafted}`);
            // this.showStatusOnly(`Recruiter scan completed${reason}${drafted}`);
          } else {
            const error = result?.error || 'Recruiter scan failed';
            this.sendDebug(`Recruiter scan failed, ${error}`);
            this.showError(`Scan failed, ${error}`);
          }
      
        } catch (err) {
          this.showError(`Message Recruiter error, ${err?.message || err}`);
        }
    }

    async requestReferralFlow() {
        try {
            let company = 'Unknown Company';
            let jobTitle = 'Unknown Job';

            this.showStatusOnly('Detecting job & company...');
      
            // 1) Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) { this.showError('No active tab found'); return; }

            // 2) Extract job details from current page
            const jobInfo = await new Promise((resolve) => {
                chrome.tabs.sendMessage(
                tab.id,
                { action: 'extractFromCurrentPageGeneric' },
                (res) => resolve(res && res.success ? (res.job || res.data) : null)
                );
            });
            
            if (!jobInfo) {
                this.showError('Could not detect job details on this page, retrying...');
            }
            else {
                await chrome.storage.local.set({ lastExtractedJobInfo: jobInfo });
                company = jobInfo.company;
                jobTitle = jobInfo.title;
            }
        
            if (company === 'Unknown Company') {
                this.showError('Could not detect job details on this page');
                return;
            }
            // שלב גם את החברה וגם את המשרה אם קיימים
            let terms = '';
            if (company !== 'Unknown Company' && jobTitle !== 'Unknown Job') {
                terms = `"${company}" "${jobTitle}"`;
            } else if (company !== 'Unknown Company') {
                terms = `"${company}"`;
            } else if (jobTitle !== 'Unknown Job') {
                terms = `"${jobTitle}"`;
            } else {
                terms = 'connections';
            }
          this.showStatusOnly(`Searching for connections for ${terms}`);
          const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(terms)}&network=%5B%22F%22%5D&origin=FACETED_SEARCH`;          
          // this.showStatusOnly(`Opening LinkedIn, searching connections at ${company || 'your network'}`);
          this.sendDebug(`Opening LinkedIn, searching connections at ${company || 'your network'}`);
      
          await chrome.tabs.update(tab.id, { url });
      
          // 3.1 Wait for full loading
          this.showStatusOnly(`Waiting for LinkedIn page to finish loading`);
          await this.waitForTabComplete(tab.id, 10000);
          this.sendDebug(`Waiting for LinkedIn page to finish loading`);
      
          // 3.2 Ensure content script exists, inject if not
          let hasCS = await this.pingContentScript(tab.id);
          this.sendDebug(`Content script available: ${hasCS}`);
          if (!hasCS) {
            try {
              this.sendDebug(`Injecting content script`);
              await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                files: ['ai_agent.js', 'content.js', 'simple-popup.js', 'popup.js', 'background.js', 'settings.js']
              });
              await this.delay(800);
              hasCS = await this.pingContentScript(tab.id);
              if (!hasCS) {
                this.showError('Could not load content script on LinkedIn page');
                return;
              }
            } catch (e) {
              this.sendDebug(`Error injecting content script: ${e.message}`);
              this.showError('Could not load content script on LinkedIn page');
              return;
            }
          }
      
          // 4) Call the referral scan and draft action
          const payload = { company, job: jobInfo };
          this.sendDebug(`Calling referralScanAndDraft with payload: ${JSON.stringify(payload)}`);
          this.showStatusOnly(`Scanning for connections...`);
          const result = await this.sendWithRetries(tab.id, { action: 'referralScanAndDraft', payload }, 3, 1000);
          this.sendDebug(`ReferralScanAndDraft result: ${JSON.stringify(result)}`);
      
          if (result && result.success) {
            const data = result.result || result.data || {};
            const drafted = data.drafted ? `\n\n"${data.drafted}"` : '';
            const reason = data.reason ? ` (${data.reason})` : '';
            this.sendDebug(`Referral scan completed${reason}${drafted}`);
          
            if (data.reason === 'no_cards') {
              this.sendDebug('No connections found in your network, trying 2nd/3rd degree...', 'info');
              this.showStatusOnly('No 1st degree connections found, trying 2nd degree...');
          
              // 👇 העבר את tab.id ואת כל מה שצריך לפונקציה
              const secondPass = await this.generalReferralSearch(tab.id, jobInfo);
          
              // אופציונלי: חיווי לפי תוצאת הסיבוב השני
              if (secondPass && secondPass.success) {
                const d2 = secondPass.result || secondPass.data || {};
                const drafted2 = d2.drafted ? `\n\n"${d2.drafted}"` : '';
                const reason2  = d2.reason ? ` (${d2.reason})` : '';
                this.sendDebug(`Referral (2nd pass) completed${reason2}${drafted2}`);
              } else {
                const err2 = secondPass?.error || 'Referral (2nd pass) failed';
                this.sendDebug(`Referral (2nd pass) failed, ${err2}`);
                this.showStatusOnly(`Searching for connections only with company...`);
                // try search only with company
                const thirdPass = await this.generalReferralSearch(tab.id, jobInfo, company);
                if (thirdPass && thirdPass.success) {
                  const d3 = thirdPass.result || thirdPass.data || {};
                  const drafted3 = d3.drafted ? `\n\n"${d3.drafted}"` : '';
                  const reason3  = d3.reason ? ` (${d3.reason})` : '';
                  this.sendDebug(`Referral (3rd pass) completed${reason3}${drafted3}`);
                }
                else {
                  this.showError(`Referral (3rd pass) failed, ${thirdPass?.error || 'Unknown error'}`);
                }
              }
            }
          } else {
            const error = result?.error || 'Referral scan failed';
            this.sendDebug(`Referral scan failed, ${error}`);
            this.showError(`Scan failed, ${error}`);
          }
        } catch (err) {
            this.showError(`Referral request error, ${err?.message || err}`);
        }
    }
    // מחוץ ל-requestReferralFlow
    async generalReferralSearch(tabId, jobInfo, terms = '') {
        // בנה מילות חיפוש: "Company" "Job Title" (לפי מה שקיים)
        const jobTitle = (jobInfo?.title || jobInfo?.role || '').trim();
        const company  = (jobInfo?.company || '').trim();
        if (terms) {
            terms = terms.trim();
        } else if (company && jobTitle)      terms = `"${company}" "${jobTitle}"`;
        else if (company)             terms = `"${company}"`;
        else if (jobTitle)            terms = `"${jobTitle}"`;
        else                          terms = 'connections';
    
        // חיפוש People כללי, בלי פילטר 1st
        const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(terms)}&origin=FACETED_SEARCH`;
        this.sendDebug(`Opening LinkedIn (2nd pass), general People search: ${terms}`);
        await chrome.tabs.update(tabId, { url });
    
        // להמתין לטעינה ולוודא content script
        await this.waitForTabComplete(tabId, 10000);
        let hasCS = await this.pingContentScript(tabId);
        if (!hasCS) {
        try {
            this.sendDebug(`Injecting content script`);
            await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
            await this.delay(800);
            hasCS = await this.pingContentScript(tabId);
            if (!hasCS) {
            this.showError('Could not load content script on LinkedIn page (2nd pass)');
            return { success: false, error: 'content script missing' };
            }
        } catch (e) {
            this.sendDebug(`Error injecting content script: ${e.message}`);
            this.showError('Could not load content script on LinkedIn page (2nd pass)');
            return { success: false, error: e.message };
        }
        }
    
        // קריאה חוזרת ל-referralScanAndDraft (אותו payload)
        const payload = { company, job: jobInfo };
        this.sendDebug(`Calling referralScanAndDraft (2nd pass) with payload: ${JSON.stringify(payload)}`);
        const res = await this.sendWithRetries(tabId, { action: 'referralScanAndDraft', payload }, 3, 1000);
        this.sendDebug(`ReferralScanAndDraft (2nd pass) result: ${JSON.stringify(res)}`);
    
        return res;
    }
  
    // helpers
    delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    async waitForTabComplete(tabId, timeoutMs = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const tab = await chrome.tabs.get(tabId);
            this.sendDebug(`Tab status: ${tab.status}`);
            if (tab.status === 'complete') return true;
            this.sendDebug(`Waiting for tab to complete...`);
            await this.delay(250);
            this.sendDebug(`Has tab completed? ${tab.status === 'complete'}`);
        }
        this.delay(1000);
        return true; // continue even if not strictly 'complete'
    }
    
    async pingContentScript(tabId) {
        try {
        const res = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return !!res?.ready;
        } catch {
        return false;
        }
    }
    
    async sendWithRetries(tabId, message, tries = 3, gapMs = 800) {
        for (let i = 0; i < tries; i++) {
        try {
            const res = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, message, (r) => {
                // handle "Could not establish connection" gracefully
                if (chrome.runtime.lastError) return resolve(null);
                resolve(r);
            });
            });
            if (res) return res;
        } catch {}
        await this.delay(gapMs);
        }
        return null;
    }
    
    async openSettings() {
        try {
            // Open the full settings page
            chrome.tabs.create({
                url: chrome.runtime.getURL('settings.html')
            });
            // Close the popup
            window.close();
        } catch (error) {
            this.showError(`Error opening settings: ${error.message}`);
        }
    }

    async updateStatus() {
        try {
            // Check if resume file and profile data exist
            const { resumeFile } = await chrome.storage.local.get('resumeFile');
            const { profileData } = await chrome.storage.sync.get('profileData');
            const statusEl = document.getElementById('statusText');
            const statusMsg = document.getElementById('statusMessage');
            const hasResume = resumeFile && resumeFile.base64;
            const hasProfile = profileData && (profileData.fullName || profileData.email);
            
            if (hasResume && hasProfile) {
                statusEl.textContent = 'Profile and resume ready for job filling';
                statusMsg.className = 'status ready';
            } else if (hasResume && !hasProfile) {
                statusEl.textContent = 'Resume ready, missing profile data';
                statusMsg.className = 'status partial';
            } else if (!hasResume && hasProfile) {
                statusEl.textContent = 'Profile ready, missing resume file';
                statusMsg.className = 'status partial';
            } else {
                statusEl.textContent = 'Configure profile and upload resume in Settings';
                statusMsg.className = 'status incomplete';
            }
        } catch (error) {
            console.error('Error updating status:', error);
            statusEl.textContent = 'Smart job form detection ready';
            statusMsg.className = 'status ready';
        }
    }
    showStatusOnly(text) {
        const head   = document.querySelector('.head');
        const stack  = document.querySelector('.stack');
        const status = document.getElementById('statusMessage');
        const textEl = document.getElementById('statusText');
      
        // הסתירו הכל חוץ מהסטטוס
        if (head)  head.style.display  = 'none';
        if (stack) stack.style.display = 'none';
        if (status) {
          status.style.display = 'flex';
        }
        if (textEl && text) {
          textEl.textContent = text;
        }
        // הכניסו את הפופ‑אפ למצב קומפקטי — זה מקטין פיזית את חלון ה‑popup
        document.body.classList.add('compact');
        // רענון ל‑layout (טריק קטן)
        void document.body.offsetHeight;
      }
      
    showError(message) {
        const statusEl = document.getElementById('statusText');
        const statusMsg = document.getElementById('statusMessage');
        
        statusEl.textContent = message;
        statusMsg.className = 'status error';
        
        // Reset status after 3 seconds
        setTimeout(() => {
            this.updateStatus();
        }, 3000);
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
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (!__JOBNICK_POPUP__) return;
  
      if (msg.action === 'popupShowStatus') {
        __JOBNICK_POPUP__.showStatusOnly(msg.text || 'Working…');
        sendResponse?.({ ok: true });
        return true;
      }
  
      if (msg.action === 'popupSetText') {
        const textEl = document.getElementById('statusText');
        if (textEl) textEl.textContent = msg.text || '';
        sendResponse?.({ ok: true });
        return true;
      }
  
      if (msg.action === 'popupReset') {
        const head  = document.querySelector('.head');
        const stack = document.querySelector('.stack');
        if (head)  head.style.display  = '';
        if (stack) stack.style.display = '';
        document.getElementById('statusMessage')?.style?.removeProperty('display');
        document.body.classList.remove('compact');
        __JOBNICK_POPUP__.updateStatus?.();
        sendResponse?.({ ok: true });
        return true;
      }
    } catch (e) {
      sendResponse?.({ ok: false, error: e?.message || String(e) });
    }
  });

// Initialize the simple popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SimplePopup();
}); 