const puppeteer = require("puppeteer");
const logger = require("../utils/logger");
const fs = require("fs/promises");
const path = require("path");
const loginToNaukri = require("../auth/loginToNaukar");
const sendApplicationReport = require("../helpers/sendApplication");
const saveJobDescription = require("../helpers/saveJobDes");
const restoreSession = require("../auth/restoreSession");
const saveJobToExcel = require("../helpers/saveJobToExcel");
const checkRequiredSkills = require("../helpers/checkRequiredDetails");
const {
    updateApplicationCount,
    getApplicationCount,
} = require("../helpers/appliedCount");
const { ResumeJobMatcher } = require("../aiAnalyzeJobMatch/analyzeJobMatch");



async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoApplyToJobsUsingAi(
    jobs,
    credentials,
    {
        resumePath,
        emailConfig = {},
        existingBrowser = null,
        matchThreshold = 50,
        rateLimitDelay = 5000, // 5 seconds delay between applications to avoid 
    }
) {
    const matcher = new ResumeJobMatcher(process.env.OPENAI_API_KEY);
    // const matcher = new ResumeJobMatcher(process.env.GEMINI_API_KEY);

    const MAX_APPLY_LIMIT = 50;
    const { successfullyApplied } = await getApplicationCount();

    // Calculate remaining job application slots
    const MAX_JOBS_TO_APPLY = Math.min(MAX_APPLY_LIMIT - successfullyApplied, jobs.length);

    // Early exit if no more slots available
    if (MAX_JOBS_TO_APPLY <= 0) {
        logger.info(`Reached maximum job application limit of ${MAX_APPLY_LIMIT}`);
        return {
            applied: [],
            skipped: jobs,
            totalAppliedJobsCount: 0,
        };
    }

    const jobsToApply = jobs.slice(0, MAX_JOBS_TO_APPLY);

    const isHeadless = process.env.RENDER === "true" || process.env.PUPPETEER_HEADLESS === "true";
    const browser =
        existingBrowser ||
        (await puppeteer.launch({
            headless: isHeadless,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-features=FederatedCredentialManagement",
            ],
        }));

    const skippedJobs = [];
    const appliedJobs = [];
    const totalJobs = jobs.length;
    let appliedJobsCount = 0;

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );

        // Use correct session file based on credentials
        const sessionFilePath = credentials.isCalledForMNC 
            ? "./nauakrisession.json" 
            : "./naukrisession.json";
        
        logger.info(`Using session file: ${sessionFilePath}`);
        
        const sessionData = await loginToNaukri(page, credentials, sessionFilePath);

        for (const job of jobsToApply) {
            if (appliedJobsCount >= MAX_JOBS_TO_APPLY) {
                logger.info(`Reached maximum job applications limit of ${MAX_JOBS_TO_APPLY}`);
                break;
            }

            try {
                logger.info(`Processing job: ${job.title} at ${job.company}`);
                logger.info(`Navigating to job page: ${job.link}`);

                // Navigate to job page with simpler wait
                const navigationResult = await page
                    .goto(job.link, {
                        waitUntil: ["domcontentloaded"],
                        timeout: 60000,
                    })
                    .catch((error) => {
                        logger.error(`Navigation failed: ${error.message}`);
                        return null;
                    });

                if (!navigationResult) {
                    logger.error("Failed to navigate to job page");
                    skippedJobs.push({ ...job, reason: "Navigation failed" });
                    continue;
                }

                // Wait for content to load
                await new Promise((resolve) => setTimeout(resolve, 3000));

                const { isEligible } = await checkRequiredSkills(page, job);

                if (!isEligible) {
                    skippedJobs.push({
                        ...job,
                        reason: "Required skills not found",
                    });
                    continue;
                }
                // Get job description
                const jobDescription = await page.evaluate(() => {
                    const descElement = document.querySelector(".styles_JDC__dang-inner-html__h0K4t");
                    return descElement ? descElement.innerText : "";
                });
                console.log('===== JOB DESCRIPTION START =====');

                console.log('\nDescription:\n', jobDescription);
                console.log('===== JOB DESCRIPTION END =====');

                let matchResult;
                try {
                    matchResult = await matcher.analyzeJobMatch(
                        resumePath,
                        jobDescription,
                        { minMatchPercentage: matchThreshold }
                    );

                    // Add delay to avoid rate limiting
                    await sleep(2000);
                } catch (aiError) {
                    // AI matching failed (quota issue), fall back to rule-based matching
                    logger.warn(`AI matching failed: ${aiError.message}. Using rule-based skill matching.`);
                    const skillCheckResult = await checkRequiredSkills(page, job);
                    
                    if (!skillCheckResult.isEligible) {
                        skippedJobs.push({
                            ...job,
                            reason: skillCheckResult.reason || "Skills not matching (rule-based)",
                            matchPercentage: skillCheckResult.matchPercentage || 0,
                        });
                        continue;
                    }
                    
                    // Use rule-based result as eligible
                    matchResult = {
                        isEligible: true,
                        matchPercentage: skillCheckResult.matchPercentage || 50,
                        details: { source: 'rule-based' }
                    };
                }

                if (!matchResult.isEligible) {
                    skippedJobs.push({
                        ...job,
                        reason: `Low match score: ${matchResult.matchPercentage.toFixed(2)}%`,
                    });
                    continue;
                }

                // Restore session and navigate to job page for application
                await restoreSession(page, sessionData);
                await page.goto(job.link, {
                    waitUntil: ["networkidle0", "domcontentloaded"],
                    timeout: 60000,
                });
                await new Promise((resolve) => setTimeout(resolve, 4000)); // Wait for a while

                // Check if the company is redirecting to an external website
                const companyWebsiteButton = await page.evaluate(() => {
                    const button = document.querySelector("#company-site-button");
                    return !!button;
                });

                if (companyWebsiteButton) {
                    skippedJobs.push({ ...job, reason: "Company website redirect" });
                    await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait before continuing
                    continue;
                }

                // Apply to the job
                const applicationResult = await applyToJob(page, job);

                if (applicationResult.success) {
                    appliedJobs.push({
                        ...job,
                        matchDetails: matchResult.details,
                        appliedAt: new Date().toISOString(),
                    });
                    appliedJobsCount++;
                } else {
                    skippedJobs.push({
                        ...job,
                        reason: applicationResult.reason,
                    });
                }

                // Sleep to prevent hitting the rate limit
                await sleep(rateLimitDelay);

            } catch (error) {
                logger.error(`Error processing job ${job.title}: ${error.message}`);
                skippedJobs.push({ ...job, reason: "Unexpected error" });
            }
        }

        if (appliedJobs.length > 0) {
            await updateApplicationCount(appliedJobs.length);
        }

        if (emailConfig.to) {
            const filePath = path.join(__dirname, "job_applications.xlsx");
            const attachments = [
                {
                    filename: "job_applications.xlsx",
                    path: filePath,
                    contentType:
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                },
            ];

            await sendApplicationReport({
                to: emailConfig.to,
                appliedJobs,
                skippedJobs,
                attachments,
                message: `Job application process completed. Total applied jobs: ${appliedJobsCount}`,
            });
        }

        return {
            applied: appliedJobs,
            skipped: skippedJobs,
            totalAppliedJobsCount: appliedJobsCount,
        };
    } finally {
        if (!existingBrowser && browser) {
            await browser.close();
        }
    }
}



async function applyToJob(page, job) {
    try {
        // Check if already applied
        const isAlreadyApplied = await page.evaluate(() => {
            const appliedSpan = document.querySelector("#already-applied, .already-applied");
            return !!appliedSpan;
        });

        if (isAlreadyApplied) {
            return {
                success: false,
                reason: "Already applied to this job"
            };
        }

        // Find and click apply button
        const applyButton = await page
            .waitForSelector("#apply-button, .apply-button", {
                timeout: 5000,
                visible: true,
            })
            .catch(() => null);

        if (!applyButton) {
            return {
                success: false,
                reason: "Apply button not found"
            };
        }

        // Click apply button
        await page.evaluate(() => {
            const button = document.querySelector("#apply-button, .apply-button");
            if (button && !button.disabled) {
                button.click();
            }
        });

        // Wait for application response
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Verify application success
        const applicationStatus = await page.evaluate(() => {
            const successMessage = document.body.textContent.includes("successfully applied");
            const appliedIndicator = document.querySelector("#already-applied, .already-applied");
            return successMessage || !!appliedIndicator;
        });

        return {
            success: applicationStatus,
            reason: applicationStatus
                ? undefined
                : "Application process did not complete successfully"
        };


    } catch (error) {
        return {
            success: false,
            reason: `Application error: ${error.message}`
        };
    }
}

module.exports = {
    autoApplyToJobsUsingAi,
};
