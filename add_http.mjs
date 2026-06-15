import { readFileSync, writeFileSync } from 'fs';

const filePath = 'G:/SoftwareDev/novel-reader/server/integrated.js';
const content = readFileSync(filePath, 'utf8');

const httpFunc = `

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
                log('HTTP 請求失敗: ' + res.statusCode);
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
                    const title = titleMatch ? titleMatch[1].trim() : '第' + chapterNum + '章';
                    links.push({ title: title, url: href });
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
                        links.push({ title: title, url: href });
                    }
                }
                
                resolve(links);
            });
        });
        req.on('error', (error) => {
            log('HTTP 請求錯誤: ' + error.message);
            resolve([]);
        });
        req.setTimeout(30000, () => {
            req.destroy();
            resolve([]);
        });
    });
}
`;

// Find the end of getChapterUrls function
const idx = content.indexOf('async function getChapterContent');
const before = content.substring(0, idx);
const funcEnd = before.lastIndexOf('}');

// Insert after the closing } of getChapterUrls
const newContent = content.substring(0, funcEnd + 1) + httpFunc + content.substring(funcEnd + 1);
writeFileSync(filePath, newContent, 'utf8');
console.log('Added getChapterUrlsByHttp function');