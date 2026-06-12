<script setup>
import { ref, onMounted } from 'vue'
import { api } from './api.js'

const currentView = ref('home') // home, detail, reading
const novels = ref([])
const currentNovel = ref(null)
const currentChapter = ref(null)
const chapters = ref([])
const loading = ref(false)
const error = ref('')

// 新增小說對話框
const showAddDialog = ref(false)
const newNovelUrl = ref('')
const newNovelTitle = ref('')

// 刪除對話框
const showDeleteDialog = ref(false)
const deletePassword = ref('')
const novelToDelete = ref(null)

// 載入小說列表
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

// 新增小說
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

// 刪除小說
async function confirmDelete() {
  if (!deletePassword.value) return
  try {
    await api.deleteNovel(novelToDelete.value.id, deletePassword.value)
    showDeleteDialog.value = false
    deletePassword.value = ''
    novelToDelete.value = null
    await loadNovels()
  } catch (e) {
    error.value = '刪除失敗：' + e.message
  }
}

// 開啟刪除對話框
function openDeleteDialog(novel) {
  novelToDelete.value = novel
  deletePassword.value = ''
  showDeleteDialog.value = true
}

// 進入小說詳情
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

// 閱讀章節
async function readChapter(chapter) {
  currentChapter.value = chapter
  loading.value = true
  try {
    const data = await api.getChapter(currentNovel.value.id, chapter.chapter_number)
    if (data.status === 'downloading') {
      // 等待一下再試
      await new Promise(r => setTimeout(r, 2000))
      const retryData = await api.getChapter(currentNovel.value.id, chapter.chapter_number)
      currentChapter.value.content = retryData.content || '載入中...'
    } else {
      currentChapter.value.content = data.content || '無內容'
    }
    // 預載後3章
    api.preloadChapters(currentNovel.value.id, chapter.chapter_number)
    currentView.value = 'reading'
  } catch (e) {
    error.value = '載入失敗：' + e.message
  }
  loading.value = false
}

// 返回
function goBack() {
  if (currentView.value === 'reading') {
    currentView.value = 'detail'
  } else if (currentView.value === 'detail') {
    currentView.value = 'home'
    currentNovel.value = null
  }
}

// 格式化狀態
function formatStatus(status) {
  const map = {
    pending: '等待中',
    scraping: '下載中',
    completed: '已完成',
    partial: '部分完成',
    failed: '失敗',
    cancelled: '已取消'
  }
  return map[status] || status
}

onMounted(() => {
  loadNovels()
})
</script>

<template>
  <div class="app">
    <!-- 頂部導航 -->
    <header class="header">
      <button v-if="currentView !== 'home'" @click="goBack" class="back-btn">← 返回</button>
      <h1>📚 小說閱讀器</h1>
      <button v-if="currentView === 'home'" @click="showAddDialog = true" class="add-btn">+ 新增</button>
    </header>

    <!-- 錯誤訊息 -->
    <div v-if="error" class="error">{{ error }}</div>

    <!-- 載入中 -->
    <div v-if="loading" class="loading">載入中...</div>

    <!-- 首頁：小說列表 -->
    <main v-if="currentView === 'home'" class="home">
      <div v-if="novels.length === 0" class="empty">
        <p>還沒有小說</p>
        <button @click="showAddDialog = true">新增第一本小說</button>
      </div>
      <div class="novel-grid">
        <div v-for="novel in novels" :key="novel.id" class="novel-card" @click="viewNovel(novel)">
          <div class="novel-cover">
            <img v-if="novel.coverUrl" :src="novel.coverUrl" alt="cover">
            <div v-else class="no-cover">📖</div>
          </div>
          <div class="novel-info">
            <h3>{{ novel.title }}</h3>
            <p v-if="novel.author" class="author">作者：{{ novel.author }}</p>
            <p v-if="novel.category" class="category">{{ novel.category }}</p>
            <span class="status" :class="novel.status">{{ formatStatus(novel.status) }}</span>
          </div>
          <button class="delete-btn" @click.stop="openDeleteDialog(novel)">🗑️</button>
        </div>
      </div>
    </main>

    <!-- 詳情頁：小說資訊 + 章節列表 -->
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
        </div>
      </div>
      <div class="chapter-list">
        <h3>章節目錄</h3>
        <div v-if="chapters.length === 0" class="empty">暫無章節</div>
        <button 
          v-for="ch in chapters" 
          :key="ch.id" 
          class="chapter-btn"
          @click="readChapter(ch)"
        >
          {{ ch.chapter_number }}. {{ ch.title }}
        </button>
      </div>
    </main>

    <!-- 閱讀頁 -->
    <main v-if="currentView === 'reading'" class="reading">
      <div class="chapter-title">
        <h2>{{ currentChapter.title }}</h2>
      </div>
      <div class="chapter-content">
        <p v-if="loading">載入中...</p>
        <p v-else>{{ currentChapter.content }}</p>
      </div>
      <div class="chapter-nav">
        <button disabled>上一章</button>
        <button disabled>下一章</button>
      </div>
    </main>

    <!-- 新增小說對話框 -->
    <div v-if="showAddDialog" class="dialog-overlay" @click.self="showAddDialog = false">
      <div class="dialog">
        <h3>新增小說</h3>
        <input 
          v-model="newNovelUrl" 
          placeholder="輸入小說網址 https://www.novel543.com/xxx"
          @keyup.enter="addNovel"
        >
        <input 
          v-model="newNovelTitle" 
          placeholder="標題（可選，會自動抓取）"
        >
        <div class="dialog-buttons">
          <button @click="showAddDialog = false">取消</button>
          <button @click="addNovel" :disabled="!newNovelUrl">新增</button>
        </div>
      </div>
    </div>

    <!-- 刪除對話框 -->
    <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
      <div class="dialog">
        <h3>刪除小說</h3>
        <p>確定要刪除「{{ novelToDelete?.title }}」嗎？</p>
        <input 
          type="password" 
          v-model="deletePassword" 
          placeholder="輸入密碼"
          @keyup.enter="confirmDelete"
        >
        <div class="dialog-buttons">
          <button @click="showDeleteDialog = false">取消</button>
          <button @click="confirmDelete" :disabled="!deletePassword">刪除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #ddd;
  margin-bottom: 20px;
}

.header h1 {
  font-size: 1.5rem;
  margin: 0;
}

.back-btn, .add-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.back-btn {
  background: #f0f0f0;
}

.add-btn {
  background: #4CAF50;
  color: white;
}

.error {
  background: #ffebee;
  color: #c62828;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #666;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.novel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

.novel-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  cursor: pointer;
  position: relative;
  transition: transform 0.2s;
}

.novel-card:hover {
  transform: translateY(-4px);
}

.novel-cover {
  height: 200px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.novel-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-cover {
  font-size: 60px;
}

.novel-info {
  padding: 15px;
}

.novel-info h3 {
  margin: 0 0 10px;
  font-size: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.author, .category {
  font-size: 0.85rem;
  color: #666;
  margin: 5px 0;
}

.status {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  margin-top: 8px;
}

.status.pending { background: #fff3e0; color: #e65100; }
.status.scraping { background: #e3f2fd; color: #1565c0; }
.status.completed { background: #e8f5e9; color: #2e7d32; }
.status.partial { background: #fff8e1; color: #f57f17; }
.status.failed { background: #ffebee; color: #c62828; }

.delete-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0,0,0,0.5);
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.novel-card:hover .delete-btn {
  opacity: 1;
}

/* 詳情頁 */
.novel-header {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
}

.cover {
  width: 150px;
  height: 200px;
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info h2 {
  margin: 0 0 10px;
}

.info p {
  margin: 5px 0;
  color: #666;
}

.description {
  margin-top: 15px;
  font-size: 0.9rem;
  line-height: 1.6;
}

.chapter-count {
  margin-top: 15px;
  font-weight: bold;
}

.chapter-list h3 {
  margin-bottom: 15px;
}

.chapter-btn {
  display: block;
  width: 100%;
  padding: 12px;
  margin-bottom: 8px;
  background: #f5f5f5;
  border: none;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
}

.chapter-btn:hover {
  background: #e0e0e0;
}

/* 閱讀頁 */
.chapter-title {
  text-align: center;
  margin-bottom: 20px;
}

.chapter-content {
  background: white;
  padding: 30px;
  border-radius: 12px;
  line-height: 1.8;
  font-size: 1.1rem;
  min-height: 300px;
}

.chapter-nav {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.chapter-nav button {
  padding: 12px 30px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  background: #f5f5f5;
}

.chapter-nav button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 對話框 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background: white;
  padding: 30px;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
}

.dialog h3 {
  margin: 0 0 20px;
}

.dialog input {
  width: 100%;
  padding: 12px;
  margin-bottom: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-sizing: border-box;
}

.dialog-buttons {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.dialog-buttons button {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.dialog-buttons button:first-child {
  background: #f5f5f5;
}

.dialog-buttons button:last-child {
  background: #4CAF50;
  color: white;
}

.dialog-buttons button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
