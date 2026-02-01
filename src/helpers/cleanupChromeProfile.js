const fs = require("fs").promises;
const path = require("path");
const rimraf = require("rimraf");

async function waitAndRetry(fn, maxRetries = 3, delay = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fn();
      return true;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return false;
}

async function cleanupChromeProfile() {
  try {
    const tempDir = path.join(require("os").tmpdir());
    const profileDirs = await fs.readdir(tempDir);

    for (const dir of profileDirs) {
      if (dir.includes("puppeteer_dev_chrome_profile")) {
        const profilePath = path.join(tempDir, dir);

        try {
          // Remove lockfile with retry
          const lockFile = path.join(profilePath, "lockfile");
          await waitAndRetry(async () => {
            try {
              await fs.unlink(lockFile);
            } catch (e) {
              if (e.code !== "ENOENT") throw e;
            }
          });

          // Use fs.rm instead of rimraf
          await waitAndRetry(async () => {
            await fs.rm(profilePath, { recursive: true, force: true });
          });

          console.log(`Successfully removed profile directory: ${dir}`);
        } catch (err) {
          console.warn(`All cleanup attempts failed for ${dir}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("Error in Chrome profile cleanup:", err);
  }
}

// Export the cleanup function
module.exports = { cleanupChromeProfile };
