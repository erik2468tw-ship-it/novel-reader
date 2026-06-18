const { chromium } = require('playwright');

const novelUrl = 'https://www.novel543.com/0606693257';
const baseUrl = novelUrl.endsWith('/') ? novelUrl.slice(0, -1) : novelUrl;
const dirUrl = baseUrl + '/dir';

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--disable-setuid-sandbox', '--no-sandbox'] });
    const context = await browser.newContext({ 
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    
    // Step 1: Go to novel page (like getNovelMetadata does)
    console.log('1. Going to novel page...');
    await page.goto(novelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('   Novel page loaded');
    
    // Step 2: Go to directory page (like getChapterUrls does)
    console.log('2. Going to directory page...');
    await page.goto(dirUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('   Directory page loaded');
    
    await page.waitForSelector('a[href*=".html"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.waitForTimeout(3000);
    
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
    
    console.log('3. Found chapters:', chapters.length);
    console.log('   First 3:', chapters.slice(0, 3));
    
    await browser.close();
})().catch(e => console.log('ERROR:', e.message));
