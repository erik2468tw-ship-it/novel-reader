const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // extractContent（和 server/integrated.js 完全一致）
  const extractContent = async () => {
    return await page.evaluate(() => {
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
  };
  
  let allContent = [];
  let content = await extractContent();
  allContent.push(content);
  
  // 模擬完整流程
  let mergedContent = allContent.join('\n\n');
  
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
  
  // 分割和清理
  let finalContent = mergedContent
    .split('\n')
    .map(para => {
      return para
        .replace(/\t/g, '')
        .replace(/ {2,}/g, ' ')
        .trim();
    })
    .filter(para => para.length > 3 && /[a-zA-Z0-9\u4e00-\u9fa5]/.test(para))
    .join('\n\n');
  
  console.log('Has newline:', finalContent.includes('\n'));
  console.log('Has double newline:', finalContent.includes('\n\n'));
  console.log('Length:', finalContent.length);
  console.log('\nFirst 400 chars:');
  console.log(finalContent.substring(0, 400));
  
  await browser.close();
})();
