<script setup>
/**
 * 🚩 /admin/pharmacist_user — รายชื่อเภสัชกรที่ได้รับการอนุมัติแล้ว (status_verify === 1)
 */
import { ref, computed, onMounted, watch } from 'vue'

definePageMeta({ middleware: 'admin-only' })

const allData = ref([])
const searchQuery = ref('')
const isLoading = ref(false)
const selectedData = ref(null)
const showModal = ref(false)
const isShowImagePreview = ref(false)
const imagePreviewUrl = ref('')
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
  label: 'เภสัชกร',
  title: 'เภสัชกรในระบบ',
  subtitle: 'รายชื่อเภสัชกรที่ได้รับการอนุมัติให้บริการแล้ว',
  icon: 'fa-solid fa-capsules',
  statLabel: 'เภสัชกรทั้งหมด',
  placeholder: 'ค้นหาชื่อเภสัชกร / username...',
}

const handleFetch = async () => {
  isLoading.value = true
  try {
    const base = useNuxtApp().$getApiBase()
    const deletedParam = deletedFilter.value === 'deleted' ? '?deleted=1' : ''
    const res = await $fetch(`${base}/get-pharma.php${deletedParam}`, { credentials: 'include' })
    if (res.status === 'success' || res.authenticated) {
      const data = Array.isArray(res.data) ? res.data : [res.data]
      allData.value = data.filter(item => item.status_verify == 1)
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
  return allData.value.filter(item =>
    item.username?.toLowerCase().includes(q) ||
    item.firstname?.toLowerCase().includes(q) ||
    item.lastname?.toLowerCase().includes(q)
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

watch([searchQuery, deletedFilter], () => resetPage())
watch(deletedFilter, () => handleFetch())

const openDetail = (item) => {
  selectedData.value = item
  showModal.value = true
}
const closeModal = () => {
  showModal.value = false
  setTimeout(() => { selectedData.value = null }, 300)
}

const openImagePreview = (url) => {
  if (!url) return
  imagePreviewUrl.value = url
  isShowImagePreview.value = true
}
const closeImagePreview = () => {
  isShowImagePreview.value = false
  imagePreviewUrl.value = ''
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

const pharmaName = (item) => (item.firstname || item.lastname) ? `ภก. ${item.firstname || ''} ${item.lastname || ''}`.trim() : (item.username || '')

const confirmDelete = (item) => {
  actionPopup.value = {
    show: true,
    tone: 'danger',
    title: 'ยืนยันการลบข้อมูล',
    message: 'เภสัชกรรายนี้จะถูกซ่อนออกจากหน้าปกติ แต่ข้อมูลจริงยังถูก freeze เก็บไว้ในฐานข้อมูล',
    detail: pharmaName(item),
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
    title: 'กู้คืนข้อมูลเภสัชกร',
    message: 'กู้คืนเภสัชกรรายนี้กลับไปยังรายการใช้งานอยู่หรือไม่?',
    detail: pharmaName(item),
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
      const res = await $fetch(`${useNuxtApp().$getApiBase()}/delete-pharma.php?id=${id}`, { credentials: 'include' })
      showResultPopup('success', 'ลบข้อมูลแล้ว', res?.message || 'ลบออกจากหน้าปกติแล้ว')
    } else {
      const res = await $fetch(`${useNuxtApp().$getApiBase()}/restore-deleted.php?type=pharma&id=${id}`, { credentials: 'include' })
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
  <AdminLayout active-tab="pharma">
    <div class="management-view fade-in">
      <section class="search-section">
        <!-- ===== Hero ===== -->
        <div class="mgmt-hero hero-pharma">
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
          <div class="mgmt-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" v-model="searchQuery" :placeholder="tabMeta.placeholder">
            <button v-if="searchQuery" class="mgmt-search-clear" @click="searchQuery = ''" title="ล้างคำค้น">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div v-if="searchQuery" class="mgmt-search-hint">
            พบ <strong>{{ filteredList.length }}</strong> รายการจากคำค้น "{{ searchQuery }}"
          </div>
          <div class="soft-delete-tabs">
            <button class="soft-delete-tab" :class="{ active: deletedFilter === 'active' }" @click="deletedFilter = 'active'">
              <i class="fa-solid fa-user-doctor"></i> ใช้งานอยู่
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
            class="mgmt-card card-pharma" @click="openDetail(item)">
            <span class="mgmt-card-no">#{{ pageStart + index }}</span>

            <div class="mgmt-card-avatar avatar-pharma">
              <template v-if="item.image && item.image !== 'default.png'">
                <img
                  :src="`${useNuxtApp().$getApiBase()}/images_pharma/${item.image}`"
                  :alt="item.username || 'avatar'"
                  @error="(e) => { e.target.style.display='none'; e.target.parentElement.classList.add('avatar-fallback'); }">
              </template>
              <template v-else>
                <i class="fa-solid fa-user-doctor"></i>
              </template>
            </div>

            <div class="mgmt-card-body">
              <div class="mgmt-card-name">
                <span>ภก.</span>
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
                <span class="mgmt-tag tag-verified">
                  <i class="fa-solid fa-circle-check"></i> อนุมัติแล้ว
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

    <!-- ===== Modals/Overlays ===== -->
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
                  :src="`${useNuxtApp().$getApiBase()}/images_pharma/${selectedData.image}`"
                  class="circle-img"
                  @error="(e) => e.target.src = 'https://via.placeholder.com/150'">
                <h3>ภก. {{ selectedData.firstname || selectedData.username }} {{ selectedData.lastname || '' }}</h3>
                <span class="role-badge">
                  <i class="fa-solid fa-user-doctor"></i> Pharmacist
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
                  <label>อายุ *</label>
                  <input type="text" :value="(selectedData.age || '0') + ' ปี'" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>เพศ *</label>
                  <input type="text" :value="selectedData.gender === 'M' ? 'ชาย' : 'หญิง'" readonly class="input-readonly">
                </div>
                <div class="form-group full-width">
                  <label>ตารางเวลาปฏิบัติงาน *</label>
                  <div class="work-time-box">{{ selectedData.work_time || 'ไม่ได้ระบุตารางเวลา' }}</div>
                </div>
                <div class="form-group full-width">
                  <label>ใบประกอบวิชาชีพเภสัชกรรม</label>
                  <div class="license-viewer">
                    <img :src="`${useNuxtApp().$getApiBase()}/uploads/licenses/${selectedData.license_image}`"
                         style="cursor: pointer;"
                         class="license-img pointer-cursor"
                         @click="openImagePreview(`${useNuxtApp().$getApiBase()}/uploads/licenses/${selectedData.license_image}`)"
                         @error="(e) => e.target.src = 'https://via.placeholder.com/600x400?text=License+Image+Not+Found'">
                  </div>
                </div>
                <div class="form-group full-width">
                  <label>หมายเลขโทรศัพท์ *</label>
                  <input type="text" :value="selectedData.phone" readonly class="input-readonly">
                </div>
                <div class="form-group full-width">
                  <label>อีเมล *</label>
                  <input type="text" :value="selectedData.email" readonly class="input-readonly">
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <transition name="fade">
        <div v-if="isShowImagePreview" class="image-preview-overlay" @click.self="closeImagePreview">
          <div class="preview-container">
            <button class="close-preview-btn-top" @click="closeImagePreview">×</button>
            <img :src="imagePreviewUrl" class="full-preview-image" />
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
</style>
