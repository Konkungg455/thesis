<script setup>
import { ref, computed, onMounted } from 'vue'

/**
 * 🚩 AdminLayout — โครงหลักของทุกหน้าใน admin/
 * ไฟล์: app/components/admin/Layout.vue → ใช้เป็น <AdminLayout> (Nuxt auto import)
 *
 * รวม Header_admin + Mobile topbar + Sidebar + Slot (เนื้อหา) + Footer
 *
 * Usage:
 *   <AdminLayout active-tab="pharma">
 *     ... เนื้อหาหน้า ...
 *     <template #overlays>... โมดอลที่ต้องอยู่นอก main ...</template>
 *   </AdminLayout>
 */

const props = defineProps({
  // ระบุ tab ปัจจุบันเพื่อให้ sidebar ไฮไลต์ถูก
  activeTab: {
    type: String,
    required: true,
    validator: v => ['overview', 'pharma', 'user', 'partner', 'prescriptions', 'pending', 'service', 'admins'].includes(v),
  },
})

const { user } = useAuthUser()
const route = useRoute()
const isSidebarOpen = ref(false)
const pendingCount = ref(0)
const pendingAdminCount = ref(0)
const isSuperAdmin = computed(() => Number(user.value?.is_super_admin) === 1)

// 🚩 รายการเมนูทั้งหมด — ใช้ path จริงเพื่อ navigate ระหว่างหน้า
const MENU_ITEMS = computed(() => {
  const items = [
    { id: 'overview',      label: 'Overview',                 icon: 'fa-chart-pie',         path: '/admin_dashboard_page' },
    { id: 'pharma',        label: 'เภสัชกร',                   icon: 'fa-capsules',          path: '/admin/pharmacist_user' },
    { id: 'user',          label: 'ผู้ใช้บริการ',                  icon: 'fa-user-injured',      path: '/admin/user_user' },
    { id: 'partner',       label: 'ร้านยาพาร์ทเนอร์',           icon: 'fa-store',             path: '/admin/phacmacy_shop' },
    { id: 'prescriptions', label: 'ติดตามการบันทึกยา PDF',   icon: 'fa-file-prescription', path: '/admin/prescriptions_admin' },
    { id: 'pending',       label: 'รอดำเนินการ',              icon: 'fa-address-card',      path: '/admin/continue_pharmacist' },
    { id: 'service',       label: 'การใช้บริการ',             icon: 'fa-clipboard-list',    path: '/admin/usage' },
  ]
  // 🚩 เพิ่มเมนู "จัดการแอดมิน" เฉพาะ Super Admin
  if (isSuperAdmin.value) {
    items.push({ id: 'admins', label: 'จัดการแอดมิน', icon: 'fa-user-shield', path: '/admin/admins' })
  }
  return items
})

// 🚩 ป้ายชื่อ tab ปัจจุบัน (ใช้ใน mobile topbar)
const tabLabelMap = {
  overview: 'Overview',
  pharma: 'เภสัชกร',
  user: 'ผู้ใช้บริการ',
  partner: 'ร้านยาพาร์ทเนอร์',
  prescriptions: 'ติดตามการบันทึกยา PDF',
  pending: 'รอดำเนินการ',
  service: 'การใช้บริการ',
  admins: 'จัดการแอดมิน',
}
const currentMenuLabel = computed(() => tabLabelMap[props.activeTab] || 'แผงควบคุม')

// 🚩 navigate ไปหน้าที่ระบุใน menu (ใช้แทน switchTab เดิม)
const goTo = (path) => {
  isSidebarOpen.value = false
  if (route.path === path) return
  navigateTo(path)
}

// 🚩 ดึงจำนวนเภสัชกรที่รออนุมัติ — แสดง badge บนเมนู
const fetchPendingCount = async () => {
  try {
    const base = useNuxtApp().$getApiBase()
    const res = await $fetch(`${base}/get-pharma.php`, { credentials: 'include' })
    if (res?.status === 'success' || res?.authenticated) {
      const data = Array.isArray(res.data) ? res.data : [res.data]
      pendingCount.value = data.filter(item => item?.status_verify == 0).length
    }
  } catch (_) {
    pendingCount.value = 0
  }
}

// 🚩 ดึงจำนวนแอดมินที่รออนุมัติ (เฉพาะ super admin)
const fetchPendingAdminCount = async () => {
  if (!isSuperAdmin.value) return
  try {
    const base = useNuxtApp().$getApiBase()
    const res = await $fetch(`${base}/admin-list-admins.php?status=pending&t=${Date.now()}`, { credentials: 'include' })
    if (res?.status === 'success') {
      pendingAdminCount.value = (res.items || []).length
    }
  } catch (_) {
    pendingAdminCount.value = 0
  }
}

onMounted(() => {
  fetchPendingCount()
  fetchPendingAdminCount()
})

defineExpose({ pendingCount, refreshPending: fetchPendingCount })
</script>

<template>
  <div class="admin-layout" :class="{ 'sidebar-open': isSidebarOpen }">
    <Header_admin />

    <!-- 🚩 Mobile topbar -->
    <div class="mobile-topbar">
      <button class="hamburger-btn" @click="isSidebarOpen = true" aria-label="เปิดเมนู">
        <i class="fa-solid fa-bars"></i>
      </button>
      <div class="mobile-title">
        <i class="fa-solid fa-shield-halved"></i>
        <span>{{ currentMenuLabel }}</span>
      </div>
      <span v-if="pendingCount > 0" class="mobile-badge" @click="goTo('/admin/continue_pharmacist')">
        {{ pendingCount }}
      </span>
    </div>

    <div class="main-content">
      <transition name="overlay-fade">
        <div v-if="isSidebarOpen" class="sidebar-overlay" @click="isSidebarOpen = false"></div>
      </transition>

      <aside class="sidebar" :class="{ open: isSidebarOpen }">
        <div class="sidebar-header">
          <span><i class="fa-solid fa-shield-halved"></i> ADMIN PANEL</span>
          <button class="sidebar-close" @click="isSidebarOpen = false" aria-label="ปิดเมนู">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <nav class="menu-list">
          <button
            v-for="item in MENU_ITEMS"
            :key="item.id"
            class="menu-btn"
            :class="{ active: activeTab === item.id }"
            @click="goTo(item.path)"
          >
            <i class="fa-solid" :class="item.icon"></i>
            <span>{{ item.label }}</span>
            <span v-if="item.id === 'pending' && pendingCount > 0" class="menu-badge">
              {{ pendingCount }}
            </span>
            <span v-if="item.id === 'admins' && pendingAdminCount > 0" class="menu-badge">
              {{ pendingAdminCount }}
            </span>
          </button>
        </nav>
      </aside>

      <main class="view-container">
        <!-- 🚩 เนื้อหาหลักของแต่ละหน้า -->
        <slot />
      </main>
    </div>

    <!-- 🚩 modal / lightbox / overlay เพิ่มเติมที่ต้องอยู่นอก main-content -->
    <slot name="overlays" />

    <Footer />
  </div>
</template>

<style scoped>
@import "@/assets/admin_dashboard_page.css";
@import "@/assets/admin-shared.css";
</style>
