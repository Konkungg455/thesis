const LOCALE_STORAGE_KEY = 'app_language'
const HIDE_STYLE_ID = 'hide-google-translate-chrome'

type AppLocale = 'THAI' | 'ENGLISH'

function hideGoogleChrome() {
    if (document.getElementById(HIDE_STYLE_ID)) return

    const style = document.createElement('style')
    style.id = HIDE_STYLE_ID
    style.textContent = `
        iframe.goog-te-banner-frame,
        iframe.goog-te-menu-frame,
        iframe.goog-te-balloon-frame,
        .goog-te-banner-frame,
        .goog-te-menu-frame,
        .goog-te-balloon-frame,
        .skiptranslate,
        #goog-gt-tt,
        .goog-te-gadget,
        .goog-te-gadget-simple,
        .goog-tooltip,
        .goog-tooltip:hover {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
        }
        body {
            top: 0 !important;
            position: static !important;
        }
        .goog-text-highlight {
            background: none !important;
            box-shadow: none !important;
        }
        #google_translate_element {
            position: absolute;
            left: -9999px;
            width: 1px;
            height: 1px;
            overflow: hidden;
        }
        .notranslate,
        [translate="no"] {
            translate: no;
        }
    `
    document.head.appendChild(style)
}

function purgeGoogleBannerNodes() {
    document.querySelectorAll('iframe.goog-te-banner-frame, .goog-te-banner-frame.skiptranslate').forEach((node) => {
        node.remove()
    })
    document.body.style.top = '0'
    document.body.style.position = 'static'
    document.documentElement.classList.remove('translated-ltr', 'translated-rtl')
    document.body.classList.remove('translated-ltr', 'translated-rtl')
}

function cookieDomains(): string[] {
    const hostname = window.location.hostname
    const domains = ['']
    if (hostname && hostname !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        domains.push(hostname, `.${hostname}`)
    }
    return domains
}

function setGoogTransCookie(value: string) {
    const expires = new Date(Date.now() + 365 * 86400000).toUTCString()
    for (const domain of cookieDomains()) {
        const domainPart = domain ? `;domain=${domain}` : ''
        document.cookie = `googtrans=${value};expires=${expires};path=/${domainPart}`
    }
}

function clearGoogTransCookie() {
    const expires = 'Thu, 01 Jan 1970 00:00:00 UTC'
    for (const domain of cookieDomains()) {
        const domainPart = domain ? `;domain=${domain}` : ''
        document.cookie = `googtrans=;expires=${expires};path=/${domainPart}`
    }
}

function triggerGoogleTranslate(locale: AppLocale) {
    const select = document.querySelector('.goog-te-combo') as HTMLSelectElement | null
    if (!select) return false

    const target = locale === 'ENGLISH' ? 'en' : ''
    select.value = target
    select.dispatchEvent(new Event('change'))
    return true
}

function applyAppLocale(locale: AppLocale) {
    hideGoogleChrome()
    purgeGoogleBannerNodes()

    if (locale === 'THAI') {
        clearGoogTransCookie()
        window.location.reload()
        return
    }

    setGoogTransCookie('/th/en')

    if (!triggerGoogleTranslate('ENGLISH')) {
        window.location.reload()
    }
}

export default defineNuxtPlugin((nuxtApp) => {
    if (!document.getElementById('google_translate_element')) {
        const mount = document.createElement('div')
        mount.id = 'google_translate_element'
        document.body.appendChild(mount)
    }

    hideGoogleChrome()

    const saved = (localStorage.getItem(LOCALE_STORAGE_KEY) as AppLocale | null) || 'THAI'
    if (saved === 'ENGLISH') {
        setGoogTransCookie('/th/en')
    } else {
        clearGoogTransCookie()
    }

    ;(window as typeof window & { googleTranslateElementInit?: () => void }).googleTranslateElementInit = () => {
        const google = (window as typeof window & { google?: any }).google
        const TranslateElement = google?.translate?.TranslateElement
        if (!TranslateElement) return

        new TranslateElement(
            {
                pageLanguage: 'th',
                includedLanguages: 'en,th',
                autoDisplay: false,
                layout: TranslateElement.InlineLayout.SIMPLE,
            },
            'google_translate_element',
        )

        hideGoogleChrome()
        purgeGoogleBannerNodes()

        const current = (localStorage.getItem(LOCALE_STORAGE_KEY) as AppLocale | null) || 'THAI'
        if (current === 'ENGLISH') {
            window.setTimeout(() => triggerGoogleTranslate('ENGLISH'), 300)
        }
    }

    if (!document.getElementById('google-translate-script')) {
        const script = document.createElement('script')
        script.id = 'google-translate-script'
        script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
        script.async = true
        document.body.appendChild(script)
    }

    const cleanupTimer = window.setInterval(purgeGoogleBannerNodes, 1000)
    window.setTimeout(() => window.clearInterval(cleanupTimer), 15000)

    nuxtApp.provide('applyAppLocale', (locale: AppLocale) => applyAppLocale(locale))
})
