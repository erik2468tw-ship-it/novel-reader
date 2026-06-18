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
    
    console.log('Going to:', dirUrl);
    await page.goto(dirUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Page loaded');
    
    await page.waitForSelector('a[href*=".html"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.waitForTimeout(3000);
    
    const content = await page.content();
    console.log('Page content length:', content.length);
    
    // Check if CloudFlare or anti-bot page
    if (content.includes('CloudFlare') || content.includes('checking your browser')) {
        console.log('WARNING: CloudFlare or anti-bot page detected!');
    }
    
    // Check for chapter links
    const chapterLinks = await page.$$eval('a[href*=".html"]', links => 
        links.filter(link => !link.href.includes('/dir')).length
    );
    console.log('Chapter links found:', chapterLinks);
    
    await browser.close();
})().catch(e => console.log('ERROR:', e.message));
