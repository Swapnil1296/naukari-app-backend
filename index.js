const { scrapeNaukriJobs } = require("./src/scraper/scraper");
const { autoApplyToJobs } = require("./src/autoApply/autoApply");
const { loginToNaukri } = require("./src/auth/loginToNaukar");
const autoApplyToJobsSf = require("./src/failSafe/autoApplyToJobs");
const logger = require("./src/utils/logger");
const puppeteer = require("puppeteer");
const { getApplicationCount } = require("./src/helpers/appliedCount");
const { autoApplyToJobsUsingAi } = require("./src/autoApply/autoApplyUsingAi");
const { cleanupChromeProfile } = require("./src/helpers/cleanupChromeProfile");
const { Command } = require('commander');
const program = new Command();

require("dotenv").config();
const path = require("path");

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
    }
    program
      .option('--maxPages <number>', 'Maximum number of pages to scrape', parseInt)
      .option('--experience <number>', 'Years of experience', parseInt)
      .option('--jobAge <number>', 'Job age in days', parseInt)
      .option('--autoApply', 'Automatically apply to jobs')
      .option('--scrapeMNC', 'Scrape jobs specifically for MNCs')
      .parse(process.argv);

    const cliOptions = program.opts();
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
      autoApply: cliOptions.autoApply ?? true,
    };


    const startScrapingForMNC = cliOptions.scrapeMNC ?? false;

    let jobs;

    if (startScrapingForMNC) {
      // for mnc job applies

      const credForMNC = { ...credentials, isCalledForMNC: true };
      const modifiedOptions = {
        ...options, businessSize: [62, 213, 217], // Corresponds to company type product,indian mnc, foreignmnc
          jobPostType: 1, //posted by company
        qcrc: 1028, 
          // companyType: "MNC",
        postedBy: "Employer",
          // topCompanies: [
          //   1288, 10476, 13832, 19288, 19656, 24912, 30928, 41608, 44664, 82242,
          //   121138, 135342, 142780, 164080, 224154, 227722, 231614, 235536, 236044, 240936,
          //   243080, 255614, 356782, 415028, 478706, 498434, 516156, 530892, 675066, 1078056,
          //   1402790, 1482768, 1574056, 1595582, 1784498, 1931748, 2041470, 2373670, 2401526, 2436002,
          //   2485476, 3507502, 4588365, 4602035, 4618647, 4836901, 4847169, 8483159
        // ], // Corresponds to qctopGroupId
      }
      jobs = await scrapeNaukriJobs(
        modifiedOptions,
        credForMNC,
        emailConfig
      );
    } else {
      // for normal job applies
      jobs = await scrapeNaukriJobs(
        options,
        credentials,
        emailConfig
      );
    }



    logger.info(`===>Scraping completed. Found ${jobs?.length} jobs`);


    if (options.autoApply) {
      logger.info("Starting auto-apply process...");

      // Clean up any existing profile directories before launching
      await cleanupChromeProfile();

      browser = await puppeteer.launch({
        headless: false,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-features=FederatedCredentialManagement",
        ],
        userDataDir: path.join(
          require("os").tmpdir(),
          `puppeteer_dev_chrome_profile_${Date.now()}`
        ),
      });

      const applicationResults = await autoApplyToJobs(
        jobs,
        credentials,
        emailConfig,
        browser, options?.experience
      );

      logger.info(`Auto-apply completed:`);
      logger.info(
        `- Successfully applied: ${applicationResults?.applied?.length} jobs`
      );
      logger.info(`- Skipped: ${applicationResults?.skipped?.length} jobs`);
    }
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

      // Clean up after the browser is closed
      await cleanupChromeProfile();
    }
  }
}

// Add proper process handlers
process.on("SIGINT", async () => {
  console.log("Received SIGINT. Cleaning up...");
  await cleanupChromeProfile();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM. Cleaning up...");
  await cleanupChromeProfile();
  process.exit(0);
});

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = {
  scrapeNaukriJobs,
  autoApplyToJobs,
  loginToNaukri,
};