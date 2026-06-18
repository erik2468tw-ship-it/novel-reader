const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // 提取標題
  let title = '未知章節';
  const titleSelectors = ['.chapter-title', 'h2.chapter-title', '#chapter-content h2', '#chapterContent h2', 'h1.title', '.title h2', 'h2'];
  for (const sel of titleSelectors) {
    const el = await page.$(sel);
    if (el) {
      const text = await el.innerText() || el.textContent;
      if (text && text.trim().length > 2) {
        title = text.trim().replace(/\s*\(\d+\/\d+\)\s*$/g, '').replace(/\s*第\d+頁\s*/g, '').trim();
        break;
      }
    }
  }
  
  // extractContent
  const extractContent = async () => {
    return await page.evaluate(() => {
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
  };
  
  let allContent = [];
  let content = await extractContent();
  allContent.push(content);
  
  // 模擬合併和處理邏輯
  let mergedContent = allContent.join('\n\n');
  
  // 清理分頁標記
  mergedContent = mergedContent
    .replace(/\s*\(\d+\/\d+\)\s*/g, '')
    .replace(/\s*第\d+\/\d+頁\s*/g, '')
    .replace(/\s*-\s*\d+\/\d+\s*/g, '')
    .replace(/\s*\|\s*\d+\/\d+\s*/g, '')
    .replace(/\s*下一頁[^\n]*/gi, '')
    .replace(/\s*下一章[^\n]*/gi, '')
    .replace(/\s*Page \d+ of \d+/gi, '');
  
  // 清理廣告
  mergedContent = mergedContent
    .replace(/如您認為本書不錯[\s\S]*?$/gm, '')
    .replace(/請記住本站網址[\s\S]*?$/gm, '')
    .replace(/本章尚未結束[\s\S]*?$/gm, '')
    .replace(/溫馨提示:[^\n]*/gi, '');
  
  // 正規化換行
  mergedContent = mergedContent
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  
  // 分割並清理
  let finalContent = mergedContent
    .split('\n')
    .map(para => {
      return para
        .replace(/\t/g, '')
        .replace(/ {2,}/g, ' ')
        .trim();
    })
    .filter(para => para.length > 3 && !para.match(/^[\s\W]+$/))
    .join('\n\n');
  
  console.log('Title:', title);
  console.log('Has double newline:', finalContent.includes('\n\n'));
  console.log('Newline count:', (finalContent.match(/\n/g) || []).length);
  console.log('\n=== First 800 chars ===');
  console.log(finalContent.substring(0, 800));
  
  await browser.close();
})();
