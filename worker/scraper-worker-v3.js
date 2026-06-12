/**
 * Novel Scraper v3 - JSON Backup Version
 * 小說爬蟲 Worker - 直接儲存為 JSON 檔案（避免編碼問題）
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 固定路徑設定
const ROOT = 'G:/SoftwareDev/novel-scraper-v2';
const BACKUP_DIR = path.join(ROOT, 'novels');

// 確保備份目錄存在
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 設定
const SCRAPE_INTERVAL = 10000; // 檢查間隔（毫秒）
const CHAPTER_DELAY = 2000;   // 章節之間延遲（毫秒）
const MAX_RETRIES = 3;

// 日誌
function log(msg) {
    console.log(`[${new Date().toISOString()}] [Worker] ${msg}`);
}

// 儲存章節到 JSON 檔案
function saveChapterToFile(novelId, chapterNumber, title, content) {
    const novelDir = path.join(BACKUP_DIR, String(novelId));
    if (!fs.existsSync(novelDir)) {
        fs.mkdirSync(novelDir, { recursive: true });
    }
    
    const chapterFile = path.join(novelDir, `${chapterNumber}.json`);
    const data = {
        novelId,
        chapterNumber,
        title,
        content,
        savedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(chapterFile, JSON.stringify(data, null, 2), 'utf8');
    return chapterFile;
}

// 讀取已下載的章節數
function getDownloadedChapterCount(novelId) {
    const novelDir = path.join(BACKUP_DIR, String(novelId));
    if (!fs.existsSync(novelDir)) {
        return 0;
    }
    
    const files = fs.readdirSync(novelDir).filter(f => f.endsWith('.json'));
    return files.length;
}

// 取得小說清單
function getNovelList() {
    const listFile = path.join(BACKUP_DIR, 'novels.json');
    if (fs.existsSync(listFile)) {
        return JSON.parse(fs.readFileSync(listFile, 'utf8'));
    }
    return [];
}

// 儲存小說清單
function saveNovelList(novels) {
    const listFile = path.join(BACKUP_DIR, 'novels.json');
    fs.writeFileSync(listFile, JSON.stringify(novels, null, 2), 'utf8');
}

// 新增待爬取的小說
function addNovel(novelId, title, url) {
    const novels = getNovelList();
    const existing = novels.find(n => n.novelId === novelId);
    if (!existing) {
        novels.push({ novelId, title, url, status: 'pending', addedAt: new Date().toISOString() });
        saveNovelList(novels);
    }
}

// 更新小說狀態
function updateNovelStatus(novelId, status) {
    const novels = getNovelList();
    const novel = novels.find(n => n.novelId === novelId);
    if (novel) {
        novel.status = status;
        novel.updatedAt = new Date().toISOString();
        saveNovelList(novels);
    }
}

// 取得小說詳細資訊（書名、作者、分類、介紹）
async function getNovelMetadata(page, novelUrl) {
    try {
        log(`正在抓取小說資訊: ${novelUrl}`);
        
        await page.goto(novelUrl, { 
            waitUntil: 'networkidle',
            timeout: 60000 
        });
        
        await page.waitForTimeout(2000);
        
        // 解析書名、作者、分類、介紹
        const metadata = await page.evaluate(() => {
            // 嘗試從頁面取得資訊
            const titleEl = document.querySelector('h2.hotwordtitle') || document.querySelector('h2') || document.querySelector('.title');
            const authorEl = document.querySelector('.author a') || document.querySelector('.author');
            const categoryEl = document.querySelector('.category a') || document.querySelector('.category');
            const descEl = document.querySelector('.description') || document.querySelector('.intro') || document.querySelector('#novel-description');
            
            // 取得封面圖
            const coverEl = document.querySelector('.cover img') || document.querySelector('img.cover');
            const coverUrl = coverEl ? coverEl.src : '';
            
            // 取得作者
            let author = authorEl ? authorEl.textContent.trim() : '';
            author = author.replace(/作者：/, '').trim();
            
            // 取得分類
            let category = categoryEl ? categoryEl.textContent.trim() : '';
            category = category.replace(/分類：/, '').trim();
            
            // 取得介紹
            let description = descEl ? descEl.textContent.trim() : '';
            
            // 取得標題
            let title = titleEl ? titleEl.textContent.trim() : '';
            title = title.replace(/《|》/g, '').trim();
            
            return {
                title,
                author,
                category,
                description,
                coverUrl
            };
        });
        
        log(`抓取完成: ${JSON.stringify(metadata)}`);
        return metadata;
    } catch (error) {
        log(`抓取小說資訊失敗: ${error.message}`);
        return { title: '', author: '', category: '', description: '', coverUrl: '' };
    }
}

// 取得章節清單
async function getChapterUrls(page, novelUrl) {
    try {
        // 章節目錄頁 URL
        const dirUrl = novelUrl.replace(/\/(\d+)\.html$/, '/dir');
        log(`正在獲取章節列表: ${dirUrl}`);
        
        await page.goto(dirUrl, { 
            waitUntil: 'networkidle',
            timeout: 60000 
        });
        
        await page.waitForTimeout(3000);
        
        const chapters = await page.$$eval('a[href*=".html"]', links => {
            return links
                .filter(link => link.href && link.href.includes('.html') && !link.href.includes('/dir'))
                .map(link => ({
                    title: link.textContent.trim(),
                    url: link.href
                }));
        });
        
        log(`找到 ${chapters.length} 個章節連結`);
        return chapters;
    } catch (error) {
        log(`獲取章節列表失敗: ${error.message}`);
        return [];
    }
}

// 取得章節內容
async function getChapterContent(page, chapterUrl) {
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
        try {
            await page.goto(chapterUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            await page.waitForSelector('#chapter-content, #chapterContent, div.chapter-content, .chapter-content', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(2000);
            
            // 取得標題 - 先嘗試從內容區域取得
            let title = '未知章節';
            try {
                const titleEl = await page.$('.chapter-title, h2.chapter-title, #chapter-content h2, #chapterContent h2');
                if (titleEl) {
                    title = await titleEl.innerText();
                }
            } catch (e) {}
            if (!title || title === '未知章節') {
                try {
                    const h2s = await page.$$eval('#chapter-content h2, #chapterContent h2', els => els.map(e => e.innerText.trim()).filter(t => t.length > 5));
                    if (h2s.length > 0) title = h2s[0];
                } catch (e) {}
            }
            
            let content = await page.$eval('#chapter-content, #chapterContent, div.chapter-content, .chapter-content', el => {
                const clone = el.cloneNode(true);
                
                const removeTags = ['script', 'style', 'iframe', 'noscript', 'svg', 'img', 'video', 'audio'];
                removeTags.forEach(tag => {
                    clone.querySelectorAll(tag).forEach(e => e.remove());
                });
                
                const adPatterns = [/ad/i, /ads/i, /banner/i, /sponsor/i, /onead/i, /pubfuture/i, /tamedia/i, /google/i, /ND/i, /ONEAD/i, /TAMad/i];
                const allElements = clone.querySelectorAll('*');
                allElements.forEach(el => {
                    const className = el.className || '';
                    const id = el.id || '';
                    const isAd = adPatterns.some(p => 
                        (typeof className === 'string' && p.test(className)) ||
                        (typeof id === 'string' && p.test(id))
                    );
                    if (isAd) el.remove();
                });
                
                return clone.innerText || clone.textContent || '';
            }).catch(() => '');
            
            content = content.replace(/\s{3,}/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim();
            
            return { title, content };
        } catch (error) {
            log(`重試 ${retry + 1}/${MAX_RETRIES}: ${error.message}`);
            if (retry < MAX_RETRIES - 1) {
                await page.waitForTimeout(3000);
            }
        }
    }
    return null;
}

// 主工作流程
async function scrapeNovel(novel) {
    log(`開始下載: ${novel.title} (ID: ${novel.novelId})`);
    updateNovelStatus(novel.novelId, 'scraping');
    
    let browser;
    try {
        browser = await chromium.launch({ 
            headless: true,
            args: ['--disable-blink-features=AutomationControlled', '--disable-setuid-sandbox', '--no-sandbox']
        });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            extraHTTPHeaders: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        
        const chapters = await getChapterUrls(page, novel.url);
        if (chapters.length === 0) {
            log('無法取得章節列表');
            updateNovelStatus(novel.novelId, 'failed');
            return;
        }
        
        const existingCount = getDownloadedChapterCount(novel.novelId);
        log(`現有章節: ${existingCount}, 總章節: ${chapters.length}`);
        
        let newChapters = 0;
        for (let i = existingCount; i < chapters.length; i++) {
            const chapter = chapters[i];
            log(`下載第 ${i + 1}/${chapters.length} 章: ${chapter.title}`);
            
            const data = await getChapterContent(page, chapter.url);
            if (data && data.content) {
                saveChapterToFile(novel.novelId, i + 1, data.title, data.content);
                newChapters++;
            }
            
            if (i < chapters.length - 1) {
                await page.waitForTimeout(CHAPTER_DELAY);
            }
        }
        
        log(`完成！新增 ${newChapters} 章`);
        
        const finalCount = getDownloadedChapterCount(novel.novelId);
        if (finalCount >= chapters.length) {
            updateNovelStatus(novel.novelId, 'completed');
            log('全部章節下載完成！');
        } else {
            updateNovelStatus(novel.novelId, 'partial');
            log(`部分完成: ${finalCount}/${chapters.length} 章`);
        }
        
    } catch (error) {
        log(`爬蟲錯誤: ${error.message}`);
        updateNovelStatus(novel.novelId, 'failed');
    } finally {
        if (browser) await browser.close();
    }
}

// 主循環
async function main() {
    log('='.repeat(50));
    log('小說爬蟲 Worker v3 啟動 (JSON 備份模式)');
    log(`備份目錄: ${BACKUP_DIR}`);
    log('='.repeat(50));
    
    let isRunning = true;
    
    process.on('SIGINT', () => {
        log('收到關閉信號...');
        isRunning = false;
        process.exit(0);
    });
    
    while (isRunning) {
        try {
            const novels = getNovelList();
            const pendingNovel = novels.find(n => n.status === 'pending' || n.status === 'scraping');
            
            if (pendingNovel) {
                log(`發現待處理小說: ${pendingNovel.title}`);
                await scrapeNovel(pendingNovel);
            } else {
                log(`等待新任務... (${new Date().toLocaleString('zh-TW')})`);
            }
        } catch (error) {
            log(`錯誤: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, SCRAPE_INTERVAL));
    }
}

// 自動新增小說（從命令行參數）
if (process.argv.length > 2) {
    const novelId = process.argv[2];
    const title = process.argv[3] || '未知小說';
    const url = process.argv[4] || '';
    
    if (url) {
        log(`新增小說: ${title} (${url})`);
        addNovel(novelId, title, url);
    }
}

main().catch(console.error);