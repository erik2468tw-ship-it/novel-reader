const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // 抓目錄頁
  await page.goto('https://www.novel543.com/0606693257/dir', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  const firstChapter = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="0606693257"]');
    return links.length > 0 ? links[0].href : 'no link';
  });
  console.log('First chapter URL:', firstChapter);
  
  if (firstChapter !== 'no link') {
    // 抓章節頁
    await page.goto(firstChapter, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    const html = await page.evaluate(() => {
      const el = document.querySelector('#chapter-content, #chapterContent, div.chapter-content, .chapter-content');
      if (!el) return 'NOT FOUND';
      return el.innerHTML.substring(0, 3000);
    });
    console.log('\n=== Chapter HTML Structure ===');
    console.log(html);
  }
  
  await browser.close();
})();
