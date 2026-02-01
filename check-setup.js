#!/usr/bin/env node

/**
 * Setup Verification Script
 * Run this to verify your backend is properly configured after cleanup
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Backend Setup...\n');

let hasErrors = false;

// Check 1: Verify we're in backend directory
console.log('1️⃣  Checking current directory...');
const currentDir = process.cwd();
if (currentDir.endsWith('backend')) {
  console.log('   ✅ Running from backend directory');
} else {
  console.log('   ❌ NOT in backend directory!');
  console.log(`   Current: ${currentDir}`);
  console.log('   Run: cd backend');
  hasErrors = true;
}

// Check 2: Verify src folder exists
console.log('\n2️⃣  Checking src folder...');
if (fs.existsSync('./src')) {
  console.log('   ✅ src/ folder exists');
} else {
  console.log('   ❌ src/ folder NOT found!');
  hasErrors = true;
}

// Check 3: Verify critical files
console.log('\n3️⃣  Checking critical files...');
const criticalFiles = [
  './src/scraper/scraper.js',
  './src/autoApply/autoApply.js',
  './src/auth/loginToNaukar.js',
  './src/helpers/appliedCount.js',
  './src/helpers/job_application_tracker.json',
  './server.js',
  './package.json',
  './.env'
];

criticalFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} NOT found!`);
    hasErrors = true;
  }
});

// Check 4: Verify environment variables
console.log('\n4️⃣  Checking environment variables...');
require('dotenv').config();

const requiredEnvVars = [
  'NAUKRI_USERNAME',
  'NAUKRI_PASSWORD',
  'EMAIL_USER',
  'EMAIL_PASS'
];

requiredEnvVars.forEach(varName => {
  if (process.env[varName]) {
    console.log(`   ✅ ${varName} is set`);
  } else {
    console.log(`   ❌ ${varName} is NOT set!`);
    hasErrors = true;
  }
});

// Check 5: Verify no old src folder in parent
console.log('\n5️⃣  Checking for old src folder...');
if (fs.existsSync('../src')) {
  console.log('   ⚠️  WARNING: Old src/ folder still exists in parent directory!');
  console.log('   This might cause confusion. Consider removing it.');
} else {
  console.log('   ✅ No old src/ folder found (good!)');
}

// Check 6: Test module imports
console.log('\n6️⃣  Testing module imports...');
try {
  const { scrapeNaukriJobs } = require('./src/scraper/scraper');
  console.log('   ✅ scraper.js imports successfully');
} catch (error) {
  console.log('   ❌ Failed to import scraper.js');
  console.log(`   Error: ${error.message}`);
  hasErrors = true;
}

try {
  const { autoApplyToJobs } = require('./src/autoApply/autoApply');
  console.log('   ✅ autoApply.js imports successfully');
} catch (error) {
  console.log('   ❌ Failed to import autoApply.js');
  console.log(`   Error: ${error.message}`);
  hasErrors = true;
}

try {
  const loginToNaukri = require('./src/auth/loginToNaukar');
  console.log('   ✅ loginToNaukar.js imports successfully');
} catch (error) {
  console.log('   ❌ Failed to import loginToNaukar.js');
  console.log(`   Error: ${error.message}`);
  hasErrors = true;
}

// Check 7: Verify node_modules
console.log('\n7️⃣  Checking dependencies...');
if (fs.existsSync('./node_modules')) {
  console.log('   ✅ node_modules exists');
  
  // Check for key dependencies
  const keyDeps = ['express', 'puppeteer', 'mongoose', 'dotenv'];
  keyDeps.forEach(dep => {
    if (fs.existsSync(`./node_modules/${dep}`)) {
      console.log(`   ✅ ${dep} installed`);
    } else {
      console.log(`   ⚠️  ${dep} NOT installed (run: npm install)`);
    }
  });
} else {
  console.log('   ❌ node_modules NOT found!');
  console.log('   Run: npm install');
  hasErrors = true;
}

// Final summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.log('❌ SETUP HAS ISSUES - Please fix the errors above');
  console.log('\nCommon fixes:');
  console.log('  1. Make sure you\'re in the backend/ directory');
  console.log('  2. Run: npm install');
  console.log('  3. Copy .env.example to .env and fill in credentials');
  console.log('  4. Restart the server after making changes');
  process.exit(1);
} else {
  console.log('✅ SETUP LOOKS GOOD!');
  console.log('\nYou can now start the server:');
  console.log('  node server.js');
  process.exit(0);
}
