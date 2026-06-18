const { chromium } = require('playwright');

const novelUrl = 'https://www.novel543.com/0606693257';
const baseUrl = novelUrl.endsWith('/') ? novelUrl.slice(0, -1) : novelUrl;
const dirUrl = baseUrl + '/dir';

(async () => {
    const start = Date.now();
    console.log('1. Launching browser...');
    const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--disable-setuid-sandbox', '--no-sandbox'] });
    console.log('   Launched:', Date.now() - start, 'ms');
    
    const t1 = Date.now();
    const context = await browser.newContext({ 
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }
    });
    console.log('2. Context created:', Date.now() - t1, 'ms');
    
    const t2 = Date.now();
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    console.log('3. Page created:', Date.now() - t2, 'ms');
    
    const t3 = Date.now();
    await page.goto(dirUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('4. Navigated to dir:', Date.now() - t3, 'ms');
    
    const t4 = Date.now();
    await page.waitForSelector('a[href*=".html"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.waitForTimeout(3000);
    console.log('5. Waited for content:', Date.now() - t4, 'ms');
    
    const t5 = Date.now();
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
    console.log('6. Extracted chapters:', Date.now() - t5, 'ms');
    console.log('   Total chapters:', chapters.length);
    console.log('   Total time:', Date.now() - start, 'ms');
    
    await browser.close();
})().catch(e => console.log('ERROR:', e.message));
