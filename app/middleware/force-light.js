import { applyAppTheme } from '~/composables/useAppTheme'

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.client) {
    applyAppTheme(localStorage.getItem('app_theme'), to.path)
  }
})
