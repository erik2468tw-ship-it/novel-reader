const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // 直接從頁面執行，和 server/integrated.js 一樣的邏輯
  const result = await page.evaluate(async () => {
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
        if (node.tagName === 'BR') {
          texts.push('');
        } else {
          Array.from(node.childNodes).forEach(child => extractBlockText(child));
          if (blockTags.includes(node.tagName)) {
            texts.push('');
          }
        }
      }
    }
    
    Array.from(clone.childNodes).forEach(child => extractBlockText(child));
    const content = texts.join('\n');
    
    // Simulate allContent handling
    let allContent = [];
    allContent.push(content);
    let mergedContent = allContent.join('\n\n');
    
    // Cleaning
    mergedContent = mergedContent
      .replace(/\s*\(\d+\/\d+\)\s*/g, '')
      .replace(/\s*第\d+\/\d+頁\s*/g, '')
      .replace(/\s*-\s*\d+\/\d+\s*/g, '')
      .replace(/\s*\|\s*\d+\/\d+\s*/g, '')
      .replace(/\s*下一頁[^\n]*/gi, '')
      .replace(/\s*下一章[^\n]*/gi, '')
      .replace(/\s*Page \d+ of \d+/gi, '')
      .replace(/如您認為本書不錯[\s\S]*?$/gm, '')
      .replace(/請記住本站網址[\s\S]*?$/gm, '')
      .replace(/本章尚未結束[\s\S]*?$/gm, '')
      .replace(/溫馨提示:[^\n]*/gi, '')
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
    
    return {
      mergedLength: mergedContent.length,
      mergedHasNewline: mergedContent.includes('\n'),
      mergedHasDoubleNewline: mergedContent.includes('\n\n'),
      mergedFirst300: mergedContent.substring(0, 300)
    };
  });
  
  console.log('Merged content length:', result.mergedLength);
  console.log('Has \\n:', result.mergedHasNewline);
  console.log('Has \\n\\n:', result.mergedHasDoubleNewline);
  console.log('\nFirst 300 chars:');
  console.log(result.mergedFirst300);
  
  await browser.close();
})();
