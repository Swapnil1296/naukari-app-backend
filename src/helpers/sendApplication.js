const { sendEmailNotification } = require("../config/emailService");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

async function sendApplicationReport({
  to,
  appliedJobs,
  skippedJobs,
  attachments,
  experience,
  Title,
}) {
  // Save jobs to file and MongoDB
  try {
    // Only save jobs with specific failure reasons
    const jobsToSave = [
      ...appliedJobs.map(job => ({
        title: job.title,
        company: job.company,
        location: job.location || "N/A",
        link: job.link,
        reason: "N/A",
        appliedAt: job.appliedAt || new Date().toISOString(),
        matchPercentage: job.matchPercentage,
        matchedSkills: job.matchedSkills || []
      })),
      ...skippedJobs
        .filter(job => 
          job?.reason && (
            job.reason.includes("Company website redirect") ||
            job.reason.includes("Apply failed: Application did not complete successfully")
          )
        )
        .map(job => ({
          title: job.title,
          company: job.company,
          location: job.location || "N/A",
          link: job.link,
          reason: job.reason || "N/A",
          appliedAt: "N/A",
          matchPercentage: job.matchPercentage,
          matchedSkills: job.matchedSkills || []
        }))
    ];

    if (jobsToSave.length === 0) {
      logger.info('No jobs to save (no applied jobs or failed applications)');
      return;
    }

    // Save to JSON file (backup)
    const jobsFilePath = path.join(__dirname, "files/jobs_sent_over_email.json");
    const jobsDir = path.dirname(jobsFilePath);
    
    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
    }

    // Read existing jobs
    let existingJobs = [];
    if (fs.existsSync(jobsFilePath)) {
      try {
        existingJobs = JSON.parse(fs.readFileSync(jobsFilePath, 'utf8'));
      } catch (error) {
        logger.error('Error reading existing jobs file:', error);
      }
    }

    // Merge and deduplicate by link
    const jobMap = new Map();
    [...existingJobs, ...jobsToSave].forEach(job => {
      if (job.link) {
        jobMap.set(job.link, job);
      }
    });
    const mergedJobs = Array.from(jobMap.values());

    // Save to file
    fs.writeFileSync(jobsFilePath, JSON.stringify(mergedJobs, null, 2));
    logger.info(`Saved ${jobsToSave.length} jobs to file (${mergedJobs.length} total)`);
    logger.info(`  - Applied: ${appliedJobs.length}`);
    logger.info(`  - Failed/Redirect: ${jobsToSave.length - appliedJobs.length}`);

    // Try to save to MongoDB via API (if backend is running)
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      await axios.post(`${backendUrl}/api/jobs/save`, { jobs: jobsToSave }, {
        timeout: 5000
      });
      logger.info('Jobs saved to MongoDB via API');
    } catch (apiError) {
      // Silently fail if backend API is not available
      logger.warn('Could not save to MongoDB (backend may not be running)');
    }
  } catch (error) {
    logger.error('Error saving jobs:', error);
    // Continue with email even if save fails
  }

  const appliedJobsHtml =
    appliedJobs.length > 0
      ? appliedJobs
          .map(
            (job) => `
          <tr>
            <td>${job.title}</td>
            <td>${job.company}</td>
            <td>${job.location || "N/A"}</td>
            <td>${job.appliedAt}</td>
           <td>${job?.matchPercentage ? job.matchPercentage.toFixed(2) : 'N/A'}%</td>
              <td>${job.matchedSkills ? job.matchedSkills.join(", ") : 'N/A'}</td>
          </tr>
        `
          )
          .join("")
      : [];

  const skippedJobsHtml = skippedJobs
    .map(
      (job) => `
          <tr>
              <td>${job.title}</td>
              <td>${job.company}</td>
              <td>${job.location || "N/A"}</td>
              <td>${job.reason}</td>
              <td><a href="${job.link}" target="_blank">${job.link}</a></td>
              <td>${
                job?.matchPercentage ? job.matchPercentage.toFixed(2) : "N/A"
              }%</td>
              <td>${
                job.matchedSkills ? job.matchedSkills.join(", ") : "N/A"
              }</td>
          </tr>
      `
    )
    .join("");

  const emailHtml = `
          <h2>${Title}</h2>
          
          <h3>Successfully Applied Jobs (${appliedJobs.length}) for (${experience} years of experience)</h3>
          <table border="1" style="border-collapse: collapse; width: 100%;">
            <thead>
              <tr style="background-color: #f2f2f2;">
                <th style="padding: 8px;">Title</th>
                <th style="padding: 8px;">Company</th>
                <th style="padding: 8px;">Location</th>
                <th style="padding: 8px;">Applied At</th>
                 <th style="padding: 8px;">Match Percentage</th>
          <th style="padding: 8px;">Matched Skills</th>
              </tr>
            </thead>
            <tbody>
              ${
                appliedJobsHtml ||
                '<tr><td colspan="4" style="text-align:center;">No jobs applied</td></tr>'
              }
            </tbody>
          </table>
      
          <h3>Skipped Jobs (${skippedJobs.length})</h3>
          <table border="1" style="border-collapse: collapse; width: 100%;">
            <thead>
              <tr style="background-color: #f2f2f2;">
                <th style="padding: 8px;">Title</th>
                <th style="padding: 8px;">Company</th>
                <th style="padding: 8px;">Location</th>
                <th style="padding: 8px;">Reason</th>
                <th style="padding: 8px;">Link</th>
                <th style="padding: 8px;">Match Percentage</th>
                <th style="padding: 8px;">Matched Skills</th>
              </tr>
            </thead>
            <tbody>
              ${
                skippedJobsHtml ||
                '<tr><td colspan="5" style="text-align:center;">No jobs skipped</td></tr>'
              }
            </tbody>
          </table>
        `;

  await sendEmailNotification(`Naukri Job Application Report`, emailHtml, 
    to,
  );

  logger.info("Application report email sent successfully");
}

module.exports = sendApplicationReport;