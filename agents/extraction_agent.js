// Extraction Agent - Extracts content from LinkedIn pages
export class ExtractionAgent {
    constructor() {
        this.extractionHistory = [];
        this.currentPage = null;
    }

    async extractPageContent(pageType, context = {}) {
        try {
            console.log(`Extraction Agent: Extracting content from ${pageType} page...`);
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found');
            }
            
            let result;
            switch (pageType) {
                case 'jobSearch':
                    result = await this.extractJobSearchContent(tabs[0].id);
                    break;
                    
                case 'individualJob':
                    result = await this.extractIndividualJobContent(tabs[0].id);
                    break;
                    
                case 'companyPage':
                    result = await this.extractCompanyPageContent(tabs[0].id);
                    break;
                    
                default:
                    result = await this.extractGenericContent(tabs[0].id);
            }
            
            // Record extraction
            this.extractionHistory.push({
                pageType: pageType,
                timestamp: Date.now(),
                success: result.success,
                dataSize: result.data ? JSON.stringify(result.data).length : 0
            });
            
            return result;
            
        } catch (error) {
            console.error(`Extraction Agent: Error extracting ${pageType} content:`, error);
            return {
                success: false,
                error: error.message,
                pageType: pageType
            };
        }
    }

    async extractJobSearchContent(tabId) {
        try {
            console.log('Extraction Agent: Extracting job search content...');
            
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'extractJobListings'
            });
            
            if (response && response.jobs) {
                console.log(`Extraction Agent: Successfully extracted ${response.jobs.length} jobs`);
                
                // Enrich job data with additional information
                const enrichedJobs = await this.enrichJobData(response.jobs, tabId);
                
                return {
                    success: true,
                    pageType: 'jobSearch',
                    jobs: enrichedJobs,
                    count: enrichedJobs.length,
                    timestamp: Date.now()
                };
            } else {
                throw new Error('No jobs extracted from response');
            }
        } catch (error) {
            throw new Error(`Job search extraction failed: ${error.message}`);
        }
    }

    async extractIndividualJobContent(tabId) {
        try {
            console.log('Extraction Agent: Extracting individual job content...');
            
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'extractIndividualJobData'
            });
            
            if (response && response.jobData) {
                console.log('Extraction Agent: Successfully extracted individual job data');
                
                // Enrich individual job data
                const enrichedJob = await this.enrichIndividualJobData(response.jobData, tabId);
                
                return {
                    success: true,
                    pageType: 'individualJob',
                    job: enrichedJob,
                    timestamp: Date.now()
                };
            } else {
                throw new Error('No individual job data extracted');
            }
        } catch (error) {
            throw new Error(`Individual job extraction failed: ${error.message}`);
        }
    }

    async extractCompanyPageContent(tabId) {
        try {
            console.log('Extraction Agent: Extracting company page content...');
            
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'extractCompanyData'
            });
            
            if (response && response.companyData) {
                console.log('Extraction Agent: Successfully extracted company data');
                return {
                    success: true,
                    pageType: 'companyPage',
                    company: response.companyData,
                    timestamp: Date.now()
                };
            } else {
                throw new Error('No company data extracted');
            }
        } catch (error) {
            throw new Error(`Company page extraction failed: ${error.message}`);
        }
    }

    async extractGenericContent(tabId) {
        try {
            console.log('Extraction Agent: Extracting generic page content...');
            
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'extractGenericContent'
            });
            
            if (response && response.content) {
                console.log('Extraction Agent: Successfully extracted generic content');
                return {
                    success: true,
                    pageType: 'generic',
                    content: response.content,
                    timestamp: Date.now()
                };
            } else {
                throw new Error('No generic content extracted');
            }
        } catch (error) {
            throw new Error(`Generic content extraction failed: ${error.message}`);
        }
    }

    async enrichJobData(jobs, tabId) {
        try {
            console.log('Extraction Agent: Enriching job data...');
            
            const enrichedJobs = [];
            
            for (const job of jobs) {
                const enrichedJob = {
                    ...job,
                    extractedAt: Date.now(),
                    pageUrl: await this.getCurrentPageUrl(tabId),
                    metadata: await this.extractJobMetadata(job, tabId)
                };
                
                enrichedJobs.push(enrichedJob);
            }
            
            return enrichedJobs;
        } catch (error) {
            console.error('Extraction Agent: Error enriching job data:', error);
            return jobs; // Return original jobs if enrichment fails
        }
    }

    async enrichIndividualJobData(job, tabId) {
        try {
            console.log('Extraction Agent: Enriching individual job data...');
            
            const enrichedJob = {
                ...job,
                extractedAt: Date.now(),
                pageUrl: await this.getCurrentPageUrl(tabId),
                fullDescription: await this.extractFullJobDescription(tabId),
                requirements: await this.extractJobRequirements(tabId),
                benefits: await this.extractJobBenefits(tabId),
                salary: await this.extractJobSalary(tabId),
                companyInfo: await this.extractCompanyInfo(tabId)
            };
            
            return enrichedJob;
        } catch (error) {
            console.error('Extraction Agent: Error enriching individual job data:', error);
            return job; // Return original job if enrichment fails
        }
    }

    async extractJobMetadata(job, tabId) {
        try {
            // Extract additional metadata for each job
            const metadata = {
                hasApplyButton: false,
                isEasyApply: false,
                jobLevel: this.determineJobLevel(job.title),
                remoteWork: this.determineRemoteWork(job.location),
                urgency: this.determineUrgency(job)
            };
            
            return metadata;
        } catch (error) {
            console.error('Extraction Agent: Error extracting job metadata:', error);
            return {};
        }
    }

    async extractFullJobDescription(tabId) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'extractJobDescription'
            });
            
            return response && response.description ? response.description : '';
        } catch (error) {
            console.error('Extraction Agent: Error extracting job description:', error);
            return '';
        }
    }

    async extractJobRequirements(tabId) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'extractJobRequirements'
            });
            
            return response && response.requirements ? response.requirements : '';
        } catch (error) {
            console.error('Extraction Agent: Error extracting job requirements:', error);
            return '';
        }
    }

    async extractJobBenefits(tabId) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'extractJobBenefits'
            });
            
            return response && response.benefits ? response.benefits : '';
        } catch (error) {
            console.error('Extraction Agent: Error extracting job benefits:', error);
            return '';
        }
    }

    async extractJobSalary(tabId) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'extractJobSalary'
            });
            
            return response && response.salary ? response.salary : '';
        } catch (error) {
            console.error('Extraction Agent: Error extracting job salary:', error);
            return '';
        }
    }

    async extractCompanyInfo(tabId) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'extractCompanyInfo'
            });
            
            return response && response.companyInfo ? response.companyInfo : {};
        } catch (error) {
            console.error('Extraction Agent: Error extracting company info:', error);
            return {};
        }
    }

    async getCurrentPageUrl(tabId) {
        try {
            const tab = await chrome.tabs.get(tabId);
            return tab.url;
        } catch (error) {
            console.error('Extraction Agent: Error getting current page URL:', error);
            return '';
        }
    }

    determineJobLevel(title) {
        const titleLower = title.toLowerCase();
        
        if (titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('principal')) {
            return 'senior';
        } else if (titleLower.includes('junior') || titleLower.includes('entry') || titleLower.includes('associate')) {
            return 'junior';
        } else if (titleLower.includes('manager') || titleLower.includes('director') || titleLower.includes('head')) {
            return 'management';
        } else {
            return 'mid';
        }
    }

    determineRemoteWork(location) {
        const locationLower = location.toLowerCase();
        
        if (locationLower.includes('remote') || locationLower.includes('work from home')) {
            return 'remote';
        } else if (locationLower.includes('hybrid')) {
            return 'hybrid';
        } else {
            return 'onsite';
        }
    }

    determineUrgency(job) {
        // Analyze job posting for urgency indicators
        const titleLower = job.title.toLowerCase();
        const description = (job.description || '').toLowerCase();
        
        if (titleLower.includes('urgent') || titleLower.includes('immediate') || 
            description.includes('urgent') || description.includes('immediate')) {
            return 'high';
        } else if (titleLower.includes('asap') || description.includes('asap')) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    getExtractionHistory() {
        return this.extractionHistory;
    }

    getCurrentPage() {
        return this.currentPage;
    }

    reset() {
        this.extractionHistory = [];
        this.currentPage = null;
    }
} 