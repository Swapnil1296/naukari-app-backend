const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

async function loginToNaukri(page, credentials, sessionFilePath) {
  try {
    if (fs.existsSync(sessionFilePath)) {
      logger.info("Session file found. Using existing session...");

      // Use fs.readFileSync instead of require() to avoid caching issues
      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, "utf8"));

      // Restore cookies
      await page.setCookie(...sessionData.cookies);
      return true;
    }
    logger.info("Attempting to login to Naukri via cred...");

    await page.goto("https://www.naukri.com/nlogin/login", {
      waitUntil: ["networkidle0", "domcontentloaded"],
      timeout: 60000,
    });

    await page.waitForSelector(
      'input[placeholder="Enter Email ID / Username"]',
      {
        timeout: 60000,
      }
    );

    await page.type(
      'input[placeholder="Enter Email ID / Username"]',
      credentials.username
    );
    await page.type(
      'input[placeholder="Enter Password"]',
      credentials.password
    );
    await page.click('button[type="submit"]');

    // Wait for successful login
    await Promise.race([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 }),
      page.waitForSelector('[class*="nI-gNb-drawer"]', { timeout: 60000 }),
    ]);

    const cookies = await page.cookies();
    fs.writeFileSync(sessionFilePath, JSON.stringify({ cookies }, null, 2));

    logger.info("Session file saved!");
    return true;
  } catch (error) {
    logger.error("Login failed:", error);
    throw error;
  }
}
module.exports = loginToNaukri;
