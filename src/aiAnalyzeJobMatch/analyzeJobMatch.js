const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");

// using openAi

class ResumeJobMatcher {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error("OpenAI API Key is required");
        }
        this.openai = new OpenAI({ apiKey });
    }

    async extractPDFText(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        return data.text;
    }

    async preprocessResume(resumePath) {
        const fileExtension = path.extname(resumePath).toLowerCase();
        let resumeText;

        switch (fileExtension) {
            case ".pdf":
                resumeText = await this.extractPDFText(resumePath);
                break;
            case ".txt":
                resumeText = fs.readFileSync(resumePath, "utf-8");
                break;
            default:
                throw new Error("Unsupported resume file type");
        }

        return this.cleanResumeText(resumeText);
    }

    cleanResumeText(text) {
        return text
            .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines
            .replace(/[^\w\s.,()-]/g, "") // Remove special characters
            .trim();
    }

    async analyzeJobMatch(resumePath, jobDescription, options = {}, retryCount = 0) {
        const defaultOptions = {
            minMatchPercentage: 50,
            detailedAnalysis: true,
            model: "gpt-3.5-turbo",
        };

        const config = { ...defaultOptions, ...options };

        try {
            const resumeText = await this.preprocessResume(resumePath);

            const matchAnalysis = await this.openai.chat.completions.create({
                model: config.model,
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "React JS Frontend Developer",
                        content: `"You are an expert AI recruiter specializing in technical job matching. Analyze a resume for a React JS Frontend Developer against a job description with extreme precision.

  ANALYSIS FOCUS:
  - Calculate skill match percentage specific to React, JavaScript, and frontend technologies
  - Evaluate technical skills: React, TypeScript, Redux, Next.js, state management
  - Assess frontend development experience depth
  - Identify specific technical strengths and potential skill gaps
  - Provide career trajectory assessment for frontend development roles
  - Recommend application strategy and potential resume enhancements

  SCORING CRITERIA:
  - React Ecosystem Proficiency (40%)
    * React hooks, component architecture
    * Performance optimization
    * Modern React practices

  - JavaScript/TypeScript Mastery (25%)
    * ES6+ features
    * Type safety implementation
    * Functional programming concepts

  - State Management Skills (15%)
    * Redux/Context API usage
    * Complex state handling
    * Global state management strategies

  - Additional Frontend Technologies (10%)
    * Responsive design
    * CSS frameworks
    * Build tools, webpack

  - Soft Skills & Professional Growth (10%)
    * Problem-solving approach
    * Collaboration capabilities
    * Learning agility in frontend tech`,
                    },
                    {
                        role: "user",
                        content: `Perform a detailed technical job matching analysis:

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

Provide a structured JSON response with precise, actionable insights.`,
                    },
                ],
                temperature: 0.3,
                max_tokens: 1500,
            });

            const analysis = JSON.parse(matchAnalysis.choices[0].message.content);

            return {
                matchPercentage: analysis.skillMatchPercentage || 0,
                isEligible: analysis.skillMatchPercentage >= config.minMatchPercentage,
                details: {
                    skillAlignment: analysis.skillAlignment || [],
                    profileGaps: analysis.profileGaps || [],
                    careerTrajectory: analysis.careerTrajectory || {},
                    recommendationStrength: analysis.recommendationStrength || "Neutral",
                    resumeEnhancements: analysis.resumeEnhancements || [],
                },
                rawAnalysis: analysis,
            };
        } catch (error) {
            if (error.status === 429 && retryCount < 5) {
                // Retry on rate limit error
                const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                console.log(`Rate limit exceeded. Retrying in ${retryDelay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.analyzeJobMatch(resumePath, jobDescription, options, retryCount + 1);
            }
            console.error("Job Matching Analysis Error:", error);
            return {
                error: error.message,
                matchPercentage: 0,
                isEligible: false,
            };
        }
    }

    async batchJobMatch(resumePath, jobDescriptions, options = {}) {
        const results = [];
        for (const jobDesc of jobDescriptions) {
            const matchResult = await this.analyzeJobMatch(
                resumePath,
                jobDesc,
                options
            );
            results.push(matchResult);
        }
        return results.sort((a, b) => b.matchPercentage - a.matchPercentage);
    }
}

// gemini

// class ResumeJobMatcher {
//     constructor(geminiApiKey) {
//         this.geminiApiKey = geminiApiKey;
//     }

//     async fetchGeminiResponse(prompt) {
//         const headers = {
//             "Authorization": `Bearer ${this.geminiApiKey}`,
//             "Content-Type": "application/json",
//         };

//         const body = {
//             "prompt": prompt,
//             "max_tokens": 1024,
//             "temperature": 0.7,
//         };

//         const response = await fetch("https://api.gemini.ai/v1/generate", {
//             method: "POST",
//             headers: headers,
//             body: JSON.stringify(body),
//         });

//         if (!response.ok) {
//             throw new Error(`Gemini API request failed with status ${response.status}`);
//         }

//         const data = await response.json();
//         return data.text;
//     }

//     async analyzeJobMatch(resumePath, jobDescription) {
//         try {
//             // 1. Read and preprocess resume
//             const resumeText = await this.readResume(resumePath);

//           // 2. Construct Gemini prompt
//           const prompt = `Analyze the following resume for a match with the given job description:
  
//         **Resume:**
//         ${resumeText}
  
//         **Job Description:**
//         ${jobDescription}
  
//         Provide a structured response in JSON format with the following keys:
//         - **matchPercentage:** A percentage indicating the overall match (0-100).
//         - **isEligible:** A boolean indicating whether the candidate is a strong match.
//         - **skillAlignment:** An array of skills found in both the resume and job description.
//         - **skillGaps:** An array of skills required in the job description but not found in the resume.
//         - **recommendations:** An array of suggestions for improving the resume or the candidate's skills.`;

//           // 3. Get Gemini response
//           const response = await this.fetchGeminiResponse(prompt);

//           // 4. Parse JSON response
//           const analysis = JSON.parse(response);

//           return analysis;

//       } catch (error) {
//           console.error("Job Matching Analysis Error:", error);
//           return {
//               error: error.message,
//               matchPercentage: 0,
//               isEligible: false,
//           };
//       }
//     }

//     // Helper function to read resume content (adapt based on your file handling needs)
//     async readResume(resumePath) {
//         // Example: Reading a plain text file
//         return fs.readFileSync(resumePath, 'utf-8'); 
//     }
// }

// Example Usage


module.exports = { ResumeJobMatcher };



