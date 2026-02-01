#!/usr/bin/env node

/**
 * Puppeteer Browser Launch Test
 * Run this to verify Puppeteer can launch Chrome
 */

const puppeteer = require('puppeteer');

console.log('\n🔍 Testing Puppeteer Browser Launch...\n');

async function testBrowserLaunch() {
  let browser = null;
  
  try {
    console.log('⏳ Attempting to launch browser...');
    console.log('   This may take 30-90 seconds on first run...\n');
    
    browser = await puppeteer.launch({
      headless: false,
      timeout: 90000,
      protocolTimeout: 90000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1280,720',
        '--no-first-run',
        '--no-default-browser-check',
      ],
      dumpio: true, // Show browser console output
    });

    console.log('✅ Browser launched successfully!\n');
    
    const version = await browser.version();
    console.log(`📦 Browser version: ${version}\n`);
    
    console.log('⏳ Opening test page...');
    const page = await browser.newPage();
    await page.goto('https://example.com', { waitUntil: 'networkidle0' });
    console.log('✅ Test page loaded successfully!\n');
    
    console.log('⏳ Closing browser...');
    await browser.close();
    console.log('✅ Browser closed successfully!\n');
    
    console.log('🎉 All tests passed! Puppeteer is working correctly.\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Browser launch failed!\n');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    
    if (error.message.includes('Timed out')) {
      console.error('\n💡 Troubleshooting tips:');
      console.error('1. Check if Chrome/Chromium is installed');
      console.error('2. Try running: npx puppeteer browsers install chrome');
      console.error('3. Check antivirus/firewall settings');
      console.error('4. Try closing other Chrome instances');
      console.error('5. Check Windows Defender settings\n');
    }
    
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore
      }
    }
    
    process.exit(1);
  }
}

testBrowserLaunch();
