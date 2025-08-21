// Execution Agent - Executes planned actions
export class ExecutionAgent {
    constructor() {
        this.currentAction = null;
        this.isExecuting = false;
        this.executionHistory = [];
    }

    async executeAction(action, context) {
        try {
            console.log(`Execution Agent: Executing action: ${action.action}`);
            this.currentAction = action;
            this.isExecuting = true;
            
            const result = await this.performAction(action, context);
            
            // Record execution
            this.executionHistory.push({
                action: action.action,
                timestamp: Date.now(),
                success: result.success,
                result: result
            });
            
            this.isExecuting = false;
            return result;
            
        } catch (error) {
            console.error(`Execution Agent: Error executing ${action.action}:`, error);
            this.isExecuting = false;
            return {
                success: false,
                error: error.message,
                action: action.action
            };
        }
    }

    async performAction(action, context) {
        switch (action.action) {
            case 'NAVIGATE_TO_LINKEDIN':
                return await this.navigateToLinkedIn();
                
            case 'SEARCH_JOBS':
                return await this.searchJobs(action.parameters);
                
            case 'EXTRACT_JOBS':
                return await this.extractJobs();
                
            case 'ANALYZE_JOBS':
                return await this.analyzeJobs(context.jobs);
                
            case 'APPLY_TO_BEST_JOBS':
                return await this.applyToBestJobs(action.parameters.maxApplications);
                
            case 'NAVIGATE_NEXT_PAGE':
                return await this.navigateNextPage();
                
            case 'SCROLL_PAGE':
                return await this.scrollPage();
                
            case 'GO_BACK':
                return await this.goBack();
                
            case 'WAIT':
                return await this.wait(action.parameters.duration);
                
            case 'COMPLETE':
                return await this.complete();
                
            default:
                return {
                    success: false,
                    error: `Unknown action: ${action.action}`
                };
        }
    }

    async navigateToLinkedIn() {
        try {
            console.log('Execution Agent: Navigating to LinkedIn Jobs...');
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found');
            }
            
            const linkedInJobsUrl = 'https://www.linkedin.com/jobs/';
            await chrome.tabs.update(tabs[0].id, { url: linkedInJobsUrl });
            
            // Wait for navigation
            await this.delay(5000);
            
            return {
                success: true,
                message: 'Successfully navigated to LinkedIn Jobs',
                url: linkedInJobsUrl
            };
        } catch (error) {
            throw new Error(`Navigation failed: ${error.message}`);
        }
    }

    async searchJobs(parameters) {
        try {
            console.log('Execution Agent: Searching for jobs with parameters:', parameters);
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found');
            }
            
            // Send search request to content script
            const response = await chrome.tabs.sendMessage(tabs[0].id, {
                action: 'performJobSearch',
                searchData: parameters
            });
            
            if (response && response.success) {
                console.log('Execution Agent: Job search completed successfully');
                return {
                    success: true,
                    message: 'Job search completed',
                    searchQuery: parameters.query,
                    location: parameters.location
                };
            } else {
                throw new Error('Job search failed in content script');
            }
        } catch (error) {
            throw new Error(`Job search failed: ${error.message}`);
        }
    }

    async extractJobs() {
        try {
            console.log('Execution Agent: Extracting job listings...');
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found');
            }
            
            const response = await chrome.tabs.sendMessage(tabs[0].id, {
                action: 'extractJobListings'
            });
            
            if (response && response.jobs) {
                console.log(`Execution Agent: Successfully extracted ${response.jobs.length} jobs`);
                return {
                    success: true,
                    jobs: response.jobs,
                    count: response.jobs.length
                };
            } else {
                throw new Error('No jobs extracted');
            }
        } catch (error) {
            throw new Error(`Job extraction failed: ${error.message}`);
        }
    }

    async analyzeJobs(jobs) {
        try {
            console.log(`Execution Agent: Analyzing ${jobs.length} jobs...`);
            
            // This will be handled by the Analysis Agent
            return {
                success: true,
                message: 'Jobs sent for analysis',
                jobCount: jobs.length
            };
        } catch (error) {
            throw new Error(`Job analysis failed: ${error.message}`);
        }
    }

    async applyToBestJobs(maxApplications) {
        try {
            console.log(`Execution Agent: Applying to best jobs (max: ${maxApplications})...`);
            
            // This will be handled by the Application Agent
            return {
                success: true,
                message: 'Applications initiated',
                maxApplications: maxApplications
            };
        } catch (error) {
            throw new Error(`Job applications failed: ${error.message}`);
        }
    }

    async navigateNextPage() {
        try {
            console.log('Execution Agent: Navigating to next page...');
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found');
            }
            
            const response = await chrome.tabs.sendMessage(tabs[0].id, {
                action: 'navigateToNextPage'
            });
            
            if (response && response.success) {
                await this.delay(3000); // Wait for page to load
                return {
                    success: true,
                    message: 'Successfully navigated to next page'
                };
            } else {
                throw new Error('Navigation to next page failed');
            }
        } catch (error) {
            throw new Error(`Next page navigation failed: ${error.message}`);
        }
    }

    async scrollPage() {
        try {
            console.log('Execution Agent: Scrolling page to load more jobs...');
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found');
            }
            
            const response = await chrome.tabs.sendMessage(tabs[0].id, {
                action: 'scrollPage'
            });
            
            if (response && response.success) {
                await this.delay(2000); // Wait for content to load
                return {
                    success: true,
                    message: 'Page scrolled successfully'
                };
            } else {
                throw new Error('Page scrolling failed');
            }
        } catch (error) {
            throw new Error(`Page scrolling failed: ${error.message}`);
        }
    }

    async goBack() {
        try {
            console.log('Execution Agent: Going back to search results...');
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found');
            }
            
            const response = await chrome.tabs.sendMessage(tabs[0].id, {
                action: 'goBackToSearchResults'
            });
            
            if (response && response.success) {
                await this.delay(3000); // Wait for page to load
                return {
                    success: true,
                    message: 'Successfully went back to search results'
                };
            } else {
                throw new Error('Going back failed');
            }
        } catch (error) {
            throw new Error(`Going back failed: ${error.message}`);
        }
    }

    async wait(duration) {
        try {
            console.log(`Execution Agent: Waiting for ${duration}ms...`);
            await this.delay(duration);
            return {
                success: true,
                message: `Waited for ${duration}ms`
            };
        } catch (error) {
            throw new Error(`Wait failed: ${error.message}`);
        }
    }

    async complete() {
        try {
            console.log('Execution Agent: Job search completed');
            return {
                success: true,
                message: 'Job search process completed',
                completed: true
            };
        } catch (error) {
            throw new Error(`Completion failed: ${error.message}`);
        }
    }

    getExecutionHistory() {
        return this.executionHistory;
    }

    getCurrentAction() {
        return this.currentAction;
    }

    isCurrentlyExecuting() {
        return this.isExecuting;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
} 