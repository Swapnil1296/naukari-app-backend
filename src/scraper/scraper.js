const puppeteer = require("puppeteer");
const fs = require("fs/promises");
const path = require("path");
const logger = require("../utils/logger");
const { sendEmailNotification } = require("../config/emailService");
const { extractJobsFromPage } = require("./pageExtractor");
const skipKeywords = require("../utils/common-constant");
const loginToNaukri = require("../auth/loginToNaukar");
const { isCompanyBlocked, getBlockedCompanyMatch } = require("../config/blocked-companies");

async function getTotalPages(page) {
  try {
    // page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    // Wait for the jobs list header to appear
    await page.waitForSelector(".styles_count-string__DlPaZ", {
      timeout: 15000,
    });

    const totalJobs = await page.evaluate(() => {
      const countElement = document.querySelector(
        ".styles_count-string__DlPaZ"
      );
      if (!countElement) return 0;

      // Extract the text content (e.g., "81 - 100 of 2790")
      const countText =
        countElement.getAttribute("title") || countElement.textContent;

      // Modified regex to capture the entire number after "of"
      const match = countText.match(/of\s+(\d+)/);
      if (!match) return 0;

      // Convert the matched number to integer
      const totalJobs = parseInt(match[1]);
      console.log("Extracted total jobs:", totalJobs); // Debug log
      return totalJobs;
    });

    // Calculate total pages (20 jobs per page) using Math.ceil to round up
    const totalPages = Math.ceil(totalJobs / 20);

    logger.info(`Found ${totalJobs} total jobs across ${totalPages} pages`);

    // Return the calculated pages, with fallback to 50 if something goes wrong
    return totalPages || 50;
  } catch (error) {
    logger.error("Error getting total pages:", error);
    return 50; // Default to 50 pages if detection fails
  }
}

// Handle successful scraping

async function handleScrapingSuccess(jobs, filename, searchQuery, options) {
  const timestamp = new Date().toLocaleString();
  const emailBody = `
   <h2 style="color: #2c3e50; font-family: Arial, sans-serif; text-align: center; margin-bottom: 20px;">
  Job Scraping Completed Successfully
</h2>
<p style="font-family: Arial, sans-serif; font-size: 14px; color: #34495e; margin-bottom: 10px;">
  <strong>Timestamp:</strong> ${timestamp}
</p>
<p style="font-family: Arial, sans-serif; font-size: 14px; color: #34495e; margin-bottom: 10px;">
  <strong>Search Query:</strong> ${searchQuery}
</p>
<p style="font-family: Arial, sans-serif; font-size: 14px; color: #34495e; margin-bottom: 20px;">
  <strong>Total Jobs Found:</strong> ${jobs.length}
</p>
<h3 style="font-family: Arial, sans-serif; font-size: 16px; color: #2c3e50; margin-bottom: 10px;">
  Applied Filters:
</h3>
<ul style="font-family: Arial, sans-serif; font-size: 14px; color: #34495e; list-style-type: disc; margin-left: 20px;">
  ${
    options.experience
      ? `<li style="margin-bottom: 5px;">Experience: ${options.experience} years</li>`
      : ""
  }
  ${
    options.jobAge
      ? `<li style="margin-bottom: 5px;">Job Age: ${options.jobAge} days</li>`
      : ""
  }
  ${
    options.location
      ? `<li style="margin-bottom: 5px;">Location: ${options.location}</li>`
      : ""
  }
  ${
    options.workMode
      ? `<li style="margin-bottom: 5px;">Work Mode: ${options.workMode}</li>`
      : ""
  }
  ${
    options.salary
      ? `<li style="margin-bottom: 5px;">Salary Range: ${options.salary}</li>`
      : ""
  }
</ul>
<p style="font-family: Arial, sans-serif; font-size: 14px; color: #34495e; margin-top: 20px;">
  Please find the complete job listings in the attached JSON file.
</p>

  `;

  await sendEmailNotification(
    `Job Scraping Successful - ${jobs.length} Jobs Found`,
    emailBody,
    [
      {
        filename: filename,
        path: path.join(process.cwd(), filename),
        contentType: "application/json",
      },
    ]
  );
}

// Handle scraping failure
async function handleScrapingFailure(
  error,
  partialJobs,
  searchQuery,
  failedPage = null
) {
  const timestamp = new Date().toLocaleString();
  let partialDataFilename = null;

  if (partialJobs.length > 0) {
    partialDataFilename = `naukri-jobs-partial-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    await fs.writeFile(
      partialDataFilename,
      JSON.stringify(partialJobs, null, 2)
    );
  }

  const emailBody = `
    <h2>Job Scraping Failed</h2>
    <p><strong>Timestamp:</strong> ${timestamp}</p>
    <p><strong>Search Query:</strong> ${searchQuery}</p>
    ${failedPage ? `<p><strong>Failed at Page:</strong> ${failedPage}</p>` : ""}
    <p><strong>Error Message:</strong> ${error.message}</p>
    <p><strong>Partial Jobs Retrieved:</strong> ${partialJobs.length}</p>
    ${
      partialJobs.length > 0
        ? "<p>Partial data is attached to this email.</p>"
        : ""
    }
    <h3>Error Details:</h3>
    <pre>${error.stack}</pre>
  `;

  const attachments = [];
  if (partialDataFilename) {
    attachments.push({
      filename: partialDataFilename,
      path: path.join(process.cwd(), partialDataFilename),
      contentType: "application/json",
    });
  }

  await sendEmailNotification(
    `Job Scraping Failed - ${partialJobs.length} Partial Jobs Retrieved`,
    emailBody,
    attachments
  );
}
// Title MUST contain at least one of these before auto-apply (filters e.g. "Platform Engineer", "Software Engineer" without React/MERN/Fullstack)
const REACT_MERN_FULLSTACK_TITLE_KEYWORDS = [
  "react", "reactjs", "react.js", "mern", "mern stack", "fullstack", "full stack", "full-stack"
];

function filterJobTitle(jobTitle) {
  // Convert job title to lowercase once for efficiency
  const lowercaseJobTitle = jobTitle.toLowerCase();

  // Check for Developer or Engineer
  const hasDeveloperOrEngineer = /developer|engineer/i.test(lowercaseJobTitle);

  // Must have React or MERN or Fullstack in title (filters Platform Engineer, generic Software Engineer, etc.)
  const hasReactOrMernOrFullstack = REACT_MERN_FULLSTACK_TITLE_KEYWORDS.some((keyword) => {
    const k = keyword.trim().toLowerCase();
    return lowercaseJobTitle.includes(k);
  });

  // Check for skip keywords using word boundaries and escaping special characters
  const hasSkipKeyword = skipKeywords.some((keyword) => {
    const escapedKeyword = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escapedKeyword}\\b`, "i");
    return pattern.test(lowercaseJobTitle);
  });

  return hasDeveloperOrEngineer && hasReactOrMernOrFullstack && !hasSkipKeyword;
}

function filterCompany(company) {
  const shouldSkip = isCompanyBlocked(company);

  if (shouldSkip) {
    const matchedPattern = getBlockedCompanyMatch(company);
    logger.debug(`Filtering out company: ${company} (matched: ${matchedPattern})`);
  }

  return !shouldSkip;
}

function filterJobs(jobs) {
  const filteredJobs = jobs.filter((job) => {
    const isValidTitle = filterJobTitle(job.title);
    const isValidCompany = filterCompany(job.company);

    if (!isValidTitle || !isValidCompany) {
      logger.debug(
        `Filtered out job unmatched: ${job.title} at ${job.company}`
      );
      return false;
    }

    return true;
  });

  logger.info(
    `Filtered unmatched ${jobs.length - filteredJobs.length} jobs out of ${
      jobs.length
    } total jobs`
  );
  return filteredJobs;
}

// ### latest scraper which login before scraping any jobs
// async function scrapeNaukriJobs(searchQuery, options = {}, credentials = null) {
//   const {
//     maxPages = 1,
//     experience = null,
//     jobAge = null,
//     location = null,
//     workMode = null,
//     salary = null,
//   } = options;

//   let browser;
//   let partialJobs = [];

//   try {
//     logger.info("Launching browser...");
//     browser = await puppeteer.launch({
//       headless: false,
//       defaultViewport: null,
//       args: [
//         "--no-sandbox",
//         "--disable-setuid-sandbox",
//         "--disable-features=FederatedCredentialManagement",
//         "--start-maximized",
//         "--disable-web-security",
//         "--disable-features=IsolateOrigins,site-per-process",
//         "--start-maximized",
//         // "--window-position=-10000,0",
//       ],
//     });

//     const page = await browser.newPage();

//     // Check if credentials are provided and perform login
//     if (!credentials) {
//       throw new Error("Credentials are required for scraping Naukri jobs");
//     }

//     logger.info("Initiating login process...");
//     await page.setViewport({ width: 1000, height: 768 });
//     await page.setUserAgent(
//       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
//     );

//     const sessionFilePath = "./naukrisession.json";
//     const loginSuccess = await loginToNaukri(
//       page,
//       credentials,
//       sessionFilePath
//     );

//     if (!loginSuccess) {
//       logger.error("Failed to login to Naukri");
//       throw new Error("Login failed");
//     }

//     // Wait for session establishment
//     logger.info("Login successful, waiting for session establishment...");
//     await new Promise((resolve) => setTimeout(resolve, 5000));

//     // URL construction with proper encoding
//     const baseUrl = "https://www.naukri.com";
//     const isMultipleQueries = Array.isArray(searchQuery);

//     // Create the URL slug part
//     let searchSlug;
//     let queryParam;

//     if (isMultipleQueries) {
//       // For multiple positions, join them with hyphens for the slug
//       searchSlug = searchQuery
//         .map(query => query.trim().replace(/\s+/g, "-").toLowerCase())
//         .join("-");

//       // For query parameter, join them with commas
//       queryParam = searchQuery
//         .map(query => query.trim())
//         .join(", ");
//     } else {
//       // Handle single search query as before
//       searchSlug = searchQuery.trim().replace(/\s+/g, "-").toLowerCase();
//       queryParam = searchQuery.trim();
//     }

//     // Create query parameters
//     const params = new Map();
//     params.set("k", queryParam);
//     if (experience) params.set("experience", experience);
//     if (jobAge) params.set("jobAge", jobAge);
//     if (location) params.set("location", location);
//     if (workMode) params.set("workType", workMode);
//     if (salary) params.set("salary", salary);

//     const queryString = Array.from(params.entries())
//       .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
//       .join("&");

//     const url = `${baseUrl}/${searchSlug}-jobs?${queryString}`;
//     logger.info("Navigating to:", url);
//     let pageLoaded = false;
//     let retryCount = 0;
//     while (!pageLoaded && retryCount < 3) {
//       try {
//         await page.goto(url, {
//           waitUntil: ["networkidle0", "domcontentloaded"],
//           timeout: 30000,
//         });
//         await page.waitForSelector(".srp-jobtuple-wrapper", { timeout: 15000 });
//         pageLoaded = true;
//       } catch (error) {
//         retryCount++;
//         logger.error(`Page load attempt ${retryCount} failed:`, error);
//         if (retryCount === 3) throw error;
//         await new Promise((resolve) => setTimeout(resolve, 5000));
//       }
//     }

//     const totalAvailablePages = await getTotalPages(page);
//     logger.info(`Total available pages: ${totalAvailablePages}`);

//     const pagesToScrape = Math.max(maxPages, totalAvailablePages);
//     logger.info(`Will scrape ${pagesToScrape} pages`);

//     // Rest of the scraping logic remains the same...
//     const allJobs = [];
//     for (let currentPage = 1; currentPage <= pagesToScrape; currentPage++) {
//       logger.info(`Scraping page ${currentPage} of ${pagesToScrape}`);

//       if (currentPage > 1) {
//         // Modified URL construction for pagination
//         const pageUrl = `${baseUrl}/${searchSlug}-jobs-${currentPage}?${queryString}`;
//         let pageLoadSuccess = false;
//         let pageRetries = 0;

//         while (!pageLoadSuccess && pageRetries < 3) {
//           try {
//             await page.goto(pageUrl, {
//               waitUntil: ["networkidle0", "domcontentloaded"],
//               timeout: 30000,
//             });
//             await page.waitForSelector(".srp-jobtuple-wrapper", {
//               timeout: 15000,
//             });
//             pageLoadSuccess = true;
//           } catch (error) {
//             pageRetries++;
//             logger.error(
//               `Failed to load page ${currentPage}, attempt ${pageRetries}:`,
//               error
//             );
//             if (pageRetries === 3) break;
//             await new Promise((resolve) => setTimeout(resolve, 6000));
//           }
//         }

//         if (!pageLoadSuccess) {
//           logger.error(`Skipping page ${currentPage} after failed attempts`);
//           continue;
//         }
//       }

//       const jobs = await extractJobsFromPage(page, currentPage);
//       logger.info(`Found ${jobs.length} jobs on page ${currentPage}`);

//       if (jobs.length > 0) {
//         allJobs.push(...jobs);
//       } else {
//         logger.debug("No jobs found on page, waiting and retrying...");
//         await new Promise((resolve) => setTimeout(resolve, 8000));

//         const retryJobs = await extractJobsFromPage(page, currentPage);
//         if (retryJobs.length > 0) {
//           allJobs.push(...retryJobs);
//           logger.info(`Retrieved ${retryJobs.length} jobs after retry`);
//         } else {
//           logger.error(
//             `No jobs found on page ${currentPage} after retry, may have reached end`
//           );
//           break;
//         }
//       }

//       if (currentPage < pagesToScrape) {
//         const delay = Math.floor(Math.random() * (5000 - 3000 + 1) + 3000);
//         logger.info(`Waiting ${delay}ms before next page...`);
//         await new Promise((resolve) => setTimeout(resolve, delay));
//       }
//     }

//     const filteredJobs = filterJobs(allJobs);
//     logger.info(`Retained ${filteredJobs.length} jobs after filtering`);

//     return filteredJobs;
//   } catch (error) {
//     await handleScrapingFailure(error, partialJobs, searchQuery);
//     throw error;
//   } finally {
//     if (browser) {
//       await browser.close();
//     }
//   }
// };


async function scrapeNaukriJobs(options = {}, credentials = null, emailConfig) {
  const {
    searchQuery = [],
    maxPages = 1,
    experience = null,
    jobAge = null,
    location = null,
    workMode = null,
    salary = null,
    businessSize = null, // e.g., [62, 213, 217]
    jobPostType = null, // e.g., 1
    qcrc = null, // e.g., 1028
    companyType = null, // e.g., "MNC", "Startup"
    postedBy = null, // e.g., "Employer", "Consultant"
    topCompanies = null, // New: e.g., [10476, 13832, 19288, 41608, 243080, 255614, 1931748]
  } = options;

  let browser;
  let partialJobs = [];

  try {
    const isHeadless = process.env.RENDER === "true" || process.env.PUPPETEER_HEADLESS === "true";
    logger.info("Launching browser...");
    browser = await puppeteer.launch({
      headless: isHeadless,
      timeout: 90000,
      protocolTimeout: 90000,
      defaultViewport: null,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-features=FederatedCredentialManagement",
        "--start-maximized",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-http2",
        "--disable-gpu",
      ],
      ignoreDefaultArgs: ['--disable-extensions'],
    });

    logger.info("Browser launched successfully");
    const page = await browser.newPage();

    // Check if credentials are provided and perform login
    if (!credentials) {
      throw new Error("Credentials are required for scraping Naukri jobs");
    }

    logger.info("Initiating login process...");
    await page.setViewport({ width: 1000, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    const sessionFilePath = "./naukrisession.json";
    const loginSuccess = await loginToNaukri(
      page,
      credentials,
      sessionFilePath
    );

    if (!loginSuccess) {
      logger.error("Failed to login to Naukri");
      throw new Error("Login failed");
    }

    // Wait for session establishment
    logger.info("Login successful, waiting for session establishment...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // URL construction with proper encoding
    const baseUrl = "https://www.naukri.com";
    const isMultipleQueries = Array.isArray(searchQuery);

    // Create the URL slug part
    let searchSlug;
    let queryParam;

    if (isMultipleQueries) {
      searchSlug = searchQuery
        .map((query) => query.trim().replace(/\s+/g, "-").toLowerCase())
        .join("-");
      queryParam = searchQuery.map((query) => query.trim()).join(", ");
    } else {
      searchSlug = searchQuery.trim().replace(/\s+/g, "-").toLowerCase();
      queryParam = searchQuery.trim();
    }

    // Create query parameters
    const params = new Map();
    params.set("k", queryParam);
    if (experience) params.set("experience", experience);
    if (jobAge) params.set("jobAge", jobAge);
    if (location) params.set("location", location);
    if (workMode) params.set("workType", workMode);
    if (salary) params.set("salary", salary);
    if (jobPostType) params.set("jobPostType", jobPostType);
    if (qcrc) params.set("glbl_qcrc", qcrc);
    if (companyType) params.set("companyType", companyType);
    if (postedBy) params.set("postedBy", postedBy);

    // Handle businessSize (can be an array or single value)
    if (businessSize) {
      if (Array.isArray(businessSize)) {
        businessSize.forEach((size) => params.set(`qbusinessSize`, size));
      } else {
        params.set("qbusinessSize", businessSize);
      }
    }

    // Handle topCompanies (array of company IDs)
    if (topCompanies) {
      if (Array.isArray(topCompanies)) {
        topCompanies.forEach((companyId) => params.set(`qctopGroupId`, companyId));
      } else {
        params.set("qctopGroupId", topCompanies);
      }
    }

    // Construct query string
    const queryString = Array.from(params.entries())
      .map(([key, value]) => {
        if (key === "qbusinessSize" && Array.isArray(businessSize)) {
          return businessSize
            .map((size) => `${key}=${encodeURIComponent(size)}`)
            .join("&");
        }
        if (key === "qctopGroupId" && Array.isArray(topCompanies)) {
          return topCompanies
            .map((companyId) => `${key}=${encodeURIComponent(companyId)}`)
            .join("&");
        }
        return `${key}=${encodeURIComponent(value)}`;
      })
      .filter((str) => str)
      .join("&");

    const url = `${baseUrl}/${searchSlug}-jobs?${queryString}`;
    logger.info("Navigating to:", url);

    let pageLoaded = false;
    let retryCount = 0;
    const maxRetries = 4;
    while (!pageLoaded && retryCount < maxRetries) {
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await page.waitForSelector(".srp-jobtuple-wrapper", { timeout: 25000 });
        pageLoaded = true;
      } catch (error) {
        retryCount++;
        logger.error(`Page load attempt ${retryCount} failed:`, error);
        if (retryCount >= maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    const totalAvailablePages = await getTotalPages(page);
    logger.info(`Total available pages: ${totalAvailablePages}`);

    const pagesToScrape = Math.max(maxPages, totalAvailablePages);
    logger.info(`Will scrape ${pagesToScrape} pages`);

    const allJobs = [];
    for (let currentPage = 1; currentPage <= pagesToScrape; currentPage++) {
      logger.info(`Scraping page ${currentPage} of ${pagesToScrape}`);

      if (currentPage > 1) {
        const pageUrl = `${baseUrl}/${searchSlug}-jobs-${currentPage}?${queryString}`;
        let pageLoadSuccess = false;
        let pageRetries = 0;

        while (!pageLoadSuccess && pageRetries < 4) {
          try {
            await page.goto(pageUrl, {
              waitUntil: "domcontentloaded",
              timeout: 45000,
            });
            await page.waitForSelector(".srp-jobtuple-wrapper", {
              timeout: 25000,
            });
            pageLoadSuccess = true;
          } catch (error) {
            pageRetries++;
            logger.error(
              `Failed to load page ${currentPage}, attempt ${pageRetries}:`,
              error
            );
            if (pageRetries === 3) break;
            await new Promise((resolve) => setTimeout(resolve, 6000));
          }
        }

        if (!pageLoadSuccess) {
          logger.error(`Skipping page ${currentPage} after failed attempts`);
          continue;
        }
      }

      const jobs = await extractJobsFromPage(page, currentPage);
      logger.info(`Found ${jobs.length} jobs on page ${currentPage}`);

      if (jobs.length > 0) {
        allJobs.push(...jobs);
      } else {
        logger.debug("No jobs found on page, waiting and retrying...");
        await new Promise((resolve) => setTimeout(resolve, 8000));

        const retryJobs = await extractJobsFromPage(page, currentPage);
        if (retryJobs.length > 0) {
          allJobs.push(...retryJobs);
          logger.info(`Retrieved ${retryJobs.length} jobs after retry`);
        } else {
          logger.error(
            `No jobs found on page ${currentPage} after retry, may have reached end`
          );
          break;
        }
      }

      if (currentPage < pagesToScrape) {
        const delay = Math.floor(Math.random() * (5000 - 3000 + 1) + 3000);
        logger.info(`Waiting ${delay}ms before next page...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    const filteredJobs = filterJobs(allJobs);
    logger.info(`Retained ${filteredJobs.length} jobs after filtering`);
    if (credentials?.isCalledForMNC) {

      emailConfig.isOnlyMNC = true
    }
    return filteredJobs;
  } catch (error) {
    await handleScrapingFailure(error, partialJobs, searchQuery);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ## construction url changes in the scraper
// async function scrapeNaukriJobs(searchQuery, options = {}) {
//   const {
//     maxPages = 1,
//     experience = null,
//     jobAge = null,
//     location = null,
//     workMode = null,
//     salary = null,
//     credentials = null,
//   } = options;

//   let browser;
//   let partialJobs = [];

//   try {
//     logger.info("Launching browser...");
//     browser = await puppeteer.launch({
//       headless: false,
//       defaultViewport: null,
//       args: [
//         "--no-sandbox",
//         "--disable-setuid-sandbox",
//         "--disable-features=FederatedCredentialManagement",
//         "--start-maximized",
//         "--disable-web-security",
//         "--disable-features=IsolateOrigins,site-per-process",
//         "--start-maximized",
//         "--window-position=-10000,0",
//       ],
//     });

//     const page = await browser.newPage();
//     // If credentials are provided, perform login
//     // if (credentials) {
//     //   logger.info("Logging in to Naukri...");
//     //   await page.setViewport({ width: 1000, height: 768 });
//     //   await page.setUserAgent(
//     //     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
//     //   );
//     //   const sessionFilePath = "./naukrisession.json";
//     //   const sessionData = await loginToNaukri(
//     //     page,
//     //     credentials,
//     //     sessionFilePath
//     //   );
//     //   if (!sessionData) {
//     //     logger.error("Failed to login");
//     //     throw new Error("Login failed");
//     //   }
//     //   // Wait a moment after login to ensure session is established.
//     //   await new Promise((resolve) => setTimeout(resolve, 3000));
//     // }

//     // URL construction with proper encoding
//     const baseUrl = "https://www.naukri.com";

//     // Create URL-friendly slug for the path
//     const searchSlug = searchQuery.trim().replace(/\s+/g, "-").toLowerCase();

//     // Create query parameters
//     const params = new Map();
//     params.set("k", searchQuery.trim());
//     if (experience) params.set("experience", experience);
//     if (jobAge) params.set("jobAge", jobAge);
//     if (location) params.set("location", location);
//     if (workMode) params.set("workType", workMode);
//     if (salary) params.set("salary", salary);

//     // Manually construct query string with proper encoding
//     const queryString = Array.from(params.entries())
//       .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
//       .join("&");

//     // Construct initial URL for first page
//     const url = `${baseUrl}/${searchSlug}-jobs?${queryString}`;
//     logger.info("Navigating to:", url);

//     let pageLoaded = false;
//     let retryCount = 0;
//     while (!pageLoaded && retryCount < 3) {
//       try {
//         await page.goto(url, {
//           waitUntil: ["networkidle0", "domcontentloaded"],
//           timeout: 30000,
//         });
//         await page.waitForSelector(".srp-jobtuple-wrapper", { timeout: 15000 });
//         pageLoaded = true;
//       } catch (error) {
//         retryCount++;
//         logger.error(`Page load attempt ${retryCount} failed:`, error);
//         if (retryCount === 3) throw error;
//         await new Promise((resolve) => setTimeout(resolve, 5000));
//       }
//     }

//     const totalAvailablePages = await getTotalPages(page);
//     logger.info(`Total available pages: ${totalAvailablePages}`);

//     const pagesToScrape = Math.max(maxPages, totalAvailablePages);
//     logger.info(`Will scrape ${pagesToScrape} pages`);

//     const allJobs = [];
//     for (let currentPage = 1; currentPage <= pagesToScrape; currentPage++) {
//       logger.info(`Scraping page ${currentPage} of ${pagesToScrape}`);

//       if (currentPage > 1) {
//         // Modified URL construction for pagination
//         const pageUrl = `${baseUrl}/${searchSlug}-jobs-${currentPage}?${queryString}`;
//         let pageLoadSuccess = false;
//         let pageRetries = 0;

//         while (!pageLoadSuccess && pageRetries < 3) {
//           try {
//             await page.goto(pageUrl, {
//               waitUntil: ["networkidle0", "domcontentloaded"],
//               timeout: 30000,
//             });
//             await page.waitForSelector(".srp-jobtuple-wrapper", {
//               timeout: 15000,
//             });
//             pageLoadSuccess = true;
//           } catch (error) {
//             pageRetries++;
//             logger.error(
//               `Failed to load page ${currentPage}, attempt ${pageRetries}:`,
//               error
//             );
//             if (pageRetries === 3) break;
//             await new Promise((resolve) => setTimeout(resolve, 6000));
//           }
//         }

//         if (!pageLoadSuccess) {
//           logger.error(`Skipping page ${currentPage} after failed attempts`);
//           continue;
//         }
//       }

//       const jobs = await extractJobsFromPage(page, currentPage);
//       logger.info(`Found ${jobs.length} jobs on page ${currentPage}`);

//       if (jobs.length > 0) {
//         allJobs.push(...jobs);
//       } else {
//         logger.debug("No jobs found on page, waiting and retrying...");
//         await new Promise((resolve) => setTimeout(resolve, 8000));

//         const retryJobs = await extractJobsFromPage(page, currentPage);
//         if (retryJobs.length > 0) {
//           allJobs.push(...retryJobs);
//           logger.info(`Retrieved ${retryJobs.length} jobs after retry`);
//         } else {
//           logger.error(
//             `No jobs found on page ${currentPage} after retry, may have reached end`
//           );
//           break;
//         }
//       }

//       if (currentPage < pagesToScrape) {
//         const delay = Math.floor(Math.random() * (5000 - 3000 + 1) + 3000);
//         logger.info(`Waiting ${delay}ms before next page...`);
//         await new Promise((resolve) => setTimeout(resolve, delay));
//       }
//     }

//     const filteredJobs = filterJobs(allJobs);
//     logger.info(`Retained ${filteredJobs.length} jobs after filtering`);

//     return filteredJobs;
//   } catch (error) {
//     await handleScrapingFailure(error, partialJobs, searchQuery);
//     throw error;
//   } finally {
//     if (browser) {
//       await browser.close();
//     }
//   }
// }

// async function scrapeNaukriJobs(searchQuery, options = {}) {
//   const {
//     maxPages = 5,
//     experience = null,
//     jobAge = null,
//     location = null,
//     workMode = null,
//     salary = null,
//   } = options;

//   // Get current application count

//   let browser;
//   let partialJobs = [];

//   try {
//     logger.info("Launching browser...");
//     browser = await puppeteer.launch({
//       headless: false,
//       defaultViewport: null,
//       args: [
//         "--no-sandbox",
//         "--disable-setuid-sandbox",
//         "--disable-features=FederatedCredentialManagement",
//         "--start-maximized",
//         "--disable-web-security",
//         "--disable-features=IsolateOrigins,site-per-process",
//         "--start-maximized",
//         // "--window-position=-10000,0",
//       ],
//     });

//     const page = await browser.newPage();

//     const baseUrl = "https://www.naukri.com";
//     const searchTerm = searchQuery.replace(/\s+/g, "-").toLowerCase();

//     const urlParams = new URLSearchParams();
//     urlParams.append("k", searchQuery.replace(/-/g, " "));
//     urlParams.append("nignbevent_src", "jobsearchDeskGNB");

//     if (experience) urlParams.append("experience", experience);
//     if (jobAge) urlParams.append("jobAge", jobAge);
//     if (location) urlParams.append("location", location);
//     if (workMode) urlParams.append("workType", workMode);
//     if (salary) urlParams.append("salary", salary);

//     // Initial URL for first page
//     const url = `${baseUrl}/${searchTerm}-jobs?${urlParams.toString()}`;
//     logger.info("Navigating to:", url);

//     let pageLoaded = false;
//     let retryCount = 0;
//     while (!pageLoaded && retryCount < 3) {
//       try {
//         await page.goto(url, {
//           waitUntil: ["networkidle0", "domcontentloaded"],
//           timeout: 30000,
//         });
//         await page.waitForSelector(".srp-jobtuple-wrapper", { timeout: 15000 });
//         pageLoaded = true;
//       } catch (error) {
//         retryCount++;
//         logger.error(`Page load attempt ${retryCount} failed:`, error);
//         if (retryCount === 3) throw error;
//         await new Promise((resolve) => setTimeout(resolve, 5000));
//       }
//     }

//     const totalAvailablePages = await getTotalPages(page);
//     logger.info(`Total available pages: ${totalAvailablePages}`);

//     const pagesToScrape = Math.max(maxPages, totalAvailablePages);
//     logger.info(`Will scrape ${pagesToScrape} pages`);

//     const allJobs = [];
//     for (let currentPage = 1; currentPage <= pagesToScrape; currentPage++) {
//       logger.info(`Scraping page ${currentPage} of ${pagesToScrape}`);

//       if (currentPage > 1) {
//         // Modified URL construction for pagination
//         const pageUrl = `${baseUrl}/${searchTerm}-jobs-${currentPage}?${urlParams.toString()}`;
//         let pageLoadSuccess = false;
//         let pageRetries = 0;

//         while (!pageLoadSuccess && pageRetries < 3) {
//           try {
//             await page.goto(pageUrl, {
//               waitUntil: ["networkidle0", "domcontentloaded"],
//               timeout: 30000,
//             });
//             await page.waitForSelector(".srp-jobtuple-wrapper", {
//               timeout: 15000,
//             });
//             pageLoadSuccess = true;
//           } catch (error) {
//             pageRetries++;
//             logger.error(
//               `Failed to load page ${currentPage}, attempt ${pageRetries}:`,
//               error
//             );
//             if (pageRetries === 3) break;
//             await new Promise((resolve) => setTimeout(resolve, 6000));
//           }
//         }

//         if (!pageLoadSuccess) {
//           logger.error(`Skipping page ${currentPage} after failed attempts`);
//           continue;
//         }
//       }

//       const jobs = await extractJobsFromPage(page, currentPage);
//       logger.info(`Found ${jobs.length} jobs on page ${currentPage}`);

//       if (jobs.length > 0) {
//         allJobs.push(...jobs);
//       } else {
//         logger.debug("No jobs found on page, waiting and retrying...");
//         await new Promise((resolve) => setTimeout(resolve, 8000));

//         const retryJobs = await extractJobsFromPage(page, currentPage);
//         if (retryJobs.length > 0) {
//           allJobs.push(...retryJobs);
//           logger.info(`Retrieved ${retryJobs.length} jobs after retry`);
//         } else {
//           logger.error(
//             `No jobs found on page ${currentPage} after retry, may have reached end`
//           );
//           break;
//         }
//       }

//       if (currentPage < pagesToScrape) {
//         const delay = Math.floor(Math.random() * (5000 - 3000 + 1) + 3000);
//         logger.info(`Waiting ${delay}ms before next page...`);
//         await new Promise((resolve) => setTimeout(resolve, delay));
//       }
//     }
//     const filteredJobs = filterJobs(allJobs);
//     logger.info(`Retained ${filteredJobs.length} jobs after filtering`);

//     // const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
//     // const filename = `naukri-jobs-${timestamp}.txt`;
//     // await fs.writeFile(filename, JSON.stringify(allJobs, null, 2), "utf8");
//     // logger.info(`Saved ${allJobs.length} jobs to ${filename}`);
//     // await handleScrapingSuccess(allJobs, filename, searchQuery, options);

//     return filteredJobs;
//   } catch (error) {
//     await handleScrapingFailure(error, partialJobs, searchQuery);
//     throw error;
//   } finally {
//     if (browser) {
//       await browser.close();
//     }
//   }
// }

module.exports = {
  scrapeNaukriJobs,
};
