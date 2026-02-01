#!/usr/bin/env node

/**
 * Environment Variables Test Script
 * Run this to verify your backend configuration
 */

require('dotenv').config();

console.log('\n🔍 Checking Backend Configuration...\n');

const checks = [
  { name: 'NAUKRI_USERNAME', value: process.env.NAUKRI_USERNAME, required: true },
  { name: 'NAUKRI_PASSWORD', value: process.env.NAUKRI_PASSWORD, required: true },
  { name: 'EMAIL_USER', value: process.env.EMAIL_USER, required: true },
  { name: 'EMAIL_PASS', value: process.env.EMAIL_PASS, required: true },
  { name: 'EMAIL_RECIPIENT', value: process.env.EMAIL_RECIPIENT, required: false },
  { name: 'OPENAI_API_KEY', value: process.env.OPENAI_API_KEY, required: false },
  { name: 'PORT', value: process.env.PORT || '3001', required: false },
  { name: 'FRONTEND_URL', value: process.env.FRONTEND_URL || 'http://localhost:3000', required: false },
];

let hasErrors = false;

checks.forEach(check => {
  const status = check.value ? '✅' : (check.required ? '❌' : '⚠️');
  const message = check.value 
    ? `${check.name.includes('PASSWORD') || check.name.includes('KEY') || check.name.includes('PASS') 
        ? '***hidden***' 
        : check.value}`
    : 'Not set';
  
  console.log(`${status} ${check.name.padEnd(20)} ${message}`);
  
  if (check.required && !check.value) {
    hasErrors = true;
  }
});

console.log('\n');

if (hasErrors) {
  console.log('❌ Configuration incomplete!');
  console.log('\nMissing required variables. Please:');
  console.log('1. Check that backend/.env file exists');
  console.log('2. Add missing variables to backend/.env');
  console.log('3. Run this script again to verify\n');
  process.exit(1);
} else {
  console.log('✅ All required configuration present!');
  console.log('\nYou can now start the backend server:');
  console.log('  npm start\n');
  process.exit(0);
}
