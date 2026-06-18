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
  
  // 模擬整個流程
  let mergedContent = [result].join('\n\n');
  
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
  
  const parts = mergedContent.split('\n');
  
  console.log('Parts 0-10:');
  for (let i = 0; i < Math.min(10, parts.length); i++) {
    const p = parts[i];
    const lenOk = p.length > 3;
    const notOnlySymbols = !p.match(/^[\s\W]+$/);
    const filterOk = lenOk && notOnlySymbols;
    console.log(`[${i}] len=${p.length} len>3=${lenOk} sym=${notOnlySymbols} filter=${filterOk} => "${p.substring(0, 40)}..."`);
  }
  
  // 測試 filter 條件
  const testPara = ' "他跟我說，那是他女兒，叫張淑，小名叫寶兒。';
  console.log('\nTest para:', JSON.stringify(testPara));
  console.log('  length:', testPara.length);
  console.log('  > 3:', testPara.length > 3);
  console.log('  match /^[\s\W]+$/:', Boolean(testPara.match(/^[\s\W]+$/)));
  
  await browser.close();
})();
