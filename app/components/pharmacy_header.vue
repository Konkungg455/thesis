<template>
    <header>
        <nav class="navbar">
            <div class="nav-left">
                <NuxtLink to="/">
                    <img src="https://ik.imagekit.io/pcqen5m7p/Telebotpharcy%20(1)%201%20(2).png" alt="logo"
                        class="logo-img" />
                </NuxtLink>
            </div>

            <button class="btn-hamburger" @click.stop="toggleMobile">
                <i :class="mobileOpen ? 'fas fa-times' : 'fas fa-bars'"></i>
            </button>

            <ul class="nav-menu" :class="{ 'show-mobile': mobileOpen }">
                <li>
                    <NuxtLink to="/dashboard" @click="closeAll">หน้าหลัก</NuxtLink>
                </li>
                <li>
                    <NuxtLink to="/pharmacy_web" @click="closeAll">ปรึกษาอาการ</NuxtLink>
                </li>
                <li>
                    <NuxtLink to="/Contact_Pharmacy" @click="closeAll">ติดต่อเจ้าหน้าที่</NuxtLink>
                </li>
                <li>
                    <NuxtLink to="/history" @click="closeAll">ประวัติการสั่งยา</NuxtLink>
                </li>
                <li>
                    <NuxtLink to="/tracking" @click="closeAll">ติดตามอาการคนไข้</NuxtLink>
                </li>

                <li class="mobile-only mobile-stack">
                    <!-- 🚩 กระดิ่งแจ้งเตือน — โผล่ใน hamburger dropdown เฉพาะมือถือ -->
                    <div class="mobile-item mobile-bell" :class="{ 'has-alert': hasAnyAlert }"
                         @click.stop="toggleDropdown('notification')">
                        <i class="fa-solid fa-bell" :class="{ 'bell-shake': hasAnyAlert }"></i>
                        <span>การแจ้งเตือน</span>
                        <span v-if="hasAnyAlert" class="mobile-bell-dot"></span>
                    </div>
                    <div class="mobile-item notranslate" translate="no" @click="setLang(language === 'THAI' ? 'ENGLISH' : 'THAI')">
                        <i class="fa-solid fa-globe"></i> {{ language }}
                    </div>
                    <div class="mobile-item notranslate" translate="no" @click="setTheme(theme === 'LIGHT' ? 'DARK' : 'LIGHT')">
                        <i :class="theme === 'LIGHT' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'"></i> {{ theme }}
                    </div>
                </li>
            </ul>

            <div class="nav-right">
                <div class="dropdown" ref="notifRef">
                    <button class="icon-btn bell-btn" :class="{ 'has-alert': hasAnyAlert }" aria-label="Notifications" @click.stop="toggleDropdown('notification')">
                        <i class="fa-solid fa-bell" :class="{ 'bell-shake': hasAnyAlert }"></i>
                        <span v-if="hasAnyAlert" class="red-dot">
                            <span class="red-dot-ring"></span>
                        </span>
                    </button>

                    <transition name="slide">
                        <div v-if="activeDropdown === 'notification'"
                            class="dropdown-menu notification-dropdown shadow">

                            <!-- แจ้งเตือนสถานะร้านยา -->
                            <div v-if="storeStatus?.state === 'unassigned'" class="notif-wrapper alert-block">
                                <div class="notif-header danger"><i class="fa-solid fa-circle-exclamation"></i> ถูกนำออกจากร้านยา</div>
                                <p class="alert-desc">คุณไม่ได้สังกัดร้านยาในขณะนี้ กรุณาเลือกร้านใหม่เพื่อยื่นคำขอกลับเข้าทำงาน</p>
                                <NuxtLink to="/pharmacy/profile" class="btn-rejoin" @click="closeAll">
                                    <i class="fa-solid fa-store"></i> ยื่นคำขอกลับเข้าร้าน
                                </NuxtLink>
                            </div>

                            <div v-else-if="storeStatus?.state === 'pending'" class="notif-wrapper alert-block alert-warn">
                                <div class="notif-header warn"><i class="fa-solid fa-hourglass-half"></i> รอเจ้าของร้านอนุมัติ</div>
                                <p class="alert-desc">{{ storeStatus.message }}</p>
                            </div>

                            <!-- แจ้งเตือนเข้าร่วมร้านยา (เพิ่มเข้าข่ายสำเร็จ) -->
                            <div v-if="showWelcomeNotice" class="notif-wrapper welcome-join-block">
                                <div class="welcome-join-head">
                                    <span class="welcome-join-icon" aria-hidden="true">
                                        <i class="fa-solid fa-circle-check"></i>
                                    </span>
                                    <span class="welcome-join-title">เข้าร่วมร้านยาแล้ว</span>
                                </div>
                                <p class="welcome-join-msg">
                                    คุณได้รับการเพิ่มเข้าร้าน
                                    <strong>{{ storeStatus?.store_name || 'ร้านยา' }}</strong>
                                    เรียบร้อยแล้ว ยินดีต้อนรับสู่ทีม! 🎉
                                </p>
                                <button
                                    type="button"
                                    class="welcome-join-btn"
                                    :disabled="ackWelcomeLoading"
                                    @click="acknowledgeStoreWelcome"
                                >
                                    <i class="fa-solid fa-check"></i>
                                    {{ ackWelcomeLoading ? 'กำลังบันทึก...' : 'รับทราบ' }}
                                </button>
                            </div>

                            <!-- แจ้งเตือนคำขอปรึกษา -->
                            <div v-if="incomingRequest" class="notif-wrapper">
                                <div class="notif-header">คำขอคำปรึกษาใหม่</div>
                                <div class="user-info">
                                    <div class="alert-icon-box">
                                        <i class="fa-solid fa-briefcase-medical"></i>
                                    </div>
                                    <div class="user-text">
                                        <strong>{{ incomingRequest.customer_name }}</strong>
                                        <span v-if="incomingRequest.symptom_name" class="symptom-line" :title="incomingRequest.symptom_name">
                                            <i class="fa-solid fa-stethoscope"></i> อาการ: {{ incomingRequest.symptom_name }}
                                        </span>
                                        <span v-else class="symptom-empty">ยังไม่ระบุอาการ</span>
                                        <span class="wait-text">รอการตอบรับจากคุณ</span>
                                    </div>
                                </div>
                                <!-- ✨ ปุ่มดูประวัติแชท bot ก่อนตัดสินใจ -->
                                <button
                                    v-if="incomingRequest.bot_message_count > 0"
                                    class="btn-view-history"
                                    @click="openBotHistory(incomingRequest)"
                                    :disabled="loadingBotHistory">
                                    <i class="fa-solid fa-robot"></i>
                                    ดูประวัติแชทกับ AI
                                    <span class="msg-count-badge">{{ incomingRequest.bot_message_count }}</span>
                                </button>
                                <div class="action-btns">
                                    <button @click="updateRequestStatus('accepted')" class="btn-accept">
                                        <i class="fa-solid fa-circle-check"></i> รับเคส
                                    </button>
                                    <button @click="updateRequestStatus('rejected')" class="btn-reject">
                                        <i class="fa-solid fa-circle-xmark"></i> ปฏิเสธ
                                    </button>
                                </div>
                            </div>

                            <div v-if="!incomingRequest && !hasStoreAlert && !showWelcomeNotice" class="notif-empty">
                                ไม่มีคำขอใหม่ในขณะนี้
                            </div>
                        </div>
                    </transition>
                </div>

                <div class="dropdown notranslate" translate="no" ref="langRef">
                    <div class="dropdown-trigger" @click.stop="toggleDropdown('lang')">
                        <i class="fa-solid fa-globe"></i> {{ language }} 
                        <span class="arrow"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div v-if="activeDropdown === 'lang'" class="dropdown-menu">
                        <button @click="setLang('THAI')">THAI</button>
                        <button @click="setLang('ENGLISH')">ENGLISH</button>
                    </div>
                </div>

                <div class="dropdown notranslate" translate="no" ref="themeRef">
                    <div class="dropdown-trigger" @click.stop="toggleDropdown('theme')">
                        <i :class="theme === 'LIGHT' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'"></i> {{ theme }} 
                        <span class="arrow"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div v-if="activeDropdown === 'theme'" class="dropdown-menu">
                        <button @click="setTheme('LIGHT')">LIGHT</button>
                        <button @click="setTheme('DARK')">DARK</button>
                    </div>
                </div>

                <div class="dropdown" ref="profileRef">
                    <div v-if="user" class="dropdown-trigger profile-trigger" @click.stop="toggleDropdown('profile')">
                        <div class="profile-thumb">
                            <img :src="profileImageUrl" :alt="displayName" @error="onImgError" />
                        </div>
                        <span class="username-label">{{ displayName }}</span>
                        <span class="arrow"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div v-if="user && activeDropdown === 'profile'" class="dropdown-menu">
                        <NuxtLink to="/pharmacy/profile" class="menu-link" @click="closeAll">แก้ไขข้อมูลส่วนตัว</NuxtLink>
                        <button @click="handleLogout" class="btn-logout-link">ออกจากระบบ</button>
                    </div>

                    <div v-if="!user" class="dropdown" ref="signinRef">
                        <button class="btn-signin" @click.stop="toggleDropdown('signin')">
                            Sign in <span class="arrow"><i class="fa-solid fa-chevron-down"></i></span>
                        </button>
                        <div v-if="activeDropdown === 'signin'" class="dropdown-menu">
                            <NuxtLink to="/auth/login-pharmacist" class="menu-link" @click="closeAll">เข้าสู่ระบบเภสัช</NuxtLink>
                            <NuxtLink to="/auth" class="menu-link" @click="closeAll">เลือกประเภทบัญชี</NuxtLink>
                            <NuxtLink to="/auth/register-pharmacist" class="menu-link" @click="closeAll">สมัครเภสัชกร</NuxtLink>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
        <slot />
    </header>

    <LogoutConfirmDialog
        :show="logoutDialog"
        :loading="logoutLoading"
        role="pharmacist"
        @confirm="confirmLogout"
        @cancel="logoutDialog = false"
    />

    <!-- ✨ MODAL: ดูประวัติแชท bot ก่อนตัดสินใจรับ/ปฏิเสธ -->
    <transition name="modal-fade">
        <div v-if="showBotHistoryModal" class="bot-history-overlay" @click.self="closeBotHistory">
            <div class="bot-history-modal">
                <div class="bot-history-modal__header">
                    <div class="bot-history-modal__header-info">
                        <div class="bot-avatar"><i class="fa-solid fa-user-injured"></i></div>
                        <div>
                            <div class="bot-history-modal__title">
                                ประวัติการคุยกับ AI ของ <strong>{{ botHistory.patient_name }}</strong>
                            </div>
                            <div v-if="botHistory.symptom_name" class="bot-history-modal__symptom">
                                <i class="fa-solid fa-stethoscope"></i>
                                อาการที่แจ้ง: <strong>{{ botHistory.symptom_name }}</strong>
                            </div>
                            <div class="bot-history-modal__meta">
                                {{ botHistory.message_count }} ข้อความ · เซสชัน {{ shortSession(botHistory.session_id) }}
                            </div>
                        </div>
                    </div>
                    <button class="bot-history-modal__close" @click="closeBotHistory" aria-label="ปิด">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="bot-history-modal__body">
                    <div v-if="loadingBotHistory" class="bot-history-loading">
                        <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดประวัติ...
                    </div>
                    <div v-else-if="botHistory.data && botHistory.data.length > 0" class="bot-history-messages">
                        <div v-for="(msg, idx) in botHistory.data" :key="idx"
                             :class="['bh-msg', msg.role === 'user' ? 'bh-msg--user' : 'bh-msg--bot']">
                            <div class="bh-msg__avatar">
                                <i :class="msg.role === 'user' ? 'fa-solid fa-user' : 'fa-solid fa-robot'"></i>
                            </div>
                            <div class="bh-msg__bubble">
                                <div class="bh-msg__text">{{ msg.message }}</div>
                                <div class="bh-msg__time">{{ formatBhTime(msg.created_at) }}</div>
                            </div>
                        </div>
                    </div>
                    <div v-else class="bot-history-empty">
                        <i class="fa-solid fa-comment-slash"></i>
                        <p>ไม่พบประวัติแชทกับ AI ของคนไข้คนนี้</p>
                    </div>
                </div>

                <div class="bot-history-modal__footer">
                    <button class="btn-ghost" @click="closeBotHistory">ปิดหน้าต่าง</button>
                    <button class="btn-primary" @click="acceptFromModal" :disabled="loadingBotHistory">
                        <i class="fa-solid fa-circle-check"></i> รับเคสนี้
                    </button>
                </div>
            </div>
        </div>
    </transition>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from "vue"
import { useApiBase } from "~/composables/useApiBase"
import { useAuthUser } from "~/composables/useAuthUser"
import { applyAppTheme } from '~/composables/useAppTheme'

const { apiUrl } = useApiBase()
const { user, displayName, profileImageUrl, syncFromServer, clearUser } = useAuthUser()
const { language, setLocale, initLocale } = useAppLocale()

/* ================= State ================= */
const mobileOpen = ref(false)
const activeDropdown = ref(null)
const theme = ref("LIGHT")

/* ================= Notification State (สำหรับเภสัช) ================= */
const incomingRequest = ref(null) 
const storeStatus = ref(null) // {state: 'active'|'pending'|'unassigned', message, store_name}
let pollTimer = null
let lastIncomingReqId = 0

const playNotificationSound = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (!AudioCtx) return
        const ctx = new AudioCtx()
        const playBeep = (freq, delay, duration = 0.18) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = 'sine'
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

/* ================= Bot History Modal ================= */
const showBotHistoryModal = ref(false)
const loadingBotHistory = ref(false)
const botHistory = ref({
    patient_id: 0,
    patient_name: '',
    session_id: '',
    symptom_name: '',
    message_count: 0,
    data: [],
})

const shortSession = (s) => {
    if (!s) return '-'
    return s.length > 12 ? s.substring(0, 8) + '...' : s
}

const formatBhTime = (ts) => {
    if (!ts) return ''
    try {
        const d = new Date(ts.replace(' ', 'T'))
        if (isNaN(d.getTime())) return ts
        return d.toLocaleString('th-TH', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'
        })
    } catch { return ts }
}

// แสดงเฉพาะ session ที่ผู้ป่วยกำลังคุยอยู่ตอนกดปรึกษา (มาจาก consult_request.bot_session_id)
const openBotHistory = async (req) => {
    if (!req) return
    const u_id = req.id_account ?? req.customer_id
    if (!u_id) return
    loadingBotHistory.value = true
    showBotHistoryModal.value = true
    botHistory.value = {
        patient_id: u_id,
        patient_name: req.customer_name || ('คนไข้ #' + u_id),
        session_id: req.bot_session_id || '',
        symptom_name: req.symptom_name || '',
        message_count: req.bot_message_count || 0,
        data: [],
    }
    try {
        const qs = new URLSearchParams({ u_id: String(u_id) })
        if (req.bot_session_id) qs.set('session_id', req.bot_session_id)
        const res = await $fetch(apiUrl(`consult-handler.php?action=get_user_bot_history&${qs.toString()}`), {
            credentials: 'include'
        })
        if (res && res.status === 'success') {
            botHistory.value = {
                patient_id: res.patient_id || u_id,
                patient_name: res.patient_name || req.customer_name || ('คนไข้ #' + u_id),
                session_id: res.session_id || '',
                symptom_name: res.symptom_name || req.symptom_name || '',
                message_count: res.message_count || 0,
                data: Array.isArray(res.data) ? res.data : [],
            }
        } else {
            botHistory.value.data = []
        }
    } catch (e) {
        console.error('โหลดประวัติแชท bot ไม่สำเร็จ:', e)
        botHistory.value.data = []
    } finally {
        loadingBotHistory.value = false
    }
}

const closeBotHistory = () => { showBotHistoryModal.value = false }

const acceptFromModal = async () => {
    closeBotHistory()
    await updateRequestStatus('accepted')
}

const hasStoreAlert = computed(() =>
    storeStatus.value && (storeStatus.value.state === 'unassigned' || storeStatus.value.state === 'pending')
)
const showWelcomeNotice = computed(() =>
    !!storeStatus.value?.welcome_pending && storeStatus.value?.state === 'active'
)
const hasAnyAlert = computed(() =>
    !!incomingRequest.value || hasStoreAlert.value || showWelcomeNotice.value
)

const ackWelcomeLoading = ref(false)
const welcomeAutoOpened = ref(false)

/* ================= Refs ================= */
const langRef = ref(null)
const themeRef = ref(null)
const profileRef = ref(null)
const notifRef = ref(null)
const signinRef = ref(null)

const onImgError = (e) => {
    e.target.src = 'https://via.placeholder.com/40'
}

/* ================= Functions ================= */

// 1. ฟังก์ชันเช็คคำขอจากคนไข้ (Polling)
const checkIncomingRequest = async () => {
    if (!user.value) return;
    try {
        const data = await $fetch(apiUrl(`consult-handler.php?action=check_pharma_request&t=${Date.now()}`), {
            credentials: 'include'
        });
        const next = data && data.id && data.status === 'waiting' ? data : null;
        const nextId = next ? Number(next.id) : 0;
        if (nextId > 0 && nextId !== lastIncomingReqId) {
            if (lastIncomingReqId > 0) {
                playNotificationSound();
                if (!activeDropdown.value) activeDropdown.value = 'notification';
            }
            lastIncomingReqId = nextId;
        }
        if (!next) lastIncomingReqId = 0;
        incomingRequest.value = next;
    } catch (error) {
        console.error("Pharma Polling Error:", error);
    }
}

// 1.5 ตรวจสอบสถานะร้านที่สังกัด (ถูก kick / รออนุมัติ / แจ้งเข้าร้านใหม่)
const checkStoreStatus = async () => {
    if (!user.value) return;
    try {
        const data = await $fetch(apiUrl('get-pharma-store-status.php'), { credentials: 'include' });
        if (data?.status === 'success') {
            storeStatus.value = data;
            if (data.welcome_pending && data.state === 'active' && !welcomeAutoOpened.value) {
                activeDropdown.value = 'notification';
                welcomeAutoOpened.value = true;
            }
            if (!data.welcome_pending) {
                welcomeAutoOpened.value = false;
            }
        }
    } catch (e) {
        // เงียบไว้ — ไม่ critical
    }
}

const acknowledgeStoreWelcome = async () => {
    if (ackWelcomeLoading.value) return;
    ackWelcomeLoading.value = true;
    try {
        const data = await $fetch(apiUrl('ack-pharma-store-welcome.php'), {
            method: 'POST',
            credentials: 'include'
        });
        if (data?.status === 'success') {
            await checkStoreStatus();
            closeAll();
        }
    } catch (e) {
        console.error('Ack welcome error:', e);
    } finally {
        ackWelcomeLoading.value = false;
    }
}

// 2. ฟังก์ชันกด "รับงาน" หรือ "ปฏิเสธ" (ซ่อมแซมการแชร์ค่าไปหน้าแชทถาวร)
const updateRequestStatus = async (status) => {
    if (!incomingRequest.value) return;

    const body = new FormData();
    body.append('request_id', incomingRequest.value.id);
    body.append('status', status); 

    try {
        const res = await $fetch(apiUrl('consult-handler.php?action=update_status'), {
            method: 'POST',
            body,
            credentials: 'include'
        });

        if (res.status === 'success') {
            if (status === 'accepted') {
                const patientId = incomingRequest.value.id_account ?? incomingRequest.value.customer_id;
                const patientName = incomingRequest.value.customer_name || '';

                if (patientId) {
                    const pharmaId = user.value?.id_pharma || user.value?.id || 'guest';
                    localStorage.setItem('bell-incoming-patient-id', String(patientId));
                    if (patientName) {
                        localStorage.setItem('bell-incoming-patient-name', patientName);
                    }
                    const sideKey = `pharma-sidebar-patients-${pharmaId}`;
                    let list = [];
                    try {
                        const raw = localStorage.getItem(sideKey);
                        if (raw) list = JSON.parse(raw);
                    } catch { /* ignore */ }
                    const nId = Number(patientId);
                    if (!list.includes(nId)) {
                        list.push(nId);
                        localStorage.setItem(sideKey, JSON.stringify(list.sort((a, b) => a - b)));
                    }
                    await navigateTo(`/pharmacy_web?id=${patientId}`);
                } else {
                    await navigateTo('/pharmacy_web');
                }
            }
            incomingRequest.value = null; // ล้างแถบแจ้งเตือนหลังจากประมวลผลเสร็จสิ้น
            closeAll();
        }
    } catch (error) {
        console.error("Update Status Error:", error);
    }
}

const checkUserStatus = () => {
    syncFromServer().catch(() => {})
    if (user.value) {
        checkIncomingRequest()
        checkStoreStatus()
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
    } catch (e) { console.error("Logout Error:", e) }
    clearUser()
    logoutDialog.value = false
    logoutLoading.value = false
    window.location.href = '/'
}

const closeAll = () => { activeDropdown.value = null; mobileOpen.value = false; }
const toggleDropdown = (name) => { activeDropdown.value = activeDropdown.value === name ? null : name }
const toggleMobile = () => { mobileOpen.value = !mobileOpen.value }
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

const handleClickOutside = (event) => {
    const refs = [langRef, themeRef, profileRef, notifRef, signinRef]
    if (!refs.some(r => r.value?.contains(event.target))) closeAll()
}

onMounted(() => {
    initLocale()
    const savedTheme = localStorage.getItem("app_theme")
    if (savedTheme === "DARK" || savedTheme === "LIGHT") {
        theme.value = savedTheme
    }
    applyTheme(theme.value)

    window.addEventListener("click", handleClickOutside)
    checkUserStatus()
    pollTimer = setInterval(() => {
        checkIncomingRequest()
        checkStoreStatus()
    }, 5000);
})

onBeforeUnmount(() => {
    window.removeEventListener("click", handleClickOutside)
    if (pollTimer) clearInterval(pollTimer);
})

watch(theme, (val) => { applyTheme(val) })
</script>

<style scoped>
/* ===== เข้าร่วมร้านยา — ใน dropdown แจ้งเตือน ===== */
.welcome-join-block {
    padding: 16px;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    margin-bottom: 12px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}
.welcome-join-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}
.welcome-join-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    flex-shrink: 0;
}
.welcome-join-title {
    font-size: 15px;
    font-weight: 700;
    color: #1e293b;
}
.welcome-join-msg {
    margin: 0 0 14px;
    font-size: 13px;
    line-height: 1.55;
    color: #475569;
}
.welcome-join-msg strong { color: #1e3a8a; }
.welcome-join-btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: #fff;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
}
.welcome-join-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(34, 197, 94, 0.32);
}
.welcome-join-btn:disabled { opacity: 0.7; cursor: wait; }

/* จัดการตำแหน่ง Dropdown แจ้งเตือน */
.notification-dropdown {
    width: min(340px, calc(100vw - 24px));
    right: 0;
    padding: 15px !important;
    /* Override default if needed */
    cursor: default;
}

.notif-header {
    font-size: 14px;
    font-weight: bold;
    color: #2c3e50;
    margin-bottom: 12px;
    border-bottom: 1px solid #f0f0f0;
    padding-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.notif-header.danger { color: #b91c1c; }
.notif-header.warn { color: #b45309; }

.alert-block {
    padding: 14px;
    border-radius: 10px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    margin-bottom: 12px;
}
.alert-block.alert-warn {
    background: #fefce8;
    border-color: #fde68a;
}
.alert-desc {
    font-size: 12px;
    color: #475569;
    line-height: 1.5;
    margin: 0 0 10px;
}
.btn-rejoin {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    background: linear-gradient(135deg, #ef4444, #b91c1c);
    color: white !important;
    padding: 9px 14px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 13px;
    transition: 0.2s;
}
.btn-rejoin:hover { transform: translateY(-1px); box-shadow: 0 6px 12px rgba(239,68,68,0.3); }

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

/* รายละเอียดคนไข้ */
.user-info {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 15px;
}

.alert-icon-box {
    background: #e6f7ff;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    font-size: 20px;
}

.user-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
}

.user-text strong {
    font-size: 14px;
    color: #1f2937;
    font-weight: 700;
}

.user-text .symptom-line {
    font-size: 12px;
    color: #b45309;
    background: linear-gradient(90deg, #fef3c7 0%, #fde68a 100%);
    padding: 3px 8px;
    border-radius: 6px;
    border-left: 3px solid #f59e0b;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}
.user-text .symptom-line i { font-size: 10px; }
.user-text .symptom-empty {
    font-size: 11px;
    color: #94a3b8;
    font-style: italic;
}
.user-text .wait-text {
    font-size: 11px;
    color: #6b7280;
    margin-top: 1px;
}

/* ✨ ปุ่มดูประวัติแชท bot */
.btn-view-history {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    background: linear-gradient(135deg, #ffffff 0%, #eef2ff 100%);
    color: #4338ca;
    border: 1.5px solid #c7d2fe;
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: 10px;
    position: relative;
    box-shadow: 0 2px 6px rgba(67, 56, 202, 0.08);
}
.btn-view-history:hover:not(:disabled) {
    background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
    border-color: #818cf8;
    transform: translateY(-1px);
    box-shadow: 0 5px 14px rgba(67, 56, 202, 0.2);
}
.btn-view-history:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-view-history i.fa-robot {
    color: #6366f1;
    font-size: 14px;
}
.msg-count-badge {
    background: #4338ca;
    color: #fff;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    margin-left: auto;
    font-weight: 800;
}

/* ปุ่ม Action สำหรับเภสัช */
.action-btns {
    display: flex;
    gap: 10px;
}

.btn-accept,
.btn-reject {
    flex: 1;
    border: none;
    padding: 8px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.2s ease;
}

.btn-accept {
    background-color: #52c41a;
    color: white;
}

.btn-reject {
    background-color: #f5f5f5;
    color: #595959;
}

.btn-accept:hover {
    background-color: #45a016;
}

.btn-reject:hover {
    background-color: #e8e8e8;
}

.notif-empty {
    text-align: center;
    padding: 10px;
    color: #bfbfbf;
    font-size: 13px;
}

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

/* ============================================================
   ✨ BOT HISTORY MODAL
   ============================================================ */
.bot-history-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(4px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: bhFadeIn 0.18s ease;
}
@keyframes bhFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
}

.bot-history-modal {
    background: #fff;
    width: 100%;
    max-width: 640px;
    max-height: 86vh;
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.3);
    animation: bhPop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes bhPop {
    from { opacity: 0; transform: scale(0.94) translateY(10px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
}

.bot-history-modal__header {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: #fff;
    padding: 18px 22px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
}
.bot-history-modal__header-info {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex: 1;
    min-width: 0;
}
.bot-avatar {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
    backdrop-filter: blur(6px);
}
.bot-history-modal__title {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.45;
    margin-bottom: 4px;
}
.bot-history-modal__title strong { font-weight: 800; }
.bot-history-modal__symptom {
    font-size: 12.5px;
    background: rgba(255, 255, 255, 0.18);
    padding: 4px 10px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 4px;
    border-left: 3px solid #fde68a;
}
.bot-history-modal__symptom strong { color: #fef9c3; }
.bot-history-modal__meta {
    font-size: 11px;
    opacity: 0.85;
}
.bot-history-modal__close {
    background: rgba(255, 255, 255, 0.18);
    border: none;
    color: #fff;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    flex-shrink: 0;
}
.bot-history-modal__close:hover { background: rgba(255, 255, 255, 0.32); }

.bot-history-modal__body {
    flex: 1;
    overflow-y: auto;
    padding: 18px 18px 14px;
    background: #f8fafc;
    min-height: 200px;
}
.bot-history-loading {
    text-align: center;
    padding: 40px 20px;
    color: #6b7280;
    font-size: 14px;
}
.bot-history-loading i { margin-right: 8px; color: #6366f1; }

.bot-history-empty {
    text-align: center;
    padding: 50px 20px;
    color: #9ca3af;
}
.bot-history-empty i {
    font-size: 38px;
    margin-bottom: 12px;
    display: block;
    color: #cbd5e1;
}
.bot-history-empty p { font-size: 14px; margin: 0; }

.bot-history-messages {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.bh-msg {
    display: flex;
    gap: 9px;
    align-items: flex-start;
}
.bh-msg--user { flex-direction: row-reverse; }
.bh-msg__avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
}
.bh-msg--user .bh-msg__avatar {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: #fff;
}
.bh-msg--bot .bh-msg__avatar {
    background: linear-gradient(135deg, #ddd6fe, #c4b5fd);
    color: #5b21b6;
}
.bh-msg__bubble {
    max-width: 75%;
    padding: 10px 14px;
    border-radius: 14px;
    font-size: 13px;
    line-height: 1.55;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    word-wrap: break-word;
}
.bh-msg--user .bh-msg__bubble {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #fff;
    border-bottom-right-radius: 4px;
}
.bh-msg--bot .bh-msg__bubble {
    background: #fff;
    color: #1f2937;
    border: 1px solid #e5e7eb;
    border-bottom-left-radius: 4px;
}
.bh-msg__text {
    white-space: pre-wrap;
    word-break: break-word;
}
.bh-msg__time {
    font-size: 10px;
    margin-top: 4px;
    opacity: 0.7;
    text-align: right;
}
.bh-msg--bot .bh-msg__time { color: #94a3b8; }

.bot-history-modal__footer {
    padding: 14px 18px;
    background: #fff;
    border-top: 1px solid #e5e7eb;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}
.bot-history-modal__footer .btn-ghost {
    background: #f3f4f6;
    color: #4b5563;
    border: none;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
}
.bot-history-modal__footer .btn-ghost:hover { background: #e5e7eb; }
.bot-history-modal__footer .btn-primary {
    background: linear-gradient(135deg, #10b981, #059669);
    color: #fff;
    border: none;
    padding: 9px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.18s;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}
.bot-history-modal__footer .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}
.bot-history-modal__footer .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }

@media (max-width: 560px) {
    .bot-history-modal { max-height: 92vh; border-radius: 14px; }
    .bot-history-modal__header { padding: 14px 16px; }
    .bot-history-modal__body { padding: 14px 12px; }
    .bh-msg__bubble { max-width: 82%; font-size: 12.5px; }
    .bot-avatar { width: 38px; height: 38px; font-size: 15px; }
    .bot-history-modal__title { font-size: 14px; }
}
</style>

<style src="@/assets/header.css"></style>