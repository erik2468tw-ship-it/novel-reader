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
  console.log('Step 1 - extractContent:');
  console.log('  Has \\n:', content.includes('\n'));
  console.log('  \\n count:', (content.match(/\n/g) || []).length);
  
  allContent.push(content);
  
  let mergedContent = allContent.join('\n\n');
  console.log('\nStep 2 - After join:');
  console.log('  Has \\n:', mergedContent.includes('\n'));
  console.log('  Has \\n\\n:', mergedContent.includes('\n\n'));
  
  // Clean pagination marks
  mergedContent = mergedContent
    .replace(/\s*\(\d+\/\d+\)\s*/g, '')
    .replace(/\s*第\d+\/\d+頁\s*/g, '')
    .replace(/\s*-\s*\d+\/\d+\s*/g, '')
    .replace(/\s*\|\s*\d+\/\d+\s*/g, '')
    .replace(/\s*下一頁[^\n]*/gi, '')
    .replace(/\s*下一章[^\n]*/gi, '')
    .replace(/\s*Page \d+ of \d+/gi, '');
  
  // Clean ads
  mergedContent = mergedContent
    .replace(/如您認為本書不錯[\s\S]*?$/gm, '')
    .replace(/請記住本站網址[\s\S]*?$/gm, '')
    .replace(/本章尚未結束[\s\S]*?$/gm, '')
    .replace(/溫馨提示:[^\n]*/gi, '');
  
  console.log('\nStep 3 - After cleaning:');
  console.log('  Has \\n:', mergedContent.includes('\n'));
  console.log('  Has \\n\\n:', mergedContent.includes('\n\n'));
  
  // Normalize
  mergedContent = mergedContent
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  
  console.log('\nStep 4 - After normalize:');
  console.log('  Has \\n:', mergedContent.includes('\n'));
  console.log('  Has \\n\\n:', mergedContent.includes('\n\n'));
  
  // Split
  const parts = mergedContent.split('\n');
  console.log('\nStep 5 - After split:');
  console.log('  Parts count:', parts.length);
  
  // Map and filter
  const cleaned = parts
    .map(para => {
      return para
        .replace(/\t/g, '')
        .replace(/ {2,}/g, ' ')
        .trim();
    })
    .filter(para => para.length > 3 && !para.match(/^[\s\W]+$/));
  
  console.log('\nStep 6 - After map/filter:');
  console.log('  Cleaned count:', cleaned.length);
  
  // Join
  const final = cleaned.join('\n\n');
  console.log('\nStep 7 - Final result:');
  console.log('  Has \\n:', final.includes('\n'));
  console.log('  Has \\n\\n:', final.includes('\n\n'));
  console.log('  First 500 chars:');
  console.log(final.substring(0, 500));
  
  await browser.close();
})();
