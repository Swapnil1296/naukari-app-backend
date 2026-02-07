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
  updateshouldSendEmailCounter,
  getshouldSendEmailCounter,
} = require("../helpers/appliedCount");

async function autoApplyToJobs(
  jobs,
  credentials,
  emailConfig = {},
  existingBrowser = null,
  experience
) {
  const MAX_APPLY_LIMIT = 40;
  const { successfullyApplied } = await getApplicationCount();
  
  const MAX_JOBS_TO_APPLY = MAX_APPLY_LIMIT - successfullyApplied;

  // Early exit if no more slots available
  if (MAX_JOBS_TO_APPLY <= 0) {
    logger.info(`Reached maximum job application limit of ${MAX_APPLY_LIMIT}`);
    return {
      applied: [],
      skipped: jobs,
      totalAppliedJobsCount: 0,
    };
  }

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

    await page.setViewport({ width: 1000, height: 768 });
    

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );
    
    // Use correct session file based on credentials
    const sessionFilePath = credentials.isCalledForMNC 
      ? "./nauakrisession.json" 
      : "./naukrisession.json";
    
    logger.info(`Using session file: ${sessionFilePath}`);
    
    const sessionData = await loginToNaukri(page, credentials, sessionFilePath);
    if (!sessionData) {
      logger.error("failed to login");
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    for (const job of jobs) {
      console.log(
        `\n====> Processing ${jobs.indexOf(job) + 1} out of ${totalJobs} <====`
      );
      logger.info(`====>Processing job: ${job.title} at ${job.company}`);

      if (appliedJobsCount >= MAX_JOBS_TO_APPLY) {
        logger.info(
          `\n===>Reached maximum job applications limit of ${MAX_JOBS_TO_APPLY}<===`
        );
        break;
      }

      try {
        // Navigate to job page with proper error handling
        logger.info(`Navigating to job page: ${job.link}`);
        const navigationResult = await page
          .goto(job.link, {
            waitUntil: ["networkidle0", "domcontentloaded"],
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

        // Wait for job content to load
        await page
          .waitForSelector(".styles_JDC__dang-inner-html__h0K4t", {
            timeout: 10000,
          })
          .catch((error) => {
            logger.error(`Job content not found: ${error.message}`);
            return null;
          });

        // First check if already applied
        const isApplied = await page.evaluate(() => {
          // Check for already applied indicator
          const appliedSpan = document.querySelector(
            "#already-applied, .already-applied"
          );
          if (appliedSpan) {
            return true;
          }

          // Check container text for "Applied" status
          const applyContainer = document.querySelector(
            '[class*="apply-button-container"]'
          );
          if (applyContainer) {
            const containerText = applyContainer.textContent.trim();
            return (
              containerText === "Applied" || containerText === "Already Applied"
            );
          }

          return false;
        });

        if (isApplied) {
          logger.info("Already applied to this job");
          skippedJobs.push({
            ...job,
            reason: "Already applied",
          });
          continue;
        }

        const result = await checkRequiredSkills(page, job);
        const { isEligible, skills, matchPercentage, matchedSkills, reason } = result;
        console.log("Required SkillMatch Result==>", result);


        if (!isEligible) {
          logger.info(
            `Job ${job.title} skipped - ${
              reason !== "" ? reason : "not eligible"
            }`
          );
          skippedJobs.push({
            ...job,
            reason: reason !== "" ? reason : "not eligible",
            matchPercentage: matchPercentage,
            matchedSkills: matchedSkills,
          });
          continue;
        }

        await page.goto(job.link, {
          waitUntil: ["networkidle0", "domcontentloaded"],
          timeout: 60000,
        });

        //check for company side redirection
        const companyWebsiteButton = await page.evaluate(() => {
          const button = document.querySelector("#company-site-button");
          return !!button;
        });
        if (companyWebsiteButton) {
          console.log("Skipped:Company website redirect");
          skippedJobs.push({
            ...job,
            reason: "Company website redirect",
            matchPercentage: matchPercentage,
            matchedSkills: matchedSkills,
          });
          continue;
        }

        // If not already applied, try to apply
        const applyButton = await page
          .waitForSelector("#apply-button, .apply-button", {
            timeout: 5000,
            visible: true,
          })
          .catch((error) => {
            logger.error("Error finding apply button:", error.message);
            return null;
          });

        if (!applyButton) {
          logger.info("Apply button not found");
          skippedJobs.push({
            ...job,
            reason: "No apply button found",
            matchPercentage,
            matchedSkills,
          });
          continue;
        }

        try {
          // Try to click the button
          try {
            await page.evaluate(() => {
              const button = document.querySelector(
                "#apply-button, .apply-button"
              );
              if (button && !button.disabled) {
                button.click();
                return true;
              }
              throw new Error("Button not clickable");
            });
          } catch (evalError) {
            await applyButton.click();
          }

          // Wait for click response
          await new Promise((resolve) => setTimeout(resolve, 6000));

          // Verify application success
          const applicationStatus = await page.evaluate(() => {
            const successMessage = document.body.textContent.includes(
              "successfully applied"
            );
            const appliedIndicator = document.querySelector(
              "#already-applied, .already-applied"
            );
            const button = document.querySelector(
              "#apply-button, .apply-button"
            );

            return {
              success: successMessage || !!appliedIndicator,
              buttonStillVisible: button
                ? getComputedStyle(button).display !== "none"
                : false,
            };
          });

          if (
            !applicationStatus.success &&
            applicationStatus.buttonStillVisible
          ) {
            throw new Error("Application did not complete successfully");
          }
        } catch (error) {
          console.error("Application failed:", error.message);
          skippedJobs.push({
            ...job,
            reason: `Apply failed: ${error.message}`,
            matchPercentage: matchPercentage,
            matchedSkills: matchedSkills,
          });
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const successMessage = await page.evaluate(() => {
          return document.body.innerText.includes(
            "You have successfully applied to"
          );
        });

        if (successMessage) {
          logger.info("\n=>successfully applied to job<==");
          appliedJobsCount++;
          appliedJobs.push({
            ...job,
            appliedAt: new Date().toISOString(),
            matchPercentage: matchPercentage,
            matchedSkills: matchedSkills,
          });

          try {
            const excelPath = await saveJobToExcel.saveAppliedJobToExcel(
              page,
              job,
              true,
              skills,
              matchPercentage,
              matchedSkills
            );
            logger.info(
              `Successfully applied job saved to Excel at: ${excelPath}`
            );
          } catch (error) {
            logger.error(
              `Error saving successful job application: ${error.message}`
            );
          } // Save only successful applications to Excel
        } else {
          skippedJobs.push({
            ...job,
            reason: "Application confirmation not found - clicked successfully",
            matchPercentage: matchPercentage,
            matchedSkills: matchedSkills,
          });
        }
      } catch (error) {
        logger.error(`Error processing job ${job.title}:`, error);
        skippedJobs.push({
          ...job,
          reason: `Error: ${error.message}`,
          matchPercentage: matchPercentage,
          matchedSkills: matchedSkills,
        });
      }
    }

    if (appliedJobs.length > 0) {
      await updateApplicationCount(appliedJobs?.length);
    }
    //update the should email send counter
    await updateshouldSendEmailCounter();

    const filePath = path.join(__dirname, "job_applications.xlsx");

    const attachments = [
      {
        filename: "job_applications.xlsx",
        path: filePath,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ];
    
    const failedPath = await saveJobToExcel.saveFailedJobToExcel(skippedJobs);

    logger.info(`Saved failed job file to ${failedPath}`);


    const { shouldSendEmailCounter } = await getshouldSendEmailCounter();

    if ((appliedJobs.length > 0 || skippedJobs.length > 0) && !emailConfig.testing) {
      const Title = `Job Application Report ${emailConfig.isOnlyMNC ? "for MNCs jobs" : "for All type"
        }.`;
      if (emailConfig.to) {
        await sendApplicationReport({
          to: shouldSendEmailCounter === 3 ? [emailConfig.to,  'senavijit1697@gmail.com', 'rajivp332@gmail.com', 'banerjeearghya1996@gmail.com',  ] : emailConfig.to,
          appliedJobs,
          skippedJobs,
          attachments,
          experience,
          Title
        });
      }
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


module.exports = {
  autoApplyToJobs,
};
