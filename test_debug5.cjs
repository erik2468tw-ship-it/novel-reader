const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  const result = await page.evaluate(() => {
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
    return texts.join('\n');
  });
  
  console.log('Result length:', result.length);
  console.log('Has \\n:', result.includes('\n'));
  console.log('\\n count:', (result.match(/\n/g) || []).length);
  console.log('\nFirst 300 chars (raw):');
  console.log(result.substring(0, 300));
  console.log('\nFirst 300 chars (JSON):');
  console.log(JSON.stringify(result.substring(0, 300)));
  
  await browser.close();
})();
