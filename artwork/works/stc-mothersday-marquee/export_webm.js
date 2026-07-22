#!/usr/bin/env node
/* Export one exact animation loop through the page's built-in MediaRecorder. */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

(async () => {
  const here = __dirname;
  const source = path.join(here, 'stc-marquee-mothersday.html');
  const output = path.join(here, 'stc-mothersday-marquee.webm');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  if (process.argv.includes('--qc')) {
    const qcDir = path.resolve(here, '../../../output/playwright');
    fs.mkdirSync(qcDir, { recursive: true });
    for (const time of [400, 800, 1020, 1150, 1350, 1550, 5300, 8800, 12300]) {
      await page.goto(`${pathToFileURL(source).href}?t=${time}`);
      await page.locator('#cv').screenshot({
        path: path.join(qcDir, `stc-mothersday-girl-${time}.png`),
      });
    }
    await browser.close();
    console.log(qcDir);
    return;
  }
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
