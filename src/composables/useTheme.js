// 主題管理 composable
import { ref } from 'vue'

const isDark = ref(false)

function applyDarkMode() {
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

function toggleDarkMode() {
  isDark.value = !isDark.value
  localStorage.setItem('darkMode', isDark.value ? '1' : '0')
  applyDarkMode()
}

function initTheme() {
  const saved = localStorage.getItem('darkMode')
  isDark.value = saved === '1'
  applyDarkMode()
}

export function useTheme() {
  return {
    isDark,
    toggleDarkMode,
    initTheme
  }
}