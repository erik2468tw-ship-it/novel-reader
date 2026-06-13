<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { api } from './api.js'
import { useTheme } from './composables/useTheme.js'
import { useReadingProgress } from './composables/useReadingProgress.js'

const currentView = ref(localStorage.getItem('novel-reader-view') || 'home')
const currentNovel = ref(null)
const currentChapter = ref(null)
const chapters = ref([])
const loading = ref(false)
const error = ref('')

// 字體大小
const fontSize = ref(16)

// 主題
const { isDark, toggleDarkMode, initTheme } = useTheme()

// 閱讀進度
const { getProgress, saveProgress, getBookmarks, addBookmark, removeBookmark } = useReadingProgress()

// 小說列表
const novels = ref([])
const searchQuery = ref('')
const filter = ref('all')

const filteredNovels = computed(() => {
  let result = novels.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(n => n.title?.toLowerCase().includes(q) || n.author?.toLowerCase().includes(q))
  }
  if (filter.value !== 'all') {
    result = result.filter(n => n.status === filter.value)
  }
  return result
})

async function loadNovels() {
  loading.value = true
  error.value = ''
  try {
    novels.value = await api.getNovels()
  } catch (e) {
    error.value = '載入失敗：' + e.message
  }
  loading.value = false
}

// 新增
const showAddDialog = ref(false)
const newNovelUrl = ref('')
const newNovelTitle = ref('')

async function addNovel() {
  if (!newNovelUrl.value) return
  loading.value = true
  try {
    await api.addNovel(newNovelUrl.value, newNovelTitle.value || newNovelUrl.value)
    showAddDialog.value = false
    newNovelUrl.value = ''
    newNovelTitle.value = ''
    await loadNovels()
  } catch (e) {
    error.value = '新增失敗：' + e.message
  }
  loading.value = false
}

// 刪除
const showDeleteDialog = ref(false)
const deletePassword = ref('')
const novelToDelete = ref(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!deletePassword.value) return
  deleting.value = true
  try {
    await api.deleteNovel(novelToDelete.value.id, deletePassword.value)
    showDeleteDialog.value = false
    deletePassword.value = ''
    novelToDelete.value = null
    deleting.value = false
    await loadNovels()
  } catch (e) {
    error.value = '刪除失敗：' + e.message
    deleting.value = false
  }
}

function openDeleteDialog(novel) {
  novelToDelete.value = novel
  deletePassword.value = ''
  showDeleteDialog.value = true
}

async function viewNovel(novel) {
  currentNovel.value = novel
  loading.value = true
  try {
    chapters.value = await api.getChapters(novel.id)
    currentView.value = 'detail'
  } catch (e) {
    error.value = '載入章節失敗：' + e.message
  }
  loading.value = false
}

async function readChapter(chapter) {
  currentChapter.value = chapter
  loading.value = true
  try {
    const data = await api.getChapter(currentNovel.value.id, chapter.chapter_number)
    if (data.status === 'downloading') {
      await new Promise(r => setTimeout(r, 2000))
      const retryData = await api.getChapter(currentNovel.value.id, chapter.chapter_number)
      currentChapter.value.content = retryData.content || '載入中...'
    } else {
      currentChapter.value.content = data.content || '無內容'
    }
    saveProgress(currentNovel.value.id, chapter.chapter_number, chapter.chapter_number)
    api.preloadChapters(currentNovel.value.id, chapter.chapter_number)
    currentView.value = 'reading'
  } catch (e) {
    error.value = '載入失敗：' + e.message
  }
  loading.value = false
}

function toggleBookmark(chapter) {
  const bookmarks = getBookmarks(currentNovel.value.id)
  const isBookmarked = bookmarks.some(b => b.chapterId === chapter.chapter_number)
  if (isBookmarked) {
    removeBookmark(currentNovel.value.id, chapter.chapter_number)
  } else {
    addBookmark(currentNovel.value.id, chapter.chapter_number, chapter.chapter_number)
  }
}

function prevChapter() {
  const idx = chapters.value.findIndex(c => c.chapter_number === currentChapter.value?.chapter_number)
  if (idx > 0) readChapter(chapters.value[idx - 1])
}

function nextChapter() {
  const idx = chapters.value.findIndex(c => c.chapter_number === currentChapter.value?.chapter_number)
  if (idx < chapters.value.length - 1) readChapter(chapters.value[idx + 1])
}

function goBack() {
  if (currentView.value === 'reading') {
    currentView.value = 'detail'
  } else if (currentView.value === 'detail') {
    currentView.value = 'home'
    currentNovel.value = null
  }
}

function formatStatus(status) {
  const map = { pending: '等待中', scraping: '下載中', completed: '已完成', partial: '部分完成', failed: '失敗', cancelled: '已取消' }
  return map[status] || status
}

function formatDate(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

async function refreshNovel() {
  if (!currentNovel.value) return
  loading.value = true
  error.value = ''
  try {
    await api.refreshNovel(currentNovel.value.id)
    // 等待一下讓Worker開始處理
    await new Promise(r => setTimeout(r, 3000))
    // 重新載入章節列表
    chapters.value = await api.getChapters(currentNovel.value.id)
    // 更新小說資訊
    const novelInfo = await api.getNovelInfo(currentNovel.value.id)
    currentNovel.value.lastSync = novelInfo.lastSync
    currentNovel.value.totalChapters = novelInfo.totalChapters
    currentNovel.value.status = novelInfo.status
  } catch (e) {
    error.value = '重新整理失敗：' + e.message
  }
  loading.value = false
}

function getProgressPercent(novel) {
  if (!novel.totalChapters || novel.totalChapters === 0) return 0
  const dir = novels.value.find(n => n.id === novel.id)
  if (!dir) return 0
  // 簡單估算
  return Math.min(100, Math.round((novel.totalChapters / novel.totalChapters) * 100))
}

onMounted(async () => {
  initTheme()
  await loadNovels()
  // 恢復之前的状态
  const savedView = localStorage.getItem('novel-reader-view')
  const savedNovelId = localStorage.getItem('novel-reader-novel-id')
  if (savedView === 'detail' && savedNovelId) {
    const novel = novels.value.find(n => n.id == savedNovelId)
    if (novel) {
      currentNovel.value = novel
      chapters.value = await api.getChapters(novel.id)
      currentView.value = 'detail'
    }
  } else if (savedView === 'reading' && savedNovelId) {
    const savedChapterId = localStorage.getItem('novel-reader-chapter-id')
    const novel = novels.value.find(n => String(n.id) === String(savedNovelId))
    if (novel && savedChapterId) {
      currentNovel.value = novel
      chapters.value = await api.getChapters(novel.id)
      const chapter = chapters.value.find(c => String(c.chapter_number) === String(savedChapterId))
      if (chapter) {
        currentChapter.value = chapter
        currentView.value = 'reading'
        const data = await api.getChapter(novel.id, chapter.chapter_number)
        if (data && data.content) {
          currentChapter.value.content = data.content
        }
      }
    }
  }
})

// 監聽 view 變化，保存到 localStorage
watch(currentView, (newView) => {
  localStorage.setItem('novel-reader-view', newView)
})

watch(currentNovel, (novel) => {
  if (novel) {
    localStorage.setItem('novel-reader-novel-id', novel.id)
  }
})

watch(currentChapter, (chapter) => {
  if (chapter) {
    localStorage.setItem('novel-reader-chapter-id', chapter.chapter_number)
  }
})
</script>

<template>
  <div class="app" :class="{ dark: isDark }">
    <header class="header">
      <button v-if="currentView !== 'home'" @click="goBack" class="back-btn ripple">← 返回</button>
      <h1>📚 小說閱讀器</h1>
      <div class="header-actions">
        <button v-if="currentView === 'home'" @click="showAddDialog = true" class="add-btn ripple">+ 新增</button>
        <button @click="toggleDarkMode" class="theme-btn ripple">{{ isDark ? '☀️' : '🌙' }}</button>
      </div>
    </header>

    <!-- 搜尋列 -->
    <div v-if="currentView === 'home'" class="search-bar">
      <input v-model="searchQuery" placeholder="搜尋小說..." class="search-input">
      <select v-model="filter" class="filter-select">
        <option value="all">全部</option>
        <option value="pending">等待中</option>
        <option value="scraping">下載中</option>
        <option value="completed">已完成</option>
      </select>
    </div>

    <!-- 錯誤 -->
    <div v-if="error" class="error">
      <span>{{ error }}</span>
      <button @click="error = ''">✕</button>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading && novels.length === 0" class="skeleton-grid">
      <div v-for="i in 4" :key="i" class="skeleton-card">
        <div class="skeleton-cover"></div>
        <div class="skeleton-info">
          <div class="skeleton-title"></div>
          <div class="skeleton-author"></div>
        </div>
      </div>
    </div>

    <!-- 首頁 -->
    <main v-if="currentView === 'home' && !loading" class="home">
      <div v-if="filteredNovels.length === 0" class="empty">
        <div class="empty-icon">📚</div>
        <p>還沒有小說</p>
        <button @click="showAddDialog = true" class="add-btn ripple">新增第一本小說</button>
      </div>
      <div class="novel-grid">
        <div v-for="novel in filteredNovels" :key="novel.id" class="novel-card ripple" @click="viewNovel(novel)">
          <div class="novel-cover">
            <img v-if="novel.coverUrl" :src="novel.coverUrl" alt="cover" loading="lazy">
            <div v-else class="no-cover">📖</div>
            <div v-if="novel.status === 'scraping'" class="scraping-overlay">
              <div class="spinner"></div>
            </div>
          </div>
          <div class="novel-info">
            <h3>{{ novel.title }}</h3>
            <p v-if="novel.author" class="author">{{ novel.author }}</p>
            <div class="novel-meta">
              <span class="status" :class="novel.status">{{ formatStatus(novel.status) }}</span>
              <span v-if="novel.totalChapters" class="chapter-count">{{ novel.totalChapters }}章</span>
            </div>
            <div v-if="novel.status === 'completed'" class="progress-bar">
              <div class="progress-fill"></div>
            </div>
          </div>
          <button class="delete-btn ripple" @click.stop="openDeleteDialog(novel)">🗑️</button>
        </div>
      </div>
    </main>

    <!-- 詳情頁 -->
    <main v-if="currentView === 'detail'" class="detail">
      <div class="novel-header">
        <div class="cover">
          <img v-if="currentNovel.coverUrl" :src="currentNovel.coverUrl" alt="cover">
          <div v-else class="no-cover">📖</div>
        </div>
        <div class="info">
          <h2>{{ currentNovel.title }}</h2>
          <p v-if="currentNovel.author">作者：{{ currentNovel.author }}</p>
          <p v-if="currentNovel.category">分類：{{ currentNovel.category }}</p>
          <p v-if="currentNovel.description" class="description">{{ currentNovel.description }}</p>
          <p class="chapter-count">共 {{ chapters.length }} 章</p>
          <p v-if="currentNovel.lastSync" class="last-sync">最後同步：{{ formatDate(currentNovel.lastSync) }}</p>
        </div>
      </div>
      <div class="detail-actions">
        <button @click="refreshNovel" class="refresh-btn ripple" :disabled="loading">
          🔄 重新整理章節
        </button>
      </div>
      <div class="chapter-list">
        <h3>章節目錄</h3>
        <div v-if="chapters.length === 0" class="empty-chapters">暫無章節</div>
        <div class="chapter-grid">
          <button v-for="(ch, idx) in chapters" :key="ch.id" class="chapter-btn ripple" @click="readChapter(ch)">
            {{ ch.chapter_number }}. {{ ch.title }}
          </button>
        </div>
      </div>
    </main>

    <!-- 閱讀頁 -->
    <main v-if="currentView === 'reading' && currentChapter" class="reading">
      <div class="reading-header">
        <h2>{{ currentChapter.title }}</h2>
        <div class="reading-actions">
          <button class="bookmark-btn ripple" @click="toggleBookmark(currentChapter)">
            {{ getBookmarks(currentNovel?.id)?.some(b => b.chapterId === currentChapter.chapter_number) ? '★' : '☆' }}
          </button>
          <select v-model="fontSize" class="font-size-select">
            <option :value="14">小</option>
            <option :value="16">中</option>
            <option :value="18">大</option>
            <option :value="20">特大</option>
          </select>
        </div>
      </div>
      <div class="chapter-content" :style="{ fontSize: fontSize + 'px', lineHeight: '1.8' }">
        <div v-if="loading" class="loading-text">載入中...</div>
        <p v-else>{{ currentChapter.content }}</p>
      </div>
      <div class="chapter-nav">
        <button class="nav-btn ripple" @click="prevChapter" :disabled="chapters.findIndex(c => c.chapter_number === currentChapter?.chapter_number) <= 0">
          ← 上一章
        </button>
        <span class="chapter-indicator">{{ chapters.findIndex(c => c.chapter_number === currentChapter?.chapter_number) + 1 }} / {{ chapters.length }}</span>
        <button class="nav-btn ripple" @click="nextChapter" :disabled="chapters.findIndex(c => c.chapter_number === currentChapter?.chapter_number) >= chapters.length - 1">
          下一章 →
        </button>
      </div>
    </main>

    <!-- 新增對話框 -->
    <div v-if="showAddDialog" class="dialog-overlay" @click.self="showAddDialog = false">
      <div class="dialog">
        <h3>新增小說</h3>
        <input v-model="newNovelUrl" placeholder="輸入小說網址 https://www.novel543.com/xxx" @keyup.enter="addNovel" class="ripple">
        <input v-model="newNovelTitle" placeholder="標題（可選，會自動抓取）" class="ripple">
        <div class="dialog-buttons">
          <button @click="showAddDialog = false" class="cancel-btn ripple">取消</button>
          <button @click="addNovel" :disabled="!newNovelUrl" class="confirm-btn ripple">新增</button>
        </div>
      </div>
    </div>

    <!-- 刪除對話框 -->
    <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
      <div class="dialog delete-dialog">
        <div class="delete-icon">⚠️</div>
        <h3>刪除小說</h3>
        <p>確定要刪除「{{ novelToDelete?.title }}」嗎？</p>
        <p class="delete-warning">此操作無法撤銷</p>
        <input type="password" v-model="deletePassword" placeholder="輸入密碼" @keyup.enter="confirmDelete" class="ripple">
        <div class="dialog-buttons">
          <button @click="showDeleteDialog = false" class="cancel-btn ripple">取消</button>
          <button @click="confirmDelete" :disabled="!deletePassword || deleting" class="delete-confirm-btn ripple">
            {{ deleting ? '刪除中...' : '確認刪除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* CSS Variables */
:root {
  --primary: #4CAF50;
  --danger: #e53935;
  --bg: #ffffff;
  --surface: #ffffff;
  --text: #1a1a1a;
  --text-secondary: #666666;
  --border: #e0e0e0;
  --shadow: rgba(0,0,0,0.1);
  --shadow-hover: rgba(0,0,0,0.15);
  --radius: 12px;
  --radius-sm: 8px;
}

.dark {
  --bg: #121212;
  --surface: #1e1e1e;
  --text: #ffffff;
  --text-secondary: #aaaaaa;
  --border: #333333;
  --shadow: rgba(0,0,0,0.3);
  --shadow-hover: rgba(0,0,0,0.5);
}

/* Base */
* { box-sizing: border-box; }

.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  transition: background 0.3s, color 0.3s;
}

/* Ripple Effect */
.ripple {
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}
.ripple:active {
  transform: scale(0.98);
}
.ripple::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  pointer-events: none;
  background: radial-gradient(circle, rgba(255,255,255,0.3) 10%, transparent 10%);
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0;
  transition: opacity 0.3s;
}
.ripple:active::after {
  opacity: 1;
}

.dark .ripple::after {
  background: radial-gradient(circle, rgba(255,255,255,0.1) 10%, transparent 10%);
}

/* Header */
.header {
  display: flex;
  align-items: center;
  padding: 15px 0;
  border-bottom: 2px solid var(--border);
  margin-bottom: 25px;
  gap: 15px;
}
.header h1 {
  flex: 1;
  font-size: 1.5rem;
  margin: 0;
  color: var(--text);
}
.header-actions {
  display: flex;
  gap: 10px;
}

/* Buttons */
.theme-btn, .back-btn {
  padding: 10px 16px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 1rem;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 2px 8px var(--shadow);
}
.theme-btn { font-size: 1.2rem; }
.add-btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  background: var(--primary);
  color: white;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

/* Search */
.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 25px;
}
.search-input, .filter-select {
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
  transition: border-color 0.2s;
}
.search-input { flex: 1; }
.search-input:focus, .filter-select:focus {
  outline: none;
  border-color: var(--primary);
}

/* Error */
.error {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ffebee;
  color: var(--danger);
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  margin-bottom: 20px;
}
.dark .error { background: #4a2020; }
.error button {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1.2rem;
}

/* Skeleton */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}
.skeleton-card {
  background: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
  animation: pulse 1.5s infinite;
}
.skeleton-cover {
  height: 200px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
}
.skeleton-info { padding: 15px; }
.skeleton-title {
  height: 20px;
  background: #f0f0f0;
  border-radius: 4px;
  margin-bottom: 10px;
}
.skeleton-author {
  height: 14px;
  background: #f0f0f0;
  border-radius: 4px;
  width: 60%;
}
@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}

/* Empty */
.empty {
  text-align: center;
  padding: 80px 20px;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: 0 4px 20px var(--shadow);
}
.empty-icon { font-size: 4rem; margin-bottom: 20px; }
.empty p {
  color: var(--text-secondary);
  font-size: 1.1rem;
  margin-bottom: 25px;
}

/* Novel Grid */
.novel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 25px;
}
.novel-card {
  background: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 4px 15px var(--shadow);
  cursor: pointer;
  position: relative;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s;
}
.novel-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 30px var(--shadow-hover);
}
.novel-cover {
  height: 220px;
  background: #f5f5f5;
  position: relative;
  overflow: hidden;
}
.novel-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}
.novel-card:hover .novel-cover img {
  transform: scale(1.05);
}
.no-cover {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 4rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}
.scraping-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.novel-info { padding: 18px; }
.novel-info h3 {
  margin: 0 0 10px;
  font-size: 1.05rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.author {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin: 0 0 10px;
}
.novel-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.status {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  background: #e0e0e0;
  color: #333;
}
.status.completed { background: #e8f5e9; color: #2e7d32; }
.status.scraping { background: #fff3e0; color: #e65100; }
.status.failed { background: #ffebee; color: #c62828; }
.dark .status { color: #fff; }
.chapter-count {
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.progress-bar {
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), #81c784);
  border-radius: 2px;
  width: 100%;
  animation: progress-pulse 2s infinite;
}
@keyframes progress-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.delete-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  cursor: pointer;
  font-size: 1rem;
  opacity: 0;
  transition: opacity 0.2s;
}
.novel-card:hover .delete-btn { opacity: 1; }

/* Detail */
.detail { padding: 20px; }
.detail-actions { margin-bottom: 20px; }
.refresh-btn {
  padding: 12px 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: white;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}
.refresh-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
}
.refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.last-sync { font-size: 0.85rem; color: var(--text-secondary); margin-top: 5px; }
.novel-header {
  display: flex;
  gap: 25px;
  margin-bottom: 30px;
  padding: 20px;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: 0 4px 15px var(--shadow);
}
.cover { width: 160px; flex-shrink: 0; }
.cover img {
  width: 100%;
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 15px var(--shadow);
}
.info { flex: 1; }
.info h2 { margin: 0 0 15px; color: var(--text); }
.info p { margin: 8px 0; color: var(--text-secondary); }
.description {
  margin-top: 15px !important;
  font-size: 0.95rem;
  line-height: 1.6;
}
.chapter-list h3 { margin-bottom: 15px; color: var(--text); }
.empty-chapters {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}
.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}
.chapter-btn {
  padding: 14px 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  text-align: left;
  font-size: 0.95rem;
  box-shadow: 0 2px 8px var(--shadow);
  transition: transform 0.2s, box-shadow 0.2s;
}
.chapter-btn:hover {
  transform: translateX(5px);
  box-shadow: 0 4px 12px var(--shadow-hover);
}

/* Reading */
.reading {
  padding: 25px;
  background: var(--surface);
  border-radius: var(--radius);
  min-height: 80vh;
  box-shadow: 0 4px 20px var(--shadow);
}
.reading-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 2px solid var(--border);
}
.reading-header h2 { margin: 0; color: var(--text); }
.reading-actions { display: flex; gap: 12px; align-items: center; }
.bookmark-btn {
  background: none;
  border: none;
  font-size: 1.8rem;
  cursor: pointer;
  color: #ffc107;
  transition: transform 0.2s;
}
.bookmark-btn:hover { transform: scale(1.2); }
.font-size-select {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.chapter-content {
  color: var(--text);
  line-height: 1.8;
  margin-bottom: 30px;
  min-height: 50vh;
}
.loading-text {
  text-align: center;
  color: var(--text-secondary);
  padding: 60px;
}
.chapter-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  padding-top: 20px;
  border-top: 2px solid var(--border);
}
.nav-btn {
  padding: 14px 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: white;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}
.nav-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
}
.nav-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
  box-shadow: none;
}
.chapter-indicator {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s;
}
@keyframes fadeIn { from { opacity: 0; } }
.dialog {
  background: var(--surface);
  padding: 30px;
  border-radius: var(--radius);
  width: 90%;
  max-width: 420px;
  animation: slideUp 0.3s;
}
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } }
.dialog h3 { margin: 0 0 20px; color: var(--text); }
.dialog input {
  width: 100%;
  padding: 14px;
  margin-bottom: 15px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
}
.dialog input:focus { outline: none; border-color: var(--primary); }
.dialog-buttons {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}
.cancel-btn, .confirm-btn {
  padding: 12px 24px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.2s;
}
.cancel-btn {
  background: #e0e0e0;
  color: #333;
}
.confirm-btn { background: var(--primary); color: white; }
.confirm-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Delete Dialog */
.delete-dialog { text-align: center; }
.delete-icon { font-size: 3rem; margin-bottom: 15px; }
.delete-warning { color: var(--danger); font-size: 0.9rem; margin-bottom: 20px; }
.delete-confirm-btn { background: var(--danger); color: white; }

/* Responsive */
@media (max-width: 600px) {
  .novel-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; }
  .novel-cover { height: 180px; }
  .novel-header { flex-direction: column; }
  .cover { width: 120px; margin: 0 auto; }
  .chapter-grid { grid-template-columns: 1fr; }
  .header h1 { font-size: 1.2rem; }
  .chapter-nav { flex-direction: column; }
  .nav-btn { width: 100%; text-align: center; }
}
</style>