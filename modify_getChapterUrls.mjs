import { readFileSync, writeFileSync } from 'fs';

const filePath = 'G:/SoftwareDev/novel-reader/server/integrated.js';
let content = readFileSync(filePath, 'utf8');

// Find and replace the getChapterUrls function
const oldFunc = `async function getChapterUrls(page, novelUrl) {
    try {
        const dirUrl = novelUrl.endsWith('/dir') ? novelUrl : novelUrl + '/dir';
        await page.goto(dirUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);
        return await page.$$eval('a[href*=".html"]', links => {
            return links.filter(link => {
                if (link.href.includes('/dir')) return false;
                const text = link.textContent.trim();
                if (!text || text.length < 2) return false;
                if (text.includes('最新') || text.includes('首頁') || text.includes('目錄')) return false;
                return true;
            }).map(link => ({ title: link.textContent.trim(), url: link.href }));
        });
    } catch (error) {
        log(\`獲取章節列表失敗: \${error.message}\`);
        return [];
    }
}`;

const newFunc = `async function getChapterUrls(page, novelUrl) {
    // 先嘗試用 HTTP 直接請求（更快，不容易被阻擋）
    const dirUrl = novelUrl.endsWith('/dir') ? novelUrl : novelUrl + '/dir';
    const httpLinks = await getChapterUrlsByHttp(dirUrl);
    if (httpLinks.length > 0) {
        log(\`HTTP 獲取到 \${httpLinks.length} 個章節連結\`);
        return httpLinks;
    }
    
    // 如果 HTTP 失敗，用 Playwright
    try {
        await page.goto(dirUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('a[href*=".html"]', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(5000);
        
        const links = await page.$$eval('a[href*=".html"]', links => {
            return links.filter(link => {
                if (link.href.includes('/dir')) return false;
                const text = link.textContent.trim();
                if (!text || text.length < 2) return false;
                if (text.includes('最新') || text.includes('首頁') || text.includes('目錄')) return false;
                return true;
            }).map(link => ({ title: link.textContent.trim(), url: link.href }));
        });
        
        log(\`Playwright 獲取到 \${links.length} 個章節連結\`);
        return links;
    } catch (error) {
        log(\`獲取章節列表失敗: \${error.message}\`);
        return [];
    }
}`;

if (content.includes(oldFunc)) {
  content = content.replace(oldFunc, newFunc);
  console.log('Replaced getChapterUrls');
} else {
  console.log('Old function not found, trying alternate pattern');
  // Try with escaped characters
  const altPattern = /async function getChapterUrls\(page, novelUrl\) \{\s*try \{\s*const dirUrl = novelUrl\.endsWith\('\/dir'\) \? novelUrl : novelUrl \+ '\/dir';\s*await page\.goto\(dirUrl, \{ waitUntil: 'networkidle', timeout: 60000 \}\);/;
  if (altPattern.test(content)) {
    console.log('Found with regex');
  } else {
    console.log('Could not find function to replace');
  }
}

writeFileSync(filePath, content, 'utf8');
console.log('Done');