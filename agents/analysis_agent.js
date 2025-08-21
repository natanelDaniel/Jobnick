// Analysis Agent - Analyzes job fit using AI
export class AnalysisAgent {
    constructor(geminiApiKey) {
        this.geminiApiKey = geminiApiKey;
        this.analysisHistory = [];
        this.currentAnalysis = null;
    }

    async analyzeJobFit(job, userProfile, userPreferences) {
        try {
            console.log(`Analysis Agent: Analyzing job fit for: ${job.title}`);
            this.currentAnalysis = {
                jobId: job.id,
                jobTitle: job.title,
                startTime: Date.now()
            };
            
            const analysis = await this.performAIAnalysis(job, userProfile, userPreferences);
            
            // Record analysis
            this.analysisHistory.push({
                jobId: job.id,
                jobTitle: job.title,
                timestamp: Date.now(),
                analysis: analysis,
                success: analysis.success
            });
            
            this.currentAnalysis = null;
            return analysis;
            
        } catch (error) {
            console.error(`Analysis Agent: Error analyzing job ${job.title}:`, error);
            this.currentAnalysis = null;
            return {
                success: false,
                error: error.message,
                shouldApply: false,
                confidence: 0,
                score: 0
            };
        }
    }

    async analyzeMultipleJobs(jobs, userProfile, userPreferences) {
        try {
            console.log(`Analysis Agent: Analyzing ${jobs.length} jobs for fit...`);
            
            const analyses = [];
            const batchSize = 3; // Process jobs in batches to avoid overwhelming the API
            
            for (let i = 0; i < jobs.length; i += batchSize) {
                const batch = jobs.slice(i, i + batchSize);
                console.log(`Analysis Agent: Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(jobs.length/batchSize)}`);
                
                const batchAnalyses = await Promise.all(
                    batch.map(job => this.analyzeJobFit(job, userProfile, userPreferences))
                );
                
                analyses.push(...batchAnalyses);
                
                // Wait between batches to avoid rate limiting
                if (i + batchSize < jobs.length) {
                    await this.delay(2000);
                }
            }
            
            // Rank jobs by fit score
            const rankedJobs = this.rankJobsByFit(jobs, analyses);
            
            console.log(`Analysis Agent: Completed analysis of ${jobs.length} jobs`);
            return {
                success: true,
                analyses: analyses,
                rankedJobs: rankedJobs,
                totalJobs: jobs.length
            };
            
        } catch (error) {
            console.error('Analysis Agent: Error analyzing multiple jobs:', error);
            return {
                success: false,
                error: error.message,
                analyses: [],
                rankedJobs: []
            };
        }
    }

    async performAIAnalysis(job, userProfile, userPreferences) {
        try {
            if (!this.geminiApiKey) {
                throw new Error('Gemini API key not configured');
            }

            // Prepare the prompt for Gemini
            const prompt = this.createAnalysisPrompt(job, userProfile, userPreferences);
            
            // Call Gemini API
            const aiResponse = await this.callGeminiAPI(prompt);
            
            // Parse the response
            const analysis = this.parseAIResponse(aiResponse);
            
            // Add job metadata
            analysis.jobId = job.id;
            analysis.jobTitle = job.title;
            analysis.company = job.company;
            analysis.location = job.location;
            analysis.analysisTimestamp = Date.now();
            
            return analysis;
            
        } catch (error) {
            console.error('Analysis Agent: Error in AI analysis:', error);
            throw error;
        }
    }

    createAnalysisPrompt(job, userProfile, userPreferences) {
        return `
        Analyze this job posting and determine if it's a good fit for the candidate.

        CANDIDATE PROFILE:
        - Name: ${userProfile.fullName || 'Not specified'}
        - Current Company: ${userProfile.currentCompany || 'Not specified'}
        - Location: ${userProfile.location || 'Not specified'}
        - Experience Level: ${userPreferences.experienceLevel || 'Any'}

        JOB PREFERENCES:
        - Desired Job Titles: ${userPreferences.jobTitles || 'Any'}
        - Keywords to Match: ${userPreferences.keywords || 'Any'}
        - Keywords to Exclude: ${userPreferences.excludeKeywords || 'None'}
        - Preferred Locations: ${userPreferences.locationPreference || 'Any'}
        - Company Size: ${userPreferences.companySize || 'Any'}

        JOB POSTING:
        - Title: ${job.title || 'Unknown'}
        - Company: ${job.company || 'Unknown'}
        - Location: ${job.location || 'Unknown'}
        - Description: ${job.description || 'No description'}
        - Requirements: ${job.requirements || 'No requirements'}
        - Benefits: ${job.benefits || 'No benefits'}
        - Salary: ${job.salary || 'Not specified'}

        Please analyze this job and provide:
        1. Should the candidate apply? (Yes/No)
        2. Confidence level (0-1, where 1 is very confident)
        3. Reasoning for the decision
        4. Overall fit score (0-100)
        5. Key matching factors
        6. Potential concerns

        Respond in this exact JSON format:
        {
            "shouldApply": true/false,
            "confidence": 0.85,
            "reasoning": "Detailed explanation",
            "score": 85,
            "matchingFactors": ["factor1", "factor2"],
            "concerns": ["concern1", "concern2"],
            "recommendation": "Strongly recommend applying"
        }
        `;
    }

    async callGeminiAPI(prompt) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
            
        } catch (error) {
            console.error('Analysis Agent: Error calling Gemini API:', error);
            throw error;
        }
    }

    parseAIResponse(response) {
        try {
            // Try to parse JSON response
            const parsed = JSON.parse(response);
            
            return {
                success: true,
                shouldApply: parsed.shouldApply || false,
                confidence: parsed.confidence || 0,
                reasoning: parsed.reasoning || 'No reasoning provided',
                score: parsed.score || 0,
                matchingFactors: parsed.matchingFactors || [],
                concerns: parsed.concerns || [],
                recommendation: parsed.recommendation || 'No recommendation'
            };
        } catch (error) {
            console.error('Analysis Agent: Error parsing AI response:', error);
            
            // Fallback parsing for non-JSON responses
            const shouldApply = response.toLowerCase().includes('yes') || response.toLowerCase().includes('true');
            const confidence = this.extractConfidence(response);
            
            return {
                success: true,
                shouldApply,
                confidence,
                reasoning: response,
                score: confidence * 100,
                matchingFactors: [],
                concerns: [],
                recommendation: shouldApply ? 'Consider applying' : 'Not recommended'
            };
        }
    }

    extractConfidence(text) {
        // Try to extract confidence from text
        const confidenceMatch = text.match(/(\d+(?:\.\d+)?)/);
        if (confidenceMatch) {
            const num = parseFloat(confidenceMatch[1]);
            if (num >= 0 && num <= 1) return num;
        }
        return 0.5; // Default confidence
    }

    rankJobsByFit(jobs, analyses) {
        try {
            // Create a map of job ID to analysis
            const analysisMap = new Map();
            analyses.forEach(analysis => {
                if (analysis.success && analysis.jobId) {
                    analysisMap.set(analysis.jobId, analysis);
                }
            });
            
            // Rank jobs by fit score
            const rankedJobs = jobs
                .map(job => {
                    const analysis = analysisMap.get(job.id);
                    return {
                        ...job,
                        analysis: analysis,
                        fitScore: analysis ? analysis.score : 0,
                        shouldApply: analysis ? analysis.shouldApply : false,
                        confidence: analysis ? analysis.confidence : 0
                    };
                })
                .filter(job => job.analysis) // Only include jobs with analysis
                .sort((a, b) => b.fitScore - a.fitScore); // Sort by score descending
            
            console.log(`Analysis Agent: Ranked ${rankedJobs.length} jobs by fit score`);
            return rankedJobs;
            
        } catch (error) {
            console.error('Analysis Agent: Error ranking jobs:', error);
            return jobs; // Return original jobs if ranking fails
        }
    }

    getAnalysisHistory() {
        return this.analysisHistory;
    }

    getCurrentAnalysis() {
        return this.currentAnalysis;
    }

    setGeminiApiKey(apiKey) {
        this.geminiApiKey = apiKey;
        console.log('Analysis Agent: Gemini API key updated');
    }

    reset() {
        this.analysisHistory = [];
        this.currentAnalysis = null;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
} 