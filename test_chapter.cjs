const { chromium } = require('playwright');

async function test() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // 測試第100章
    const chapter100Url = 'https://www.novel543.com/0606693257/8096_100.html';
    console.log('測試章節：', chapter100Url);
    
    await page.goto(chapter100Url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // 取得標題
    let title = '';
    try {
        const titleEl = await page.$('h2.chapter-title, #chapter-content h2, h1.title');
        if (titleEl) {
            title = await titleEl.innerText() || '';
        }
    } catch (e) {}
    console.log('當前章節標題：', title);
    
    // 取得第一頁內容開頭（前200字）
    let content1 = await page.$eval('#chapter-content, #chapterContent, div.chapter-content', el => {
        return el.textContent.substring(0, 200);
    }).catch(() => '');
    console.log('第1頁開頭：', content1.substring(0, 100));
    
    // 檢查是否有下一頁連結
    const nextLink = await page.$('a:has-text("下一頁"), a:has-text("下一章"), a[rel="next"]');
    if (nextLink) {
        const href = await nextLink.getAttribute('href');
        console.log('下一頁連結：', href);
        
        // 直接導航到下一頁
        if (href && !href.startsWith('javascript')) {
            const nextUrl = href.startsWith('http') ? href : 'https://www.novel543.com' + href;
            console.log('導航到：', nextUrl);
            await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);
            
            // 取得新標題
            let nextTitle = '';
            try {
                const titleEl = await page.$('h2.chapter-title, #chapter-content h2, h1.title');
                if (titleEl) {
                    nextTitle = await titleEl.innerText() || '';
                }
            } catch (e) {}
            console.log('下一頁標題：', nextTitle);
            
            // 取得內容開頭
            let content2 = await page.$eval('#chapter-content, #chapterContent, div.chapter-content', el => {
                return el.textContent.substring(0, 200);
            }).catch(() => '');
            console.log('第2頁開頭：', content2.substring(0, 100));
        }
    } else {
        console.log('沒有下一頁連結');
    }
    
    await browser.close();
}

test().catch(console.error);
