const express = require('express');
const cors = require('cors');
const path = require('path');

// Load environment variables from backend directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Connect to MongoDB
const connectDB = require('./config/database');
connectDB();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Import scraper modules
const { scrapeNaukriJobs } = require('./src/scraper/scraper');
const { autoApplyToJobs } = require('./src/autoApply/autoApply');
const { autoApplyToJobsUsingAi } = require('./src/autoApply/autoApplyUsingAi');
const { getApplicationCount } = require('./src/helpers/appliedCount');
const loginToNaukri = require('./src/auth/loginToNaukar'); // Default export, not destructured
const logger = require('./src/utils/logger');
const puppeteer = require('puppeteer');
const { cleanupChromeProfile } = require('./src/helpers/cleanupChromeProfile');
const fs = require('fs');
const jobService = require('./services/jobService');

// Global state
let scraperState = {
  isRunning: false,
  browser: null,
  logs: [],
  stats: {
    jobsFound: 0,
    applied: 0,
    skipped: 0
  }
};

// Custom logger to capture logs
const captureLog = (level, message) => {
  const logEntry = {
    level,
    message: typeof message === 'object' ? JSON.stringify(message) : message,
    timestamp: new Date().toISOString()
  };
  scraperState.logs.push(logEntry);
  if (scraperState.logs.length > 100) {
    scraperState.logs.shift();
  }
};

// Override logger methods
const originalInfo = logger.info;
const originalError = logger.error;
logger.info = (...args) => {
  captureLog('info', args.join(' '));
  originalInfo.apply(logger, args);
};
logger.error = (...args) => {
  captureLog('error', args.join(' '));
  originalError.apply(logger, args);
};

// Routes
app.get('/api/status', async (req, res) => {
  try {
    const { successfullyApplied } = await getApplicationCount();
    res.json({
      isRunning: scraperState.isRunning,
      jobsFound: scraperState.stats.jobsFound,
      applied: scraperState.stats.applied,
      skipped: scraperState.stats.skipped,
      dailyLimit: successfullyApplied,
      maxLimit: 50
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

app.get('/api/scrape/logs', (req, res) => {
  res.json({
    logs: scraperState.logs,
    isRunning: scraperState.isRunning
  });
});

app.post('/api/scrape/start', async (req, res) => {
  if (scraperState.isRunning) {
    return res.status(400).json({ error: 'Scraper is already running' });
  }

  const config = req.body;
  scraperState.isRunning = true;
  scraperState.logs = [];
  scraperState.stats = { jobsFound: 0, applied: 0, skipped: 0 };

  res.json({ message: 'Scraper started', status: 'running' });

  // Run scraper in background
  runScraper(config).catch(error => {
    logger.error('Scraper error:', error);
    scraperState.isRunning = false;
  });
});

app.post('/api/scrape/stop', async (req, res) => {
  if (!scraperState.isRunning) {
    return res.status(400).json({ error: 'Scraper is not running' });
  }

  try {
    if (scraperState.browser) {
      await scraperState.browser.close();
      scraperState.browser = null;
    }
    await cleanupChromeProfile();
    scraperState.isRunning = false;
    res.json({ message: 'Scraper stopped' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop scraper' });
  }
});

app.post('/api/reset-counter', async (req, res) => {
  try {
    const trackerPath = path.join(__dirname, './src/helpers/job_application_tracker.json');
    
    if (fs.existsSync(trackerPath)) {
      const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
      data.successfullyApplied = 0;
      data.lastResetDate = new Date().toISOString().split('T')[0];
      fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2));
      res.json({ message: 'Counter reset successfully' });
    } else {
      res.json({ message: 'No tracker file found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset counter' });
  }
});

app.get('/api/session/status', (req, res) => {
  try {
    const normalSession = path.join(__dirname, './naukrisession.json');
    const mncSession = path.join(__dirname, './nauakrisession.json');
    
    res.json({
      normalSession: {
        exists: fs.existsSync(normalSession),
        path: normalSession
      },
      mncSession: {
        exists: fs.existsSync(mncSession),
        path: mncSession
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check session status' });
  }
});

app.delete('/api/session/clear', (req, res) => {
  try {
    const normalSession = path.join(__dirname, './naukrisession.json');
    const mncSession = path.join(__dirname, './nauakrisession.json');
    
    let cleared = [];
    
    if (fs.existsSync(normalSession)) {
      fs.unlinkSync(normalSession);
      cleared.push('naukrisession.json');
    }
    
    if (fs.existsSync(mncSession)) {
      fs.unlinkSync(mncSession);
      cleared.push('nauakrisession.json');
    }
    
    res.json({ 
      message: cleared.length > 0 
        ? `Cleared sessions: ${cleared.join(', ')}` 
        : 'No sessions to clear',
      cleared
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear sessions' });
  }
});

app.get('/api/jobs/history', async (req, res) => {
  try {
    const useMongoOnly = process.env.USE_MONGO_ONLY === 'true';
    
    // Try MongoDB first
    const allJobs = await jobService.getTodaysJobs();
    
    // Filter to only show specific statuses
    const jobs = allJobs.filter(job => {
      // Include applied jobs
      if (job.status === 'applied') return true;
      
      // Include only specific failure reasons
      if (job.reason && (
        job.reason.includes('Company website redirect') ||
        job.reason.includes('Apply failed: Application did not complete successfully')
      )) {
        return true;
      }
      
      return false;
    });
    
    if (jobs.length > 0 || useMongoOnly) {
      // Calculate stats for filtered jobs only
      const stats = {
        total: jobs.length,
        applied: jobs.filter(j => j.status === 'applied').length,
        redirect: jobs.filter(j => j.reason && j.reason.includes('Company website redirect')).length,
        failed: jobs.filter(j => j.reason && j.reason.includes('Apply failed')).length,
      };
      
      // Return MongoDB data
      return res.json({ 
        jobs: jobs.map(job => ({
          title: job.title,
          company: job.company,
          location: job.location,
          link: job.link,
          reason: job.reason,
          appliedAt: job.appliedAt || 'N/A',
          status: job.status,
        })),
        stats,
        total: jobs.length,
        source: 'mongodb'
      });
    }
    
    // Fallback to JSON file if MongoDB is empty (and not disabled)
    const jobsFilePath = path.join(__dirname, './src/helpers/files/jobs_sent_over_email.json');
    
    if (!fs.existsSync(jobsFilePath)) {
      return res.json({ jobs: [], stats: { total: 0, applied: 0, redirect: 0, failed: 0 }, total: 0, source: 'none' });
    }
    
    const jobsData = JSON.parse(fs.readFileSync(jobsFilePath, 'utf8'));
    
    // Filter jobs from file too
    const filteredJobs = jobsData.filter(job => {
      if (job.appliedAt && job.appliedAt !== 'N/A') return true;
      if (job.reason && (
        job.reason.includes('Company website redirect') ||
        job.reason.includes('Apply failed: Application did not complete successfully')
      )) {
        return true;
      }
      return false;
    });
    
    // Sort by appliedAt date (newest first)
    const sortedJobs = filteredJobs.sort((a, b) => {
      const dateA = a.appliedAt !== 'N/A' ? new Date(a.appliedAt) : new Date(0);
      const dateB = b.appliedAt !== 'N/A' ? new Date(b.appliedAt) : new Date(0);
      return dateB - dateA;
    });
    
    // Calculate statistics
    const fileStats = {
      total: sortedJobs.length,
      applied: sortedJobs.filter(j => j.appliedAt !== 'N/A').length,
      redirect: sortedJobs.filter(j => j.reason && j.reason.includes('Company website redirect')).length,
      failed: sortedJobs.filter(j => j.reason && j.reason.includes('Apply failed')).length,
    };
    
    res.json({ 
      jobs: sortedJobs,
      stats: fileStats,
      total: sortedJobs.length,
      source: 'file'
    });
  } catch (error) {
    logger.error('Failed to fetch job history:', error);
    res.status(500).json({ error: 'Failed to fetch job history' });
  }
});

app.post('/api/jobs/save', async (req, res) => {
  try {
    const { jobs } = req.body;
    
    if (!jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'Invalid jobs data' });
    }

    logger.info(`Received ${jobs.length} jobs to save`);
    
    const results = await jobService.saveJobs(jobs);
    
    res.json({
      message: 'Jobs saved successfully',
      saved: results.saved,
      duplicates: results.duplicates,
      errors: results.errors,
      total: jobs.length
    });
  } catch (error) {
    logger.error('Failed to save jobs:', error);
    res.status(500).json({ error: 'Failed to save jobs' });
  }
});

// Main scraper function
async function runScraper(config) {
  try {
    // Validate credentials
    if (!process.env.NAUKRI_USERNAME || !process.env.NAUKRI_PASSWORD) {
      throw new Error('NAUKRI_USERNAME and NAUKRI_PASSWORD must be set in .env file');
    }

    const credentials = {
      username: process.env.NAUKRI_USERNAME,
      password: process.env.NAUKRI_PASSWORD,
      isCalledForMNC: config.scrapeMNC || false
    };

    const emailConfig = {
      to: process.env.EMAIL_RECIPIENT,
      testing: false,
      isOnlyMNC: config.scrapeMNC || false
    };

    // Determine session file path
    const sessionFileName = config.scrapeMNC ? 'nauakrisession.json' : 'naukrisession.json';
    const sessionFilePath = path.join(__dirname, sessionFileName);
    
    logger.info(`Using session file: ${sessionFileName}`);
    logger.info(`Credentials loaded: ${credentials.username ? 'Yes' : 'No'}`);

    const searchQuery = [
      "React Js Developer",
      "React Js Frontend Developer",
      "Mern Stack Developer",
      "Mern Full Stack Developer",
      "Fullstack Developer",
      "Full Stack",
    ];

    const options = {
      searchQuery,
      maxPages: config.maxPages || 1,
      experience: config.experience || 3,
      jobAge: config.jobAge || 1,
      autoApply: config.autoApply ?? true,
    };

    if (config.scrapeMNC) {
      options.businessSize = [62, 213, 217];
      options.jobPostType = 1;
      options.qcrc = 1028;
      options.postedBy = "Employer";
    }

    // Scrape jobs (session restoration happens inside scrapeNaukriJobs)
    const jobs = await scrapeNaukriJobs(options, credentials, emailConfig);
    scraperState.stats.jobsFound = jobs?.length || 0;
    logger.info(`Scraping completed. Found ${jobs?.length} jobs`);

    if (options.autoApply && jobs.length > 0) {
      logger.info('Starting auto-apply process...');
      
      await cleanupChromeProfile();

      logger.info('Launching browser...');
      
      const isHeadless = process.env.RENDER === 'true' || process.env.PUPPETEER_HEADLESS === 'true';
      try {
        scraperState.browser = await puppeteer.launch({
          headless: isHeadless,
          timeout: 90000, // Increase timeout to 90 seconds
          protocolTimeout: 90000,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-features=FederatedCredentialManagement',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-blink-features=AutomationControlled',
          ],
          userDataDir: path.join(
            require('os').tmpdir(),
            `puppeteer_dev_chrome_profile_${Date.now()}`
          ),
          ignoreDefaultArgs: ['--disable-extensions'],
          dumpio: false, // Set to true for debugging
        });
        
        logger.info('Browser launched successfully');
      } catch (launchError) {
        logger.error('Failed to launch browser:', launchError.message);
        
        // Try fallback: launch without userDataDir
        logger.info('Attempting fallback browser launch without userDataDir...');
        scraperState.browser = await puppeteer.launch({
          headless: isHeadless,
          timeout: 90000,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-features=FederatedCredentialManagement',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080',
          ],
        });
        logger.info('Browser launched with fallback method');
      }

      // autoApplyToJobs will handle login internally using session file
      logger.info('Browser ready for auto-apply');

      let applicationResults;

      if (config.useAI) {
        const resumePath = path.join(__dirname, './src/aiAnalyzeJobMatch/Swapnil_Landage-3YOE.pdf');
        applicationResults = await autoApplyToJobsUsingAi(jobs, credentials, {
          resumePath,
          emailConfig,
          existingBrowser: scraperState.browser,
          matchThreshold: config.matchThreshold || 50,
          rateLimitDelay: 5000
        });
      } else {
        applicationResults = await autoApplyToJobs(
          jobs,
          credentials,
          emailConfig,
          scraperState.browser,
          options.experience
        );
      }

      scraperState.stats.applied = applicationResults?.applied?.length || 0;
      scraperState.stats.skipped = applicationResults?.skipped?.length || 0;

      logger.info(`Auto-apply completed: ${scraperState.stats.applied} applied, ${scraperState.stats.skipped} skipped`);
    }

  } catch (error) {
    logger.error('Scraper error:', error);
  } finally {
    if (scraperState.browser) {
      try {
        await scraperState.browser.close();
      } catch (err) {
        console.warn('Error closing browser:', err.message);
      }
      scraperState.browser = null;
    }
    await cleanupChromeProfile();
    scraperState.isRunning = false;
  }
}

// Root (for Render / default health checks)
app.get('/', (req, res) => {
  res.json({ service: 'job-scraper-backend', status: 'running', docs: '/api/status' });
});

// Health check (Render uses this when healthCheckPath is set)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}`);
  
  // Validate environment variables
  const requiredEnvVars = ['NAUKRI_USERNAME', 'NAUKRI_PASSWORD', 'EMAIL_USER', 'EMAIL_PASS'];
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.warn(`⚠️  Warning: Missing environment variables: ${missing.join(', ')}`);
    console.warn('⚠️  Some features may not work correctly. Check your .env file.');
  } else {
    console.log('✅ All required environment variables loaded');
  }
  
  // Validate imports
  if (typeof loginToNaukri !== 'function') {
    console.error('❌ Error: loginToNaukri is not properly imported');
  }
  if (typeof scrapeNaukriJobs !== 'function') {
    console.error('❌ Error: scrapeNaukriJobs is not properly imported');
  }
  
  console.log('✅ All modules loaded successfully');
});

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (scraperState.browser) {
    await scraperState.browser.close();
  }
  await cleanupChromeProfile();
  process.exit(0);
});
