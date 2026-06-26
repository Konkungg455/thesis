<script setup>
/**
 * 🚩 /admin/phacmacy_shop — ร้านยาพาร์ทเนอร์ (ดู/แก้ไขข้อมูล + ตารางเวลาเปิด-ปิด)
 */
import { ref, computed, onMounted, watch } from 'vue'

definePageMeta({ middleware: 'admin-only' })

const allData = ref([])
const searchQuery = ref('')
const isLoading = ref(false)
const selectedData = ref(null)
const showModal = ref(false)

// 🚩 image preview (ใบรับรองร้านยา)
const isShowImagePreview = ref(false)
const imagePreviewUrl = ref('')

// 🚩 แท็บกรองตาม admin_status: 'all' | 'pending' | 'approved' | 'rejected'
const statusFilter = ref('approved')
const deletedFilter = ref('active')
const reviewLoading = ref(false)
const reviewNote = ref('')
const popupLoading = ref(false)
const actionPopup = ref({
  show: false,
  tone: 'danger',
  title: '',
  message: '',
  detail: '',
  confirmText: 'ยืนยัน',
  confirmOnly: false,
  action: null,
  id: null,
})

// 🚩 state สำหรับ Modal ร้านยา
const isLoadingPartner = ref(false)
const isSavingPartner = ref(false)
const partnerError = ref('')
const partnerSuccess = ref('')
const partnerForm = ref({
  id: '',
  username: '',
  firstname: '',
  lastname: '',
  personal_phone: '',
  personal_email: '',
  store_name: '',
  house_no: '',
  road: '',
  sub_district: '',
  district: '',
  province: '',
  zipcode: '',
  store_phone: '',
  store_email: '',
  google_maps_url: '',
  license_file: '',
  license_url: '',
})

// 🚩 URL ของรูปใบรับรองร้านยา (รองรับทั้ง license_url ที่ backend ส่งมา และ license_file)
const licenseImageUrl = computed(() => {
  const base = useNuxtApp().$getApiBase()
  const rel = partnerForm.value.license_url
  if (rel) return rel.startsWith('http') ? rel : `${base}/${rel.replace(/^\//, '')}`
  const file = partnerForm.value.license_file
  if (file) return `${base}/uploads/licenses/${file}`
  return ''
})

const openImagePreview = (url) => {
  if (!url) return
  imagePreviewUrl.value = url
  isShowImagePreview.value = true
}
const closeImagePreview = () => {
  isShowImagePreview.value = false
  imagePreviewUrl.value = ''
}
const partnerSchedules = ref([])
const DAY_OPTIONS = [
  { value: 'Mon', label: 'จันทร์' },
  { value: 'Tue', label: 'อังคาร' },
  { value: 'Wed', label: 'พุธ' },
  { value: 'Thu', label: 'พฤหัสบดี' },
  { value: 'Fri', label: 'ศุกร์' },
  { value: 'Sat', label: 'เสาร์' },
  { value: 'Sun', label: 'อาทิตย์' },
]

const tabMeta = {
  label: 'ร้านยาพาร์ทเนอร์',
  title: 'ร้านยาพาร์ทเนอร์',
  subtitle: 'ร้านยาที่เข้าร่วมเป็นพาร์ทเนอร์ในเครือข่ายของเรา',
  icon: 'fa-solid fa-store',
  statLabel: 'ร้านพาร์ทเนอร์',
  placeholder: 'ค้นหาชื่อร้านยา / จังหวัด / เบอร์โทร...',
}

const handleFetch = async () => {
  isLoading.value = true
  try {
    const base = useNuxtApp().$getApiBase()
    const deletedParam = deletedFilter.value === 'deleted' ? '?deleted=1' : ''
    const res = await $fetch(`${base}/get-stores.php${deletedParam}`, { credentials: 'include' })
    if (res?.status === 'success') {
      allData.value = Array.isArray(res.stores) ? res.stores : []
    } else {
      allData.value = []
    }
  } catch (err) {
    console.error('Fetch error:', err)
    allData.value = []
  } finally {
    isLoading.value = false
  }
}

const statusCounts = computed(() => {
  const counts = { all: allData.value.length, pending: 0, approved: 0, rejected: 0 }
  allData.value.forEach(item => {
    const s = item.admin_status || 'approved'
    if (counts[s] !== undefined) counts[s]++
  })
  return counts
})

const filteredList = computed(() => {
  let list = allData.value
  if (statusFilter.value !== 'all') {
    list = list.filter(item => (item.admin_status || 'approved') === statusFilter.value)
  }
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return list
  return list.filter(item =>
    item.store_name?.toLowerCase().includes(q) ||
    item.province?.toLowerCase().includes(q) ||
    item.district?.toLowerCase().includes(q) ||
    item.store_phone?.toLowerCase().includes(q) ||
    item.store_email?.toLowerCase().includes(q) ||
    item.address?.toLowerCase().includes(q)
  )
})

const {
  PAGE_SIZE_OPTIONS,
  pageSize,
  currentPage,
  totalPages,
  pagedList,
  pageStart,
  pageEnd,
  pageNumbers,
  goToPage,
  resetPage,
} = useTablePagination(filteredList)

watch([searchQuery, statusFilter, deletedFilter], () => resetPage())
watch(deletedFilter, () => handleFetch())

// 🚩 ตั้งค่า partnerForm จากข้อมูลใน list (ใช้ก่อน fetch detail)
const resetPartnerFormFromList = (item) => {
  partnerForm.value = {
    id: item.id || '',
    username: item.username || '',
    firstname: item.firstname || '',
    lastname: item.lastname || '',
    personal_phone: item.personal_phone || item.phone || '',
    personal_email: item.personal_email || item.email || '',
    store_name: item.store_name || '',
    house_no: item.house_no || '',
    road: item.road || item.moo || '',
    sub_district: item.sub_district || '',
    district: item.district || '',
    province: item.province || '',
    zipcode: item.zipcode || '',
    store_phone: item.store_phone || '',
    store_email: item.store_email || '',
    google_maps_url: item.google_maps_url || '',
    license_file: item.license_file || '',
    license_url: item.license_url || '',
  }
  partnerSchedules.value = []
}

// 🚩 ดึงข้อมูลร้านยาแบบเต็ม (รวมตารางเปิด-ปิด)
const fetchPartnerDetail = async (id) => {
  if (!id) return
  isLoadingPartner.value = true
  partnerError.value = ''
  const base = useNuxtApp().$getApiBase()
  const deletedParam = deletedFilter.value === 'deleted' ? '&deleted=1' : ''

  const candidates = [
    `${base}/admin-get-store-profile.php?id=${id}`,
    `${base}/vue-get-store-profile.php?id=${id}`,
    `${base}/get-store-profile.php?id=${id}`,
    `${base}/get-stores.php?id=${id}${deletedParam}`,
  ]

  for (const url of candidates) {
    try {
      const res = await $fetch(url, { credentials: 'include' })
      let d = null
      if (res?.status === 'success') {
        if (res.data) d = res.data
        else if (Array.isArray(res.stores)) d = res.stores.find(s => String(s.id) === String(id)) || res.stores[0]
        else if (res.store) d = res.store
      }

      if (d) {
        const det = d.details || d
        partnerForm.value = {
          id: d.id || id,
          username: d.username || partnerForm.value.username || '',
          firstname: d.firstname || '',
          lastname: d.lastname || '',
          personal_phone: d.personal_phone || d.phone || '',
          personal_email: d.personal_email || d.email || '',
          store_name: det.store_name || d.store_name || '',
          house_no: det.house_no || '',
          road: det.road || det.moo || '',
          sub_district: det.sub_district || '',
          district: det.district || '',
          province: det.province || '',
          zipcode: det.zipcode || '',
          store_phone: det.store_phone || '',
          store_email: det.store_email || '',
          google_maps_url: det.google_maps_url || d.google_maps_url || '',
          license_file: d.license_file || partnerForm.value.license_file || '',
          license_url: d.license_url || partnerForm.value.license_url || '',
        }
        const opens = (d.schedules || []).filter(s => s.is_open || s.open_time)
        partnerSchedules.value = opens.length
          ? opens.map(s => ({
              day: s.day_of_week || s.day || 'Mon',
              start: s.open_time || s.start || '08:00',
              end: s.close_time || s.end || '20:00',
            }))
          : [{ day: 'Mon', start: '08:00', end: '20:00' }]

        isLoadingPartner.value = false
        return
      }
    } catch (_) { /* ลอง endpoint ถัดไป */ }
  }

  isLoadingPartner.value = false
}

const openDetail = (item) => {
  selectedData.value = item
  showModal.value = true
  partnerError.value = ''
  partnerSuccess.value = ''
  resetPartnerFormFromList(item)
  fetchPartnerDetail(item.id)
}

const closeModal = () => {
  showModal.value = false
  partnerError.value = ''
  partnerSuccess.value = ''
  setTimeout(() => { selectedData.value = null }, 300)
}

const addPartnerSchedule = () => {
  partnerSchedules.value.push({ day: 'Mon', start: '08:00', end: '20:00' })
}
const removePartnerSchedule = (idx) => {
  if (partnerSchedules.value.length <= 1) return
  partnerSchedules.value.splice(idx, 1)
}

const savePartner = async () => {
  if (!partnerForm.value.id) return
  isSavingPartner.value = true
  partnerError.value = ''
  partnerSuccess.value = ''
  try {
    const body = new FormData()
    body.append('id', partnerForm.value.id)
    body.append('firstname', partnerForm.value.firstname)
    body.append('lastname', partnerForm.value.lastname)
    body.append('personal_phone', partnerForm.value.personal_phone)
    body.append('personal_email', partnerForm.value.personal_email)
    body.append('store_name', partnerForm.value.store_name)
    body.append('house_no', partnerForm.value.house_no)
    body.append('road', partnerForm.value.road)
    body.append('sub_district', partnerForm.value.sub_district)
    body.append('district', partnerForm.value.district)
    body.append('province', partnerForm.value.province)
    body.append('zipcode', partnerForm.value.zipcode)
    body.append('store_phone', partnerForm.value.store_phone)
    body.append('store_email', partnerForm.value.store_email)
    body.append('google_maps_url', partnerForm.value.google_maps_url)

    partnerSchedules.value.forEach(s => {
      if (s.day && s.start && s.end) {
        body.append('work_day[]', s.day)
        body.append('open_time[]', s.start)
        body.append('close_time[]', s.end)
      }
    })

    const base = useNuxtApp().$getApiBase()
    let res = null
    try {
      res = await $fetch(`${base}/admin-update-store-profile.php`, {
        method: 'POST', body, credentials: 'include',
      })
    } catch (_) { res = null }
    if (!res || res.status !== 'success') {
      res = await $fetch(`${base}/vue-update-store-profile.php`, {
        method: 'POST', body, credentials: 'include',
      })
    }

    if (res?.status === 'success') {
      partnerSuccess.value = res.message || 'บันทึกข้อมูลสำเร็จ'
      await fetchPartnerDetail(partnerForm.value.id)
      handleFetch()
    } else {
      const msg = res?.message || ''
      if (/เข้าสู่ระบบ|เจ้าของร้าน|login|unauth/i.test(msg)) {
        partnerError.value = 'ไม่สามารถบันทึกได้ — กรุณาให้แอดมินอัปเดต API ฝั่ง backend ให้รองรับการแก้ไขโดยแอดมิน'
      } else {
        partnerError.value = msg || 'บันทึกไม่สำเร็จ'
      }
    }
  } catch (err) {
    console.error('savePartner error:', err)
    partnerError.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
  } finally {
    isSavingPartner.value = false
  }
}

const closeActionPopup = () => {
  if (popupLoading.value) return
  actionPopup.value.show = false
}

const showResultPopup = (tone, title, message) => {
  actionPopup.value = {
    show: true,
    tone,
    title,
    message,
    detail: '',
    confirmText: 'ตกลง',
    confirmOnly: true,
    action: null,
    id: null,
  }
}

const storeName = (item) => item.store_name || item.username || 'ร้านยา'

const confirmDelete = (item) => {
  actionPopup.value = {
    show: true,
    tone: 'danger',
    title: 'ยืนยันการลบข้อมูล',
    message: 'ร้านยาพาร์ทเนอร์รายนี้จะถูกซ่อนออกจากหน้าปกติ แต่ข้อมูลจริงยังถูก freeze เก็บไว้ในฐานข้อมูล',
    detail: storeName(item),
    confirmText: 'ลบข้อมูล',
    confirmOnly: false,
    action: 'delete',
    id: item.id,
  }
}

const restoreItem = (item) => {
  actionPopup.value = {
    show: true,
    tone: 'restore',
    title: 'กู้คืนข้อมูลร้านยา',
    message: 'กู้คืนร้านยาพาร์ทเนอร์รายนี้กลับไปยังรายการใช้งานอยู่หรือไม่?',
    detail: storeName(item),
    confirmText: 'กู้คืน',
    confirmOnly: false,
    action: 'restore',
    id: item.id,
  }
}

const handleActionConfirm = async () => {
  if (!actionPopup.value.action) {
    closeActionPopup()
    return
  }

  const currentAction = actionPopup.value.action
  popupLoading.value = true
  try {
    const id = actionPopup.value.id
    if (currentAction === 'delete') {
      const res = await $fetch(`${useNuxtApp().$getApiBase()}/delete-store.php?id=${id}`, { credentials: 'include' })
      showResultPopup('success', 'ลบข้อมูลแล้ว', res?.message || 'ลบออกจากหน้าปกติแล้ว')
    } else {
      const res = await $fetch(`${useNuxtApp().$getApiBase()}/restore-deleted.php?type=store&id=${id}`, { credentials: 'include' })
      if (res?.status !== 'success') throw new Error(res?.message || 'restore failed')
      showResultPopup('success', 'กู้คืนข้อมูลแล้ว', res.message || 'กู้คืนข้อมูลสำเร็จ')
    }
    handleFetch()
  } catch (err) {
    showResultPopup('error', 'ทำรายการไม่สำเร็จ', currentAction === 'restore' ? 'ไม่สามารถกู้คืนข้อมูลได้' : 'ไม่สามารถลบข้อมูลได้')
  } finally {
    popupLoading.value = false
  }
}

// ===== Admin review: approve / reject =====
const reviewStore = async (item, action) => {
  const label = action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'
  let note = ''
  if (action === 'reject') {
    note = window.prompt('โปรดระบุเหตุผลที่ปฏิเสธ (เพื่อแจ้งให้เจ้าของร้านทราบ):', '') || ''
    if (note === null) return
  } else {
    if (!confirm(`คุณแน่ใจหรือไม่ที่จะอนุมัติร้าน "${item.store_name || item.username}"?`)) return
  }
  reviewLoading.value = true
  try {
    const base = useNuxtApp().$getApiBase()
    const res = await $fetch(`${base}/admin-review-store.php`, {
      method: 'POST',
      body: { id: item.id, action, note },
      credentials: 'include',
    })
    if (res?.status === 'success') {
      alert(res.message || `${label}เรียบร้อย`)
      await handleFetch()
      if (selectedData.value && selectedData.value.id === item.id) closeModal()
    } else {
      alert(res?.message || `${label}ไม่สำเร็จ`)
    }
  } catch (err) {
    console.error('reviewStore error:', err)
    alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
  } finally {
    reviewLoading.value = false
  }
}

onMounted(() => {
  handleFetch()
})
</script>

<template>
  <AdminLayout active-tab="partner">
    <div class="management-view fade-in">
      <section class="search-section">
        <!-- ===== Hero ===== -->
        <div class="mgmt-hero hero-partner">
          <div class="mgmt-hero-left">
            <div class="mgmt-hero-icon">
              <i :class="tabMeta.icon"></i>
            </div>
            <div>
              <h2 class="mgmt-hero-title">{{ tabMeta.title }}</h2>
              <p class="mgmt-hero-subtitle">{{ tabMeta.subtitle }}</p>
            </div>
          </div>
          <div class="mgmt-hero-stats">
            <div class="mgmt-stat-card">
              <span class="mgmt-stat-label">ทั้งหมด</span>
              <span class="mgmt-stat-value">{{ statusCounts.all.toLocaleString('th-TH') }}</span>
              <i :class="tabMeta.icon" class="mgmt-stat-bg"></i>
            </div>
            <div v-if="statusCounts.pending > 0" class="mgmt-stat-card alert">
              <span class="mgmt-stat-label">รออนุมัติ</span>
              <span class="mgmt-stat-value">{{ statusCounts.pending }}</span>
              <i class="fa-solid fa-hourglass-half mgmt-stat-bg"></i>
            </div>
          </div>
        </div>

        <!-- ===== Search + Tabs ===== -->
        <div class="mgmt-search-wrap">
          <div class="mgmt-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" v-model="searchQuery" :placeholder="tabMeta.placeholder">
            <button v-if="searchQuery" class="mgmt-search-clear" @click="searchQuery = ''" title="ล้างคำค้น">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="soft-delete-tabs">
            <button class="soft-delete-tab" :class="{ active: deletedFilter === 'active' }" @click="deletedFilter = 'active'; statusFilter = 'approved'">
              <i class="fa-solid fa-store"></i> ใช้งานอยู่
            </button>
            <button class="soft-delete-tab danger" :class="{ active: deletedFilter === 'deleted' }" @click="deletedFilter = 'deleted'; statusFilter = 'all'">
              <i class="fa-solid fa-box-archive"></i> ถูกลบแล้ว
            </button>
          </div>

          <div class="store-tabs">
            <button class="store-tab" :class="{ active: statusFilter === 'approved' }" @click="statusFilter = 'approved'">
              <i class="fa-solid fa-handshake"></i> พาร์ทเนอร์ <span class="store-tab-count">{{ statusCounts.approved }}</span>
            </button>
            <button class="store-tab tab-pending" :class="{ active: statusFilter === 'pending' }" @click="statusFilter = 'pending'">
              <i class="fa-solid fa-hourglass-half"></i> รออนุมัติ
              <span class="store-tab-count" :class="{ 'count-alert': statusCounts.pending > 0 }">{{ statusCounts.pending }}</span>
            </button>
            <button class="store-tab tab-rejected" :class="{ active: statusFilter === 'rejected' }" @click="statusFilter = 'rejected'">
              <i class="fa-solid fa-circle-xmark"></i> ถูกปฏิเสธ <span class="store-tab-count">{{ statusCounts.rejected }}</span>
            </button>
            <button class="store-tab tab-all" :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">
              <i class="fa-solid fa-layer-group"></i> ทั้งหมด
            </button>
          </div>

          <div v-if="searchQuery" class="mgmt-search-hint">
            พบ <strong>{{ filteredList.length }}</strong> รายการจากคำค้น "{{ searchQuery }}"
          </div>
        </div>

        <!-- ===== List ===== -->
        <div v-if="isLoading" class="mgmt-loading">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>กำลังโหลดข้อมูล{{ tabMeta.label }}...</span>
        </div>

        <div v-else-if="filteredList.length === 0" class="mgmt-empty">
          <div class="mgmt-empty-icon">
            <i :class="searchQuery ? 'fa-solid fa-search' : 'fa-solid fa-folder-open'"></i>
          </div>
          <h3>{{ searchQuery ? 'ไม่พบข้อมูลที่ตรงกับคำค้น' : `ยังไม่มี${tabMeta.label}ในระบบ` }}</h3>
          <p>{{ searchQuery ? 'ลองเปลี่ยนคำค้น หรือเคลียร์คำค้นเพื่อดูทั้งหมด' : 'เมื่อมีข้อมูลใหม่จะปรากฏที่นี่' }}</p>
        </div>

        <div v-else class="mgmt-card-grid">
          <div v-for="(item, index) in pagedList" :key="item.id"
            class="mgmt-card card-partner"
            :class="{
              'card-pending-store': (item.admin_status || 'approved') === 'pending',
              'card-rejected-store': item.admin_status === 'rejected',
            }"
            @click="openDetail(item)">
            <span class="mgmt-card-no">#{{ pageStart + index }}</span>

            <div class="mgmt-card-avatar avatar-partner">
              <i class="fa-solid fa-store"></i>
            </div>

            <div class="mgmt-card-body">
              <div class="mgmt-card-name">{{ item.store_name || item.username || 'ร้านยา (ไม่ระบุชื่อ)' }}</div>
              <div class="mgmt-card-meta">
                <span v-if="item.province" class="meta-item">
                  <i class="fa-solid fa-location-dot"></i>
                  {{ [item.district, item.province].filter(Boolean).join(', ') }}
                </span>
                <span v-if="item.store_phone || item.personal_phone" class="meta-item">
                  <i class="fa-solid fa-phone"></i>{{ item.store_phone || item.personal_phone }}
                </span>
                <span v-if="item.store_email || item.personal_email" class="meta-item meta-email">
                  <i class="fa-solid fa-envelope"></i>{{ item.store_email || item.personal_email }}
                </span>
              </div>
              <div class="mgmt-card-tags">
                <span v-if="(item.admin_status || 'approved') === 'approved'" class="mgmt-tag tag-partner">
                  <i class="fa-solid fa-handshake"></i> พาร์ทเนอร์
                </span>
                <span v-else-if="item.admin_status === 'pending'" class="mgmt-tag tag-pending">
                  <i class="fa-solid fa-hourglass-half"></i> รออนุมัติ
                </span>
                <span v-else-if="item.admin_status === 'rejected'" class="mgmt-tag tag-rejected">
                  <i class="fa-solid fa-circle-xmark"></i> ปฏิเสธแล้ว
                </span>
                <span v-if="deletedFilter === 'deleted'" class="mgmt-tag tag-rejected">
                  <i class="fa-solid fa-box-archive"></i> ถูกลบ {{ item.deleted_at || '' }}
                </span>
              </div>
            </div>

            <div class="mgmt-card-actions">
              <template v-if="deletedFilter === 'deleted'">
                <button class="mgmt-btn view" @click.stop="openDetail(item)">
                  <i class="fa-solid fa-eye"></i><span>ดูข้อมูล</span>
                </button>
                <button class="mgmt-btn approve" @click.stop="restoreItem(item)" title="กู้คืน">
                  <i class="fa-solid fa-rotate-left"></i><span>กู้คืน</span>
                </button>
              </template>
              <template v-else-if="item.admin_status === 'pending'">
                <button class="mgmt-btn approve" @click.stop="reviewStore(item, 'approve')" :disabled="reviewLoading">
                  <i class="fa-solid fa-check"></i><span>อนุมัติ</span>
                </button>
                <button class="mgmt-btn reject" @click.stop="reviewStore(item, 'reject')" :disabled="reviewLoading">
                  <i class="fa-solid fa-xmark"></i><span>ปฏิเสธ</span>
                </button>
              </template>
              <template v-else>
                <button class="mgmt-btn view" @click.stop="openDetail(item)">
                  <i class="fa-solid fa-eye"></i><span>ดูข้อมูล</span>
                </button>
                <button class="mgmt-btn delete" @click.stop="confirmDelete(item)" title="ลบ">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </template>
            </div>
          </div>
        </div>

        <AdminPagination
          v-if="!isLoading && filteredList.length > 0"
          :page-start="pageStart"
          :page-end="pageEnd"
          :total-items="filteredList.length"
          :current-page="currentPage"
          :total-pages="totalPages"
          :page-numbers="pageNumbers"
          :page-size="pageSize"
          :sizes="PAGE_SIZE_OPTIONS"
          @go="goToPage"
          @size-change="(v) => pageSize = v"
        />
      </section>
    </div>

    <!-- ===== Modal: ร้านยา ===== -->
    <template #overlays>
      <ActionConfirmDialog
        :show="actionPopup.show"
        :loading="popupLoading"
        :tone="actionPopup.tone"
        :title="actionPopup.title"
        :message="actionPopup.message"
        :detail="actionPopup.detail"
        :confirm-text="actionPopup.confirmText"
        :confirm-only="actionPopup.confirmOnly"
        @confirm="handleActionConfirm"
        @cancel="closeActionPopup"
      />
      <transition name="pop">
        <div v-if="showModal && selectedData" class="modal-overlay" @click.self="closeModal">
          <div class="user-detail-card shadow-lg">
            <button class="close-x" @click="closeModal">×</button>

            <div class="modal-scroll-content">
              <div class="profile-preview">
                <div class="store-avatar">
                  <i class="fa-solid fa-store"></i>
                </div>
                <h3>{{ partnerForm.store_name || selectedData.store_name || 'ร้านยา (ไม่ระบุชื่อ)' }}</h3>
                <span class="role-badge">
                  <i class="fa-solid fa-store"></i> ร้านยาพาร์ทเนอร์
                </span>
              </div>

              <div v-if="isLoadingPartner" class="partner-loading">
                <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูลร้านยา...
              </div>

              <div v-if="partnerError" class="partner-msg error">{{ partnerError }}</div>
              <div v-if="partnerSuccess" class="partner-msg success">{{ partnerSuccess }}</div>

              <h4 class="section-head"><i class="fa-solid fa-user"></i> ข้อมูลส่วนตัวเจ้าของร้าน</h4>
              <div class="info-grid">
                <div class="form-group full-width">
                  <label>ชื่อผู้ใช้งาน (Username)</label>
                  <input type="text" v-model="partnerForm.username" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>ชื่อ *</label>
                  <input type="text" v-model="partnerForm.firstname" class="input-editable">
                </div>
                <div class="form-group">
                  <label>นามสกุล *</label>
                  <input type="text" v-model="partnerForm.lastname" class="input-editable">
                </div>
                <div class="form-group">
                  <label>เบอร์โทรส่วนตัว *</label>
                  <input type="text" v-model="partnerForm.personal_phone" class="input-editable">
                </div>
                <div class="form-group">
                  <label>อีเมลส่วนตัว *</label>
                  <input type="text" v-model="partnerForm.personal_email" class="input-editable">
                </div>
              </div>

              <h4 class="section-head"><i class="fa-solid fa-store"></i> ข้อมูลร้านยา</h4>
              <div class="info-grid">
                <div class="form-group full-width">
                  <label>ชื่อร้าน *</label>
                  <input type="text" v-model="partnerForm.store_name" class="input-editable">
                </div>
                <div class="form-group">
                  <label>บ้านเลขที่ *</label>
                  <input type="text" v-model="partnerForm.house_no" class="input-editable">
                </div>
                <div class="form-group">
                  <label>หมู่ / ถนน</label>
                  <input type="text" v-model="partnerForm.road" class="input-editable">
                </div>
                <div class="form-group">
                  <label>ตำบล *</label>
                  <input type="text" v-model="partnerForm.sub_district" class="input-editable">
                </div>
                <div class="form-group">
                  <label>อำเภอ *</label>
                  <input type="text" v-model="partnerForm.district" class="input-editable">
                </div>
                <div class="form-group">
                  <label>จังหวัด *</label>
                  <input type="text" v-model="partnerForm.province" class="input-editable">
                </div>
                <div class="form-group">
                  <label>รหัสไปรษณีย์ *</label>
                  <input type="text" v-model="partnerForm.zipcode" class="input-editable">
                </div>
                <div class="form-group">
                  <label>เบอร์ร้าน *</label>
                  <input type="text" v-model="partnerForm.store_phone" class="input-editable">
                </div>
                <div class="form-group">
                  <label>อีเมลร้าน *</label>
                  <input type="text" v-model="partnerForm.store_email" class="input-editable">
                </div>
                <div class="form-group full-width">
                  <label>Google Maps URL</label>
                  <input type="text" v-model="partnerForm.google_maps_url"
                         placeholder="https://maps.google.com/..." class="input-editable">
                  <a v-if="partnerForm.google_maps_url"
                     :href="partnerForm.google_maps_url" target="_blank" rel="noopener"
                     class="maps-link" style="margin-top: 8px;">
                    <i class="fa-solid fa-map-location-dot"></i> เปิดใน Google Maps
                  </a>
                </div>
              </div>

              <h4 class="section-head"><i class="fa-solid fa-id-card"></i> ใบรับรองร้านยา</h4>
              <div class="info-grid">
                <div class="form-group full-width">
                  <div v-if="licenseImageUrl" class="license-viewer">
                    <img :src="licenseImageUrl"
                         class="license-img pointer-cursor"
                         alt="ใบรับรองร้านยา"
                         @click="openImagePreview(licenseImageUrl)"
                         @error="(e) => e.target.src = 'https://via.placeholder.com/600x400?text=License+Image+Not+Found'" />
                    <div class="license-hint">
                      <i class="fa-solid fa-magnifying-glass-plus"></i> คลิกที่รูปเพื่อขยายดูภาพเต็ม
                    </div>
                  </div>
                  <div v-else class="license-empty">
                    <i class="fa-solid fa-file-circle-xmark"></i>
                    <span>ร้านยานี้ยังไม่ได้แนบรูปใบรับรอง</span>
                  </div>
                </div>
              </div>

              <h4 class="section-head"><i class="fa-solid fa-clock"></i> ตารางเวลาเปิด-ปิด</h4>
              <div class="schedule-list">
                <div v-for="(s, idx) in partnerSchedules" :key="idx" class="schedule-row">
                  <select v-model="s.day" class="sched-day">
                    <option v-for="d in DAY_OPTIONS" :key="d.value" :value="d.value">{{ d.label }}</option>
                  </select>
                  <span class="sched-sep">เริ่ม</span>
                  <input type="time" v-model="s.start" class="sched-time">
                  <span class="sched-sep">ถึง</span>
                  <input type="time" v-model="s.end" class="sched-time">
                  <button class="sched-remove"
                          :disabled="partnerSchedules.length <= 1"
                          @click="removePartnerSchedule(idx)">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>

                <button class="btn-add-schedule" @click="addPartnerSchedule">
                  <i class="fa-solid fa-plus"></i> เพิ่มตารางเวลา
                </button>
              </div>
            </div>

            <div class="verify-actions partner-actions">
              <button class="btn-cancel" @click="closeModal" :disabled="isSavingPartner">ปิด</button>

              <template v-if="selectedData && selectedData.admin_status === 'pending'">
                <button class="btn-reject" @click="reviewStore(selectedData, 'reject')" :disabled="reviewLoading">
                  <i class="fa-solid fa-xmark"></i> ปฏิเสธคำขอ
                </button>
                <button class="btn-approve" @click="reviewStore(selectedData, 'approve')" :disabled="reviewLoading">
                  <i class="fa-solid fa-check"></i>
                  {{ reviewLoading ? 'กำลังดำเนินการ...' : 'อนุมัติร้านยา' }}
                </button>
              </template>
              <template v-else>
                <button class="btn-save" @click="savePartner" :disabled="isSavingPartner || isLoadingPartner">
                  <i class="fa-solid fa-floppy-disk"></i>
                  {{ isSavingPartner ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข' }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </transition>

      <transition name="fade">
        <div v-if="isShowImagePreview" class="image-preview-overlay" @click.self="closeImagePreview">
          <div class="preview-container">
            <button class="close-preview-btn-top" @click="closeImagePreview">×</button>
            <img :src="imagePreviewUrl" class="full-preview-image" alt="ใบรับรองร้านยา (ภาพเต็ม)" />
          </div>
        </div>
      </transition>
    </template>
  </AdminLayout>
</template>

<style scoped>
@import "@/assets/admin_dashboard_page.css";
@import "@/assets/admin-shared.css";

/* ===== Status tabs ===== */
.store-tabs {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.store-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 999px;
  background: #f1f5f9;
  border: 1px solid transparent;
  color: #475569;
  font-weight: 600;
  cursor: pointer;
  transition: all .15s;
}
.store-tab:hover { background: #e2e8f0; }
.store-tab.active {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #fff;
  border-color: #4f46e5;
  box-shadow: 0 4px 12px rgba(99,102,241,.3);
}
.store-tab.tab-pending.active {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border-color: #d97706;
  box-shadow: 0 4px 12px rgba(245,158,11,.35);
}
.store-tab.tab-rejected.active {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border-color: #dc2626;
  box-shadow: 0 4px 12px rgba(239,68,68,.35);
}
.store-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 11px;
  background: rgba(255,255,255,.6);
  color: inherit;
  font-size: .78rem;
  font-weight: 700;
}
.store-tab:not(.active) .store-tab-count { background: #fff; color: #475569; border: 1px solid #e2e8f0; }
.store-tab .count-alert { background: #ef4444; color: #fff; border-color: transparent; }
.store-tab.active .store-tab-count { background: rgba(255,255,255,.25); color: #fff; }

/* ===== Pending / Rejected card style ===== */
.mgmt-card.card-pending-store {
  border: 2px solid #fbbf24;
  background: linear-gradient(180deg, #fffbeb 0%, #ffffff 60%);
}
.mgmt-card.card-rejected-store {
  border: 2px solid #fca5a5;
  background: linear-gradient(180deg, #fef2f2 0%, #ffffff 60%);
  opacity: .92;
}

/* Badge variants */
.mgmt-tag.tag-pending {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #92400e;
}
.mgmt-tag.tag-rejected {
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  color: #991b1b;
}

/* Approve / Reject buttons */
.mgmt-btn.approve {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  border-color: #059669;
}
.mgmt-btn.approve:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(16,185,129,.35);
  transform: translateY(-1px);
}
.mgmt-btn.reject {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  border-color: #dc2626;
}
.mgmt-btn.reject:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(239,68,68,.35);
  transform: translateY(-1px);
}
.mgmt-btn.approve:disabled,
.mgmt-btn.reject:disabled { opacity: .6; cursor: not-allowed; }

/* alert stat card */
.mgmt-stat-card.alert {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  color: #92400e;
}
.mgmt-stat-card.alert .mgmt-stat-bg { color: #f59e0b; }

/* Modal action buttons */
.btn-approve {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 22px; border-radius: 12px; border: none;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff; font-weight: 700; cursor: pointer;
  box-shadow: 0 6px 18px rgba(16,185,129,.3);
}
.btn-approve:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(16,185,129,.4); }
.btn-approve:disabled { opacity: .6; cursor: not-allowed; }

.btn-reject {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 22px; border-radius: 12px; border: none;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff; font-weight: 700; cursor: pointer;
  box-shadow: 0 6px 18px rgba(239,68,68,.25);
}
.btn-reject:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(239,68,68,.4); }
.btn-reject:disabled { opacity: .6; cursor: not-allowed; }

/* ===== License image viewer ===== */
.license-viewer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  border-radius: 14px;
}
.license-img {
  max-width: 100%;
  max-height: 420px;
  border-radius: 10px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, .12);
  transition: transform .18s ease, box-shadow .18s ease;
  background: #fff;
}
.license-img:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 26px rgba(15, 23, 42, .18);
}
.pointer-cursor { cursor: zoom-in; }
.license-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: .85rem;
}
.license-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 26px;
  color: #94a3b8;
  background: #f8fafc;
  border: 1.5px dashed #cbd5e1;
  border-radius: 14px;
}
.license-empty i { font-size: 2rem; }

/* ===== Full-screen image preview overlay ===== */
.image-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .85);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.preview-container {
  position: relative;
  max-width: 95vw;
  max-height: 95vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.full-preview-image {
  max-width: 100%;
  max-height: 92vh;
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .5);
}
.close-preview-btn-top {
  position: absolute;
  top: -14px;
  right: -14px;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: none;
  background: #ef4444;
  color: #fff;
  font-size: 1.6rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .4);
}
.close-preview-btn-top:hover { background: #dc2626; transform: scale(1.05); }

.soft-delete-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}
.soft-delete-tab {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 800;
  cursor: pointer;
}
.soft-delete-tab.danger {
  border-color: #fecaca;
  background: #fff1f2;
  color: #be123c;
}
.soft-delete-tab.active {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #fff;
}
.soft-delete-tab.danger.active {
  background: #be123c;
  border-color: #be123c;
}

.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
