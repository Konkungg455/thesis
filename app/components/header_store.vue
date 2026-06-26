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

            <!-- 🚩 Hamburger dropdown menu (สำหรับมือถือ) — มีกระดิ่ง + lang + theme -->
            <ul class="nav-menu" :class="{ 'show-mobile': mobileOpen }">
                <li class="mobile-only mobile-stack">
                    <div class="mobile-item mobile-bell" :class="{ 'has-alert': hasAlert }"
                         @click.stop="toggleDropdown('notif')">
                        <i class="fa-solid fa-bell" :class="{ 'bell-shake': hasAlert }"></i>
                        <span>การแจ้งเตือน</span>
                        <span v-if="hasAlert" class="mobile-bell-dot"></span>
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

                            <div v-else-if="consultStatus.status === 'completed'" class="notif-item">
                                <div class="notif-icon-box accepted"><i class="fa-solid fa-clipboard-check"></i></div>
                                <div class="notif-text">
                                    <strong>จบการปรึกษาแล้ว</strong>
                                    <p>ครบเวลา 15 นาที กรุณาประเมินผลการให้คำปรึกษาเภสัชกร</p>
                                    <button @click="navigateTo('/review_write'); closeAll()" class="btn-go-chat">
                                        <i class="fa-solid fa-user-doctor"></i> ไปหน้าประเมินเภสัช
                                    </button>
                                </div>
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
                        <NuxtLink to="/shop/profile" class="menu-link" @click="closeAll">
                            <i class="fa-solid fa-user-pen"></i> แก้ไขข้อมูลส่วนตัว
                        </NuxtLink>
                        <NuxtLink to="/shop/prescriptions" class="menu-link" @click="closeAll">
                            <i class="fa-solid fa-file-prescription"></i> ใบสั่งยา PDF ของร้าน
                        </NuxtLink>
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
        <slot />
    </header>

    <LogoutConfirmDialog
        :show="logoutDialog"
        :loading="logoutLoading"
        role="store"
        @confirm="confirmLogout"
        @cancel="logoutDialog = false"
    />
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

/* ================= Notification State (เพิ่มใหม่) ================= */
const consultStatus = ref(null)
let pollTimer = null

const hasAlert = computed(() =>
    !!consultStatus.value && ['waiting', 'accepted', 'completed'].includes(consultStatus.value.status)
)

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

        console.log("ผลลัพธ์จาก PHP:", data); // 🚩 ดูใน Console (F12)

        if (data && data.id && data.status !== 'none') {
            consultStatus.value = data;
        } else {
            consultStatus.value = null;
        }
    } catch (error) {
        console.error("Notification Polling Error:", error);
    }
}

const checkUserStatus = async () => {
    await syncFromServer()
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
</style>

<style src="@/assets/header.css"></style>