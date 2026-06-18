const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.novel543.com/0606693257/8096_157.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // 取得章節標題
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
  
  // extractContent（和 server 完全一致）
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
  
  // 取得當前章節號碼
  const currentChapterNum = title.match(/第(\d+)章/)?.[1] || '';
  
  // 提取第一頁內容
  let allContent = [];
  let content = await extractContent();
  allContent.push(content);
  
  console.log('Step 1 - extractContent:');
  console.log('  \\n count:', (content.match(/\n/g) || []).length);
  
  // 檢查是否有下一頁（假設沒有了）
  let pageNum = 1;
  const maxPages = 10;
  
  // 合併
  let mergedContent = allContent.join('\n\n');
  console.log('\nStep 2 - mergedContent:');
  console.log('  Has \\n:', mergedContent.includes('\n'));
  console.log('  Has \\n\\n:', mergedContent.includes('\n\n'));
  console.log('  Length:', mergedContent.length);
  
  // 清理
  mergedContent = mergedContent
    .replace(/\s*\(\d+\/\d+\)\s*/g, '')
    .replace(/\s*第\d+\/\d+頁\s*/g, '')
    .replace(/\s*-\s*\d+\/\d+\s*/g, '')
    .replace(/\s*\|\s*\d+\/\d+\s*/g, '')
    .replace(/\s*下一頁[^\n]*/gi, '')
    .replace(/\s*下一章[^\n]*/gi, '')
    .replace(/\s*Page \d+ of \d+/gi, '');
  
  mergedContent = mergedContent
    .replace(/如您認為本書不錯[\s\S]*?$/gm, '')
    .replace(/請記住本站網址[\s\S]*?$/gm, '')
    .replace(/本章尚未結束[\s\S]*?$/gm, '')
    .replace(/溫馨提示:[^\n]*/gi, '');
  
  console.log('\nStep 3 - after cleaning:');
  console.log('  Has \\n:', mergedContent.includes('\n'));
  console.log('  Has \\n\\n:', mergedContent.includes('\n\n'));
  
  // 正規化
  mergedContent = mergedContent
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  
  console.log('\nStep 4 - after normalize:');
  console.log('  Has \\n:', mergedContent.includes('\n'));
  console.log('  Has \\n\\n:', mergedContent.includes('\n\n'));
  console.log('  Length:', mergedContent.length);
  
  // 分割
  const parts = mergedContent.split('\n');
  console.log('\nStep 5 - after split:');
  console.log('  Parts count:', parts.length);
  
  // map/filter/join
  let finalContent = parts
    .map(para => {
      return para
        .replace(/\t/g, '')
        .replace(/ {2,}/g, ' ')
        .trim();
    })
    .filter(para => para.length > 3 && !para.match(/^[\s\W]+$/))
    .join('\n\n');
  
  console.log('\nStep 6 - final:');
  console.log('  Has \\n:', finalContent.includes('\n'));
  console.log('  Has \\n\\n:', finalContent.includes('\n\n'));
  console.log('  Length:', finalContent.length);
  console.log('\nFirst 300 chars:');
  console.log(finalContent.substring(0, 300));
  
  await browser.close();
})();
