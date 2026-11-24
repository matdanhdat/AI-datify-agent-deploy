import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const playwright = require('C:/Users/ADMIN/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright');

async function checkPie() {
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8087/phan-tich');
  await page.waitForTimeout(1000);

  const pieLabels = await page.evaluate(() => {
    // Look for all echarts instances
    const els = document.querySelectorAll('[_echarts_instance_]');
    const results = [];
    for (const el of els) {
      const inst = (window as any).echarts?.getInstanceByDom(el);
      if (inst) {
        const opt = inst.getOption();
        results.push({
          id: el.id,
          series: opt.series?.map((s) => ({
            type: s.type,
            name: s.name,
            data: s.data,
            labelFormatter: typeof s.label?.formatter === 'function' ? 'function' : s.label?.formatter
          }))
        });
      }
    }
    return results;
  });

  console.log('ECharts instances found:', JSON.stringify(pieLabels, null, 2));
  await browser.close();
}
checkPie().catch(console.error);
