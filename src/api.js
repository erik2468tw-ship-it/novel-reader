// API Service for Novel Reader
// 整合後的 API - 使用相對路徑（同一 server）
const API_BASE = ''

export const api = {
  // 取得小說列表
  async getNovels() {
    const res = await fetch(`${API_BASE}/api/novels`)
    return res.json()
  },

  // 取得單本小說
  async getNovel(id) {
    const res = await fetch(`${API_BASE}/api/novels/${id}`)
    return res.json()
  },

  // 取得章節列表
  async getChapters(novelId) {
    const res = await fetch(`${API_BASE}/api/novels/${novelId}/chapters`)
    return res.json()
  },

  // 新增小說（會自動抓取 metadata）
  async addNovel(url, title) {
    const res = await fetch(`${API_BASE}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title })
    })
    return res.json()
  },

  // 刪除小說
  async deleteNovel(id, password) {
    const res = await fetch(`${API_BASE}/api/novels/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    return res.json()
  },

  // 懶載入章節內容
  async getChapter(novelId, chapterId) {
    const res = await fetch(`${API_BASE}/api/chapter/${novelId}/${chapterId}`)
    if (res.status === 202) {
      return { status: 'downloading', message: 'Chapter is being downloaded' }
    }
    return res.json()
  },

  // 讀取靜態 HTML 章節（效能優化）
  async getChapterHTML(novelId, chapterId) {
    const res = await fetch(`${API_BASE}/api/static/${novelId}/${chapterId}`)
    if (res.status === 404) {
      return null // 章節不存在或尚未生成靜態 HTML
    }
    return res.text()
  },

  // 預載後3個章節
  async preloadChapters(novelId, chapterId) {
    const res = await fetch(`${API_BASE}/api/chapter/${novelId}/${chapterId}/preload`, {
      method: 'POST'
    })
    return res.json()
  },

  // 同步小說
  async syncNovel(id) {
    const res = await fetch(`${API_BASE}/api/scrape/${id}/sync`, {
      method: 'POST'
    })
    return res.json()
  },

  // 重新整理章節（修補標題 + 增量更新）
  async refreshNovel(id) {
    const res = await fetch(`${API_BASE}/api/scrape/${id}/refresh`, {
      method: 'POST'
    })
    return res.json()
  },

  // 全部重新整理（所有小說）
  async refreshAllNovels() {
    const res = await fetch(`${API_BASE}/api/scrape/refresh-all`, {
      method: 'POST'
    })
    return res.json()
  },

  // 取得小說詳細資訊
  async getNovelInfo(id) {
    const res = await fetch(`${API_BASE}/api/novels/${id}/info`)
    return res.json()
  },

  // 暫停/繼續/取消
  async pauseScrape(id) {
    return fetch(`${API_BASE}/api/scrape/${id}/pause`, { method: 'POST' })
  },

  async resumeScrape(id) {
    return fetch(`${API_BASE}/api/scrape/${id}/resume`, { method: 'POST' })
  },

  async cancelScrape(id) {
    return fetch(`${API_BASE}/api/scrape/${id}/cancel`, { method: 'POST' })
  },

  // Worker 控制
  async getWorkerStatus() {
    const res = await fetch(`${API_BASE}/api/worker/status`)
    return res.json()
  },

  async startWorker() {
    const res = await fetch(`${API_BASE}/api/worker/start`, { method: 'POST' })
    return res.json()
  },

  async stopWorker() {
    const res = await fetch(`${API_BASE}/api/worker/stop`, { method: 'POST' })
    return res.json()
  },

  // 任務明細
  async getTasks() {
    const res = await fetch(`${API_BASE}/api/tasks`)
    return res.json()
  },

  // 刪除任務（使用 tasks API）
  async deleteTask(id, password) {
    const res = await fetch(`${API_BASE}/api/scrape/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    return res.json()
  }
}
