#!/usr/bin/env node

/**
 * Clear Old Job Data
 * Run this to delete old jobs from JSON file
 */

const fs = require('fs');
const path = require('path');

const jobsFilePath = path.join(__dirname, '../src/helpers/files/jobs_sent_over_email.json');

console.log('\n🗑️  Clearing old job data...\n');

if (fs.existsSync(jobsFilePath)) {
  // Backup first
  const backupPath = jobsFilePath.replace('.json', '_backup.json');
  fs.copyFileSync(jobsFilePath, backupPath);
  console.log(`✅ Backup created: ${backupPath}`);
  
  // Clear the file
  fs.writeFileSync(jobsFilePath, JSON.stringify([], null, 2));
  console.log(`✅ Cleared: ${jobsFilePath}`);
  console.log('\n✨ Old data cleared! New jobs will be saved from now on.\n');
} else {
  console.log('⚠️  No jobs file found. Nothing to clear.\n');
}
