<template>
    <header>
        <nav class="navbar">
            <div class="nav-left">
                <NuxtLink to="/">
                    <img src="https://ik.imagekit.io/pcqen5m7p/Telebotpharcy%20(1)%201%20(2).png" alt="logo"
                        class="logo-img" />
                </NuxtLink>
            </div>

            <button v-if="!isAdminPage" class="btn-hamburger" @click.stop="toggleMobile">
                <i :class="mobileOpen ? 'fas fa-times' : 'fas fa-bars'"></i>
            </button>

            <ul v-if="!isAdminPage" class="nav-menu" :class="{ 'show-mobile': mobileOpen }">
                <li>
                    <NuxtLink to="/" @click="closeAll">หน้าแรก</NuxtLink>
                </li>
                <li>
                    <NuxtLink to="/Advice" @click="closeAll">ปรึกษาอาการ</NuxtLink>
                </li>
                <li>
                    <NuxtLink to="/Review" @click="closeAll">รีวิว</NuxtLink>
                </li>
                <li>
                    <NuxtLink to="/Contact" @click="closeAll">ติดต่อเจ้าหน้าที่</NuxtLink>
                </li>
                <li class="mobile-only mobile-stack">
                    <!-- 🚩 กระดิ่งแจ้งเตือน — โผล่ใน hamburger dropdown เฉพาะมือถือ -->
                    <div class="mobile-item mobile-bell" :class="{ 'has-alert': hasAlert }"
                         @click.stop="toggleDropdown('notif')">
                        <i class="fa-solid fa-bell" :class="{ 'bell-shake': hasAlert }"></i>
                        <span>การแจ้งเตือน</span>
                        <span v-if="hasAlert" class="mobile-bell-dot"></span>
                    </div>
                    <div class="mobile-item notranslate" translate="no" @click="setLang(language === 'THAI' ? 'ENGLISH' : 'THAI')"><i class="fa-solid fa-globe"></i> {{ language
                        }}</div>
                    <div class="mobile-item notranslate" translate="no" @click="setTheme(theme === 'LIGHT' ? 'DARK' : 'LIGHT')"><i :class="theme === 'LIGHT' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'"></i> {{ theme }}</div>
                </li>
            </ul>

            <div class="nav-right">
                <div class="dropdown" ref="notifRef">
                    <button class="icon-btn bell-btn" :class="{ 'has-alert': hasAlert }" @click.stop="toggleDropdown('notif')" aria-label="Notifications">
                        <i class="fa-solid fa-bell" :class="{ 'bell-shake': hasAlert }"></i>
                        <span v-if="hasAlert" class="red-dot">
                            <span class="red-dot-ring"></span>
                        </span>
                    </button>

                    <div v-if="activeDropdown === 'notif'" class="dropdown-menu notif-dropdown shadow">
                        <div class="notif-header">การแจ้งเตือน</div>

                        <div v-if="!consultStatus" class="no-notif">ไม่มีการแจ้งเตือนใหม่</div>

                        <div v-else class="notif-body">
                            <div v-if="consultStatus.status === 'waiting'" class="notif-item">
                                <div class="notif-icon-box waiting"><i class="fa-solid fa-hourglass-half"></i></div>
                                <div class="notif-text">
                                    <strong>กำลังดำเนินการ</strong>
                                    <p>กรุณารอคุณเภสัชตอบกลับคำปรึกษาของคุณ</p>
                                </div>
                            </div>

                            <div v-else-if="consultStatus.status === 'accepted' && Number(consultStatus.is_followup) === 1" class="notif-item followup">
                                <div class="notif-icon-box followup"><i class="fa-solid fa-comment-medical"></i></div>
                                <div class="notif-text">
                                    <strong>เภสัชกรขอคุยกับคุณต่อ</strong>
                                    <p>ภก. {{ consultStatus.pharma_fullname || consultStatus.pharma_name }} ติดต่อกลับเพื่อสอบถามอาการของคุณ</p>
                                    <button @click="openFollowupChat" class="btn-go-chat followup-btn">
                                        <i class="fa-solid fa-comments"></i> กลับไปห้องแชท
                                    </button>
                                </div>
                            </div>

                            <div v-else-if="consultStatus.status === 'accepted'" class="notif-item">
                                <div class="notif-icon-box accepted"><i class="fa-solid fa-circle-check"></i></div>
                                <div class="notif-text">
                                    <strong>ตอบรับแล้ว</strong>
                                    <p>ภก. {{ consultStatus.pharma_name }} ตอบรับคำปรึกษาแล้ว</p>
                                    <button @click="navigateTo({
                                        path: '/user/chat',
                                        query: { id: consultStatus.id_pharma }
                                    })" class="btn-go-chat">
                                        ไปที่ห้องแชท
                                    </button>
                                </div>
                            </div>

                            <div v-else-if="consultStatus.status === 'completed' && Number(consultStatus.tracking_active) === 1" class="notif-item followup">
                                <div class="notif-icon-box followup"><i class="fa-solid fa-notes-medical"></i></div>
                                <div class="notif-text">
                                    <strong>ติดตามอาการกับเภสัชกร</strong>
                                    <p>คุณยังติดตามอาการกับ ภก. {{ consultStatus.pharma_fullname || consultStatus.pharma_name }} ได้<span v-if="trackingLeftText"> (เหลือ {{ trackingLeftText }})</span></p>
                                    <button @click="openTrackingChat" class="btn-go-chat followup-btn">
                                        <i class="fa-solid fa-comments"></i> ไปติดตามอาการ
                                    </button>
                                </div>
                            </div>

                            <div v-else-if="consultStatus.status === 'completed' && !Number(consultStatus.reviewed)" class="notif-item">
                                <div class="notif-icon-box accepted"><i class="fa-solid fa-clipboard-check"></i></div>
                                <div class="notif-text">
                                    <strong>จบการปรึกษาแล้ว</strong>
                                    <p>ครบเวลา 15 นาที กรุณาประเมินผลการให้คำปรึกษาเภสัชกร</p>
                                    <button @click="navigateTo({ path: '/review_write', query: { consult_id: consultStatus.id } }); closeAll()" class="btn-go-chat">
                                        <i class="fa-solid fa-user-doctor"></i> ไปหน้าประเมินเภสัช
                                    </button>
                                </div>
                            </div>

                            <div v-else-if="consultStatus.status === 'completed' && Number(consultStatus.reviewed)" class="no-notif">
                                ไม่มีการแจ้งเตือนใหม่
                            </div>

                            <div v-else-if="consultStatus.status === 'rejected'" class="notif-item">
                                <div class="notif-icon-box rejected"><i class="fa-solid fa-circle-xmark"></i></div>
                                <div class="notif-text">
                                    <strong>ถูกปฏิเสธ</strong>
                                    <p>ขออภัย เภสัชกรไม่สะดวกในขณะนี้ กรุณาติดต่อคนใหม่</p>
                                    <button @click="navigateTo('/user/phamacy')" class="btn-retry">เลือกเภสัชกรใหม่</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="dropdown notranslate" translate="no" ref="langRef">
                    <div class="dropdown-trigger" @click.stop="toggleDropdown('lang')">
                        <i class="fa-solid fa-globe"></i> {{ language }} <span class="arrow"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div v-if="activeDropdown === 'lang'" class="dropdown-menu">
                        <button @click="setLang('THAI')">THAI</button>
                        <button @click="setLang('ENGLISH')">ENGLISH</button>
                    </div>
                </div>

                <div class="dropdown notranslate" translate="no" ref="themeRef">
                    <div class="dropdown-trigger" @click.stop="toggleDropdown('theme')">
                        <i :class="theme === 'LIGHT' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'"></i> {{ theme }} <span class="arrow"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div v-if="activeDropdown === 'theme'" class="dropdown-menu">
                        <button @click="setTheme('LIGHT')">LIGHT</button>
                        <button @click="setTheme('DARK')">DARK</button>
                    </div>
                </div>

                <div v-if="user" class="dropdown" ref="profileRef">
                    <div class="dropdown-trigger profile-trigger" @click.stop="toggleDropdown('profile')">
                        <div class="profile-thumb">
                            <img :src="profileImageUrl" :alt="displayName" @error="onImgError" />
                        </div>
                        <span class="username-label">{{ displayName }}</span>
                        <span class="arrow"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div v-if="activeDropdown === 'profile'" class="dropdown-menu">
                        <NuxtLink to="/user/profile" class="menu-link" @click="closeAll">แก้ไขข้อมูลส่วนตัว</NuxtLink>
                        <NuxtLink to="/user/history" class="btn-logout-link" @click="closeAll">ประวัติพูดคุยกับแชท</NuxtLink>
                        <NuxtLink to="/user/consult-history" class="btn-logout-link" @click="closeAll">ประวัติการปรึกษากับเภสัชกร</NuxtLink>
                        <button @click="handleLogout" class="btn-logout-link">ออกจากระบบ</button>
                    </div>
                </div>

                <div v-else class="dropdown" ref="signinRef">
                    <button class="btn-signin" @click.stop="toggleDropdown('signin')">
                        Sign in <span class="arrow"><i class="fa-solid fa-chevron-down"></i></span>
                    </button>
                    <div v-if="activeDropdown === 'signin'" class="dropdown-menu">
                        <NuxtLink to="/auth" class="menu-link" @click="closeAll">เข้าสู่ระบบ</NuxtLink>
                    </div>
                </div>
            </div>
        </nav>

        <!-- 🔔 Toast popup แจ้งเตือนแบบ LINE/Facebook -->
        <transition name="bell-toast">
            <div v-if="bellToastVisible" class="bell-toast" @click="handleBellToastClick">
                <div class="bell-toast-icon">
                    <i :class="bellToastIcon"></i>
                </div>
                <div class="bell-toast-body">
                    <div class="bell-toast-title">{{ bellToastTitle }}</div>
                    <div class="bell-toast-desc">{{ bellToastDesc }}</div>
                </div>
                <button class="bell-toast-close" @click.stop="dismissBellToast" aria-label="ปิด">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </transition>

        <slot />
    </header>

    <LogoutConfirmDialog
        :show="logoutDialog"
        :loading="logoutLoading"
        role="user"
        @confirm="confirmLogout"
        @cancel="logoutDialog = false"
    />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from "vue"
import { useRoute } from "vue-router"
import { useApiBase } from "~/composables/useApiBase"
import { useAuthUser } from "~/composables/useAuthUser"
import { applyAppTheme } from '~/composables/useAppTheme'

const { apiUrl } = useApiBase()
const { user, displayName, profileImageUrl, syncFromServer, clearUser } = useAuthUser()
const { language, setLocale, initLocale } = useAppLocale()

const route = useRoute()
const isAdminPage = computed(() => /^\/admin/i.test(route.path || ''))

/* ================= State ================= */
const mobileOpen = ref(false)
const activeDropdown = ref(null)
const theme = ref("LIGHT")

/* ================= Notification State (เพิ่มใหม่) ================= */
const consultStatus = ref(null)
let pollTimer = null

const hasAlert = computed(() => {
    const s = consultStatus.value
    if (!s) return false
    // ยังอยู่ในช่วงติดตามอาการ 3 วัน → เด้งเตือนให้ไปติดตามอาการ
    if (Number(s.tracking_active) === 1) return true
    // รอบที่จบแล้ว + ผู้ใช้รีวิวไปแล้ว → ไม่ต้องเด้งเตือนซ้ำ
    if (s.status === 'completed' && Number(s.reviewed) === 1) return false
    return ['waiting', 'accepted', 'completed', 'rejected'].includes(s.status)
})

// เวลาที่เหลือในช่วงติดตามอาการ (3 วันนับจาก tracking_base) → "X วัน Y ชั่วโมง Z นาที"
const trackingLeftText = computed(() => {
    const base = consultStatus.value?.tracking_base
    if (!base) return ''
    const deadline = new Date(String(base).replace(' ', 'T')).getTime() + 3 * 24 * 60 * 60 * 1000
    const diff = deadline - Date.now()
    if (diff <= 0) return ''
    const days = Math.floor(diff / 86400000)
    const hours = Math.floor((diff % 86400000) / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    return `${days} วัน ${hours} ชั่วโมง ${mins} นาที`
})

// ไปห้องแชทเพื่อติดตามอาการของ "รอบนั้น" (แนบ consult_id + SRV)
const openTrackingChat = () => {
    const s = consultStatus.value
    if (!s?.id_pharma) return
    closeAll()
    const query = { id: s.id_pharma }
    if (s.id) query.consult_id = s.id
    if (s.service_code) query.srv = s.service_code
    navigateTo({ path: '/user/chat', query })
}

/* ================= Bell Toast (LINE/Facebook style popup) ================= */
const bellToastVisible = ref(false)
const bellToastTitle = ref('การแจ้งเตือน')
const bellToastDesc = ref('')
const bellToastIcon = ref('fa-solid fa-bell')
const bellToastKind = ref('followup')
let bellToastTimer = null
let lastNotifiedFollowupId = 0
let lastNotifiedAcceptedId = 0
let lastNotifiedRejectedId = 0

const FOLLOWUP_NOTIFIED_KEY = 'followup-notified-request-id'
const ACCEPT_NOTIFIED_KEY = 'consult-accepted-notified-id'
const REJECT_NOTIFIED_KEY = 'consult-rejected-notified-id'

const playNotificationSound = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (!AudioCtx) return
        const ctx = new AudioCtx()
        const playBeep = (freq, delay, duration = 0.18, type = 'sine') => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = type
            osc.frequency.value = freq
            osc.connect(gain)
            gain.connect(ctx.destination)
            const start = ctx.currentTime + delay
            gain.gain.setValueAtTime(0.0001, start)
            gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
            osc.start(start)
            osc.stop(start + duration + 0.02)
        }
        playBeep(880, 0)
        playBeep(660, 0.18)
        setTimeout(() => { try { ctx.close() } catch {} }, 800)
    } catch {}
}

const tryShowBrowserNotification = (title, body, tag = 'telebot-alert') => {
    try {
        if (typeof Notification === 'undefined') return
        if (document.visibilityState === 'visible') return
        const fire = () => {
            try {
                const n = new Notification(title, { body, icon: '/favicon.png', tag })
                n.onclick = () => {
                    window.focus()
                    n.close()
                    handleBellToastClick()
                }
            } catch {}
        }
        if (Notification.permission === 'granted') {
            fire()
        } else if (Notification.permission === 'default') {
            Notification.requestPermission().then(p => { if (p === 'granted') fire() })
        }
    } catch {}
}

const showBellToast = (title, desc, kind = 'followup', icon = 'fa-solid fa-bell') => {
    bellToastTitle.value = title
    bellToastDesc.value = desc
    bellToastKind.value = kind
    bellToastIcon.value = icon
    bellToastVisible.value = true
    if (bellToastTimer) clearTimeout(bellToastTimer)
    bellToastTimer = setTimeout(() => { bellToastVisible.value = false }, 9000)
    playNotificationSound()
    tryShowBrowserNotification(title, desc, `telebot-${kind}`)
}

const dismissBellToast = () => {
    bellToastVisible.value = false
    if (bellToastTimer) clearTimeout(bellToastTimer)
}

const openFollowupChat = () => {
    if (!consultStatus.value?.id_pharma) return
    closeAll()
    dismissBellToast()
    navigateTo({ path: '/user/chat', query: { id: consultStatus.value.id_pharma } })
}

const openAcceptedChat = () => {
    if (!consultStatus.value?.id_pharma) return
    closeAll()
    dismissBellToast()
    navigateTo({ path: '/user/chat', query: { id: consultStatus.value.id_pharma } })
}

const handleBellToastClick = () => {
    if (bellToastKind.value === 'accepted') {
        openAcceptedChat()
        return
    }
    if (bellToastKind.value === 'followup') {
        openFollowupChat()
    }
}

const notifyConsultEvents = (data) => {
    const reqId = Number(data.id) || 0
    if (reqId <= 0) return
    const pharmaName = data.pharma_fullname || data.pharma_name || 'เภสัชกร'

    if (data.status === 'accepted' && Number(data.is_followup) === 1) {
        if (reqId !== lastNotifiedFollowupId) {
            lastNotifiedFollowupId = reqId
            try { localStorage.setItem(FOLLOWUP_NOTIFIED_KEY, String(reqId)) } catch {}
            showBellToast(
                'เภสัชกรขอคุยกับคุณต่อ',
                `ภก. ${pharmaName} ติดต่อกลับเพื่อสอบถามอาการ — แตะเพื่อกลับไปห้องแชท`,
                'followup',
                'fa-solid fa-comment-medical'
            )
        }
        return
    }

    if (data.status === 'accepted') {
        if (reqId !== lastNotifiedAcceptedId) {
            lastNotifiedAcceptedId = reqId
            try { localStorage.setItem(ACCEPT_NOTIFIED_KEY, String(reqId)) } catch {}
            showBellToast(
                'เภสัชกรตอบรับแล้ว',
                `ภก. ${pharmaName} พร้อมให้คำปรึกษาแล้ว — แตะเพื่อเข้าห้องแชท`,
                'accepted',
                'fa-solid fa-circle-check'
            )
        }
        return
    }

    if (data.status === 'rejected') {
        if (reqId !== lastNotifiedRejectedId) {
            lastNotifiedRejectedId = reqId
            try { localStorage.setItem(REJECT_NOTIFIED_KEY, String(reqId)) } catch {}
            showBellToast(
                'เภสัชกรไม่สะดวกรับสาย',
                'กรุณาเลือกเภสัชกรท่านอื่น',
                'rejected',
                'fa-solid fa-circle-xmark'
            )
        }
    }
}

/* ================= Refs ================= */
const langRef = ref(null)
const themeRef = ref(null)
const signinRef = ref(null)
const profileRef = ref(null)
const notifRef = ref(null) // สำหรับกระดิ่ง

const onImgError = (e) => {
    e.target.src = 'https://via.placeholder.com/40'
}

/* ================= Functions ================= */

// ฟังก์ชันเช็คสถานะจากเภสัชกร (ฉบับแก้ปัญหา Session Empty)
const checkConsultStatus = async () => {
    if (!user.value) return;

    try {
        // 🚩 1. ดึง ID จริงๆ ออกมาจากตัวแปร user (เช็คว่าใน user.value ของนายใช้ id หรือ id_account)
        const userId = user.value.id_account || user.value.id;

        // 🚩 2. ส่ง u_id แนบไปใน URL เลย (ใช้เครื่องหมาย Backtick ` อยู่ใต้ปุ่ม Esc)
        // การส่ง &u_id=${userId} จะทำให้ PHP รู้ทันทีว่าเป็นใครโดยไม่ต้องพึ่ง Session
        const data = await $fetch(apiUrl(`consult-handler.php?action=check_user_status&u_id=${userId}&t=${Date.now()}`), {
            credentials: 'include'
        });

        if (data && data.id && data.status !== 'none') {
            consultStatus.value = data;
            notifyConsultEvents(data);
        } else {
            consultStatus.value = null;
        }
    } catch (error) {
        console.error("Notification Polling Error:", error);
    }
}

const checkUserStatus = () => {
    syncFromServer().catch(() => {})
    if (user.value) {
        checkConsultStatus()
    }
}

const logoutDialog = ref(false)
const logoutLoading = ref(false)

const handleLogout = () => {
    closeAll()
    logoutDialog.value = true
}

const confirmLogout = async () => {
    logoutLoading.value = true
    try {
        await $fetch(apiUrl('logout.php'), { credentials: 'include' })
    } catch (e) {
        console.error("Logout Error:", e)
    }
    clearUser()
    logoutDialog.value = false
    logoutLoading.value = false
    window.location.href = '/'
}

const closeAll = () => {
    activeDropdown.value = null
    mobileOpen.value = false
}

const toggleDropdown = (name) => {
    activeDropdown.value = activeDropdown.value === name ? null : name
}

const toggleMobile = () => {
    mobileOpen.value = !mobileOpen.value
    if (mobileOpen.value) activeDropdown.value = null
}

const setLang = (val) => { setLocale(val); closeAll(); }
const applyTheme = (val) => {
    applyAppTheme(val)
}

const setTheme = (val) => {
    theme.value = val
    if (process.client) {
        localStorage.setItem("app_theme", val)
        applyTheme(val)
    }
    closeAll()
}

/* ================= Lifecycle ================= */
const handleClickOutside = (event) => {
    const refs = [langRef, themeRef, signinRef, profileRef, notifRef]
    const isInside = refs.some(r => r.value?.contains(event.target))
    if (!isInside) closeAll()
}

onMounted(() => {
    initLocale()
    const savedTheme = localStorage.getItem("app_theme")
    if (savedTheme === "DARK" || savedTheme === "LIGHT") {
        theme.value = savedTheme
    }
    applyTheme(theme.value)

    // โหลดค่า request_id ที่เคยแจ้งเตือนไปแล้ว เพื่อกัน toast เด้งซ้ำหลัง reload
    try {
        const last = localStorage.getItem(FOLLOWUP_NOTIFIED_KEY)
        if (last) lastNotifiedFollowupId = Number(last) || 0
        const acc = localStorage.getItem(ACCEPT_NOTIFIED_KEY)
        if (acc) lastNotifiedAcceptedId = Number(acc) || 0
        const rej = localStorage.getItem(REJECT_NOTIFIED_KEY)
        if (rej) lastNotifiedRejectedId = Number(rej) || 0
    } catch {}

    // ขอสิทธิ์ Notification ของเบราว์เซอร์แบบเงียบ ๆ (สำหรับ background popup เหมือน LINE/Facebook)
    try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {})
        }
    } catch {}

    window.addEventListener("click", handleClickOutside)
    checkUserStatus()

    // ตั้งเวลา Polling เช็คสถานะกระดิ่งทุก 5 วินาที
    pollTimer = setInterval(checkConsultStatus, 5000);
})

onBeforeUnmount(() => {
    window.removeEventListener("click", handleClickOutside)
    if (pollTimer) clearInterval(pollTimer);
})

watch(theme, (val) => {
    applyTheme(val)
})
</script>

<style scoped>
/* Profile Styles */
.profile-trigger {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 10px;
    border-radius: 20px;
    transition: background 0.2s;
}

.profile-trigger:hover {
    background: rgba(0, 0, 0, 0.05);
}

.profile-thumb {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid #00469c;
    background: #f0f0f0;
}

.profile-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.username-label {
    font-weight: 300;
    max-width: 50px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.btn-logout-link {
    width: 100%;
    text-align: left;
    padding: 12px 20px;
    background: none;
    border: none;
    color: #e63946;
    font-weight: 500;
    cursor: pointer;
    border-top: 1px solid #eee;
}

.btn-logout-link:hover {
    background-color: #fff5f5;
}

.menu-link {
    display: block;
    padding: 10px 20px;
    text-decoration: none;
    color: #333;
    transition: background 0.2s;
}

.menu-link:hover {
    background: #f8f9fa;
}

/* Mobile Specific */
.user-greet {
    font-weight: bold;
    color: #00469c;
}

.logout-text {
    color: #e63946 !important;
    border-top: 1px solid #eee;
    margin-top: 5px;
}

.dropdown-menu {
    min-width: 200px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

/* 🚩 สไตล์ Notification ใหม่ */
.notif-dropdown {
    width: 320px !important;
    right: 0;
    padding: 0 !important;
    overflow: hidden;
    border-radius: 12px;
}

.notif-header {
    padding: 12px 15px;
    font-weight: bold;
    background: #f8f9fa;
    border-bottom: 1px solid #eee;
    color: #333;
}

.no-notif {
    padding: 30px;
    text-align: center;
    color: #999;
}

.notif-item {
    display: flex;
    padding: 15px;
    gap: 12px;
    border-bottom: 1px solid #fafafa;
    transition: background 0.2s;
}

.notif-item:hover {
    background: #f9f9f9;
}

.notif-icon-box {
    font-size: 20px;
    min-width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #f0f2f5;
}

.notif-text strong {
    display: block;
    font-size: 14px;
    margin-bottom: 4px;
    color: #333;
}

.notif-text p {
    font-size: 13px;
    color: #666;
    margin: 0;
    line-height: 1.4;
}

.btn-go-chat {
    margin-top: 10px;
    width: 100%;
    padding: 7px;
    background: #a6c7ee;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

.btn-retry {
    margin-top: 10px;
    width: 100%;
    padding: 7px;
    background: #fff;
    color: #333;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
}

/* ===================== Notification Bell (red alert + animation) ===================== */
.bell-btn {
    position: relative;
    transition: transform 0.2s;
}
.bell-btn.has-alert i.fa-bell {
    color: #ff3b3b;
    text-shadow: 0 0 10px rgba(255, 59, 59, 0.55);
}
.bell-btn:hover { transform: scale(1.05); }

.bell-shake {
    transform-origin: top center;
    animation: bell-shake 1.6s ease-in-out infinite;
}
@keyframes bell-shake {
    0%, 50%, 100% { transform: rotate(0); }
    10% { transform: rotate(-14deg); }
    20% { transform: rotate(12deg); }
    30% { transform: rotate(-10deg); }
    40% { transform: rotate(8deg); }
    55% { transform: rotate(-4deg); }
    62% { transform: rotate(0); }
}

.red-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 11px;
    height: 11px;
    background: #ff2d2d;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 0 rgba(255, 45, 45, 0.6);
    animation: red-dot-pulse 1.8s ease-out infinite;
}
.red-dot-ring {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid rgba(255, 45, 45, 0.55);
    animation: red-dot-ring 1.8s ease-out infinite;
}
@keyframes red-dot-pulse {
    0%   { box-shadow: 0 0 0 0   rgba(255, 45, 45, 0.7); }
    70%  { box-shadow: 0 0 0 8px rgba(255, 45, 45, 0);   }
    100% { box-shadow: 0 0 0 0   rgba(255, 45, 45, 0);   }
}
@keyframes red-dot-ring {
    0%   { transform: scale(1);   opacity: 0.8; }
    100% { transform: scale(2.2); opacity: 0;   }
}

/* ===================== Follow-up dropdown item ===================== */
.notif-item.followup {
    background: linear-gradient(135deg, #ecfeff 0%, #f0f9ff 100%);
}
.notif-icon-box.followup {
    background: linear-gradient(135deg, #06b6d4 0%, #0284c7 100%);
    color: #fff;
}
.btn-go-chat.followup-btn {
    background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%);
    color: #fff;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}
.btn-go-chat.followup-btn:hover { filter: brightness(1.07); }

/* ===================== Bell Toast (LINE/Facebook-like popup) ===================== */
.bell-toast {
    position: fixed;
    top: 86px;
    right: 22px;
    width: 360px;
    max-width: calc(100vw - 24px);
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(14, 165, 233, 0.15);
    padding: 14px 14px 14px 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
    z-index: 99999;
    border-left: 5px solid #0ea5e9;
    overflow: hidden;
}
.bell-toast::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(120deg, rgba(14, 165, 233, 0.08) 0%, transparent 60%);
    pointer-events: none;
}
.bell-toast:hover {
    box-shadow: 0 22px 55px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(14, 165, 233, 0.25);
}
.bell-toast-icon {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, #0ea5e9, #0369a1);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    box-shadow: 0 6px 14px rgba(14, 165, 233, 0.4);
    animation: bell-toast-pulse 1.6s ease-out infinite;
}
@keyframes bell-toast-pulse {
    0%, 100% { box-shadow: 0 6px 14px rgba(14, 165, 233, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(14, 165, 233, 0.18), 0 6px 14px rgba(14, 165, 233, 0.4); }
}
.bell-toast-body { flex: 1; min-width: 0; }
.bell-toast-title {
    font-weight: 800;
    color: #0f172a;
    font-size: 0.98rem;
    line-height: 1.25;
    margin-bottom: 3px;
}
.bell-toast-desc {
    font-size: 0.84rem;
    color: #475569;
    line-height: 1.45;
}
.bell-toast-close {
    position: absolute;
    top: 6px;
    right: 8px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 0.95rem;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
    transition: background 0.15s, color 0.15s;
}
.bell-toast-close:hover { background: #f1f5f9; color: #334155; }

.bell-toast-enter-active,
.bell-toast-leave-active { transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.bell-toast-enter-from { opacity: 0; transform: translateX(60px) scale(0.9); }
.bell-toast-leave-to   { opacity: 0; transform: translateX(60px) scale(0.92); }

@media (max-width: 640px) {
    .bell-toast {
        top: 70px;
        right: 10px;
        left: 10px;
        width: auto;
    }
}
</style>

<style src="@/assets/header.css"></style>