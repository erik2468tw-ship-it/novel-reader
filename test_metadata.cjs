const { chromium } = require('playwright');

const novelUrl = 'https://www.novel543.com/0606693257';

(async () => {
    const start = Date.now();
    console.log('1. Launching browser...');
    const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--disable-setuid-sandbox', '--no-sandbox'] });
    console.log('   Launched:', Date.now() - start, 'ms');
    
    const context = await browser.newContext({ 
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    
    const t1 = Date.now();
    console.log('2. Going to novel page (domcontentloaded)...');
    await page.goto(novelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('   Navigated:', Date.now() - t1, 'ms');
    
    const t2 = Date.now();
    console.log('3. Waiting 2 seconds...');
    await page.waitForTimeout(2000);
    console.log('   Waited:', Date.now() - t2, 'ms');
    
    const t3 = Date.now();
    console.log('4. Extracting metadata...');
    const metadata = await page.evaluate(() => {
        const titleEl = document.querySelector('h2.hotwordtitle') || document.querySelector('h2') || document.querySelector('.title');
        const authorEl = document.querySelector('.author a') || document.querySelector('.author');
        const categoryEl = document.querySelector('.category a') || document.querySelector('.category');
        const descEl = document.querySelector('.description') || document.querySelector('.intro') || document.querySelector('#novel-description');
        const coverEl = document.querySelector('.cover img') || document.querySelector('img.cover');
        let author = authorEl ? authorEl.textContent.trim().replace(/作者：/, '') : '';
        let category = categoryEl ? categoryEl.textContent.trim().replace(/分類：/, '') : '';
        let description = descEl ? descEl.textContent.trim() : '';
        let title = titleEl ? titleEl.textContent.trim().replace(/《|》/g, '') : '';
        return { title, author, category, description, coverUrl: coverEl ? coverEl.src : '' };
    });
    console.log('   Metadata extracted:', Date.now() - t3, 'ms');
    console.log('   Title:', metadata.title);
    console.log('   Author:', metadata.author);
    
    console.log('Total time:', Date.now() - start, 'ms');
    await browser.close();
})().catch(e => console.log('ERROR:', e.message));
