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
const fontSize = ref(18)

// 主題
const { isDark, toggleDarkMode, initTheme } = useTheme()

// 閱讀進度
const { getProgress, saveProgress, getBookmarks, addBookmark, removeBookmark } = useReadingProgress()

// 小說列表
const novels = ref([])
const searchQuery = ref('')
const selectedTag = ref('')
const sortOrder = ref('asc') // 章節排序：asc 正序, desc 倒序

// 取得所有分類標籤
const allTags = computed(() => {
  const tags = new Set()
  novels.value.forEach(n => {
    if (n.category) {
      n.category.split(/[,，]/).forEach(t => tags.add(t.trim()))
    }
  })
  return [...tags].sort()
})

// 排序後的章節列表
const sortedChapters = computed(() => {
  const sorted = [...chapters.value]
  if (sortOrder.value === 'desc') {
    sorted.sort((a, b) => b.chapter_number - a.chapter_number)
  } else {
    sorted.sort((a, b) => a.chapter_number - b.chapter_number)
  }
  return sorted
})

// 最新章節（取前10個）
const latestChapters = computed(() => {
  return sortedChapters.value.slice(0, 10)
})

// 過濾後的小說列表
const filteredNovels = computed(() => {
  let result = novels.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(n => n.title?.toLowerCase().includes(q) || n.author?.toLowerCase().includes(q))
  }
  if (selectedTag.value) {
    result = result.filter(n => n.category?.includes(selectedTag.value))
  }
  return result
})

// 最近更新列表（按 lastSync 排序）
const recentUpdates = computed(() => {
  return [...novels.value]
    .filter(n => n.lastSync)
    .sort((a, b) => new Date(b.lastSync) - new Date(a.lastSync))
    .slice(0, 10)
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

// Worker 控制
const workerEnabled = ref(true)
const tasks = ref([])
const showTasksDialog = ref(false)
const taskPassword = ref('')
const taskToDelete = ref(null)

async function loadWorkerStatus() {
  try {
    const status = await api.getWorkerStatus()
    workerEnabled.value = status.enabled
  } catch (e) {
    console.error('取得 Worker 狀態失敗:', e)
  }
}

async function toggleWorker() {
  try {
    if (workerEnabled.value) {
      await api.stopWorker()
      workerEnabled.value = false
    } else {
      await api.startWorker()
      workerEnabled.value = true
    }
  } catch (e) {
    console.error('切換 Worker 狀態失敗:', e)
  }
}

async function loadTasks() {
  try {
    const data = await api.getTasks()
    tasks.value = data.tasks || []
    workerEnabled.value = data.workerEnabled
  } catch (e) {
    console.error('取得任務失敗:', e)
  }
}

async function confirmDeleteTask() {
  if (!taskPassword.value || !taskToDelete.value) return
  deleting.value = true
  try {
    await api.deleteTask(taskToDelete.value.id, taskPassword.value)
    showTasksDialog.value = false
    taskPassword.value = ''
    taskToDelete.value = null
    await loadTasks()
    await loadNovels()
  } catch (e) {
    error.value = '刪除失敗：' + e.message
  }
  deleting.value = false
}

function openTaskDeleteDialog(task) {
  taskToDelete.value = task
  taskPassword.value = ''
}

// 全部重新整理
const refreshingAll = ref(false)

async function refreshAllNovels() {
  refreshingAll.value = true
  loading.value = true
  error.value = ''
  try {
    await api.refreshAllNovels()
    await new Promise(r => setTimeout(r, 3000))
    await loadNovels()
  } catch (e) {
    error.value = '全部重新整理失敗：' + e.message
  }
  loading.value = false
  refreshingAll.value = false
}

// 初始載入 Worker 狀態
loadWorkerStatus()

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
    // 優先使用靜態 HTML（效能優化）
    const staticHTML = await api.getChapterHTML(currentNovel.value.id, chapter.chapter_number)
    if (staticHTML) {
      // 直接使用靜態 HTML 內容
      currentChapter.value.content = staticHTML
      currentChapter.value.isStaticHTML = true
    } else {
      // 回退到 JSON API
      const data = await api.getChapter(currentNovel.value.id, chapter.chapter_number)
      if (data.status === 'downloading') {
        await new Promise(r => setTimeout(r, 2000))
        const retryData = await api.getChapter(currentNovel.value.id, chapter.chapter_number)
        currentChapter.value.content = retryData.content || '載入中...'
      } else {
        currentChapter.value.content = data.content || '無內容'
      }
      currentChapter.value.isStaticHTML = false
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
        // 優先使用靜態 HTML
        const staticHTML = await api.getChapterHTML(novel.id, chapter.chapter_number)
        if (staticHTML) {
          currentChapter.value.content = staticHTML
          currentChapter.value.isStaticHTML = true
        } else {
          const data = await api.getChapter(novel.id, chapter.chapter_number)
          if (data && data.content) {
            currentChapter.value.content = data.content
          }
          currentChapter.value.isStaticHTML = false
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
    <!-- Header -->
    <header class="header">
      <button v-if="currentView !== 'home'" @click="goBack" class="back-btn ripple">← 返回</button>
      <h1 v-if="currentView === 'home'">📚 小說閱讀器</h1>
      <h1 v-else-if="currentView === 'detail'">{{ currentNovel?.title }}</h1>
      <h1 v-else>第{{ currentChapter?.chapter_number }}章</h1>
      <div class="header-actions">
        <button v-if="currentView === 'home'" @click="showTasksDialog = true; loadTasks()" class="tasks-btn ripple" title="任務管理">📋</button>
        <button v-if="currentView === 'home'" @click="refreshAllNovels" class="refresh-all-btn ripple" :disabled="refreshingAll" :title="refreshingAll ? '重新整理中...' : '全部重新整理'">
          {{ refreshingAll ? '🔄 重新整理中...' : '🔄 全部重新整理' }}
        </button>
        <button v-if="currentView === 'home'" @click="showAddDialog = true" class="add-btn ripple">+ 新增</button>
        <button @click="toggleWorker" class="worker-btn ripple" :class="{ active: workerEnabled }" :title="workerEnabled ? '爬蟲運行中' : '爬蟲已停止'">
          {{ workerEnabled ? '🟢' : '🔴' }}
        </button>
        <button @click="toggleDarkMode" class="theme-btn ripple">{{ isDark ? '☀️' : '🌙' }}</button>
      </div>
    </header>

    <!-- 搜尋列（首頁） -->
    <div v-if="currentView === 'home'" class="search-section">
      <div class="search-bar">
        <input v-model="searchQuery" placeholder="🔍 搜尋書名或作者..." class="search-input">
        <select v-model="selectedTag" class="filter-select">
          <option value="">全部分類</option>
          <option v-for="tag in allTags" :key="tag" :value="tag">{{ tag }}</option>
        </select>
      </div>
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
    <Transition name="fade" mode="out-in">
    <main v-if="currentView === 'home' && !loading" class="home">
      <div class="main-layout">
        <div class="main-content">
          <!-- 精品推薦 -->
          <section v-if="filteredNovels.length > 0" class="featured-section">
            <h2 class="section-title">📚 精品推薦</h2>
            <div class="featured-grid">
              <div 
                v-for="novel in filteredNovels.slice(0, 8)" 
                :key="novel.id" 
                class="featured-card ripple"
                @click="viewNovel(novel)"
              >
                <div class="featured-cover">
                  <img v-if="novel.coverUrl" :src="novel.coverUrl" alt="cover" loading="lazy">
                  <div v-else class="no-cover">📖</div>
                </div>
                <div class="featured-info">
                  <h4>{{ novel.title }}</h4>
                  <p>{{ novel.author || '未知作者' }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- 熱門標籤 -->
          <section v-if="allTags.length > 0" class="tags-section">
            <h2 class="section-title">🏷️ 熱門標籤</h2>
            <div class="tags-cloud">
              <button 
                v-for="tag in allTags" 
                :key="tag" 
                class="tag-item ripple"
                :class="{ active: selectedTag === tag }"
                @click="selectedTag = selectedTag === tag ? '' : tag"
              >
                {{ tag }}
              </button>
            </div>
          </section>

          <!-- 本週強推 -->
          <section v-if="recentUpdates.length > 0" class="weekly-section">
            <h2 class="section-title">🔥 本週強推</h2>
            <div class="weekly-grid">
              <div 
                v-for="novel in recentUpdates.slice(0, 4)" 
                :key="novel.id" 
                class="weekly-card ripple"
                @click="viewNovel(novel)"
              >
                <div class="weekly-cover">
                  <img v-if="novel.coverUrl" :src="novel.coverUrl" alt="cover" loading="lazy">
                  <div v-else class="no-cover">📖</div>
                </div>
                <div class="weekly-content">
                  <h4>{{ novel.title }}</h4>
                  <p class="weekly-desc">{{ novel.description?.substring(0, 60) }}...</p>
                  <p class="weekly-author">📝 {{ novel.author || '未知作者' }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- 最近更新 -->
          <section v-if="recentUpdates.length > 0" class="updates-section">
            <h2 class="section-title">🕐 最近更新</h2>
            <div class="update-list">
              <div 
                v-for="novel in recentUpdates.slice(0, 12)" 
                :key="novel.id" 
                class="update-item ripple"
                @click="viewNovel(novel)"
              >
                <span class="update-cat">{{ novel.category?.split(',')[0] || '其他' }}</span>
                <span class="update-title">{{ novel.title }}</span>
                <span class="update-author">{{ novel.author }}</span>
                <span class="update-time">{{ formatDate(novel.lastSync) }}</span>
              </div>
            </div>
          </section>
        </div>

        <!-- 側邊欄 -->
        <aside class="sidebar">
          <h3 class="sidebar-title">📊 網友都在看</h3>
          <div class="sidebar-list">
            <div 
              v-for="(novel, idx) in recentUpdates.slice(0, 10)" 
              :key="novel.id" 
              class="sidebar-item ripple"
              @click="viewNovel(novel)"
            >
              <span class="sidebar-rank">{{ idx + 1 }}</span>
              <div class="sidebar-info">
                <span class="sidebar-book-title">{{ novel.title }}</span>
                <span class="sidebar-author">{{ novel.author }}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <!-- 無小說時顯示 -->
      <div v-if="filteredNovels.length === 0" class="empty">
        <div class="empty-icon">📚</div>
        <p>書架是空的，趕快加入心儀的書籍吧！</p>
        <button @click="showAddDialog = true" class="add-btn ripple">新增一本小說</button>
      </div>
    </main>
    </Transition>

    <!-- 詳情頁 -->
    <Transition name="fade" mode="out-in">
    <main v-if="currentView === 'detail'" class="detail">
      <!-- 麵包屑 -->
      <nav class="breadcrumb">
        <span @click="currentView = 'home'" class="breadcrumb-link">首頁</span>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">{{ currentNovel?.title }}</span>
      </nav>

      <!-- 小說資訊 -->
      <div class="novel-header">
        <div class="cover">
          <img v-if="currentNovel.coverUrl" :src="currentNovel.coverUrl" alt="cover">
          <div v-else class="no-cover">📖</div>
        </div>
        <div class="info">
          <h1 class="novel-title">{{ currentNovel.title }}</h1>
          <p v-if="currentNovel.author" class="novel-author">作者：{{ currentNovel.author }}</p>
          <p v-if="currentNovel.category" class="novel-category">
            <span class="category-tag">{{ currentNovel.category.split(',')[0] }}</span>
          </p>
          <p v-if="currentNovel.description" class="description">{{ currentNovel.description }}</p>
          <div class="novel-stats">
            <span>章節：{{ chapters.length }}</span>
            <span v-if="currentNovel.lastSync">更新：{{ formatDate(currentNovel.lastSync) }}</span>
          </div>
        </div>
      </div>

      <div class="detail-actions">
        <button @click="refreshNovel" class="refresh-btn ripple" :disabled="loading">
          🔄 重新整理章節
        </button>
        <button @click="openDeleteDialog(currentNovel)" class="delete-btn ripple">
          🗑️ 刪除小說
        </button>
      </div>

      <!-- 全部章節 -->
      <div class="chapter-section">
        <div class="section-header">
          <h3 class="section-title">全部章節</h3>
          <button class="sort-btn ripple" @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'">
            {{ sortOrder === 'desc' ? '倒序 ↓' : '正序 ↑' }}
          </button>
        </div>
        <div class="chapter-grid">
          <button 
            v-for="ch in sortedChapters" 
            :key="ch.chapter_number" 
            class="chapter-btn ripple"
            @click="readChapter(ch)"
          >
            <span class="chapter-num">第{{ ch.chapter_number }}章</span>
            <span class="chapter-title">{{ ch.title }}</span>
          </button>
        </div>
      </div>
    </main>
    </Transition>

    <!-- 閱讀頁 -->
    <Transition name="fade" mode="out-in">
    <main v-if="currentView === 'reading' && currentChapter" class="reading" :key="currentChapter.chapter_number">
      <!-- 麵包屑導航 -->
      <nav class="breadcrumb">
        <span @click="currentView = 'home'" class="breadcrumb-link">首頁</span>
        <span class="breadcrumb-sep">›</span>
        <span @click="currentView = 'detail'" class="breadcrumb-link">{{ currentNovel?.title }}</span>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">第{{ currentChapter.chapter_number }}章</span>
      </nav>

      <!-- 章節標題 -->
      <h1 class="chapter-title">
        {{ currentChapter.title }}
        <span v-if="currentChapter.isStaticHTML" class="static-badge">⚡ 極速</span>
      </h1>

      <!-- 內容 -->
      <div class="chapter-content" :style="{ fontSize: fontSize + 'px', lineHeight: '2' }">
        <div v-if="loading" class="loading-text">載入中...</div>
        <div v-else-if="currentChapter.isStaticHTML" class="content-text static-html" v-html="currentChapter.content"></div>
        <div v-else class="content-text">{{ currentChapter.content }}</div>
      </div>

      <!-- 字體大小 -->
      <div class="reading-toolbar">
        <select v-model="fontSize" class="font-size-select">
          <option :value="14">小</option>
          <option :value="16">中</option>
          <option :value="18">大</option>
          <option :value="20">特大</option>
          <option :value="24">超大</option>
        </select>
        <button class="bookmark-btn ripple" @click="toggleBookmark(currentChapter)">
          {{ getBookmarks(currentNovel?.id)?.some(b => b.chapterId === currentChapter.chapter_number) ? '★ 已收藏' : '☆ 收藏' }}
        </button>
      </div>

      <!-- 底部導航 -->
      <div class="chapter-nav">
        <button class="nav-btn ripple" @click="prevChapter" :disabled="chapters.findIndex(c => c.chapter_number === currentChapter?.chapter_number) <= 0">
          ← 上一章
        </button>
        <button class="nav-btn nav-btn-secondary ripple" @click="currentView = 'detail'">
          目錄
        </button>
        <button class="nav-btn ripple" @click="nextChapter" :disabled="chapters.findIndex(c => c.chapter_number === currentChapter?.chapter_number) >= chapters.length - 1">
          下一章 →
        </button>
      </div>
    </main>
    </Transition>

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

    <!-- 任務管理對話框 -->
    <div v-if="showTasksDialog" class="dialog-overlay" @click.self="showTasksDialog = false">
      <div class="dialog tasks-dialog">
        <div class="tasks-header">
          <h3>📋 任務管理</h3>
          <div class="worker-status">
            <span>爬蟲：</span>
            <button @click="toggleWorker" class="worker-toggle-btn" :class="{ active: workerEnabled }">
              {{ workerEnabled ? '🟢 運行中' : '🔴 已停止' }}
            </button>
          </div>
        </div>
        <div class="tasks-list">
          <div v-for="task in tasks" :key="task.id" class="task-item">
            <div class="task-info">
              <div class="task-title">{{ task.title }}</div>
              <div class="task-meta">
                <span :class="'status-' + task.status">{{ task.status }}</span>
                <span>{{ task.downloadedChapters }}/{{ task.totalChapters }} 章</span>
              </div>
            </div>
            <button @click="openTaskDeleteDialog(task)" class="task-delete-btn ripple">🗑️</button>
          </div>
          <div v-if="tasks.length === 0" class="tasks-empty">目前沒有任務</div>
        </div>
        <div class="dialog-buttons">
          <button @click="loadTasks" class="refresh-btn ripple">🔄 重新整理</button>
          <button @click="showTasksDialog = false" class="cancel-btn ripple">關閉</button>
        </div>
      </div>
    </div>

    <!-- 任務刪除確認 -->
    <div v-if="taskToDelete" class="dialog-overlay" @click.self="taskToDelete = null">
      <div class="dialog delete-dialog">
        <div class="delete-icon">⚠️</div>
        <h3>刪除任務</h3>
        <p>確定要刪除「{{ taskToDelete?.title }}」？</p>
        <p class="delete-warning">此操作無法撤銷（會刪除所有已下載的章節）</p>
        <input type="password" v-model="taskPassword" placeholder="輸入密碼" @keyup.enter="confirmDeleteTask" class="ripple">
        <div class="dialog-buttons">
          <button @click="taskToDelete = null" class="cancel-btn ripple">取消</button>
          <button @click="confirmDeleteTask" :disabled="!taskPassword || deleting" class="delete-confirm-btn ripple">
            {{ deleting ? '刪除中...' : '確認刪除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Vue View Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* CSS Variables */
:root {
  --primary: #4ecdc4;
  --primary-dark: #3dbdb5;
  --danger: #e53935;
  --bg: #f5f5f5;
  --surface: #ffffff;
  --text: #1a1a1a;
  --text-secondary: #666666;
  --border: #e0e0e0;
  --shadow: rgba(0,0,0,0.08);
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

body {
  margin: 0;
  font-family: 'Microsoft JhengHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
}

.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0;
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
  cursor: pointer;
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

/* Header - 漸變背景 */
.header {
  display: flex;
  align-items: center;
  padding: 15px 25px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: white;
  gap: 15px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
}
.header h1 {
  flex: 1;
  font-size: 1.3rem;
  margin: 0;
  color: #4ecdc4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.header-actions {
  display: flex;
  gap: 10px;
}

/* Buttons */
.theme-btn, .back-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 1rem;
  background: rgba(255,255,255,0.15);
  color: white;
  transition: background 0.2s;
}
.theme-btn:hover, .back-btn:hover {
  background: rgba(255,255,255,0.25);
}
.theme-btn { font-size: 1.2rem; }
.add-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  background: var(--primary);
  color: white;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);
}
.tasks-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  background: rgba(255,255,255,0.15);
  color: white;
  font-size: 1rem;
  transition: background 0.2s;
}
.tasks-btn:hover { background: rgba(255,255,255,0.25); }
.worker-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
  opacity: 0.7;
}
.worker-btn.active { opacity: 1; background: rgba(76, 175, 80, 0.3); }
.worker-btn:hover { opacity: 1; }
.add-btn:hover {
  background: var(--primary-dark);
}

/* Search Section */
.search-section {
  padding: 20px 25px 0;
}
.search-bar {
  display: flex;
  gap: 12px;
}
.search-input {
  flex: 1;
  padding: 12px 18px;
  border: 2px solid var(--border);
  border-radius: 25px;
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.search-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.2);
}
.filter-select {
  padding: 12px 18px;
  border: 2px solid var(--border);
  border-radius: 25px;
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
  cursor: pointer;
  min-width: 120px;
}
.filter-select:focus {
  outline: none;
  border-color: var(--primary);
}

/* Home Page Layout */
.home {
  padding: 0 0 40px;
}

.main-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 25px;
}

.main-content {
  min-width: 0;
}

/* Section Title */
.section-title {
  display: block;
  font-size: 1.1rem;
  font-weight: bold;
  color: var(--text);
  margin: 25px 0 15px;
  padding-left: 10px;
  border-left: 4px solid var(--primary);
}

/* Featured Section */
.featured-section {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: 0 2px 10px var(--shadow);
}
.featured-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 15px;
}
.featured-card {
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s;
}
.featured-card:hover {
  transform: translateY(-3px);
}
.featured-cover {
  height: 180px;
  background: #f0f0f0;
  overflow: hidden;
}
.featured-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.featured-info {
  padding: 10px;
  background: var(--surface);
}
.featured-info h4 {
  margin: 0 0 5px;
  font-size: 0.9rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.featured-info p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

/* Tags Section */
.tags-section {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: 0 2px 10px var(--shadow);
}
.tags-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.tag-item {
  background: #f0f0f0;
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: 20px;
  border: none;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}
.tag-item:hover {
  background: var(--primary);
  color: white;
}
.tag-item.active {
  background: var(--primary);
  color: white;
}
.dark .tag-item {
  background: #333;
  color: #aaa;
}
.dark .tag-item:hover, .dark .tag-item.active {
  background: var(--primary);
  color: #1a1a2e;
}

/* Weekly Section */
.weekly-section {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: 0 2px 10px var(--shadow);
}
.weekly-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}
.weekly-card {
  display: flex;
  gap: 15px;
  padding: 15px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}
.weekly-card:hover {
  background: rgba(78, 205, 196, 0.1);
}
.weekly-cover {
  width: 80px;
  height: 100px;
  flex-shrink: 0;
  background: #f0f0f0;
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.weekly-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.weekly-content {
  flex: 1;
  min-width: 0;
}
.weekly-content h4 {
  margin: 0 0 8px;
  font-size: 0.95rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.weekly-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin: 0 0 8px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.weekly-author {
  font-size: 0.8rem;
  color: var(--primary);
  margin: 0;
}

/* Updates Section */
.updates-section {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: 0 2px 10px var(--shadow);
}
.update-list {
  display: flex;
  flex-direction: column;
}
.update-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.2s;
}
.update-item:last-child {
  border-bottom: none;
}
.update-item:hover {
  background: rgba(78, 205, 196, 0.1);
  margin: 0 -10px;
  padding: 12px 10px;
  border-radius: var(--radius-sm);
}
.update-cat {
  background: var(--primary);
  color: white;
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 0.7rem;
  flex-shrink: 0;
}
.update-title {
  flex: 1;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.update-author {
  color: var(--text-secondary);
  font-size: 0.8rem;
  flex-shrink: 0;
}
.update-time {
  color: var(--text-secondary);
  font-size: 0.75rem;
  flex-shrink: 0;
}

/* Sidebar */
.sidebar {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: 0 2px 10px var(--shadow);
  height: fit-content;
  position: sticky;
  top: 80px;
}
.sidebar-title {
  font-size: 1rem;
  font-weight: bold;
  color: var(--text);
  margin: 0 0 15px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--primary);
}
.sidebar-list {
  display: flex;
  flex-direction: column;
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
}
.sidebar-item:last-child {
  border-bottom: none;
}
.sidebar-item:hover .sidebar-book-title {
  color: var(--primary);
}
.sidebar-rank {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--primary);
  width: 25px;
  text-align: center;
}
.sidebar-info {
  flex: 1;
  min-width: 0;
}
.sidebar-book-title {
  display: block;
  font-size: 0.85rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.2s;
}
.sidebar-author {
  font-size: 0.75rem;
  color: var(--text-secondary);
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

/* Responsive */
@media (max-width: 900px) {
  .main-layout {
    grid-template-columns: 1fr;
  }
  .sidebar {
    position: static;
  }
}

/* Detail Page */
.detail {
  padding: 0 0 40px;
}

/* Detail Breadcrumb */
.detail .breadcrumb {
  padding: 15px 0;
  margin-bottom: 10px;
}

/* Novel Header */
.novel-header {
  display: flex;
  gap: 25px;
  margin-bottom: 25px;
  padding: 20px;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: 0 4px 15px var(--shadow);
}
.cover { width: 150px; flex-shrink: 0; }
.cover img {
  width: 100%;
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 15px var(--shadow);
}
.novel-title {
  margin: 0 0 10px;
  font-size: 1.4rem;
  color: var(--text);
}
.novel-author {
  color: var(--text-secondary);
  margin: 0 0 8px;
}
.novel-category {
  margin: 0 0 15px;
}
.category-tag {
  background: var(--primary);
  color: white;
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 0.85rem;
}
.description {
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0 0 15px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.novel-stats {
  display: flex;
  gap: 20px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

/* Detail Actions */
.detail-actions {
  margin-bottom: 25px;
}
.refresh-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 25px;
  background: var(--primary);
  color: white;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);
}
.refresh-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(78, 205, 196, 0.4);
}
.refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.refresh-all-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  background: #ff9800;
  color: white;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
  transition: all 0.2s;
}
.refresh-all-btn:hover:not(:disabled) {
  background: #f57c00;
  transform: translateY(-2px);
}
.refresh-all-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.delete-btn {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(238, 90, 90, 0.3);
}
.delete-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(238, 90, 90, 0.4);
}

/* Chapter Section */
.chapter-section {
  margin-bottom: 30px;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}
.sort-btn {
  padding: 8px 16px;
  border: 2px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}
.sort-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* Chapter List (for latest) */
.chapter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 15px;
  box-shadow: 0 2px 10px var(--shadow);
}
.chapter-list .chapter-btn {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px 15px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--bg);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}
.chapter-list .chapter-btn:hover {
  background: rgba(78, 205, 196, 0.15);
  transform: translateX(5px);
}

/* Chapter Grid (for all) */
.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.chapter-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 15px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  font-size: 0.95rem;
  box-shadow: 0 2px 8px var(--shadow);
  transition: all 0.2s;
}
.chapter-btn:hover {
  transform: translateX(5px);
  box-shadow: 0 4px 12px var(--shadow-hover);
}
.chapter-num {
  color: var(--primary);
  font-weight: 600;
  flex-shrink: 0;
}
.chapter-title {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Reading */
.reading {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px;
  background: var(--surface);
  border-radius: var(--radius);
  min-height: 80vh;
  box-shadow: 0 4px 20px var(--shadow);
}

/* Breadcrumb */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 0.9rem;
  color: var(--text-secondary);
}
.breadcrumb-link {
  color: var(--primary);
  cursor: pointer;
  transition: color 0.2s;
}
.breadcrumb-link:hover {
  color: var(--primary-dark);
  text-decoration: underline;
}
.breadcrumb-sep {
  color: var(--text-secondary);
}
.breadcrumb-current {
  color: var(--text);
}

/* Chapter Title */
.chapter-title {
  text-align: center;
  font-size: 1.5rem;
  color: var(--text);
  margin: 0 0 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border);
}

/* Chapter Content */
.chapter-content {
  color: var(--text);
  line-height: 2;
  margin-bottom: 30px;
  min-height: 50vh;
  text-align: justify;
  white-space: pre-wrap;
  word-break: break-word;
}
.content-text {
  white-space: pre-wrap;
  word-break: break-word;
}
/* 靜態 HTML 內容樣式 */
.content-text.static-html {
  white-space: normal;
}
.content-text.static-html p {
  margin-bottom: 1em;
  text-indent: 2em;
}
/* 靜態 HTML 標記 */
.static-badge {
  font-size: 0.5em;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  vertical-align: middle;
  margin-left: 8px;
}
.loading-text {
  text-align: center;
  color: var(--text-secondary);
  padding: 60px;
}

/* Reading Toolbar */
.reading-toolbar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
  margin-bottom: 25px;
  padding: 15px;
  background: var(--bg);
  border-radius: var(--radius-sm);
}
.font-size-select {
  padding: 8px 14px;
  border: 2px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font-size: 0.9rem;
}
.bookmark-btn {
  background: none;
  border: 2px solid var(--border);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--text);
  transition: all 0.2s;
}
.bookmark-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* Chapter Nav */
.chapter-nav {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
  padding-top: 20px;
  border-top: 2px solid var(--border);
}
.nav-btn {
  padding: 12px 25px;
  border: none;
  border-radius: 25px;
  background: var(--primary);
  color: white;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);
}
.nav-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(78, 205, 196, 0.4);
}
.nav-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
  box-shadow: none;
}
.nav-btn-secondary {
  background: var(--surface);
  color: var(--text);
  border: 2px solid var(--border);
  box-shadow: none;
}
.nav-btn-secondary:hover {
  border-color: var(--primary);
  color: var(--primary);
  box-shadow: none;
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

/* Tasks Dialog */
.tasks-dialog { max-width: 500px; width: 90%; }
.tasks-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
.tasks-header h3 { margin: 0; }
.worker-status { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
.worker-toggle-btn { background: var(--bg); border: 1px solid var(--border); padding: 6px 12px; border-radius: 20px; cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
.worker-toggle-btn.active { background: #4caf50; color: white; border-color: #4caf50; }
.tasks-list { max-height: 400px; overflow-y: auto; margin-bottom: 15px; }
.task-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border); gap: 10px; }
.task-item:last-child { border-bottom: none; }
.task-info { flex: 1; min-width: 0; }
.task-title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-meta { font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px; display: flex; gap: 10px; }
.task-meta .status-completed { color: #4caf50; }
.task-meta .status-partial { color: #ff9800; }
.task-meta .status-scraping { color: #2196f3; }
.task-meta .status-pending { color: #9e9e9e; }
.task-delete-btn { background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 5px; opacity: 0.6; transition: opacity 0.2s; }
.task-delete-btn:hover { opacity: 1; }
.tasks-empty { text-align: center; color: var(--text-secondary); padding: 30px; }

/* Responsive */
@media (max-width: 900px) {
  .main-layout {
    grid-template-columns: 1fr;
  }
  .sidebar {
    position: static;
  }
  .featured-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
  .weekly-grid {
    grid-template-columns: 1fr;
  }
  .header h1 {
    font-size: 1.1rem;
  }
}

@media (max-width: 600px) {
  .search-section {
    padding: 15px 15px 0;
  }
  .featured-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .featured-cover {
    height: 140px;
  }
  .update-item {
    flex-wrap: wrap;
  }
  .update-author {
    display: none;
  }
}
</style>