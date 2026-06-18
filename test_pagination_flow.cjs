const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Get current title
  let currentChapterNum = '';
  let title = await page.evaluate(() => {
    const el = document.querySelector('h1');
    return el ? el.textContent.trim() : 'unknown';
  });
  currentChapterNum = title.match(/第(\d+)章/)?.[1] || '';
  console.log('Page 1 title:', title, '| Chapter num:', currentChapterNum);
  
  // Find next link
  const nextLinkInfo = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a'));
    const nextLink = allLinks.find(a => 
      a.textContent.includes('下一頁') || 
      a.textContent.includes('下一章') ||
      a.textContent.includes('下一页')
    );
    return nextLink ? { href: nextLink.href, text: nextLink.textContent.trim() } : null;
  });
  
  if (nextLinkInfo) {
    console.log('\nNext link:', nextLinkInfo.text, '->', nextLinkInfo.href);
    
    // Use goto instead of click
    await page.goto(nextLinkInfo.href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    const title2 = await page.evaluate(() => {
      const el = document.querySelector('h1');
      return el ? el.textContent.trim() : 'unknown';
    });
    const chapterNum2 = title2.match(/第(\d+)章/)?.[1] || '';
    console.log('\nPage 2 title:', title2, '| Chapter num:', chapterNum2);
    
    // Check if same chapter
    if (chapterNum2 === currentChapterNum) {
      console.log('✓ Same chapter - should download page 2');
    } else {
      console.log('✗ Different chapter - should stop');
    }
    
    // Check content length
    const content2 = await page.evaluate(() => {
      const el = document.querySelector('#chapter-content, #chapterContent, div.chapter-content, .chapter-content');
      return el ? el.textContent.length : 0;
    });
    console.log('Page 2 content length:', content2);
  } else {
    console.log('No next link found');
  }
  
  await browser.close();
})();
