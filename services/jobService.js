const Job = require('../models/Job');
const logger = require('../src/utils/logger');
const mongoose = require('mongoose');

class JobService {
  /**
   * Check if MongoDB is connected
   */
  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  /**
   * Save a job to database (prevents duplicates)
   */
  async saveJob(jobData) {
    if (!this.isConnected()) {
      logger.info('MongoDB not connected, skipping job save');
      return null;
    }

    try {
      // Determine status
      let status = 'skipped';
      if (jobData.appliedAt && jobData.appliedAt !== 'N/A') {
        status = 'applied';
      } else if (jobData.reason && jobData.reason.includes('Already applied')) {
        status = 'already_applied';
      } else if (jobData.reason && (jobData.reason.includes('failed') || jobData.reason.includes('Navigation failed'))) {
        status = 'failed';
      }

      // Parse appliedAt date
      let appliedAtDate = null;
      if (jobData.appliedAt && jobData.appliedAt !== 'N/A') {
        appliedAtDate = new Date(jobData.appliedAt);
      }

      const job = new Job({
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        link: jobData.link,
        reason: jobData.reason || 'N/A',
        appliedAt: appliedAtDate,
        status: status,
      });

      await job.save();
      return job;
    } catch (error) {
      // Duplicate key error (job already exists)
      if (error.code === 11000) {
        logger.info(`Job already exists in DB: ${jobData.title}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Save multiple jobs (bulk insert with duplicate prevention)
   */
  async saveJobs(jobsArray) {
    if (!this.isConnected()) {
      logger.info('MongoDB not connected, skipping bulk job save');
      return {
        saved: 0,
        duplicates: 0,
        errors: jobsArray.length,
      };
    }

    const results = {
      saved: 0,
      duplicates: 0,
      errors: 0,
    };

    for (const jobData of jobsArray) {
      try {
        const saved = await this.saveJob(jobData);
        if (saved) {
          results.saved++;
        } else {
          results.duplicates++;
        }
      } catch (error) {
        logger.error(`Error saving job: ${error.message}`);
        results.errors++;
      }
    }

    return results;
  }

  /**
   * Get all jobs from today
   */
  async getTodaysJobs() {
    if (!this.isConnected()) {
      return [];
    }

    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const jobs = await Job.find({
        createdAt: { $gte: startOfDay }
      }).sort({ createdAt: -1 });

      return jobs;
    } catch (error) {
      logger.error('Error fetching jobs:', error);
      return [];
    }
  }

  /**
   * Get job statistics
   */
  async getJobStats() {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const stats = await Job.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfDay }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const result = {
        total: 0,
        applied: 0,
        skipped: 0,
        alreadyApplied: 0,
        failed: 0,
      };

      stats.forEach(stat => {
        result.total += stat.count;
        if (stat._id === 'applied') result.applied = stat.count;
        if (stat._id === 'skipped') result.skipped = stat.count;
        if (stat._id === 'already_applied') result.alreadyApplied = stat.count;
        if (stat._id === 'failed') result.failed = stat.count;
      });

      return result;
    } catch (error) {
      logger.error('Error fetching stats:', error);
      return { total: 0, applied: 0, skipped: 0, alreadyApplied: 0, failed: 0 };
    }
  }

  /**
   * Manually clear old jobs (backup to TTL)
   */
  async clearOldJobs() {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await Job.deleteMany({
        createdAt: { $lt: oneDayAgo }
      });
      logger.info(`Cleared ${result.deletedCount} old jobs`);
      return result.deletedCount;
    } catch (error) {
      logger.error('Error clearing old jobs:', error);
      return 0;
    }
  }

  /**
   * Check if job exists
   */
  async jobExists(link) {
    try {
      const job = await Job.findOne({ link });
      return !!job;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new JobService();
