/** หน้าที่ต้องเป็น Light Mode เสมอ (ใบสรุปรายการยา / สรุป — ออกแบบสำหรับพิมพ์) */
export const FORCE_LIGHT_ROUTES = ['/summary', '/prescription-view']

export function isForceLightPath(path = '') {
  const base = String(path).split('?')[0].split('#')[0].toLowerCase()
  return FORCE_LIGHT_ROUTES.includes(base)
}

export function applyAppTheme(theme, path) {
  if (!import.meta.client) return

  const pathname = path ?? window.location.pathname
  const forced = isForceLightPath(pathname)
  const effective = forced ? 'LIGHT' : theme

  document.documentElement.classList.toggle('dark', effective === 'DARK')
  document.documentElement.style.colorScheme = effective === 'DARK' ? 'dark' : 'light'
}
