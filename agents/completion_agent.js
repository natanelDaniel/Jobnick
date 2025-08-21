// Completion Agent - Determines when job search is complete
export class CompletionAgent {
    constructor() {
        this.completionCriteria = {
            maxJobsFound: 100,
            maxApplications: 20,
            maxPages: 10,
            maxTimeMinutes: 60,
            minJobQuality: 70
        };
        this.searchStartTime = null;
        this.currentStats = {
            jobsFound: 0,
            jobsAnalyzed: 0,
            applicationsSubmitted: 0,
            pagesVisited: 0,
            timeElapsed: 0
        };
        this.completionHistory = [];
    }

    startSearch() {
        this.searchStartTime = Date.now();
        this.currentStats = {
            jobsFound: 0,
            jobsAnalyzed: 0,
            applicationsSubmitted: 0,
            pagesVisited: 0,
            timeElapsed: 0
        };
        console.log('Completion Agent: Job search started');
    }

    updateStats(stats) {
        this.currentStats = { ...this.currentStats, ...stats };
        this.currentStats.timeElapsed = this.searchStartTime ? 
            Math.floor((Date.now() - this.searchStartTime) / 60000) : 0;
        
        console.log('Completion Agent: Stats updated:', this.currentStats);
    }

    async checkCompletion(context = {}) {
        try {
            console.log('Completion Agent: Checking completion criteria...');
            
            const completionCheck = {
                shouldComplete: false,
                reason: '',
                criteria: {},
                recommendations: []
            };
            
            // Check each completion criterion
            const criteriaChecks = await this.checkAllCriteria(context);
            
            // Determine if we should complete
            const failedCriteria = criteriaChecks.filter(check => check.failed);
            if (failedCriteria.length > 0) {
                completionCheck.shouldComplete = true;
                completionCheck.reason = `Completion criteria met: ${failedCriteria.map(c => c.reason).join(', ')}`;
                completionCheck.criteria = criteriaChecks;
            }
            
            // Check for exceptional conditions
            const exceptionalConditions = await this.checkExceptionalConditions(context);
            if (exceptionalConditions.shouldComplete) {
                completionCheck.shouldComplete = true;
                completionCheck.reason = exceptionalConditions.reason;
                completionCheck.recommendations = exceptionalConditions.recommendations;
            }
            
            // Record completion check
            this.completionHistory.push({
                timestamp: Date.now(),
                stats: { ...this.currentStats },
                shouldComplete: completionCheck.shouldComplete,
                reason: completionCheck.reason
            });
            
            return completionCheck;
            
        } catch (error) {
            console.error('Completion Agent: Error checking completion:', error);
            return {
                shouldComplete: false,
                reason: 'Error checking completion',
                error: error.message
            };
        }
    }

    async checkAllCriteria(context) {
        const criteriaChecks = [];
        
        // Check max jobs found
        if (this.currentStats.jobsFound >= this.completionCriteria.maxJobsFound) {
            criteriaChecks.push({
                criterion: 'maxJobsFound',
                failed: true,
                reason: `Found ${this.currentStats.jobsFound} jobs (max: ${this.completionCriteria.maxJobsFound})`,
                current: this.currentStats.jobsFound,
                limit: this.completionCriteria.maxJobsFound
            });
        } else {
            criteriaChecks.push({
                criterion: 'maxJobsFound',
                failed: false,
                reason: `Found ${this.currentStats.jobsFound} jobs (max: ${this.completionCriteria.maxJobsFound})`,
                current: this.currentStats.jobsFound,
                limit: this.completionCriteria.maxJobsFound
            });
        }
        
        // Check max applications
        if (this.currentStats.applicationsSubmitted >= this.completionCriteria.maxApplications) {
            criteriaChecks.push({
                criterion: 'maxApplications',
                failed: true,
                reason: `Submitted ${this.currentStats.applicationsSubmitted} applications (max: ${this.completionCriteria.maxApplications})`,
                current: this.currentStats.applicationsSubmitted,
                limit: this.completionCriteria.maxApplications
            });
        } else {
            criteriaChecks.push({
                criterion: 'maxApplications',
                failed: false,
                reason: `Submitted ${this.currentStats.applicationsSubmitted} applications (max: ${this.completionCriteria.maxApplications})`,
                current: this.currentStats.applicationsSubmitted,
                limit: this.completionCriteria.maxApplications
            });
        }
        
        // Check max pages
        if (this.currentStats.pagesVisited >= this.completionCriteria.maxPages) {
            criteriaChecks.push({
                criterion: 'maxPages',
                failed: true,
                reason: `Visited ${this.currentStats.pagesVisited} pages (max: ${this.completionCriteria.maxPages})`,
                current: this.currentStats.pagesVisited,
                limit: this.completionCriteria.maxPages
            });
        } else {
            criteriaChecks.push({
                criterion: 'maxPages',
                failed: false,
                reason: `Visited ${this.currentStats.pagesVisited} pages (max: ${this.completionCriteria.maxPages})`,
                current: this.currentStats.pagesVisited,
                limit: this.completionCriteria.maxPages
            });
        }
        
        // Check max time
        if (this.currentStats.timeElapsed >= this.completionCriteria.maxTimeMinutes) {
            criteriaChecks.push({
                criterion: 'maxTime',
                failed: true,
                reason: `Elapsed ${this.currentStats.timeElapsed} minutes (max: ${this.completionCriteria.maxTimeMinutes})`,
                current: this.currentStats.timeElapsed,
                limit: this.completionCriteria.maxTimeMinutes
            });
        } else {
            criteriaChecks.push({
                criterion: 'maxTime',
                failed: false,
                reason: `Elapsed ${this.currentStats.timeElapsed} minutes (max: ${this.completionCriteria.maxTimeMinutes})`,
                current: this.currentStats.timeElapsed,
                limit: this.completionCriteria.maxTimeMinutes
            });
        }
        
        // Check job quality (if we have analyzed jobs)
        if (this.currentStats.jobsAnalyzed > 0) {
            const qualityCheck = await this.checkJobQuality(context);
            criteriaChecks.push(qualityCheck);
        }
        
        return criteriaChecks;
    }

    async checkExceptionalConditions(context) {
        const exceptionalConditions = {
            shouldComplete: false,
            reason: '',
            recommendations: []
        };
        
        // Check if we're getting low-quality results
        if (context.jobs && context.jobs.length > 0) {
            const lowQualityJobs = context.jobs.filter(job => 
                job.analysis && job.analysis.score < this.completionCriteria.minJobQuality
            );
            
            if (lowQualityJobs.length > 10) {
                exceptionalConditions.shouldComplete = true;
                exceptionalConditions.reason = 'Too many low-quality jobs found';
                exceptionalConditions.recommendations.push('Consider refining search criteria');
                exceptionalConditions.recommendations.push('Try different keywords or location');
            }
        }
        
        // Check if we're stuck on the same page
        if (context.currentPage && context.pagesVisited > 3) {
            if (context.currentPage === context.previousPage) {
                exceptionalConditions.shouldComplete = true;
                exceptionalConditions.reason = 'Stuck on the same page';
                exceptionalConditions.recommendations.push('Navigation issue detected');
                exceptionalConditions.recommendations.push('Consider manual intervention');
            }
        }
        
        // Check if no new jobs are being found
        if (context.jobsFound > 0 && context.jobsFound === context.previousJobsFound) {
            if (context.pagesVisited > 2) {
                exceptionalConditions.shouldComplete = true;
                exceptionalConditions.reason = 'No new jobs found on recent pages';
                exceptionalConditions.recommendations.push('Search results may be exhausted');
                exceptionalConditions.recommendations.push('Consider different search terms');
            }
        }
        
        return exceptionalConditions;
    }

    async checkJobQuality(context) {
        try {
            if (!context.jobs || context.jobs.length === 0) {
                return {
                    criterion: 'jobQuality',
                    failed: false,
                    reason: 'No jobs to analyze',
                    current: 0,
                    limit: this.completionCriteria.minJobQuality
                };
            }
            
            const analyzedJobs = context.jobs.filter(job => job.analysis && job.analysis.score);
            if (analyzedJobs.length === 0) {
                return {
                    criterion: 'jobQuality',
                    failed: false,
                    reason: 'No jobs analyzed yet',
                    current: 0,
                    limit: this.completionCriteria.minJobQuality
                };
            }
            
            const averageScore = analyzedJobs.reduce((sum, job) => sum + job.analysis.score, 0) / analyzedJobs.length;
            const highQualityJobs = analyzedJobs.filter(job => job.analysis.score >= this.completionCriteria.minJobQuality);
            
            if (highQualityJobs.length === 0 && analyzedJobs.length >= 5) {
                return {
                    criterion: 'jobQuality',
                    failed: true,
                    reason: `No high-quality jobs found (avg score: ${averageScore.toFixed(1)})`,
                    current: averageScore,
                    limit: this.completionCriteria.minJobQuality
                };
            } else {
                return {
                    criterion: 'jobQuality',
                    failed: false,
                    reason: `Found ${highQualityJobs.length} high-quality jobs (avg score: ${averageScore.toFixed(1)})`,
                    current: averageScore,
                    limit: this.completionCriteria.minJobQuality
                };
            }
        } catch (error) {
            console.error('Completion Agent: Error checking job quality:', error);
            return {
                criterion: 'jobQuality',
                failed: false,
                reason: 'Error checking job quality',
                current: 0,
                limit: this.completionCriteria.minJobQuality
            };
        }
    }

    generateCompletionReport() {
        try {
            const report = {
                timestamp: Date.now(),
                searchDuration: this.currentStats.timeElapsed,
                finalStats: { ...this.currentStats },
                completionHistory: this.completionHistory,
                summary: this.generateSummary()
            };
            
            console.log('Completion Agent: Generated completion report');
            return report;
            
        } catch (error) {
            console.error('Completion Agent: Error generating completion report:', error);
            return {
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    generateSummary() {
        const summary = {
            totalJobsFound: this.currentStats.jobsFound,
            totalApplications: this.currentStats.applicationsSubmitted,
            searchEfficiency: this.currentStats.jobsFound > 0 ? 
                (this.currentStats.applicationsSubmitted / this.currentStats.jobsFound * 100).toFixed(1) + '%' : '0%',
            timeEfficiency: this.currentStats.timeElapsed > 0 ? 
                (this.currentStats.jobsFound / this.currentStats.timeElapsed).toFixed(1) + ' jobs/minute' : '0 jobs/minute',
            recommendations: []
        };
        
        // Generate recommendations based on results
        if (this.currentStats.applicationsSubmitted === 0) {
            summary.recommendations.push('No applications submitted - consider adjusting search criteria');
        }
        
        if (this.currentStats.jobsFound < 10) {
            summary.recommendations.push('Few jobs found - try broader search terms');
        }
        
        if (this.currentStats.timeElapsed > 30) {
            summary.recommendations.push('Search took a long time - consider more specific criteria');
        }
        
        return summary;
    }

    setCompletionCriteria(criteria) {
        this.completionCriteria = { ...this.completionCriteria, ...criteria };
        console.log('Completion Agent: Completion criteria updated:', this.completionCriteria);
    }

    getCurrentStats() {
        return { ...this.currentStats };
    }

    getCompletionHistory() {
        return [...this.completionHistory];
    }

    reset() {
        this.searchStartTime = null;
        this.currentStats = {
            jobsFound: 0,
            jobsAnalyzed: 0,
            applicationsSubmitted: 0,
            pagesVisited: 0,
            timeElapsed: 0
        };
        this.completionHistory = [];
        console.log('Completion Agent: Reset completed');
    }
} 