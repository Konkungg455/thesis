import { applyAppTheme } from '~/composables/useAppTheme'

export default defineNuxtPlugin((nuxtApp) => {
  const syncTheme = (path) => {
    applyAppTheme(localStorage.getItem('app_theme'), path)
  }

  syncTheme(window.location.pathname)

  window.addEventListener('storage', () => {
    syncTheme(window.location.pathname)
  })

  nuxtApp.hook('page:finish', () => {
    syncTheme(window.location.pathname)
  })
})
