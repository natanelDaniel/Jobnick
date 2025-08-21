// Planner Agent - Plans the next steps for job search
export class PlannerAgent {
    constructor() {
        this.currentState = 'initialized';
        this.plan = [];
        this.currentStep = 0;
        this.maxSteps = 100; // Prevent infinite loops
    }

    async createPlan(context) {
        try {
            console.log('Planner Agent: Creating new plan...');
            
            const plan = await this.generatePlanWithAI(context);
            this.plan = plan;
            this.currentStep = 0;
            this.currentState = 'planning';
            
            console.log('Planner Agent: Plan created with', this.plan.length, 'steps');
            return plan;
        } catch (error) {
            console.error('Planner Agent: Error creating plan:', error);
            return this.createFallbackPlan(context);
        }
    }

    async generatePlanWithAI(context) {
        // This will use Gemini to create a smart plan
        const prompt = `
        You are a job search planning AI. Create a step-by-step plan for finding and applying to jobs on LinkedIn.

        Current Context:
        - Page Type: ${context.pageType}
        - Current URL: ${context.url}
        - Jobs Found: ${context.jobsFound}
        - User Preferences: ${JSON.stringify(context.preferences)}
        - Search Query: ${context.searchQuery}
        - Location: ${context.location}

        Create a plan with these possible actions:
        1. SEARCH_JOBS - Perform a job search
        2. EXTRACT_JOBS - Extract job listings from current page
        3. ANALYZE_JOB - Analyze a specific job for fit
        4. APPLY_TO_JOB - Apply to a job
        5. NAVIGATE_NEXT_PAGE - Go to next page of results
        6. SCROLL_PAGE - Scroll down to load more jobs
        7. GO_BACK - Go back to search results
        8. WAIT - Wait for page to load
        9. COMPLETE - Job search is complete

        Respond with a JSON array of steps:
        [
            {
                "action": "SEARCH_JOBS",
                "description": "Search for jobs with user preferences",
                "parameters": {"query": "algorithm engineer", "location": "Israel"},
                "expectedOutcome": "Job search results page loaded"
            }
        ]
        `;

        // For now, return a basic plan - later we'll integrate with Gemini
        return this.createBasicPlan(context);
    }

    createBasicPlan(context) {
        const plan = [];
        
        if (context.pageType === 'unknown' || !context.url.includes('linkedin.com')) {
            plan.push({
                action: 'NAVIGATE_TO_LINKEDIN',
                description: 'Navigate to LinkedIn Jobs page',
                parameters: {},
                expectedOutcome: 'LinkedIn Jobs page loaded'
            });
        }
        
        if (context.jobsFound === 0) {
            plan.push({
                action: 'SEARCH_JOBS',
                description: 'Perform job search with user preferences',
                parameters: {
                    query: context.searchQuery || 'software engineer',
                    location: context.location || 'Israel'
                },
                expectedOutcome: 'Job search results loaded'
            });
            
            plan.push({
                action: 'WAIT',
                description: 'Wait for search results to load',
                parameters: { duration: 5000 },
                expectedOutcome: 'Page fully loaded'
            });
        }
        
        plan.push({
            action: 'EXTRACT_JOBS',
            description: 'Extract job listings from current page',
            parameters: {},
            expectedOutcome: 'Job data extracted'
        });
        
        plan.push({
            action: 'ANALYZE_JOBS',
            description: 'Analyze all jobs for fit',
            parameters: {},
            expectedOutcome: 'Jobs analyzed and ranked'
        });
        
        plan.push({
            action: 'APPLY_TO_BEST_JOBS',
            description: 'Apply to best matching jobs',
            parameters: { maxApplications: 5 },
            expectedOutcome: 'Applications submitted'
        });
        
        plan.push({
            action: 'NAVIGATE_NEXT_PAGE',
            description: 'Go to next page of results',
            parameters: {},
            expectedOutcome: 'Next page loaded'
        });
        
        return plan;
    }

    createFallbackPlan(context) {
        console.log('Planner Agent: Using fallback plan');
        return [
            {
                action: 'SEARCH_JOBS',
                description: 'Basic job search',
                parameters: { query: 'software engineer', location: 'Israel' },
                expectedOutcome: 'Search performed'
            },
            {
                action: 'EXTRACT_JOBS',
                description: 'Extract jobs',
                parameters: {},
                expectedOutcome: 'Jobs extracted'
            }
        ];
    }

    getNextStep() {
        if (this.currentStep >= this.plan.length) {
            return null; // Plan completed
        }
        
        if (this.currentStep >= this.maxSteps) {
            console.log('Planner Agent: Max steps reached, stopping');
            return null;
        }
        
        const step = this.plan[this.currentStep];
        this.currentStep++;
        
        console.log(`Planner Agent: Next step ${this.currentStep}/${this.plan.length}:`, step.action);
        return step;
    }

    updatePlan(context) {
        // Dynamically update plan based on current context
        if (context.jobsFound > 0 && this.plan.length === 0) {
            console.log('Planner Agent: Jobs found, updating plan...');
            this.plan = this.createBasicPlan(context);
            this.currentStep = 0;
        }
    }

    isPlanComplete() {
        return this.currentStep >= this.plan.length;
    }

    getCurrentStep() {
        return this.currentStep;
    }

    getTotalSteps() {
        return this.plan.length;
    }

    reset() {
        this.currentStep = 0;
        this.plan = [];
        this.currentState = 'initialized';
    }
} 