const fs = require("fs").promises;
const path = require("path");
const logger = require("../utils/logger");

const APPLICATION_TRACKER_FILE = path.join(
  __dirname,
  "job_application_tracker.json"
);

// Helper function to get today's date in YYYY-MM-DD format
function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

async function getApplicationCount() {
  try {
    const data = await fs.readFile(APPLICATION_TRACKER_FILE, "utf8");
    const trackerData = JSON.parse(data);
    return {
      successfullyApplied: trackerData.successfullyApplied || 0,
      successfullyAppliedTillNow: trackerData.successfullyAppliedTillNow || 0,
      lastResetDate: trackerData.lastResetDate || getTodayDate(),
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      // File doesn't exist, so return default values.
      return {
        successfullyApplied: 0,
        successfullyAppliedTillNow: 0,
        lastResetDate: getTodayDate(),
      };
    }
    throw error;
  }
}
async function getshouldSendEmailCounter() {
  try {
    const data = await fs.readFile(APPLICATION_TRACKER_FILE, "utf8");
    const trackerData = JSON.parse(data);
    return {
      shouldSendEmailCounter: trackerData.shouldSendEmailCounter || 0,

    };
  } catch (error) {
    if (error.code === "ENOENT") {
      // File doesn't exist, so return default values.
      return {
        shouldSendEmailCounter: 0,
      };
    }
    throw error;
  }
}

async function updateApplicationCount(newApplications) {
  try {
    // Initialize tracker data
    let trackerData = {
      successfullyApplied: 0,
      successfullyAppliedTillNow: 0,
      lastResetDate: getTodayDate(),
    };

    try {
      const existingData = await fs.readFile(APPLICATION_TRACKER_FILE, "utf8");
      trackerData = JSON.parse(existingData);
    } catch (readError) {
      if (readError.code !== "ENOENT") {
        throw readError;
      }
    }

    const today = getTodayDate();

    // Check if the day has changed. If yes, reset successfullyApplied for the new day.
    if (trackerData.lastResetDate !== today) {
      logger.info(`New day detected. Resetting today's job application count.`);
      trackerData.successfullyApplied = 0;
      trackerData.lastResetDate = today;
    }

    // Update counts with new applications
    trackerData.successfullyApplied += newApplications;
    trackerData.successfullyAppliedTillNow += newApplications;

    // Write updated data back to the file
    await fs.writeFile(
      APPLICATION_TRACKER_FILE,
      JSON.stringify(trackerData, null, 2)
    );

    // Log the results
    logger.info(
      "\n====> Total Jobs Applied Till Now ====> ",
      trackerData.successfullyAppliedTillNow
    );
    logger.info(
      "\n====> Total Jobs Applied Today ====> ",
      trackerData.successfullyApplied
    );

    return trackerData;
  } catch (error) {
    console.error("Error updating application count:", error);
    throw error;
  }
}


async function updateshouldSendEmailCounter() {
  try {
    // Initialize tracker data
    let trackerData = {
      shouldSendEmailCounter: 0,
      lastCounterResetDate: getTodayDate(),
    };

    try {
      const existingData = await fs.readFile(APPLICATION_TRACKER_FILE, "utf8");
      trackerData = JSON.parse(existingData);
    } catch (readError) {
      if (readError.code !== "ENOENT") {
        throw readError;
      }
    }

    const today = getTodayDate();

    // Check if the day has changed. If yes, reset successfullyApplied for the new day.
    if (trackerData.lastCounterResetDate !== today) {
      logger.info(`New day detected. Resetting today's job application count.`);
      trackerData.shouldSendEmailCounter = 0;
      trackerData.lastCounterResetDate = today;
    }

    trackerData.shouldSendEmailCounter += 1;

    // Write updated data back to the file
    await fs.writeFile(
      APPLICATION_TRACKER_FILE,
      JSON.stringify(trackerData, null, 2)
    );

    // Log the results
    logger.info("\n=> should trigger email couter => ", trackerData.shouldSendEmailCounter)
    return trackerData;
  } catch (error) {
    console.error("Error updating application count:", error);
    throw error;
  }
}

module.exports = {
  updateApplicationCount,
  getApplicationCount,
  updateshouldSendEmailCounter,
  getshouldSendEmailCounter
};