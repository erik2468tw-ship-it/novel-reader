// 小說狀態管理 composable
import { ref, computed } from 'vue'
import { api } from '../api.js'

const novels = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const currentFilter = ref('all') // all, reading, completed

// 計算屬性：過濾後的小說列表
const filteredNovels = computed(() => {
  let result = novels.value
  
  // 搜尋過濾
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(n => 
      n.title?.toLowerCase().includes(query) ||
      n.author?.toLowerCase().includes(query)
    )
  }
  
  // 狀態過濾
  if (currentFilter.value !== 'all') {
    result = result.filter(n => n.status === currentFilter.value)
  }
  
  return result
})

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
async function addNovel(url, title) {
  loading.value = true
  error.value = ''
  try {
    await api.addNovel(url, title || url)
    await loadNovels()
    return true
  } catch (e) {
    error.value = '新增失敗：' + e.message
    return false
  } finally {
    loading.value = false
  }
}

// 刪除小說
async function deleteNovel(id, password) {
  try {
    await api.deleteNovel(id, password)
    await loadNovels()
    return true
  } catch (e) {
    error.value = '刪除失敗：' + e.message
    return false
  }
}

// 搜尋
function setSearchQuery(query) {
  searchQuery.value = query
}

// 設定過濾器
function setFilter(filter) {
  currentFilter.value = filter
}

export function useNovels() {
  return {
    novels,
    loading,
    error,
    searchQuery,
    currentFilter,
    filteredNovels,
    loadNovels,
    addNovel,
    deleteNovel,
    setSearchQuery,
    setFilter
  }
}