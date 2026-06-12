/**
 * Novel Scraper API Server v4
 * 直接讀取 JSON 檔案，解決編碼問題
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3002;
const NOVELS_DIR = join(ROOT, 'novels');

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

// 確保目錄存在
if (!fs.existsSync(NOVELS_DIR)) {
    fs.mkdirSync(NOVELS_DIR, { recursive: true });
}

// 讀取小說清單（轉換為前端期望的格式）
function getNovels() {
    const listFile = join(NOVELS_DIR, 'novels.json');
    if (fs.existsSync(listFile)) {
        const novels = JSON.parse(fs.readFileSync(listFile, 'utf8'));
        // 轉換為前端期望的格式，包含 metadata
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

// 讀取章節
function getChapters(novelId) {
    const novelDir = join(NOVELS_DIR, String(novelId));
    if (!fs.existsSync(novelDir)) {
        return [];
    }
    
    const files = fs.readdirSync(novelDir)
        .filter(f => f.endsWith('.json'))
        .sort((a, b) => parseInt(a) - parseInt(b));
    
    return files.map(file => {
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
}

// API Routes
app.get('/api/novels', (req, res) => {
    try {
        const novels = getNovels();
        res.json(novels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/novels/:id', (req, res) => {
    try {
        const novels = getNovels();
        const novel = novels.find(n => n.id == req.params.id);
        if (novel) {
            res.json(novel);
        } else {
            res.status(404).json({ error: 'Novel not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/novels/:id', (req, res) => {
    try {
        // 支援 header 或 body 傳密碼
        const password = req.headers['x-password'] || req.query.password || (req.body && req.body.password);
        if (password !== '00000') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const listFile = join(NOVELS_DIR, 'novels.json');
        if (fs.existsSync(listFile)) {
            let novels = JSON.parse(fs.readFileSync(listFile, 'utf8'));
            const novelDir = join(NOVELS_DIR, req.params.id);
            
            // 刪除小說目錄
            if (fs.existsSync(novelDir)) {
                fs.rmSync(novelDir, { recursive: true });
            }
            
            // 從清單移除
            novels = novels.filter(n => n.novelId !== req.params.id);
            fs.writeFileSync(listFile, JSON.stringify(novels, null, 2), 'utf8');
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/novels/:id/chapters', (req, res) => {
    try {
        const chapters = getChapters(req.params.id);
        res.json(chapters);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scrape', (req, res) => {
    try {
        const { url, title, novelId } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        const listFile = join(NOVELS_DIR, 'novels.json');
        let novels = [];
        
        if (fs.existsSync(listFile)) {
            novels = JSON.parse(fs.readFileSync(listFile, 'utf8'));
        }
        
        // 如果沒有提供 novelId，自動產生
        const id = novelId || String(Date.now());
        
        // 檢查是否已存在
        const existing = novels.find(n => n.url === url);
        if (existing) {
            return res.status(400).json({ error: 'Novel already exists', id: existing.novelId });
        }
        
        // 新增小說
        novels.push({
            novelId: id,
            title: title || url,
            url: url,
            status: 'pending',
            addedAt: new Date().toISOString()
        });
        
        fs.writeFileSync(listFile, JSON.stringify(novels, null, 2), 'utf8');
        res.json({ success: true, id: id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scrape/:id/pause', (req, res) => {
    try {
        updateNovelStatus(req.params.id, 'paused');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scrape/:id/resume', (req, res) => {
    try {
        updateNovelStatus(req.params.id, 'scraping');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scrape/:id/cancel', (req, res) => {
    try {
        updateNovelStatus(req.params.id, 'cancelled');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy API 端點（舊版前端使用）
app.get('/api/proxy/novels', (req, res) => {
    // 代理取得小說列表
    const novels = getNovels();
    res.json(novels);
});

app.get('/api/proxy/novel/:id', (req, res) => {
    // 代理取得單本小說（含章節連結）
    const novels = getNovels();
    const novel = novels.find(n => n.id == req.params.id);
    if (!novel) {
        return res.status(404).json({ error: 'Novel not found' });
    }
    
    // 取得章節連結
    const chapters = getChapters(req.params.id);
    const chapterLinks = chapters.map(ch => ({
        chapterNumber: ch.chapter_number,
        title: ch.title,
        url: `/chapter/${ch.chapter_number}`
    }));
    
    res.json({
        ...novel,
        chapterLinks
    });
});

app.get('/api/proxy/chapter/:novelId/:chapterId', (req, res) => {
    // 代理取得章節內容
    const chapters = getChapters(req.params.novelId);
    const chapter = chapters.find(ch => ch.chapter_number == req.params.chapterId);
    if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
    }
    res.send(chapter.content);
});

app.put('/api/novels/:id', (req, res) => {
    try {
        const password = req.headers['x-password'] || req.query.password;
        if (password !== '00000') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const listFile = join(NOVELS_DIR, 'novels.json');
        if (fs.existsSync(listFile)) {
            let novels = JSON.parse(fs.readFileSync(listFile, 'utf8'));
            const idx = novels.findIndex(n => n.novelId === req.params.id);
            if (idx >= 0) {
                novels[idx] = { ...novels[idx], ...req.body, updatedAt: new Date().toISOString() };
                fs.writeFileSync(listFile, JSON.stringify(novels, null, 2), 'utf8');
                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'Novel not found' });
            }
        } else {
            res.status(404).json({ error: 'Novel not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scrape/:id/sync', (req, res) => {
    try {
        // 更新狀態為 syncing
        updateNovelStatus(req.params.id, 'syncing');
        res.json({ success: true, message: 'Sync started' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 懶載入章節：下載並返回單一章節內容
app.get('/api/chapter/:novelId/:chapterId', async (req, res) => {
    try {
        const { novelId, chapterId } = req.params;
        const novelDir = join(NOVELS_DIR, String(novelId));
        const chapterFile = join(novelDir, `${chapterId}.json`);
        
        // 如果章節已存在，直接返回
        if (fs.existsSync(chapterFile)) {
            const data = JSON.parse(fs.readFileSync(chapterFile, 'utf8'));
            return res.json(data);
        }
        
        // 章節不存在，觸發 Worker 下載（這裡只是標記狀態）
        // Worker 會處理實際的下載
        res.status(202).json({ 
            status: 'downloading',
            message: 'Chapter is being downloaded',
            novelId,
            chapterId: parseInt(chapterId)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 預載後3個章節
app.post('/api/chapter/:novelId/:chapterId/preload', async (req, res) => {
    try {
        const { novelId, chapterId } = req.params;
        const startChapter = parseInt(chapterId);
        const preloadCount = 3;
        
        // 標記需要預載的章節
        const preloadFile = join(NOVELS_DIR, String(novelId), 'preload_queue.json');
        const queue = [];
        
        for (let i = 0; i < preloadCount; i++) {
            const chNum = startChapter + i;
            const chapterFile = join(NOVELS_DIR, String(novelId), `${chNum}.json`);
            if (!fs.existsSync(chapterFile)) {
                queue.push(chNum);
            }
        }
        
        if (queue.length > 0) {
            fs.writeFileSync(preloadFile, JSON.stringify(queue), 'utf8');
        }
        
        res.json({ 
            success: true, 
            preloadQueue: queue,
            message: `Queued ${queue.length} chapters for preload`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 更新小說狀態
function updateNovelStatus(novelId, status) {
    const listFile = join(NOVELS_DIR, 'novels.json');
    if (fs.existsSync(listFile)) {
        const novels = JSON.parse(fs.readFileSync(listFile, 'utf8'));
        const novel = novels.find(n => n.novelId === novelId);
        if (novel) {
            novel.status = status;
            novel.updatedAt = new Date().toISOString();
            fs.writeFileSync(listFile, JSON.stringify(novels, null, 2), 'utf8');
        }
    }
}

// 恢復靜態檔案服務
app.use(express.static(join(ROOT, 'dist')));

// SPA 路由
app.get('*', (req, res) => {
    // 如果請求的是根路徑或 HTML 檔案，提供新的前端
    const newIndexPath = join(ROOT, 'index-new.html');
    if (fs.existsSync(newIndexPath) && (req.path === '/' || req.path === '/index.html')) {
        return res.sendFile(newIndexPath);
    }
    
    // 否則嘗試靜態檔案
    const indexPath = join(ROOT, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Not found');
    }
});

// 啟動
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Novel Scraper API v4 running on http://0.0.0.0:${PORT}`);
    console.log(`JSON 目錄: ${NOVELS_DIR}`);
});

process.on('SIGINT', () => {
    process.exit(0);
});