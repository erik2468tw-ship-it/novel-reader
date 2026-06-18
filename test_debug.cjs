const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  const rawContent = await page.evaluate(() => {
    const el = document.querySelector('#chapter-content, #chapterContent, div.chapter-content, .chapter-content');
    const clone = el.cloneNode(true);
    
    ['script', 'style', 'iframe', 'noscript', 'svg', 'img', 'video', 'audio'].forEach(tag => 
      clone.querySelectorAll(tag).forEach(e => e.remove()));
    
    const blockTags = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'blockquote'];
    const texts = [];
    
    function extractBlockText(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent?.trim();
        if (t) texts.push(t);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'BR') texts.push('');
        else {
          Array.from(node.childNodes).forEach(child => extractBlockText(child));
          if (blockTags.includes(node.tagName)) texts.push('');
        }
      }
    }
    
    Array.from(clone.childNodes).forEach(child => extractBlockText(child));
    return texts.join('\n');
  });
  
  console.log('=== Raw extractContent output ===');
  console.log('Length:', rawContent.length);
  console.log('Has \\n:', rawContent.includes('\n'));
  console.log('\\n count:', (rawContent.match(/\n/g) || []).length);
  console.log('First 300 chars:', JSON.stringify(rawContent.substring(0, 300)));
  
  // 測試合併
  const merged = [rawContent].join('\n\n');
  console.log('\n=== After join ===');
  console.log('Has \\n:', merged.includes('\n'));
  console.log('Has \\n\\n:', merged.includes('\n\n'));
  
  // 測試清理分頁標記
  let cleaned = merged
    .replace(/\s*\(\d+\/\d+\)\s*/g, '')
    .replace(/\s*第\d+\/\d+頁\s*/g, '')
    .replace(/\s*-\s*\d+\/\d+\s*/g, '')
    .replace(/\s*\|\s*\d+\/\d+\s*/g, '')
    .replace(/\s*下一頁[^\n]*/gi, '')
    .replace(/\s*下一章[^\n]*/gi, '')
    .replace(/\s*Page \d+ of \d+/gi, '');
  
  console.log('\n=== After cleaning ===');
  console.log('Has \\n:', cleaned.includes('\n'));
  console.log('Has \\n\\n:', cleaned.includes('\n\n'));
  
  // 測試正規化
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
  console.log('\n=== After normalize ===');
  console.log('Has \\n:', cleaned.includes('\n'));
  console.log('Has \\n\\n:', cleaned.includes('\n\n'));
  
  // 測試 split('\n')
  const parts = cleaned.split('\n');
  console.log('\n=== After split ===');
  console.log('Parts count:', parts.length);
  console.log('First part length:', parts[0]?.length);
  
  await browser.close();
})();
