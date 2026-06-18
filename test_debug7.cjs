const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // 這個邏輯和 server/integrated.js 完全一致
  const result = await page.evaluate(async () => {
    const el = document.querySelector('#chapter-content, #chapterContent, div.chapter-content, .chapter-content');
    const clone = el.cloneNode(true);
    
    ['script', 'style', 'iframe', 'noscript', 'svg', 'img', 'video', 'audio'].forEach(tag => 
      clone.querySelectorAll(tag).forEach(e => e.remove()));
    
    const adPatterns = [/ad/i, /ads/i, /banner/i, /sponsor/i, /onead/i, /pubfuture/i, /tamedia/i, /google/i, /ND/i, /ONEAD/i, /TAMad/i];
    clone.querySelectorAll('*').forEach(el => {
      const className = el.className || '', id = el.id || '';
      if (adPatterns.some(p => (typeof className === 'string' && p.test(className)) || (typeof id === 'string' && p.test(id)))) el.remove();
    });
    
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
    return texts.join('\n');
  });
  
  // 檢查 result
  console.log('Result length:', result.length);
  console.log('Result \\n count:', (result.match(/\n/g) || []).length);
  
  // 顯示所有 \n 的位置
  console.log('\nText between each \\n:');
  const parts = result.split('\n');
  for (let i = 0; i < Math.min(10, parts.length); i++) {
    console.log(`[${i}] "${parts[i].substring(0, 40)}..."`);
  }
  
  await browser.close();
})();
