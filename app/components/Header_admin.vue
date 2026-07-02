<template>
    <header>
        <nav class="navbar">
            <div class="nav-left">
                <NuxtLink to="/admin_dashboard_page">
                    <img src="https://ik.imagekit.io/pcqen5m7p/Telebotpharcy%20(1)%201%20(2).png" alt="logo"
                        class="logo-img" />
                </NuxtLink>
            </div>

            <button class="btn-hamburger" @click.stop="toggleMobile">
                <i :class="mobileOpen ? 'fas fa-times' : 'fas fa-bars'"></i>
            </button>

            <!-- 🚩 Nav menu สำหรับ Admin — ไม่ต้องมีลิงก์ "หน้าแรก" เพราะเมนู Overview ใน sidebar ทำหน้าที่นี้แล้ว -->
            <ul class="nav-menu" :class="{ 'show-mobile': mobileOpen }">
                <li class="mobile-only mobile-stack">
                    <!-- กระดิ่งแจ้งเตือนใน hamburger dropdown สำหรับมือถือ -->
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
                    <button class="icon-btn bell-btn" :class="{ 'has-alert': hasAlert }"
                            @click.stop="toggleDropdown('notif')" aria-label="Notifications">
                        <i class="fa-solid fa-bell" :class="{ 'bell-shake': hasAlert }"></i>
                        <span v-if="hasAlert" class="red-dot">
                            <span class="red-dot-ring"></span>
                        </span>
                    </button>

                    <div v-if="activeDropdown === 'notif'" class="dropdown-menu notif-dropdown shadow">
                        <div class="notif-header">การแจ้งเตือน</div>
                        <div class="no-notif">ไม่มีการแจ้งเตือนใหม่</div>
                    </div>
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

                <div v-if="user" class="dropdown" ref="profileRef">
                    <div class="dropdown-trigger profile-trigger" @click.stop="toggleDropdown('profile')">
                        <div class="profile-thumb">
                            <img :src="profileImageUrl" :alt="displayName" @error="onImgError" />
                        </div>
                        <span class="username-label">{{ displayName }}</span>
                        <span class="arrow"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div v-if="activeDropdown === 'profile'" class="dropdown-menu">
                        <span class="admin-badge" :class="{ 'super-admin-badge': isSuperAdmin }">
                            <i :class="isSuperAdmin ? 'fa-solid fa-crown' : 'fa-solid fa-shield-halved'"></i>
                            {{ isSuperAdmin ? 'ผู้ดูแลระบบสูงสุด (Super Admin)' : 'ผู้ดูแลระบบ' }}
                        </span>
                        <NuxtLink to="/admin/profile" class="menu-link" @click="closeAll">
                            <i class="fa-solid fa-user-pen"></i> แก้ไขข้อมูลส่วนตัว
                        </NuxtLink>
                        <NuxtLink v-if="isSuperAdmin" to="/admin/admins" class="menu-link" @click="closeAll">
                            <i class="fa-solid fa-user-shield"></i> จัดการแอดมิน
                        </NuxtLink>
                        <button @click="handleLogout" class="btn-logout-link">
                            <i class="fa-solid fa-right-from-bracket"></i> ออกจากระบบ
                        </button>
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
        role="admin"
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

const isSuperAdmin = computed(() => Number(user.value?.is_super_admin) === 1)

/* ================= State ================= */
const mobileOpen = ref(false)
const activeDropdown = ref(null)
const theme = ref("LIGHT")

/* ================= Notification ================= */
const consultStatus = ref(null)
const hasAlert = computed(() =>
    !!consultStatus.value && ['waiting', 'accepted', 'completed'].includes(consultStatus.value.status)
)

/* ================= Refs ================= */
const langRef = ref(null)
const themeRef = ref(null)
const signinRef = ref(null)
const profileRef = ref(null)
const notifRef = ref(null)

const onImgError = (e) => {
    e.target.src = 'https://via.placeholder.com/40'
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

const setLang = (val) => { setLocale(val); closeAll() }

const applyTheme = (val) => {
    applyAppTheme(val)
}

const setTheme = (val) => {
    theme.value = val
    if (process.client) {
        localStorage.setItem("app_theme", val)
    }
    applyTheme(val)
    closeAll()
}

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
    syncFromServer({ force: true })
})

onBeforeUnmount(() => {
    window.removeEventListener("click", handleClickOutside)
})

watch(theme, (val) => {
    applyTheme(val)
})
</script>

<style scoped>
/* Profile Styles — reuse จาก Header */
.profile-trigger {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px 6px 6px;
    border-radius: 30px;
    background: rgba(255, 255, 255, 0.1);
    cursor: pointer;
    transition: 0.2s;
}

.profile-trigger:hover {
    background: rgba(255, 255, 255, 0.2);
}

.profile-thumb {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    background: #fff;
    flex-shrink: 0;
}

.profile-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.username-label {
    color: #fff;
    font-weight: 500;
    font-size: 14px;
}

/* 🚩 Admin badge — แสดงสถานะ "ผู้ดูแลระบบ" */
.admin-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e;
    font-weight: 600;
    font-size: 0.85rem;
    border-bottom: 1px solid #fcd34d;
}
.admin-badge i {
    color: #d97706;
}
/* 🚩 Super Admin variant — สีต่างจากแอดมินทั่วไป (เน้นว่ามีอำนาจสูงสุด) */
.admin-badge.super-admin-badge {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: #fff;
    border-bottom-color: #b45309;
}
.admin-badge.super-admin-badge i {
    color: #fff;
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
    20% { transform: rotate(14deg); }
    30% { transform: rotate(-10deg); }
    40% { transform: rotate(8deg); }
}

.red-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ff3b3b;
    box-shadow: 0 0 0 2px #0d4c9e;
}
.red-dot-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid rgba(255, 59, 59, 0.45);
    animation: ringPulse 1.4s ease-out infinite;
}
@keyframes ringPulse {
    0%   { transform: scale(0.6); opacity: 0.8; }
    100% { transform: scale(1.6); opacity: 0; }
}

.notif-dropdown {
    width: 280px;
    right: 0;
}
.notif-header {
    padding: 12px 16px;
    font-weight: 700;
    color: #1e293b;
    border-bottom: 1px solid #f1f5f9;
}
.no-notif {
    padding: 18px 16px;
    color: #94a3b8;
    text-align: center;
    font-size: 0.9rem;
}

/* menu-link / btn-logout-link icon spacing */
.menu-link {
    display: flex !important;
    align-items: center;
    gap: 8px;
}
.menu-link i { color: #2563eb; }
.btn-logout-link {
    display: flex !important;
    align-items: center;
    gap: 8px;
}
.btn-logout-link i { color: #ef4444; }
</style>

<style src="@/assets/header.css"></style>
