<script setup>
/**
 * 🚩 /admin/user_user — รายชื่อผู้ใช้บริการในระบบ (ตัด role 'admin' ออก)
 */
import { ref, computed, onMounted, watch } from 'vue'

definePageMeta({ middleware: 'admin-only' })

const { apiUrl } = useApiBase()

const allData = ref([])
const searchQuery = ref('')
const searchTopic = ref('all')
const isLoading = ref(false)
const selectedData = ref(null)
const showModal = ref(false)
const deletedFilter = ref('active')
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

const tabMeta = {
  label: 'ผู้ใช้บริการ',
  title: 'ผู้ใช้บริการในระบบ',
  subtitle: 'รายชื่อผู้ใช้งานทั้งหมดที่สมัครสมาชิกในแพลตฟอร์ม',
  icon: 'fa-solid fa-user-injured',
  statLabel: 'สมาชิกทั้งหมด',
  placeholder: 'ค้นหาชื่อ-นามสกุล / username ผู้ใช้บริการ...',
}

const SEARCH_TOPICS = [
  { value: 'all', label: 'ทุกหัวข้อ', placeholder: 'ค้นหาชื่อ / username / อีเมล / เบอร์โทร / ที่อยู่...' },
  { value: 'name', label: 'ชื่อ-นามสกุล', placeholder: 'ค้นหาชื่อหรือนามสกุลผู้ใช้บริการ...' },
  { value: 'username', label: 'Username', placeholder: 'ค้นหา username ผู้ใช้บริการ...' },
  { value: 'email', label: 'อีเมล', placeholder: 'ค้นหาอีเมลผู้ใช้บริการ...' },
  { value: 'phone', label: 'เบอร์โทร', placeholder: 'ค้นหาเบอร์โทร เช่น 0982150751' },
  { value: 'location', label: 'ที่อยู่', placeholder: 'ค้นหาจังหวัด / อำเภอ / ตำบล / รหัสไปรษณีย์...' },
]

const searchPlaceholder = computed(() =>
  SEARCH_TOPICS.find((t) => t.value === searchTopic.value)?.placeholder || tabMeta.placeholder,
)

const matchesSearch = (item, q, topic) => {
  const fields = {
    all: [
      item.username, item.firstname, item.lastname, item.email, item.phone,
      item.province, item.district, item.sub_district, item.zipcode,
      `${item.firstname || ''} ${item.lastname || ''}`.trim(),
    ],
    name: [item.firstname, item.lastname, `${item.firstname || ''} ${item.lastname || ''}`.trim()],
    username: [item.username],
    email: [item.email],
    phone: [item.phone],
    location: [item.province, item.district, item.sub_district, item.zipcode, item.house_no, item.road],
  }
  const list = fields[topic] || fields.all
  if (list.some((v) => String(v || '').toLowerCase().includes(q))) return true
  if (topic === 'all' || topic === 'phone') {
    const qDigits = q.replace(/\D/g, '')
    if (qDigits.length >= 3) {
      const phone = String(item.phone || '').replace(/\D/g, '')
      if (phone.includes(qDigits)) return true
    }
  }
  return false
}

const handleFetch = async () => {
  isLoading.value = true
  try {
    const base = useNuxtApp().$getApiBase()
    const deletedParam = deletedFilter.value === 'deleted' ? '?deleted=1' : ''
    const res = await $fetch(`${base}/get-user.php${deletedParam}`, { credentials: 'include' })
    if (res.status === 'success' || res.authenticated) {
      const data = Array.isArray(res.data) ? res.data : [res.data]
      allData.value = data.filter(item => (item?.role ?? '').toLowerCase() !== 'admin')
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

const filteredList = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return allData.value
  return allData.value.filter((item) => matchesSearch(item, q, searchTopic.value))
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

watch([searchQuery, searchTopic, deletedFilter], () => resetPage())
watch(deletedFilter, () => handleFetch())

const openDetail = (item) => {
  selectedData.value = item
  showModal.value = true
}
const closeModal = () => {
  showModal.value = false
  setTimeout(() => { selectedData.value = null }, 300)
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

const confirmDelete = (item) => {
  actionPopup.value = {
    show: true,
    tone: 'danger',
    title: 'ยืนยันการลบข้อมูล',
    message: 'ผู้ใช้งานรายนี้จะถูกซ่อนออกจากหน้าปกติ แต่ข้อมูลจริงยังถูก freeze เก็บไว้ในฐานข้อมูล',
    detail: (item.firstname || item.lastname) ? `${item.firstname || ''} ${item.lastname || ''}`.trim() : (item.username || ''),
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
    title: 'กู้คืนข้อมูลผู้ใช้งาน',
    message: 'กู้คืนผู้ใช้งานรายนี้กลับไปยังรายการใช้งานอยู่หรือไม่?',
    detail: (item.firstname || item.lastname) ? `${item.firstname || ''} ${item.lastname || ''}`.trim() : (item.username || ''),
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
      const res = await $fetch(apiUrl(`delete-user.php?id=${id}`), { credentials: 'include' })
      showResultPopup('success', 'ลบข้อมูลแล้ว', res?.message || 'ลบออกจากหน้าปกติแล้ว')
    } else {
      const res = await $fetch(apiUrl(`restore-deleted.php?type=user&id=${id}`), { credentials: 'include' })
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

onMounted(() => {
  handleFetch()
})
</script>

<template>
  <AdminLayout active-tab="user">
    <div class="management-view fade-in">
      <section class="search-section">
        <!-- ===== Hero ===== -->
        <div class="mgmt-hero hero-user">
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
              <span class="mgmt-stat-label">{{ tabMeta.statLabel }}</span>
              <span class="mgmt-stat-value">{{ filteredList.length.toLocaleString('th-TH') }}</span>
              <i :class="tabMeta.icon" class="mgmt-stat-bg"></i>
            </div>
          </div>
        </div>

        <!-- ===== Search ===== -->
        <div class="mgmt-search-wrap">
          <div class="mgmt-search-row">
            <div class="mgmt-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" v-model="searchQuery" :placeholder="searchPlaceholder">
              <button v-if="searchQuery" class="mgmt-search-clear" @click="searchQuery = ''" title="ล้างคำค้น">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class="mgmt-search-topic">
              <i class="fa-solid fa-filter" aria-hidden="true"></i>
              <select v-model="searchTopic" aria-label="หัวข้อที่ต้องการค้นหา">
                <option v-for="opt in SEARCH_TOPICS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>
          <div v-if="searchQuery" class="mgmt-search-hint">
            พบ <strong>{{ filteredList.length }}</strong> รายการจากคำค้น "{{ searchQuery }}"
          </div>
          <div class="soft-delete-tabs">
            <button class="soft-delete-tab" :class="{ active: deletedFilter === 'active' }" @click="deletedFilter = 'active'">
              <i class="fa-solid fa-users"></i> ใช้งานอยู่
            </button>
            <button class="soft-delete-tab danger" :class="{ active: deletedFilter === 'deleted' }" @click="deletedFilter = 'deleted'">
              <i class="fa-solid fa-box-archive"></i> ถูกลบแล้ว
            </button>
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
            class="mgmt-card card-user" @click="openDetail(item)">
            <span class="mgmt-card-no">#{{ pageStart + index }}</span>

            <div class="mgmt-card-avatar avatar-user">
              <template v-if="item.image && item.image !== 'default.png'">
                <img
                  :src="`${useNuxtApp().$getApiBase()}/images_account/${item.image}`"
                  :alt="item.username || 'avatar'"
                  @error="(e) => { e.target.style.display='none'; e.target.parentElement.classList.add('avatar-fallback'); }">
              </template>
              <template v-else>
                <i class="fa-solid fa-user"></i>
              </template>
            </div>

            <div class="mgmt-card-body">
              <div class="mgmt-card-name">
                {{ (item.firstname || item.lastname) ? `${item.firstname || ''} ${item.lastname || ''}`.trim() : (item.username || 'ไม่ระบุชื่อ') }}
              </div>
              <div class="mgmt-card-meta">
                <span v-if="item.username" class="meta-item">
                  <i class="fa-solid fa-at"></i>{{ item.username }}
                </span>
                <span v-if="item.phone" class="meta-item">
                  <i class="fa-solid fa-phone"></i>{{ item.phone }}
                </span>
                <span v-if="item.email" class="meta-item meta-email">
                  <i class="fa-solid fa-envelope"></i>{{ item.email }}
                </span>
              </div>
              <div class="mgmt-card-tags">
                <span class="mgmt-tag tag-user">
                  <i class="fa-solid fa-user"></i> สมาชิก
                </span>
                <span v-if="deletedFilter === 'deleted'" class="mgmt-tag tag-rejected">
                  <i class="fa-solid fa-box-archive"></i> ถูกลบ {{ item.deleted_at || '' }}
                </span>
              </div>
            </div>

            <div class="mgmt-card-actions">
              <button class="mgmt-btn view" @click.stop="openDetail(item)">
                <i class="fa-solid fa-eye"></i><span>ดูข้อมูล</span>
              </button>
              <button v-if="deletedFilter === 'active'" class="mgmt-btn delete" @click.stop="confirmDelete(item)" title="ลบ">
                <i class="fa-solid fa-trash"></i>
              </button>
              <button v-else class="mgmt-btn approve" @click.stop="restoreItem(item)" title="กู้คืน">
                <i class="fa-solid fa-rotate-left"></i><span>กู้คืน</span>
              </button>
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

    <!-- ===== Modal ===== -->
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
                <img
                  :src="`${useNuxtApp().$getApiBase()}/images_account/${selectedData.image}`"
                  class="circle-img"
                  @error="(e) => e.target.src = 'https://via.placeholder.com/150'">
                <h3>{{ selectedData.firstname || selectedData.username }} {{ selectedData.lastname || '' }}</h3>
                <span class="role-badge">
                  <i class="fa-solid fa-user"></i> Member
                </span>
              </div>

              <div class="info-grid">
                <div class="form-group full-width">
                  <label>ชื่อผู้ใช้งาน (Username) *</label>
                  <input type="text" :value="selectedData.username" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>ชื่อ *</label>
                  <input type="text" :value="selectedData.firstname" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>นามสกุล *</label>
                  <input type="text" :value="selectedData.lastname" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>เพศ *</label>
                  <input type="text" :value="selectedData.gender" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>อายุ *</label>
                  <input type="text" :value="(selectedData.old || '0') + ' ปี'" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>ส่วนสูง *</label>
                  <input type="text" :value="(selectedData.height || '0') + ' ซม.'" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>น้ำหนัก *</label>
                  <input type="text" :value="(selectedData.weight || '0') + ' กก.'" readonly class="input-readonly">
                </div>
                <div class="form-group full-width">
                  <label>โรคประจำตัว *</label>
                  <textarea readonly class="input-readonly">{{ selectedData.personal_disease || 'ไม่มี' }}</textarea>
                </div>
                <div class="form-group full-width">
                  <label>หมายเลขโทรศัพท์ *</label>
                  <input type="text" :value="selectedData.phone" readonly class="input-readonly">
                </div>
                <div class="form-group full-width">
                  <label>อีเมล *</label>
                  <input type="text" :value="selectedData.email" readonly class="input-readonly">
                </div>

                <div class="form-group full-width section-head-inline">
                  <i class="fa-solid fa-location-dot"></i> ที่อยู่จัดส่ง
                </div>
                <div class="form-group">
                  <label>บ้านเลขที่</label>
                  <input type="text" :value="selectedData.house_no || '-'" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>ถนน</label>
                  <input type="text" :value="selectedData.road || '-'" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>ตำบล</label>
                  <input type="text" :value="selectedData.sub_district || '-'" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>อำเภอ</label>
                  <input type="text" :value="selectedData.district || '-'" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>จังหวัด</label>
                  <input type="text" :value="selectedData.province || '-'" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>รหัสไปรษณีย์</label>
                  <input type="text" :value="selectedData.zipcode || '-'" readonly class="input-readonly">
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </template>
  </AdminLayout>
</template>

<style scoped>
@import "@/assets/admin_dashboard_page.css";
@import "@/assets/admin-shared.css";
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
.section-head-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  font-weight: 700;
  color: #2B3674;
}
.section-head-inline i { color: #4318FF; }
</style>
