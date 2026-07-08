const LOCALE_STORAGE_KEY = 'app_language'

/**
 * Shared Thai / English locale state.
 * English mode uses Google Translate to translate the whole page.
 */
export function useAppLocale() {
    const language = useState('app_language', () => 'THAI')

    const setLocale = (val) => {
        const next = val === 'ENGLISH' ? 'ENGLISH' : 'THAI'
        language.value = next

        if (!import.meta.client) return

        localStorage.setItem(LOCALE_STORAGE_KEY, next)

        const apply = useNuxtApp().$applyAppLocale
        if (typeof apply === 'function') {
            apply(next)
        }
    }

    const initLocale = () => {
        if (!import.meta.client) return

        const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
        if (saved === 'ENGLISH' || saved === 'THAI') {
            language.value = saved
        }
    }

    return {
        language,
        setLocale,
        initLocale,
        isEnglish: computed(() => language.value === 'ENGLISH'),
    }
}
