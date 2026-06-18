const { chromium } = require('playwright');

async function test() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    const dirUrl = 'https://www.novel543.com/0606693257/dir';
    console.log('測試目錄：', dirUrl);
    
    await page.goto(dirUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    // 取得所有章節連結
    const chapters = await page.$$eval('a[href*=".html"]', links => {
        return links
            .filter(link => {
                if (link.href.includes('/dir')) return false;
                const text = link.textContent.trim();
                if (!text || text.length < 2) return false;
                if (text.includes('最新') || text.includes('首頁') || text.includes('目錄')) return false;
                return true;
            })
            .slice(0, 30)
            .map(link => {
                const text = link.textContent.trim();
                const href = link.href;
                // 提取章節號碼
                const chapterMatch = text.match(/第(\d+)章/);
                const chapterNum = chapterMatch ? parseInt(chapterMatch[1]) : 0;
                return { title: text, href, chapterNum };
            });
    });
    
    console.log('\n章節連結順序（前30個）：');
    chapters.forEach((ch, i) => {
        console.log(`${i + 1}. [${ch.chapterNum}] ${ch.title}`);
        console.log(`   ${ch.href}`);
    });
    
    await browser.close();
}

test().catch(console.error);
