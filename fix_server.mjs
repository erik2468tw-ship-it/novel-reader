import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const filePath = join(__dirname, 'server', 'integrated.js');

let content = fs.readFileSync(filePath, 'utf8');

// 1. Add imports for https and zlib after 'import fs from fs;'
if (!content.includes("import https from 'https'")) {
  content = content.replace(
    "import fs from 'fs';",
    "import fs from 'fs';\nimport https from 'https';\nimport zlib from 'zlib';"
  );
}

// 2. Replace the getChapterUrls function
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
}

// 用 HTTP 直接請求獲取章節列表（更快，不容易被阻擋）
async function getChapterUrlsByHttp(url) {
    return new Promise((resolve) => {
        const links = [];
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                log(\`HTTP 請求失敗: \${res.statusCode}\`);
                resolve([]);
                return;
            }
            
            const encoding = res.headers['content-encoding'];
            let decompressor;
            if (encoding === 'br') {
                decompressor = zlib.createBrotliDecompress();
                res.pipe(decompressor);
            } else if (encoding === 'gzip') {
                decompressor = zlib.createGunzip();
                res.pipe(decompressor);
            } else {
                decompressor = res;
            }
            
            let data = '';
            decompressor.on('data', chunk => data += chunk);
            decompressor.on('end', () => {
                const pattern = /href="([^"]+)"[^>]*>\\s*第(\\d+)章[^<]*/gi;
                let match;
                while ((match = pattern.exec(data)) !== null) {
                    const href = match[1];
                    const chapterNum = match[2];
                    if (href.includes('/dir') || href.includes('ranking') || href.includes('auth') || href.includes('signin')) continue;
                    const titleMatch = data.substring(match.index, match.index + 500).match(/第\\d+章\\s*([^<\\n]+)/);
                    const title = titleMatch ? titleMatch[1].trim() : \`第\${chapterNum}章\`;
                    links.push({ title, url: href });
                }
                
                if (links.length === 0) {
                    const simplePattern = /href="([^"]+\\.html)"/gi;
                    while ((match = simplePattern.exec(data)) !== null) {
                        const href = match[1];
                        if (href.includes('/dir') || href.includes('ranking') || href.includes('auth') || href.includes('signin')) continue;
                        const start = Math.max(0, match.index - 100);
                        const end = Math.min(data.length, match.index + match[0].length + 200);
                        const context = data.substring(start, end);
                        const chapterMatch = context.match(/第(\\d+)章\\s*([^<\\n]+)/);
                        const title = chapterMatch ? chapterMatch[2].trim().substring(0, 50) : '未知章節';
                        links.push({ title, url: href });
                    }
                }
                
                resolve(links);
            });
        });
        req.on('error', (error) => {
            log(\`HTTP 請求錯誤: \${error.message}\`);
            resolve([]);
        });
        req.setTimeout(30000, () => {
            req.destroy();
            resolve([]);
        });
    });
}`;

content = content.replace(oldFunc, newFunc);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');