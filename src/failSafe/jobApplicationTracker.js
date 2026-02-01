const fs = require("fs").promises;
const path = require("path");

class JobApplicationTracker {
  constructor(configPath = "./job_application_config.json") {
    this.configPath = configPath;
    this.defaultConfig = {
      appliedJobs: [],
      skippedJobs: [],
      processedJobIds: new Set(),
      lastProcessedIndex: -1,
      startTimestamp: null,
    };
  }

  async saveProgress(data) {
    try {
      const currentConfig = await this.readConfig();
      const updatedConfig = {
        ...currentConfig,
        ...data,
        lastUpdated: new Date().toISOString(),
      };
      await fs.writeFile(
        this.configPath,
        JSON.stringify(updatedConfig, null, 2)
      );
    } catch (error) {
      console.error("Error saving job application progress:", error);
    }
  }

  async readConfig() {
    try {
      const configContent = await fs.readFile(this.configPath, "utf8");
      return JSON.parse(configContent);
    } catch (error) {
      return this.defaultConfig;
    }
  }

  async recordAppliedJob(job, skills, matchPercentage) {
    const config = await this.readConfig();
    config.appliedJobs.push({
      ...job,
      appliedAt: new Date().toISOString(),
      skills,
      matchPercentage,
    });
    config.processedJobIds.add(job.id);
    await this.saveProgress(config);
  }

  async recordSkippedJob(job, reason) {
    const config = await this.readConfig();
    config.skippedJobs.push({
      ...job,
      skippedAt: new Date().toISOString(),
      reason,
    });
    config.processedJobIds.add(job.id);
    await this.saveProgress(config);
  }

  async getRemainingJobs(allJobs) {
    const config = await this.readConfig();
    return allJobs.filter((job) => !config.processedJobIds.has(job.id));
  }

  async resetProgress() {
    await fs.writeFile(
      this.configPath,
      JSON.stringify(this.defaultConfig, null, 2)
    );
  }
}

module.exports = JobApplicationTracker;
