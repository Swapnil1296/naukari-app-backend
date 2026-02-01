/**
 * AI-Powered Job Auto-Apply Entry Point
 * 
 * This file provides an alternative entry point that uses AI-based job matching
 * for more intelligent job application decisions.
 * 
 * Usage:
 *   node index-ai.js [--maxPages <n>] [--experience <n>] [--jobAge <n>] [--resume <path>]
 * 
 * Options:
 *   --maxPages <n>    Maximum number of pages to scrape (default: 1)
 *   --experience <n>  Years of experience filter
 *   --jobAge <n>      Job age in days filter
 *   --resume <path>   Path to resume PDF file (required for AI matching)
 *   --matchThreshold <n>  Minimum match percentage for AI (default: 50)
 */

const { scrapeNaukriJobs } = require("./src/scraper/scraper");
const { autoApplyToJobsUsingAi } = require("./src/autoApply/autoApplyUsingAi");
const logger = require("./src/utils/logger");
const puppeteer = require("puppeteer");
const { getApplicationCount } = require("./src/helpers/appliedCount");
const { Command } = require('commander');
const program = new Command();
const path = require("path");

require("dotenv").config();

// Default resume path
const DEFAULT_RESUME_PATH = path.join(__dirname, "src/aiAnalyzeJobMatch/Swapnil_Landage-3YOE.pdf");

async function main() {
    let browser = null;

    try {
        const credentials = {
            username: process.env.NAUKRI_USERNAME,
            password: process.env.NAUKRI_PASSWORD,
            isCalledForMNC: false
        };

        const emailConfig = {
            to: process.env.EMAIL_RECIPIENT,
            testing: false,
            isOnlyMNC: false
        };

        // CLI Options
        program
            .option('--maxPages <number>', 'Maximum number of pages to scrape', parseInt)
            .option('--experience <number>', 'Years of experience', parseInt)
            .option('--jobAge <number>', 'Job age in days', parseInt)
            .option('--resume <path>', 'Path to resume PDF file')
            .option('--matchThreshold <number>', 'Minimum match percentage for AI', parseInt)
            .option('--scrapeMNC', 'Scrape jobs specifically for MNCs')
            .option('--reset', 'Reset daily application counter')
            .parse(process.argv);

        const cliOptions = program.opts();

        // Handle reset option
        if (cliOptions.reset) {
            const fs = require("fs");
            const trackerPath = require("path").join(__dirname, "src/helpers/job_application_tracker.json");
            if (fs.existsSync(trackerPath)) {
                const data = JSON.parse(fs.readFileSync(trackerPath, "utf8"));
                data.successfullyApplied = 0;
                data.lastResetDate = new Date().toISOString().split("T")[0];
                fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2));
                logger.info("Daily application counter reset to 0");
            } else {
                logger.info("No tracker file found, counter is already at 0");
            }
            return;
        }

        // Use default resume if not specified
        let resumePath = cliOptions.resume 
            ? path.resolve(cliOptions.resume) 
            : DEFAULT_RESUME_PATH;
        
        logger.info(`Using resume: ${resumePath}`);

        // Job search queries for MERN/React stack
        const searchQuery = [
            "React Js Developer",
            "React Js Frontend Developer",
            "Mern Stack Developer",
            "Mern Full Stack Developer",
            "Mern Stack",
            "Fullstack Developer",
            "Fullstack Javascript Developer",
            "Fullstack Web Developer",
            "Fullstack Software Developer",
            "Fullstack Development",
            "Fullstack Engineer",
            "Full Stack",
        ];

        const options = {
            searchQuery,
            maxPages: cliOptions.maxPages || 1,
            experience: cliOptions.experience || 3,
            jobAge: cliOptions.jobAge || 1,
            autoApply: true,
        };

        const startScrapingForMNC = cliOptions.scrapeMNC ?? false;
        let jobs;

        if (startScrapingForMNC) {
            // For MNC job applications
            const credForMNC = { ...credentials, isCalledForMNC: true };
            const modifiedOptions = {
                ...options,
                businessSize: [62, 213, 217], // Product, Indian MNC, Foreign MNC
                jobPostType: 1, // Posted by company
                qcrc: 1028,
                postedBy: "Employer",
            };
            jobs = await scrapeNaukriJobs(modifiedOptions, credForMNC, emailConfig);
        } else {
            // For normal job applications
            jobs = await scrapeNaukriJobs(options, credentials, emailConfig);
        }

        logger.info(`===> Scraping completed. Found ${jobs?.length} jobs`);

        if (jobs.length === 0) {
            logger.info("No jobs found to apply to. Check scraping filters or try different search criteria.");
            return;
        }

        // Check application limit
        const { successfullyApplied } = await getApplicationCount();
        const MAX_APPLY_LIMIT = 50;
        const remainingSlots = MAX_APPLY_LIMIT - successfullyApplied;
        logger.info(`===> Applications used today: ${successfullyApplied}/${MAX_APPLY_LIMIT} (${remainingSlots} remaining)`);

        if (remainingSlots <= 0) {
            logger.info("Daily application limit reached. Try again tomorrow or reset the tracker.");
            return;
        }

        // Launch browser for AI-based auto-apply
        logger.info("Starting AI-powered auto-apply process...");

        browser = await puppeteer.launch({
            headless: false,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-features=FederatedCredentialManagement",
            ],
            userDataDir: path.join(
                require("os").tmpdir(),
                `puppeteer_ai_dev_chrome_profile_${Date.now()}`
            ),
        });

        const applicationResults = await autoApplyToJobsUsingAi(
            jobs,
            credentials,
            {
                resumePath: resumePath,
                emailConfig: emailConfig,
                existingBrowser: browser,
                matchThreshold: cliOptions.matchThreshold || 50,
                rateLimitDelay: 5000, // 5 seconds delay between applications
            }
        );

        logger.info(`AI Auto-apply completed:`);
        logger.info(`- Successfully applied: ${applicationResults?.applied?.length} jobs`);
        logger.info(`- Skipped: ${applicationResults?.skipped?.length} jobs`);

    } catch (error) {
        logger.error("Main function error:", error);
        throw error;
    } finally {
        if (browser) {
            try {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await browser.close();
            } catch (err) {
                console.warn("Error closing browser:", err.message);
            }
        }
    }
}

// Add proper process handlers
process.on("SIGINT", async () => {
    console.log("Received SIGINT. Cleaning up...");
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("Received SIGTERM. Cleaning up...");
    process.exit(0);
});

if (require.main === module) {
    main().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}

module.exports = { main };
