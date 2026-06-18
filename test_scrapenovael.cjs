const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const novelsDir = 'G:/SoftwareDev/novel-reader/novels';
const novelsFile = path.join(novelsDir, 'novels.json');

function getNovelList() {
    if (!fs.existsSync(novelsFile)) return [];
    return JSON.parse(fs.readFileSync(novelsFile, 'utf8'));
}

function updateNovelStatus(novelId, status) {
    const novels = getNovelList();
    const novel = novels.find(n => n.novelId === novelId);
    if (novel) {
        novel.status = status;
        novel.updatedAt = new Date().toISOString();
        fs.writeFileSync(novelsFile, JSON.stringify(novels, null, 2));
    }
}

const novelUrl = 'https://www.novel543.com/0606693257';
const baseUrl = novelUrl.endsWith('/') ? novelUrl.slice(0, -1) : novelUrl;
const dirUrl = baseUrl + '/dir';

(async () => {
    console.log('1. Launching browser...');
    const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--disable-setuid-sandbox', '--no-sandbox'] });
    console.log('2. Browser launched');
    const context = await browser.newContext({ 
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }
    });
    console.log('3. Context created');
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    
    console.log('4. Going to dir page...');
    await page.goto(dirUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('5. Waiting for content...');
    await page.waitForSelector('a[href*=".html"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.waitForTimeout(3000);
    
    console.log('6. Extracting chapter URLs...');
    const chapters = await page.$$eval('a[href*=".html"]', links => {
        return links.filter(link => {
            if (link.href.includes('/dir')) return false;
            const text = link.textContent.trim();
            if (!text || text.length < 2) return false;
            if (text.includes('最新') || text.includes('首頁') || text.includes('目錄')) return false;
            return true;
        }).map(link => {
            const text = link.textContent.trim();
            const chapterMatch = text.match(/第(\d+)章/);
            const chapterNum = chapterMatch ? parseInt(chapterMatch[1]) : 0;
            return { title: text, url: link.href, chapterNum };
        });
    });
    
    console.log(`7. Found ${chapters.length} chapters`);
    console.log('First 3:', chapters.slice(0, 3));
    
    await browser.close();
    console.log('8. Done');
})().catch(e => {
    console.log('ERROR:', e.message);
    console.log(e.stack);
});
