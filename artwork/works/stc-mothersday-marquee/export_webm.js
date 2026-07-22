#!/usr/bin/env node
/* Export one exact animation loop through the page's built-in MediaRecorder. */
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

(async () => {
  const here = __dirname;
  const source = path.join(here, 'stc-marquee-mothersday.html');
  const output = path.join(here, 'stc-mothersday-marquee.webm');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  await page.goto(pathToFileURL(source).href);
  await page.waitForSelector('#rec');
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.click('#rec');
  const download = await downloadPromise;
  await download.saveAs(output);
  await browser.close();
  console.log(output);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
