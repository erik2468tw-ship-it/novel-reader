/**
 * Novel Scraper API Server - Integrated Worker Version
 * 同一個 process 運行 API Server + Scraper Worker
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import https from 'https';
import zlib from 'zlib';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// 設定
const PORT = process.env.PORT || 3002;
const NOVELS_DIR = join(ROOT, 'novels');
const SCRAPE_INTERVAL = 10000; // 檢查間隔（毫秒）
const CHAPTER_DELAY = 3000;   // 章節之間延遲（毫秒）
const MAX_RETRIES = 3;
const MAX_DOWNLOAD_RETRIES = 2;

// Worker 控制
let workerEnabled = true;
let workerStopFlag = false;

// ============= Express Server =============
const app = express();

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

// 靜態檔案服務（前端）
app.use(express.static(join(ROOT, 'dist')));
app.use(express.static(join(ROOT, 'public')));

// SPA fallback - 讓 Vue Router 處理路由
app.use((req, res, next) => {
    // 只處理非 API 請求
    if (!req.path.startsWith('/api')) {
        const indexPath = join(ROOT, 'dist', 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send('Not found');
        }
    } else {
        next();
    }
});

// 確保目錄存在
if (!fs.existsSync(NOVELS_DIR)) {
    fs.mkdirSync(NOVELS_DIR, { recursive: true });
}

// 小說清單相關函式
function getNovels() {
    const listFile = join(NOVELS_DIR, 'novels.json');
    if (fs.existsSync(listFile)) {
        const novels = JSON.parse(fs.readFileSync(listFile, 'utf8'));
        return novels.map(n => ({
            id: n.novelId,
            title: n.title || n.novelId,
            author: n.author || '',
            category: n.category || '',
            description: n.description || '',
            coverUrl: n.coverUrl || '',
            url: n.url,
            status: n.status,
            totalChapters: n.totalChapters || 0,
            lastSync: n.lastSync || null,
            created_at: n.addedAt,
            updated_at: n.updatedAt
        }));
    }
    return [];
}

function getChapters(novelId) {
    const novelDir = join(NOVELS_DIR, String(novelId));
    if (!fs.existsSync(novelDir)) return [];
    const files = fs.readdirSync(novelDir)
        .filter(f => f.endsWith('.json'));
    const chapters = files.map(file => {
        const data = JSON.parse(fs.readFileSync(join(novelDir, file), 'utf8'));
        return {
            id: data.chapterNumber,
            novel_id: data.novelId,
            chapter_number: data.chapterNumber,
            title: data.title,
            content: data.content,
            created_at: data.savedAt
        };
    });
    // Sort by actual chapter number, not filename
    chapters.sort((a, b) => a.chapter_number - b.chapter_number);
    return chapters;
}

function getNovelList() {
    const listFile = join(NOVELS_DIR, 'novels.json');
    if (fs.existsSync(listFile)) {
        return JSON.parse(fs.readFileSync(listFile, 'utf8'));
    }
    return [];
}

function saveNovelList(novels) {
    const listFile = join(NOVELS_DIR, 'novels.json');
    fs.writeFileSync(listFile, JSON.stringify(novels, null, 2), 'utf8');
}

function updateNovelStatus(novelId, status) {
    const novels = getNovelList();
    const novel = novels.find(n => n.novelId === novelId);
    if (novel) {
        novel.status = status;
        novel.updatedAt = new Date().toISOString();
        saveNovelList(novels);
    }
}

function updateNovelMetadata(novelId, metadata) {
    const novels = getNovelList();
    const novel = novels.find(n => n.novelId === novelId);
    if (novel) {
        novel.title = metadata.title || novel.title;
        novel.author = metadata.author || '';
        novel.category = metadata.category || '';
        novel.description = metadata.description || '';
        novel.coverUrl = metadata.coverUrl || '';
        novel.updatedAt = new Date().toISOString();
        saveNovelList(novels);
    }
}

function updateNovelSync(novelId, status, totalChapters) {
    const novels = getNovelList();
    const novel = novels.find(n => n.novelId === novelId);
    if (novel) {
        novel.status = status;
        novel.totalChapters = totalChapters;
        novel.lastSync = new Date().toISOString();
        novel.updatedAt = new Date().toISOString();
        saveNovelList(novels);
        
        // 當下載完成時，生成靜態首頁
        if (status === 'completed') {
            generateNovelIndexHTML(novelId, novel.title, novels);
            generateGlobalIndexHTML();
        }
    }
}

// 生成小說的靜態首頁（章節列表）
function generateNovelIndexHTML(novelId, novelTitle, allNovels) {
    const staticDir = join(NOVELS_DIR, 'static');
    try { if (!fs.existsSync(staticDir)) fs.mkdirSync(staticDir, { recursive: true }); } catch (e) { if (e.code !== 'EEXIST') log(`[靜態HTML] 建立目錄失敗: ${e.message}`); }
    
    const novelDir = join(NOVELS_DIR, String(novelId));
    const chapters = [];
    
    // 讀取所有章節
    if (fs.existsSync(novelDir)) {
        const files = fs.readdirSync(novelDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const data = JSON.parse(fs.readFileSync(join(novelDir, file), 'utf8'));
                chapters.push({
                    number: data.chapterNumber,
                    title: data.title
                });
            } catch (e) {}
        }
    }
    
    // 排序章節
    chapters.sort((a, b) => a.number - b.number);
    
    // 生成章節列表 HTML
    const chapterList = chapters.map(ch => 
        `            <li><a href="${ch.number}.html">第${ch.number}章 ${ch.title}</a></li>`
    ).join('\n');
    
    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${novelTitle}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { font-size: 1.5em; margin-bottom: 20px; color: #333; }
        .chapter-list { list-style: none; background: #fff; border-radius: 8px; overflow: hidden; }
        .chapter-list li { border-bottom: 1px solid #eee; }
        .chapter-list li:last-child { border-bottom: none; }
        .chapter-list a { display: block; padding: 15px 20px; color: #333; text-decoration: none; transition: background 0.2s; }
        .chapter-list a:hover { background: #f0f0f0; }
        .back-link { display: inline-block; margin-bottom: 20px; color: #3498db; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <a href="index.html" class="back-link">← 返回首頁</a>
        <h1>${novelTitle}</h1>
        <ul class="chapter-list">
${chapterList}
        </ul>
    </div>
</body>
</html>`;
    
    fs.writeFileSync(join(staticDir, `${novelId}.html`), html, 'utf8');
}

// API Routes
app.get('/api/novels', (req, res) => {
    try {
        res.json(getNovels());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 讀取靜態 HTML 章節內容（繞過 JSON 解析）
app.get('/api/static/:novelId/:chapter', (req, res) => {
    try {
        const { novelId, chapter } = req.params;
        const htmlFile = join(NOVELS_DIR, 'static', novelId, `${chapter}.html`);
        if (fs.existsSync(htmlFile)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(fs.readFileSync(htmlFile, 'utf8'));
        } else {
            res.status(404).json({ error: 'Chapter not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 讀取靜態 HTML 小說首頁
app.get('/api/static/:novelId', (req, res) => {
    try {
        const { novelId } = req.params;
        const htmlFile = join(NOVELS_DIR, 'static', `${novelId}.html`);
        if (fs.existsSync(htmlFile)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(fs.readFileSync(htmlFile, 'utf8'));
        } else {
            res.status(404).json({ error: 'Novel index not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/novels/:id', (req, res) => {
    try {
        const novel = getNovels().find(n => n.id == req.params.id);
        if (novel) res.json(novel);
        else res.status(404).json({ error: 'Novel not found' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/novels/:id', (req, res) => {
    try {
        const password = req.headers['x-password'] || req.body?.password;
        if (password !== '00000') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const listFile = join(NOVELS_DIR, 'novels.json');
        if (fs.existsSync(listFile)) {
            let novels = JSON.parse(fs.readFileSync(listFile, 'utf8'));
            const novelDir = join(NOVELS_DIR, req.params.id);
            if (fs.existsSync(novelDir)) {
                fs.rmSync(novelDir, { recursive: true });
            }
            novels = novels.filter(n => n.novelId !== req.params.id);
            fs.writeFileSync(listFile, JSON.stringify(novels, null, 2), 'utf8');
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/novels/:id/info', (req, res) => {
    try {
        const novels = getNovelList();
        const novel = novels.find(n => n.novelId === req.params.id);
        if (!novel) return res.status(404).json({ error: 'Novel not found' });
        res.json({
            novelId: novel.novelId,
            title: novel.title,
            author: novel.author || '',
            category: novel.category || '',
            description: novel.description || '',
            coverUrl: novel.coverUrl || '',
            url: novel.url,
            status: novel.status,
            totalChapters: novel.totalChapters || 0,
            lastSync: novel.lastSync || null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/novels/:id/chapters', (req, res) => {
    try {
        res.json(getChapters(req.params.id));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/chapter/:novelId/:chapterId', (req, res) => {
    try {
        const chapterFile = join(NOVELS_DIR, req.params.novelId, `${req.params.chapterId}.json`);
        if (fs.existsSync(chapterFile)) {
            const data = JSON.parse(fs.readFileSync(chapterFile, 'utf8'));
            res.json(data);
        } else {
            res.status(404).json({ error: 'Chapter not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Worker 控制 API ============

// 取得 Worker 狀態
app.get('/api/worker/status', (req, res) => {
    res.json({ enabled: workerEnabled, running: !workerStopFlag });
});

// 啟動 Worker
app.post('/api/worker/start', (req, res) => {
    workerEnabled = true;
    log('Worker 已啟動');
    res.json({ success: true, message: 'Worker 已啟動' });
});

// 停止 Worker
app.post('/api/worker/stop', (req, res) => {
    workerEnabled = false;
    log('Worker 已停止');
    res.json({ success: true, message: 'Worker 已停止' });
});

// 除錯：手動觸發一次 scrapeNovel
app.post('/api/debug/scrape', (req, res) => {
    const novels = getNovelList();
    const pendingNovel = novels.find(n => n.status === 'pending' || n.status === 'scraping');
    if (!pendingNovel) {
        res.json({ success: false, message: '沒有待處理的小說' });
        return;
    }
    log(`[DEBUG] 手動觸發 scrapeNovel: ${pendingNovel.title}`);
    scrapeNovel(pendingNovel).then(() => {
        res.json({ success: true, message: 'scrapeNovel 完成' });
    }).catch(err => {
        res.json({ success: false, message: `scrapeNovel 失敗: ${err.message}` });
    });
    res.json({ success: true, message: 'scrapeNovel 已開始（非阻塞）' });
});

// 取得所有任務明細
app.get('/api/tasks', (req, res) => {
    try {
        const novels = getNovelList();
        const tasks = novels.map(novel => {
            const novelDir = join(NOVELS_DIR, String(novel.novelId));
            const files = fs.existsSync(novelDir) 
                ? fs.readdirSync(novelDir).filter(f => f.endsWith('.json')).length 
                : 0;
            return {
                id: novel.novelId,
                title: novel.title,
                url: novel.url,
                status: novel.status,
                totalChapters: novel.totalChapters || 0,
                downloadedChapters: files,
                lastSync: novel.lastSync,
                created_at: novel.addedAt
            };
        });
        res.json({ 
            workerEnabled,
            tasks 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 刪除任務（連同檔案）
app.delete('/api/scrape/:id', (req, res) => {
    try {
        const password = req.headers['x-password'] || req.body?.password;
        if (password !== '00000') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const novelId = req.params.id;
        const listFile = join(NOVELS_DIR, 'novels.json');
        if (fs.existsSync(listFile)) {
            let novels = JSON.parse(fs.readFileSync(listFile, 'utf8'));
            const novelDir = join(NOVELS_DIR, novelId);
            if (fs.existsSync(novelDir)) {
                fs.rmSync(novelDir, { recursive: true });
                log(`已刪除小說資料夾: ${novelId}`);
            }
            novels = novels.filter(n => n.novelId !== novelId);
            fs.writeFileSync(listFile, JSON.stringify(novels, null, 2), 'utf8');
            log(`已刪除任務: ${novelId}`);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scrape', (req, res) => {
    try {
        const { url, title } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });
        const id = String(Date.now());
        const novels = getNovelList();
        const existing = novels.find(n => n.url === url);
        if (existing) return res.status(400).json({ error: 'Novel already exists', id: existing.novelId });
        novels.push({ novelId: id, title: title || url, url, status: 'pending', addedAt: new Date().toISOString() });
        saveNovelList(novels);
        res.json({ success: true, id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scrape/:id/sync', (req, res) => {
    try {
        updateNovelStatus(req.params.id, 'pending');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chapter/:novelId/:chapterId/preload', (req, res) => {
    res.json({ success: true, message: 'Preload triggered' });
});

// 重新整理章節（修補標題 + 增量更新）
app.post('/api/scrape/:id/refresh', async (req, res) => {
    try {
        const novelId = req.params.id;
        const novels = getNovelList();
        const novel = novels.find(n => n.novelId === novelId);
        if (!novel) return res.status(404).json({ error: 'Novel not found' });
        
        // 觸發背景更新
        updateNovelStatus(novelId, 'pending');
        res.json({ success: true, message: '開始重新整理章節...' });
        
        // 背景執行更新
        setTimeout(() => refreshNovel(novel), 1000);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============= Scraper Worker =============
function log(msg) {
    console.log(`[${new Date().toISOString()}] [Worker] ${msg}`);
}

function saveChapterToFile(novelId, chapterNumber, title, content) {
    const novelDir = join(NOVELS_DIR, String(novelId));
    if (!fs.existsSync(novelDir)) fs.mkdirSync(novelDir, { recursive: true });
    const chapterFile = join(novelDir, `${chapterNumber}.json`);
    const data = { novelId, chapterNumber, title, content, savedAt: new Date().toISOString() };
    fs.writeFileSync(chapterFile, JSON.stringify(data, null, 2), 'utf8');
    
    // 同時生成靜態 HTML
    const staticDir = join(NOVELS_DIR, 'static', String(novelId));
    try { if (!fs.existsSync(staticDir)) fs.mkdirSync(staticDir, { recursive: true }); } catch (e) { if (e.code !== 'EEXIST') log(`[靜態HTML] 建立目錄失敗: ${e.message}`); }
    const htmlFile = join(staticDir, `${chapterNumber}.html`);
    const htmlContent = generateChapterHTML(novelId, chapterNumber, title, content);
    fs.writeFileSync(htmlFile, htmlContent, 'utf8');
    
    return chapterFile;
}

// 生成章節的靜態 HTML
function generateChapterHTML(novelId, chapterNumber, title, content) {
    // 格式化內容：將換行轉換為 <br> 或 <p>
    const formattedContent = content
        .split('\n\n')
        .map(para => para.trim())
        .filter(para => para.length > 0)
        .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
        .join('\n');
    
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>第${chapterNumber}章 ${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans TC', sans-serif;
            background: #f5f5f5; 
            color: #333; 
            line-height: 1.8;
            padding: 20px;
        }
        @media (prefers-color-scheme: dark) {
            body { background: #1a1a1a; color: #e0e0e0; }
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: #fff;
            padding: 30px 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        @media (prefers-color-scheme: dark) {
            .container { background: #2d2d2d; }
        }
        .chapter-title { 
            font-size: 1.5em; 
            margin-bottom: 20px; 
            padding-bottom: 15px; 
            border-bottom: 1px solid #eee;
            color: #2c3e50;
        }
        @media (prefers-color-scheme: dark) {
            .chapter-title { border-bottom-color: #444; color: #e0e0e0; }
        }
        .chapter-content p { 
            margin-bottom: 1em; 
            text-indent: 2em;
        }
        .nav {
            display: flex;
            justify-content: space-between;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        @media (prefers-color-scheme: dark) {
            .nav { border-top-color: #444; }
        }
        .nav a {
            padding: 10px 20px;
            background: #3498db;
            color: #fff;
            text-decoration: none;
            border-radius: 5px;
            font-size: 0.9em;
        }
        .nav a:hover { background: #2980b9; }
        .nav a.disabled { 
            background: #ccc; 
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="chapter-title">第${chapterNumber}章 ${title}</h1>
        <div class="chapter-content">
            ${formattedContent}
        </div>
        <div class="nav">
            <a href="${chapterNumber - 1}.html" id="prevBtn">上一章</a>
            <a href="${chapterNumber + 1}.html" id="nextBtn">下一章</a>
        </div>
    </div>
    <script>
        // 根據是否存在上一章/下一章隱藏導航按鈕
        fetch('${chapterNumber - 1}.html', { method: 'HEAD' })
            .then(r => { if (!r.ok) document.getElementById('prevBtn').classList.add('disabled'); })
            .catch(() => document.getElementById('prevBtn').classList.add('disabled'));
        fetch('${chapterNumber + 1}.html', { method: 'HEAD' })
            .then(r => { if (!r.ok) document.getElementById('nextBtn').classList.add('disabled'); })
            .catch(() => document.getElementById('nextBtn').classList.add('disabled'));
    </script>
</body>
</html>`;
}

function getDownloadedChapterCount(novelId) {
    const novelDir = join(NOVELS_DIR, String(novelId));
    if (!fs.existsSync(novelDir)) return 0;
    return fs.readdirSync(novelDir).filter(f => f.endsWith('.json')).length;
}

async function getNovelMetadata(page, novelUrl) {
    try {
        await page.goto(novelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        return await page.evaluate(() => {
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
    } catch (error) {
        log(`抓取 metadata 失敗: ${error.message}`);
        return { title: '', author: '', category: '', description: '', coverUrl: '' };
    }
}

async function getChapterUrls(page, novelUrl) {
    // 使用 Playwright 提取章節列表（編碼正確）
    const baseUrl = novelUrl.endsWith('/') ? novelUrl.slice(0, -1) : novelUrl;
    const dirUrl = baseUrl + '/dir';
    
    try {
        await page.goto(dirUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('a[href*=".html"]', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(5000);
        await page.waitForTimeout(3000);
        return await page.$$eval('a[href*=".html"]', links => {
            return links.filter(link => {
                if (link.href.includes('/dir')) return false;
                const text = link.textContent.trim();
                if (!text || text.length < 2) return false;
                if (text.includes('最新') || text.includes('首頁') || text.includes('目錄')) return false;
                return true;
            }).map(link => {
                const text = link.textContent.trim();
                // 嘗試提取章節編號
                const chapterMatch = text.match(/第(\d+)章/);
                const chapterNum = chapterMatch ? parseInt(chapterMatch[1]) : 0;
                // 確保 URL 是完整的（有些 href 是相對路徑）
                let url = link.href;
                if (url.startsWith('/')) {
                    url = 'https://www.novel543.com' + url;
                }
                return { title: text, url: url, chapterNum };
            });
        });
    } catch (error) {
        log(`獲取章節列表失敗: ${error.message}`);
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
                const pattern = /href="([^"]+)"[^>]*>\s*第(\d+)章[^<]*/gi;
                let match;
                while ((match = pattern.exec(data)) !== null) {
                    const href = match[1];
                    const chapterNum = match[2];
                    if (href.includes('/dir') || href.includes('ranking') || href.includes('auth') || href.includes('signin')) continue;
                    const titleMatch = data.substring(match.index, match.index + 500).match(/第\d+章\s*([^<\n]+)/);
                    const title = titleMatch ? titleMatch[1].trim() : '第' + chapterNum + '章';
                    // Convert relative URL to absolute URL
                    const fullUrl = href.startsWith('http') ? href : 'https://www.novel543.com' + href;
                    links.push({ title: title, url: fullUrl, chapterNum: parseInt(chapterNum) });
                }
                
                if (links.length === 0) {
                    const simplePattern = /href="([^"]+\.html)"/gi;
                    while ((match = simplePattern.exec(data)) !== null) {
                        const href = match[1];
                        if (href.includes('/dir') || href.includes('ranking') || href.includes('auth') || href.includes('signin')) continue;
                        const start = Math.max(0, match.index - 100);
                        const end = Math.min(data.length, match.index + match[0].length + 200);
                        const context = data.substring(start, end);
                        const chapterMatch = context.match(/第(\d+)章\s*([^<\n]+)/);
                        const chapterNum = chapterMatch ? chapterMatch[1] : '0';
                        const title = chapterMatch ? chapterMatch[2].trim().substring(0, 50) : '未知章節';
                        const fullUrl = href.startsWith('http') ? href : 'https://www.novel543.com' + href;
                        links.push({ title: title, url: fullUrl, chapterNum: parseInt(chapterNum) });
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


async function getChapterContent(page, chapterUrl) {
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
        try {
            await page.goto(chapterUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('#chapter-content, #chapterContent, div.chapter-content, .chapter-content', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(2000);
            
            let title = '未知章節';
            let allContent = [];
            let pageNum = 1;
            let maxPages = 10; // 防止無限循環
            // 擷取內容的函式（保持原始段落結構）
            const extractContent = async () => {
                const content = await page.$eval('#chapter-content, #chapterContent, div.chapter-content, .chapter-content', el => {
                    const clone = el.cloneNode(true);
                    // 移除廣告和不相關的元素
                    ['script', 'style', 'iframe', 'noscript', 'svg', 'img', 'video', 'audio'].forEach(tag => clone.querySelectorAll(tag).forEach(e => e.remove()));
                    const adPatterns = [/ad/i, /ads/i, /banner/i, /sponsor/i, /onead/i, /pubfuture/i, /tamedia/i, /google/i, /ND/i, /ONEAD/i, /TAMad/i];
                    clone.querySelectorAll('*').forEach(el => {
                        const className = el.className || '', id = el.id || '';
                        if (adPatterns.some(p => (typeof className === 'string' && p.test(className)) || (typeof id === 'string' && p.test(id)))) el.remove();
                    });
                    // 遍歷所有 block 元素，分別提取文字並用換行分隔
                    const blockTags = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'blockquote'];
                    const texts = [];
                    function extractBlockText(node) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const t = node.textContent?.trim();
                            if (t) texts.push(t);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.tagName === 'BR') {
                                texts.push('');
                            } else {
                                // 先處理子節點
                                Array.from(node.childNodes).forEach(child => extractBlockText(child));
                                // block 元素後面加換行
                                if (blockTags.includes(node.tagName)) {
                                    texts.push('');
                                }
                            }
                        }
                    }
                    Array.from(clone.childNodes).forEach(child => extractBlockText(child));
                    // 清理多餘空行
                    let result = texts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
                    return result;
                }).catch(() => '');
                return content;
            };
            
            // 提取標題
            try {
                const selectors = [
                    '.chapter-title', 'h2.chapter-title', '#chapter-content h2', '#chapterContent h2',
                    '.book-title', '.chapter-name', 'h1.title', '.novel-title', '.title h2', 'h2'
                ];
                for (const sel of selectors) {
                    const el = await page.$(sel);
                    if (el) {
                        const text = await el.innerText() || el.textContent;
                        if (text && text.trim().length > 2) {
                            let cleanTitle = text.trim()
                                .replace(/\s*\(\d+\/\d+\)\s*$/g, '')
                                .replace(/\s*第\d+頁\s*/g, '')
                                .replace(/\s*-\s*\d+\/\d+\s*$/g, '')
                                .trim();
                            if (cleanTitle.length > 2) {
                                title = cleanTitle;
                                break;
                            }
                        }
                    }
                }
            } catch (e) {}
            
            if (!title || title === '未知章節') {
                try {
                    const pageTitle = await page.title();
                    if (pageTitle) {
                        let cleanTitle = pageTitle
                            .replace(/\s*\(\d+\/\d+\)\s*$/g, '')
                            .replace(/\s*-\s*\d+\/\d+\s*$/g, '')
                            .trim();
                        if (cleanTitle.length > 2) title = cleanTitle;
                    }
                } catch (e) {}
            }
            
            // 提取第一頁內容
            let content = await extractContent();
            allContent.push(content);
            
            // 取得當前章節號碼（用於分頁比對）
            const currentChapterNum = title.match(/第(\d+)章/)?.[1] || '';
            
            // 檢查是否有下一頁連結並自動下載所有頁面
            while (pageNum < maxPages) {
                // 尋找下一頁連結
                const nextLink = await page.$('a:has-text("下一頁"), a:has-text("下一章"), a:has-text("下一页"), a.next-page, a[rel="next"]');
                if (!nextLink) break;
                
                const href = await nextLink.getAttribute('href');
                if (!href || href === '#' || href === 'javascript:void(0)') break;
                
                // 確保 URL 是完整的（有些 href 是相對路徑）
                const fullUrl = href.startsWith('http') ? href : 'https://www.novel543.com' + href;
                
                // 使用 goto 導航到下一頁（因為點擊可能被導向其他網域）
                await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(2000);
                
                // 提取新頁面的標題
                let nextPageTitle = '';
                try {
                    const titleSelectors = ['.chapter-title', 'h2.chapter-title', '#chapter-content h2', '#chapterContent h2', 'h1.title', '.title h2', 'h2'];
                    for (const sel of titleSelectors) {
                        const el = await page.$(sel);
                        if (el) {
                            const text = await el.innerText() || el.textContent;
                            if (text && text.trim().length > 2) {
                                nextPageTitle = text.trim().replace(/\s*\(\d+\/\d+\)\s*$/g, '').replace(/\s*第\d+頁\s*/g, '').trim();
                                break;
                            }
                        }
                    }
                } catch (e) {}
                
                // 如果抓不到標題，用 page title
                if (!nextPageTitle) {
                    try {
                        const pageTitle = await page.title();
                        if (pageTitle) {
                            nextPageTitle = pageTitle.replace(/\s*\(\d+\/\d+\)\s*$/g, '').replace(/\s*-\s*\d+\/\d+\s*$/g, '').trim();
                        }
                    } catch (e) {}
                }
                
                // 檢查下一頁是否同一章（比對章節號碼）
                const nextChapterNum = nextPageTitle.match(/第(\d+)章/)?.[1] || '';
                if (nextChapterNum && nextChapterNum !== currentChapterNum) {
                    log(`  偵測到新章節「${nextPageTitle}」，停止分頁下載`);
                    break;
                }
                
                // 同一章，繼續下載
                pageNum++;
                log(`  下載第 ${pageNum} 頁（仍為：${title}）...`);
                
                content = await extractContent();
                allContent.push(content);
            }
            
            // 合併所有頁面內容並重新排版
            let mergedContent = allContent.join('\n\n');
            
            // 清理各種分頁標記
            mergedContent = mergedContent
                .replace(/\s*\(\d+\/\d+\)\s*/g, '')
                .replace(/\s*第\d+\/\d+頁\s*/g, '')
                .replace(/\s*-\s*\d+\/\d+\s*/g, '')
                .replace(/\s*\|\s*\d+\/\d+\s*/g, '')
                .replace(/\s*下一頁[^\n]*/gi, '')
                .replace(/\s*下一章[^\n]*/gi, '')
                .replace(/\s*Page \d+ of \d+/gi, '');
            
            // 清理廣告和浮水印
            mergedContent = mergedContent
                .replace(/如您認為本書不錯[\s\S]*?$/gm, '')
                .replace(/請記住本站網址[\s\S]*?$/gm, '')
                .replace(/本章尚未結束[\s\S]*?$/gm, '')
                .replace(/溫馨提示:[^\n]*/gi, '');
            
            // 移除重複的章節標題（標題+內容 重複兩次）
            // 匹配模式：標題 + 標題（開頭重複）
            const chapterPattern = /((第\d+章\s*[^\n「第」]+)[\s\S]*?)(\1)+/g;
            mergedContent = mergedContent.replace(chapterPattern, '$1');
            
            // 如果標題在內容開頭重複，去掉
            const titleWords = title.split(/\s+/)[0]; // 取得標題第一個詞
            if (titleWords) {
                // 處理「標題 標題 內容」->「標題 內容」的情況
                const leadingDup = new RegExp('^' + titleWords.replace(/[\[\]()]/g, '\\$&') + '[^\n]{0,20}?', 'g');
                mergedContent = mergedContent.replace(leadingDup, '').trim();
            }
            
            // 正規化換行符
            mergedContent = mergedContent
                .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                .replace(/\n{3,}/g, '\n\n');
            
            // 分割成段落並清理
            let finalContent = mergedContent
                .split('\n')
                .map(para => {
                    return para
                        .replace(/\t/g, '')
                        .replace(/ {2,}/g, ' ')
                        .trim();
                })
                .filter(para => para.length > 3 && /[a-zA-Z0-9\u4e00-\u9fa5]/.test(para))
                .join('\n\n');
            
            // 最終清理：移除開頭的章節標題重複
            const firstNewline = finalContent.indexOf('\n');
            if (firstNewline > 0 && firstNewline < 30) {
                finalContent = finalContent.substring(firstNewline).trim();
            }
            
            if (pageNum > 1) log(`  合併 ${pageNum} 頁內容完成`);
            return { title, content: finalContent };
        } catch (error) {
            log(`重試 ${retry + 1}/${MAX_RETRIES}: ${error.message}`);
            if (retry < MAX_RETRIES - 1) await page.waitForTimeout(3000);
        }
    }
    return null;
}

async function scrapeNovel(novel, retryCount = 0) {
    log(`開始下載: ${novel.title} (ID: ${novel.novelId})`);
    updateNovelStatus(novel.novelId, 'scraping');
    let browser;
    try {
        browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--disable-setuid-sandbox', '--no-sandbox'] });
        const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', extraHTTPHeaders: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' } });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const metadata = await getNovelMetadata(page, novel.url);
        if (metadata.title) updateNovelMetadata(novel.novelId, metadata);
        const chapters = await getChapterUrls(page, novel.url);
        if (chapters.length === 0) { log('無法取得章節列表'); updateNovelStatus(novel.novelId, 'failed'); return; }
        const existingCount = getDownloadedChapterCount(novel.novelId);
        log(`現有章節: ${existingCount}, 總章節: ${chapters.length}`);
        let newChapters = 0, failedChapters = [];
        for (let i = existingCount; i < chapters.length; i++) {
            // 每次下載前檢查是否已停止
            if (!workerEnabled) {
                log('Worker 已停止，結束下載');
                break;
            }
            const chapter = chapters[i];
            log(`下載第 ${i + 1}/${chapters.length} 章: ${chapter.title}`);
            const data = await getChapterContent(page, chapter.url);
            if (data && data.content) { saveChapterToFile(novel.novelId, chapter.chapterNum || (i + 1), data.title, data.content); newChapters++; }
            else { failedChapters.push({ index: i, chapter, retry: 0 }); log(`第 ${i + 1} 章下載失敗`); }
            if (i < chapters.length - 1) await page.waitForTimeout(CHAPTER_DELAY);
        }
        if (failedChapters.length > 0 && retryCount < MAX_DOWNLOAD_RETRIES) {
            log(`開始重試 ${failedChapters.length} 個失敗章節...`);
            for (const failed of failedChapters) {
                if (failed.retry < MAX_RETRIES) {
                    log(`重試第 ${failed.index + 1} 章: ${failed.chapter.title}`);
                    await page.waitForTimeout(2000);
                    const data = await getChapterContent(page, failed.chapter.url);
                    if (data && data.content) { saveChapterToFile(novel.novelId, failed.chapter.chapterNum || (failed.index + 1), data.title, data.content); newChapters++; }
                    else failed.retry++;
                }
            }
        }
        log(`完成！新增 ${newChapters} 章`);
        const finalCount = getDownloadedChapterCount(novel.novelId);
        if (finalCount >= chapters.length) updateNovelSync(novel.novelId, 'completed', chapters.length);
        else updateNovelSync(novel.novelId, 'partial', chapters.length);
    } catch (error) {
        log(`爬蟲錯誤: ${error.message}`);
        if (retryCount < MAX_DOWNLOAD_RETRIES) {
            log(`準備重試... (${retryCount + 1}/${MAX_DOWNLOAD_RETRIES})`);
            await new Promise(r => setTimeout(r, 10000));
            await scrapeNovel(novel, retryCount + 1);
        } else updateNovelStatus(novel.novelId, 'failed');
    } finally {
        if (browser) await browser.close();
    }
}

// Worker 主循環
async function workerLoop() {
    log('='.repeat(50));
    log('小說爬蟲 Worker 已整合到 Express Server');
    log(`備份目錄: ${NOVELS_DIR}`);
    log('='.repeat(50));
    while (!workerStopFlag) {
        if (!workerEnabled) {
            await new Promise(r => setTimeout(r, 1000)); // 停用時每秒檢查一次
            continue;
        }
        try {
            const novels = getNovelList();
            const pendingNovel = novels.find(n => n.status === 'pending' || n.status === 'scraping');
            if (pendingNovel) {
                log(`發現待處理小說: ${pendingNovel.title}`);
                await scrapeNovel(pendingNovel);
            }
        } catch (error) {
            log(`錯誤: ${error.message}`);
        }
        await new Promise(r => setTimeout(r, SCRAPE_INTERVAL));
    }
    log('Worker 已停止');
}

// 重新整理章節（修補標題 + 增量更新）
async function refreshNovel(novel) {
    log(`開始重新整理: ${novel.title} (ID: ${novel.novelId})`);
    updateNovelStatus(novel.novelId, 'scraping');
    let browser;
    try {
        browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--disable-setuid-sandbox', '--no-sandbox'] });
        const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', extraHTTPHeaders: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' } });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        
        // 取得章節列表
        const chapters = await getChapterUrls(page, novel.url);
        if (chapters.length === 0) { log('無法取得章節列表'); updateNovelStatus(novel.novelId, 'failed'); return; }
        
        // 取得現有章節
        const novelDir = join(NOVELS_DIR, String(novel.novelId));
        const existingFiles = fs.existsSync(novelDir) 
            ? fs.readdirSync(novelDir).filter(f => f.endsWith('.json')) 
            : [];
        
        let fixedTitles = 0;
        let newChapters = 0;
        
        // 修補現有章節的標題
        for (const file of existingFiles) {
            const chapterNum = parseInt(file.replace('.json', ''));
            const chapterFile = join(novelDir, file);
            const data = JSON.parse(fs.readFileSync(chapterFile, 'utf8'));
            
            // 如果標題是「未知章節」，嘗試修補
            if (data.title === '未知章節' || !data.title) {
                const chapterInfo = chapters.find((ch, idx) => idx + 1 === chapterNum);
                if (chapterInfo) {
                    data.title = chapterInfo.title;
                    fs.writeFileSync(chapterFile, JSON.stringify(data, null, 2), 'utf8');
                    fixedTitles++;
                    log(`修補章節 ${chapterNum} 標題: ${chapterInfo.title}`);
                }
            }
        }
        
        // 增量下載新章節
        const existingCount = existingFiles.length;
        for (let i = existingCount; i < chapters.length; i++) {
            const chapter = chapters[i];
            log(`下載新章節 ${i + 1}/${chapters.length}: ${chapter.title}`);
            const data = await getChapterContent(page, chapter.url);
            if (data && data.content) {
                saveChapterToFile(novel.novelId, chapter.chapterNum || (i + 1), data.title, data.content);
                newChapters++;
            }
            if (i < chapters.length - 1) await page.waitForTimeout(CHAPTER_DELAY);
        }
        
        log(`完成！修補 ${fixedTitles} 個標題，新增 ${newChapters} 章`);
        updateNovelSync(novel.novelId, 'completed', chapters.length);
    } catch (error) {
        log(`重新整理錯誤: ${error.message}`);
        updateNovelStatus(novel.novelId, 'failed');
    } finally {
        if (browser) await browser.close();
    }
}

// ============= 啟動 =============
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Novel Scraper API + Worker running on http://0.0.0.0:${PORT}`);
    console.log(`JSON 目錄: ${NOVELS_DIR}`);
    
    // 啟動時為已存在的小說生成靜態 HTML
    regenerateAllStaticHTML();
    generateGlobalIndexHTML();
});

process.on('SIGINT', () => { process.exit(0); });

// 啟動 Worker（不阻塞 Express）
workerLoop();

// 為所有已存在的小說生成靜態 HTML
function regenerateAllStaticHTML() {
    const staticDir = join(NOVELS_DIR, 'static');
    try {
        if (!fs.existsSync(staticDir)) fs.mkdirSync(staticDir, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') {
            log(`[靜態HTML] 建立目錄失敗: ${e.message}`);
            return;
        }
    }
    
    const novels = getNovels();
    log(`[靜態HTML] 發現 ${novels.length} 本小說，開始生成靜態頁面...`);
    
    for (const novel of novels) {
        if (novel.status === 'completed' || novel.status === 'partial') {
            // 生成小說首頁
            const novelsForIndex = getNovelList();
            const novelData = novelsForIndex.find(n => n.novelId === novel.id);
            if (novelData) {
                generateNovelIndexHTML(novel.id, novelData.title, novelsForIndex);
            }
            
            // 生成各章節 HTML
            const novelDir = join(NOVELS_DIR, String(novel.id));
            if (fs.existsSync(novelDir)) {
                const files = fs.readdirSync(novelDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    try {
                        const data = JSON.parse(fs.readFileSync(join(novelDir, file), 'utf8'));
                        const staticChapterDir = join(staticDir, String(novel.id));
                        try { if (!fs.existsSync(staticChapterDir)) fs.mkdirSync(staticChapterDir, { recursive: true }); } catch (e) { if (e.code !== 'EEXIST') log(`[靜態HTML] 建立目錄失敗: ${e.message}`); }
                        const htmlFile = join(staticChapterDir, `${data.chapterNumber}.html`);
                        const htmlContent = generateChapterHTML(novel.id, data.chapterNumber, data.title, data.content);
                        fs.writeFileSync(htmlFile, htmlContent, 'utf8');
                    } catch (e) {
                        log(`[靜態HTML] 生成章節失敗: ${file} - ${e.message}`);
                    }
                }
            }
            log(`[靜態HTML] 完成: ${novel.title}`);
        }
    }
    log(`[靜態HTML] 全部完成！靜態頁面目錄: ${staticDir}`);
}

// 生成全局首頁（所有小說列表）
function generateGlobalIndexHTML() {
    const staticDir = join(NOVELS_DIR, 'static');
    try { if (!fs.existsSync(staticDir)) fs.mkdirSync(staticDir, { recursive: true }); } catch (e) { if (e.code !== 'EEXIST') log(`[靜態HTML] 建立目錄失敗: ${e.message}`); }
    
    const novels = getNovels().filter(n => n.status === 'completed' || n.status === 'partial');
    
    const novelList = novels.map(n => 
        `            <div class="novel-card">
                <h3><a href="${n.id}.html">${n.title}</a></h3>
                <p class="author">作者：${n.author || '未知'}</p>
                <p class="category">分類：${n.category || '其他'}</p>
                <p class="chapters">章節數：${n.totalChapters || 0}</p>
            </div>`
    ).join('\n');
    
    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>小說閱讀器</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; padding: 20px; }
        h1 { font-size: 2em; margin-bottom: 30px; color: #333; text-align: center; }
        .novel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
        .novel-card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .novel-card h3 { margin-bottom: 10px; }
        .novel-card h3 a { color: #3498db; text-decoration: none; }
        .novel-card h3 a:hover { text-decoration: underline; }
        .novel-card p { color: #666; font-size: 0.9em; margin-bottom: 5px; }
        .novel-card .chapters { color: #999; font-size: 0.8em; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📚 小說閱讀器</h1>
        <div class="novel-grid">
${novelList}
        </div>
    </div>
</body>
</html>`;
    
    fs.writeFileSync(join(staticDir, 'index.html'), html, 'utf8');
}
