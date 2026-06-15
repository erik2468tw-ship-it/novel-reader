import { readFileSync, writeFileSync } from 'fs';

const filePath = 'G:/SoftwareDev/novel-reader/server/integrated.js';
let content = readFileSync(filePath, 'utf8');

// Find the getChapterUrls function and add HTTP call at the beginning
const searchStr = "async function getChapterUrls(page, novelUrl) {\r\n    try {\r\n        const dirUrl = novelUrl.endsWith('/dir') ? novelUrl : novelUrl + '/dir';\r\n        await page.goto(dirUrl, { waitUntil: 'networkidle', timeout: 60000 });";

const replaceStr = `async function getChapterUrls(page, novelUrl) {\r\n    // 先嘗試用 HTTP 直接請求（更快，不容易被阻擋）\r\n    const dirUrl = novelUrl.endsWith('/dir') ? novelUrl : novelUrl + '/dir';\r\n    const httpLinks = await getChapterUrlsByHttp(dirUrl);\r\n    if (httpLinks.length > 0) {\r\n        log(\`HTTP 獲取到 \${httpLinks.length} 個章節連結\`);
\r\n        return httpLinks;\r\n    }\r\n    \r\n    // 如果 HTTP 失敗，用 Playwright\r\n    try {\r\n        await page.goto(dirUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });\r\n        await page.waitForSelector('a[href*=\".html\"]', { timeout: 15000 }).catch(() => {});\r\n        await page.waitForTimeout(5000);`;

if (content.includes(searchStr)) {
  content = content.replace(searchStr, replaceStr);
  console.log('Replaced successfully');
} else {
  console.log('Search string not found');
}

writeFileSync(filePath, content, 'utf8');
console.log('Done');