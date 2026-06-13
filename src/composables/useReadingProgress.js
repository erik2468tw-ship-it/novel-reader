// 閱讀進度管理 composable
import { ref } from 'vue'

const STORAGE_KEY = 'novel-reader-progress'

// 從 localStorage 載入進度
function loadProgress() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

// 儲存進度到 localStorage
function persistProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
}

const readingProgress = ref(loadProgress())

// 取得某本小說的閱讀進度
function getProgress(novelId) {
  return readingProgress.value[novelId] || null
}

// 取得某本小說的書籤列表
function getBookmarks(novelId) {
  const progress = readingProgress.value[novelId]
  return progress?.bookmarks || []
}

// 儲存閱讀進度
function saveProgress(novelId, chapterId, chapterNumber) {
  const progress = loadProgress()
  if (!progress[novelId]) {
    progress[novelId] = { bookmarks: [] }
  }
  progress[novelId].lastChapterId = chapterId
  progress[novelId].lastChapterNumber = chapterNumber
  progress[novelId].lastRead = new Date().toISOString()
  readingProgress.value = progress
  persistProgress(progress)
}

// 新增書籤
function addBookmark(novelId, chapterId, chapterNumber, note = '') {
  const progress = loadProgress()
  if (!progress[novelId]) {
    progress[novelId] = { bookmarks: [] }
  }
  
  const exists = progress[novelId].bookmarks.some(b => b.chapterId === chapterId)
  if (exists) return false
  
  progress[novelId].bookmarks.push({
    chapterId,
    chapterNumber,
    note,
    createdAt: new Date().toISOString()
  })
  
  readingProgress.value = progress
  persistProgress(progress)
  return true
}

// 移除書籤
function removeBookmark(novelId, chapterId) {
  const progress = loadProgress()
  if (!progress[novelId]) return false
  
  progress[novelId].bookmarks = progress[novelId].bookmarks.filter(
    b => b.chapterId !== chapterId
  )
  
  readingProgress.value = progress
  persistProgress(progress)
  return true
}

// 清除某本小說的所有進度
function clearProgress(novelId) {
  const progress = loadProgress()
  delete progress[novelId]
  readingProgress.value = progress
  persistProgress(progress)
}

export function useReadingProgress() {
  return {
    readingProgress,
    getProgress,
    getBookmarks,
    saveProgress,
    addBookmark,
    removeBookmark,
    clearProgress
  }
}