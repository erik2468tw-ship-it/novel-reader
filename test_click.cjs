const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Get current title
  const title1 = await page.evaluate(() => {
    const el = document.querySelector('h1');
    return el ? el.textContent.trim() : 'not found';
  });
  console.log('Page 1 title:', title1);
  console.log('Page 1 URL:', page.url());
  
  // Find and click the next link
  const clicked = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a'));
    const nextLink = allLinks.find(a => 
      a.textContent.includes('下一頁') || 
      a.textContent.includes('下一章') ||
      a.textContent.includes('下一页')
    );
    
    if (nextLink) {
      console.log('Found link:', nextLink.textContent.trim(), '->', nextLink.href);
      nextLink.click();
      return true;
    }
    return false;
  });
  
  if (clicked) {
    await page.waitForTimeout(2000);
    
    const title2 = await page.evaluate(() => {
      const el = document.querySelector('h1');
      return el ? el.textContent.trim() : 'not found';
    });
    console.log('\nAfter click:');
    console.log('Page 2 title:', title2);
    console.log('Page 2 URL:', page.url());
  }
  
  await browser.close();
})();
