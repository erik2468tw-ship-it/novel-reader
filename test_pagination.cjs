const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // 找下一頁連結
  const nextLinkInfo = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a'));
    const nextLinks = allLinks.filter(a => 
      a.textContent.includes('下一頁') || 
      a.textContent.includes('下一章') ||
      a.textContent.includes('下一页') ||
      a.getAttribute('rel') === 'next'
    );
    
    if (nextLinks.length > 0) {
      return {
        count: nextLinks.length,
        href: nextLinks[0].href,
        text: nextLinks[0].textContent.trim()
      };
    }
    return { error: 'No next link found' };
  });
  
  console.log('Next link info:', JSON.stringify(nextLinkInfo, null, 2));
  
  // 如果找到，點擊並檢查新頁面
  if (nextLinkInfo.href && nextLinkInfo.href !== '#' && !nextLinkInfo.error) {
    console.log('\nClicking next link...');
    await page.goto(nextLinkInfo.href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // 檢查新頁面的標題
    const newTitle = await page.evaluate(() => {
      const el = document.querySelector('h1, h2.chapter-title, .chapter-title, #chapter-content h2');
      return el ? el.textContent.trim() : 'not found';
    });
    console.log('New page title:', newTitle);
    
    // 檢查當前 URL
    console.log('New URL:', page.url());
    
    // 提取內容長度
    const contentLength = await page.evaluate(() => {
      const el = document.querySelector('#chapter-content, #chapterContent, div.chapter-content, .chapter-content');
      return el ? el.textContent.length : 0;
    });
    console.log('Content length:', contentLength);
  }
  
  await browser.close();
})();
