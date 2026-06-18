const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // 直接goto第二頁
  await page.goto('https://www.novel543.com/0606693257/8096_157_2.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  const title = await page.evaluate(() => {
    const el = document.querySelector('h1');
    return el ? el.textContent.trim() : 'not found';
  });
  
  console.log('Direct goto result:');
  console.log('Title:', title);
  console.log('URL:', page.url());
  
  // 嘗試提取內容
  const content = await page.evaluate(() => {
    const el = document.querySelector('#chapter-content, #chapterContent, div.chapter-content, .chapter-content');
    return el ? el.textContent.substring(0, 200) : 'not found';
  });
  
  console.log('\nContent (first 200 chars):');
  console.log(content);
  
  await browser.close();
})();
