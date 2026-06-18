const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
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
  
  let mergedContent = allContent.join('\n\n');
  
  // Clean and normalize
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
  console.log('Parts count:', parts.length);
  console.log('\nFirst 5 parts:');
  for (let i = 0; i < Math.min(5, parts.length); i++) {
    console.log(`[${i}] length=${parts[i].length}, content="${parts[i].substring(0, 50)}"`);
  }
  
  // Test filter condition
  const testPara = parts[0];
  console.log('\nTest para:', JSON.stringify(testPara));
  console.log('Length > 3:', testPara.length > 3);
  console.log('Match /^[\s\W]+$/:', Boolean(testPara.match(/^[\s\W]+$/)));
  console.log('Filter result:', testPara.length > 3 && !testPara.match(/^[\s\W]+$/));
  
  // Check what's happening
  const cleaned = parts
    .map(para => {
      return para
        .replace(/\t/g, '')
        .replace(/ {2,}/g, ' ')
        .trim();
    })
    .filter(para => para.length > 3 && !para.match(/^[\s\W]+$/));
  
  console.log('\nCleaned count:', cleaned.length);
  console.log('Cleaned content:', cleaned.join('\n\n').substring(0, 200));
  
  await browser.close();
})();
