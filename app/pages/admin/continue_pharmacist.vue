<script setup>
/**
 * 🚩 /admin/continue_pharmacist — รายการเภสัชกรที่รอการตรวจสอบ/อนุมัติ (status_verify === 0)
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

const tabMeta = {
  label: 'เภสัชกรที่รออนุมัติ',
  title: 'เภสัชกรที่รอดำเนินการ',
  subtitle: 'คำขอสมัครเภสัชกรใหม่ที่รอการตรวจสอบและอนุมัติ',
  icon: 'fa-solid fa-address-card',
  statLabel: 'รายการรออนุมัติ',
  placeholder: 'ค้นหาชื่อเภสัชกร / username...',
}

const handleFetch = async () => {
  isLoading.value = true
  try {
    const base = useNuxtApp().$getApiBase()
    const res = await $fetch(`${base}/get-pharma.php`)
    if (res.status === 'success' || res.authenticated) {
      const data = Array.isArray(res.data) ? res.data : [res.data]
      allData.value = data.filter(item => item.status_verify == 0)
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

const pendingCount = computed(() =>
  allData.value.filter(item => item.status_verify == 0).length
)

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

watch(searchQuery, () => resetPage())

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

const handleVerifyAction = async (id, status) => {
  const actionText = status === 1 ? 'อนุมัติ' : 'ปฏิเสธ/ตีกลับ'
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการ ${actionText} เภสัชกรรายนี้?`)) return
  try {
    const res = await $fetch(`${useNuxtApp().$getApiBase()}/verify-pharma.php?id=${id}&status=${status}`)
    alert(res.message || 'ดำเนินการสำเร็จ')
    closeModal()
    handleFetch()
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์')
  }
}

onMounted(() => {
  handleFetch()
})
</script>

<template>
  <AdminLayout active-tab="pending">
    <div class="management-view fade-in">
      <section class="search-section">
        <!-- ===== Hero ===== -->
        <div class="mgmt-hero hero-pending">
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
            <div v-if="pendingCount > 0" class="mgmt-stat-card alert">
              <span class="mgmt-stat-label">รอตรวจสอบ</span>
              <span class="mgmt-stat-value">{{ pendingCount }}</span>
              <i class="fa-solid fa-bell mgmt-stat-bg"></i>
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
            class="mgmt-card card-pending" @click="openDetail(item)">
            <span class="mgmt-card-no">#{{ pageStart + index }}</span>

            <div class="mgmt-card-avatar avatar-pending">
              <img
                :src="`${useNuxtApp().$getApiBase()}/images_pharma/${item.image || 'default.png'}?v=20260703a`"
                :alt="item.username || 'avatar'"
                @error="(e) => { e.target.style.display='none'; e.target.parentElement.classList.add('avatar-fallback'); }">
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
                <span class="mgmt-tag tag-pending">
                  <i class="fa-solid fa-hourglass-half"></i> รอตรวจสอบ
                </span>
              </div>
            </div>

            <div class="mgmt-card-actions">
              <button class="mgmt-btn verify" @click.stop="openDetail(item)">
                <i class="fa-solid fa-clipboard-check"></i><span>ตรวจสอบ</span>
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

            <div class="verify-actions">
              <button class="btn-confirm-approve" @click="handleVerifyAction(selectedData.id, 1)">
                ✅ ยืนยันการอนุมัติ
              </button>
              <button class="btn-confirm-reject" @click="handleVerifyAction(selectedData.id, 2)">
                ❌ ปฏิเสธการสมัคร
              </button>
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
</style>
