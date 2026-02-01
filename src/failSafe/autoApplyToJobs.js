const JobApplicationTracker = require("./jobApplicationTracker");
const EmailNotificationService = require("./emailNotificationService");
const { autoApplyToJobs } = require("../autoApply/autoApply");

async function autoApplyToJobsSf(jobs, credentials, config = {}) {
  const tracker = new JobApplicationTracker();
  const emailService = new EmailNotificationService(config.email);

  const remainingJobs = await tracker.getRemainingJobs(jobs);

  try {
    for (const job of remainingJobs) {
      try {
        // Existing job application logic
        const result = await autoApplyToJobs(job, credentials);

        if (result.success) {
          await tracker.recordAppliedJob(
            job,
            result.skills,
            result.matchPercentage
          );
        } else {
          await tracker.recordSkippedJob(job, result.reason);
        }

        // Rate limiting logic
        await handleRateLimiting(result.success);
      } catch (jobError) {
        await tracker.recordSkippedJob(job, jobError.message);
      }
    }

    const config = await tracker.readConfig();
    await emailService.sendApplicationReport(
      config.appliedJobs,
      config.skippedJobs
    );
  } catch (error) {
    console.error("Job application process failed:", error);
  }
}

module.exports = autoApplyToJobsSf;
