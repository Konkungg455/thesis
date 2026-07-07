<script setup>
/**
 * 🚩 /admin/usage — รายการการให้บริการ (แบบทั่วไป / บัตรทอง)
 *    แสดงประวัติว่าใครใช้บริการแบบใด มีปุ่ม Detail สำหรับดูรายละเอียดในโมดอล
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'

definePageMeta({ middleware: 'admin-only' })

const route = useRoute()
const router = useRouter()

const serviceUsageData = useState('admin-service-usage', () => [])
const selectedService = ref(null)
const showServiceModal = ref(false)
const serviceTypeFilter = ref('all')
const searchQuery = ref('')
const searchTopic = ref('all')
const isLoading = ref(false)
const fetchError = ref('')
const highlightCode = ref('')

// ===== Pagination =====
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const pageSize = ref(20)
const currentPage = ref(1)

const SERVICE_STATUS_LABEL = {
  completed: 'รับบริการแล้ว',
  in_progress: 'กำลังให้บริการ',
  pending: 'รอรับบริการ',
  cancelled: 'ยกเลิกบริการ',
}

const getPharmacyStoreName = (item) => {
  const name = String(item?.store_name || item?.work_place || '').trim()
  return name || 'ยังไม่ระบุร้านยา'
}

const getPharmacistDisplayName = (item) => {
  const raw = String(item?.pharmacist_name || '').trim()
  if (!raw) return '-'
  if (/^เภสัช\s*#/i.test(raw)) return raw
  const name = raw.replace(/^ภก\.\s*/, '').trim()
  return name ? `ภก. ${name}` : '-'
}

const SEARCH_TOPICS = [
  { value: 'all', label: 'ทุกหัวข้อ', placeholder: 'ค้นหาการใช้บริการ ชื่อผู้ใช้ รหัสบริการ ชื่อเภสัช หรือร้านยาเภสัช...' },
  { value: 'user', label: 'ผู้ใช้บริการ', placeholder: 'ค้นหาชื่อผู้ใช้บริการ...' },
  { value: 'code', label: 'รหัสบริการ', placeholder: 'ค้นหารหัสบริการ เช่น SRV-001...' },
  { value: 'pharma', label: 'เภสัช', placeholder: 'ค้นหาชื่อเภสัชกร...' },
  { value: 'store', label: 'ร้านยาเภสัช', placeholder: 'ค้นหาชื่อร้านยาเภสัช...' },
]

const searchPlaceholder = computed(() =>
  SEARCH_TOPICS.find((t) => t.value === searchTopic.value)?.placeholder
  || SEARCH_TOPICS[0].placeholder,
)

const matchesSearch = (item, q, topic) => {
  const fields = {
    all: [
      item.user_name,
      item.service_code,
      item.pharmacist_name,
      getPharmacistDisplayName(item),
      getPharmacyStoreName(item),
    ],
    user: [item.user_name],
    code: [item.service_code],
    pharma: [item.pharmacist_name, getPharmacistDisplayName(item)],
    store: [item.store_name, item.work_place, getPharmacyStoreName(item)],
  }
  const list = fields[topic] || fields.all
  return list.some((v) => String(v || '').toLowerCase().includes(q))
}

const handleFetch = async () => {
  isLoading.value = true
  fetchError.value = ''
  try {
    const { apiUrl } = useApiBase()
    const res = await $fetch(apiUrl('get-service-usage.php'), { credentials: 'include' })
    if (res?.status === 'success' && Array.isArray(res.data)) {
      serviceUsageData.value = res.data
    } else {
      serviceUsageData.value = []
      fetchError.value = res?.message || 'ไม่สามารถโหลดข้อมูลได้'
    }
  } catch (err) {
    console.error('get-service-usage:', err)
    serviceUsageData.value = []
    fetchError.value = 'เชื่อมต่อ API ไม่สำเร็จ — ตรวจสอบ DATABASE_URL / Supabase และล็อกอินเป็น admin'
  } finally {
    isLoading.value = false
  }
}

const serviceStats = computed(() => {
  const list = Array.isArray(serviceUsageData.value) ? serviceUsageData.value : []
  return {
    total: list.length,
    gold: list.filter(s => s.service_type === 'gold_card').length,
    normal: list.filter(s => s.service_type === 'normal').length,
  }
})

const filteredList = computed(() => {
  let list = Array.isArray(serviceUsageData.value) ? serviceUsageData.value : []
  if (serviceTypeFilter.value !== 'all') {
    list = list.filter(item => item.service_type === serviceTypeFilter.value)
  }
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return list
  return list.filter(item => matchesSearch(item, q, searchTopic.value))
})

// ===== Pagination derivatives =====
const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredList.value.length / pageSize.value))
})

const pagedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

const pageStart = computed(() => {
  if (filteredList.value.length === 0) return 0
  return (currentPage.value - 1) * pageSize.value + 1
})

const pageEnd = computed(() => {
  return Math.min(currentPage.value * pageSize.value, filteredList.value.length)
})

// แสดงปุ่มเลขหน้าแบบกระชับ (มีจุดไข่ปลา ... สำหรับช่วงกลาง)
const pageNumbers = computed(() => {
  const total = totalPages.value
  const cur = currentPage.value
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages = new Set([1, 2, total - 1, total, cur - 1, cur, cur + 1])
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const result = []
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i])
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) {
      result.push('...')
    }
  }
  return result
})

const goToPage = (p) => {
  if (typeof p !== 'number') return
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
}

const goPrev = () => goToPage(currentPage.value - 1)
const goNext = () => goToPage(currentPage.value + 1)

// ถ้าตัวกรอง/ค้นหา/ขนาดหน้าเปลี่ยน ให้รีเซ็ตกลับหน้า 1
watch([searchQuery, searchTopic, serviceTypeFilter, pageSize], () => {
  currentPage.value = 1
})

// ถ้ามีการลบรายการจนหน้าปัจจุบันเกินขอบ ก็ดึงกลับมาให้พอดี
watch(totalPages, (tp) => {
  if (currentPage.value > tp) currentPage.value = tp
})

const formatThaiDate = (dateStr) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`
}

const openServiceDetail = (item) => {
  selectedService.value = item
  showServiceModal.value = true
}
const closeServiceModal = () => {
  showServiceModal.value = false
  setTimeout(() => { selectedService.value = null }, 300)
}

// ===== Deep link: ?code=SRV-XXX จะค้น+เปิด modal ของรายการนั้นโดยอัตโนมัติ =====
const applyCodeFromQuery = async () => {
  const code = (route.query.code || '').toString().trim()
  if (!code) return
  searchQuery.value = code
  highlightCode.value = code.toUpperCase()
  await nextTick()
  const list = Array.isArray(serviceUsageData.value) ? serviceUsageData.value : []
  const match = list.find(
    item => (item.service_code || '').toUpperCase() === code.toUpperCase()
  )
  if (match) {
    openServiceDetail(match)
  }
  setTimeout(() => { highlightCode.value = '' }, 4500)
}

watch(() => route.query.code, async () => {
  if (Array.isArray(serviceUsageData.value) && serviceUsageData.value.length) {
    await applyCodeFromQuery()
  }
})

onMounted(async () => {
  await handleFetch()
  await applyCodeFromQuery()
})
</script>

<template>
  <AdminLayout active-tab="service">
    <div class="management-view fade-in">
      <section class="search-section">
        <!-- ===== Hero ===== -->
        <div class="mgmt-hero hero-service">
          <div class="mgmt-hero-left">
            <div class="mgmt-hero-icon">
              <i class="fa-solid fa-clipboard-list"></i>
            </div>
            <div>
              <h2 class="mgmt-hero-title">การให้บริการ</h2>
              <p class="mgmt-hero-subtitle">ตรวจสอบประวัติการให้บริการแก่ผู้ใช้บริการแต่ละราย</p>
            </div>
          </div>
          <div class="mgmt-hero-stats">
            <div class="mgmt-stat-card">
              <span class="mgmt-stat-label">รายการทั้งหมด</span>
              <span class="mgmt-stat-value">{{ serviceStats.total.toLocaleString('th-TH') }}</span>
              <i class="fa-solid fa-clipboard-list mgmt-stat-bg"></i>
            </div>
          </div>
        </div>

        <!-- ===== Search + Filter ===== -->
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
        </div>

        <!-- ===== List Card ===== -->
        <div class="service-list-card">
          <div class="service-list-header">
            <h3 class="service-list-title">การใช้บริการ</h3>
            <p class="service-list-subtitle">
              ตรวจสอบการใช้งานและดูว่าใครใช้บริการแบบไหน ใครรับบริการบ้าง
            </p>
          </div>

          <div v-if="isLoading" class="mgmt-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>กำลังโหลดข้อมูลการให้บริการ...</span>
          </div>

          <div v-else-if="filteredList.length === 0" class="mgmt-empty">
            <div class="mgmt-empty-icon">
              <i :class="searchQuery ? 'fa-solid fa-search' : 'fa-solid fa-folder-open'"></i>
            </div>
            <h3>{{ searchQuery ? 'ไม่พบข้อมูลที่ตรงกับคำค้น' : (fetchError || 'ยังไม่มีรายการให้บริการ') }}</h3>
            <p>{{ searchQuery ? 'ลองเปลี่ยนคำค้นใหม่' : (fetchError ? 'ตรวจสอบ session admin และการเชื่อมต่อ Supabase' : 'เมื่อมีผู้ใช้จองปรึกษาเภสัชกร ระบบจะบันทึกลงตาราง service_usage อัตโนมัติ') }}</p>
          </div>

          <!-- ===== Header (เฉพาะจอใหญ่) ===== -->
          <div v-if="!isLoading && filteredList.length > 0" class="service-table-header">
            <div class="service-th th-user">
              <i class="fa-solid fa-user"></i> ผู้ใช้บริการ
            </div>
            <div class="service-th th-code">
              <i class="fa-solid fa-barcode"></i> รหัสบริการ
            </div>
            <div class="service-th th-pharma">
              <i class="fa-solid fa-user-doctor"></i> เภสัช
            </div>
            <div class="service-th th-store">
              <i class="fa-solid fa-store"></i> ร้านยาเภสัช
            </div>
            <div class="service-th th-action">
              จัดการ
            </div>
          </div>

          <div v-if="!isLoading && filteredList.length > 0" class="service-rows">
            <div v-for="item in pagedList" :key="item.id"
              class="service-row"
              :class="[
                `service-row-${item.service_type}`,
                { 'service-row-highlight': highlightCode && (item.service_code || '').toUpperCase() === highlightCode }
              ]">
              <div class="service-col service-col-user">
                <span class="service-cell-label">ผู้ใช้บริการ</span>
                <span class="service-cell-value">{{ item.user_name }}</span>
              </div>
              <div class="service-col">
                <span class="service-cell-label">รหัสบริการ</span>
                <span class="service-cell-value mono">{{ item.service_code }}</span>
              </div>
              <div class="service-col">
                <span class="service-cell-label">เภสัช</span>
                <span class="service-cell-value">{{ getPharmacistDisplayName(item) }}</span>
              </div>
              <div class="service-col service-col-store">
                <span class="service-cell-label">ร้านยาเภสัช</span>
                <span class="service-cell-value service-store-value" :class="{ 'is-empty': !String(item?.store_name || item?.work_place || '').trim() }">
                  <i class="fa-solid fa-store"></i>
                  {{ getPharmacyStoreName(item) }}
                </span>
              </div>
              <div class="service-col service-col-action">
                <button class="btn-service-detail" @click="openServiceDetail(item)">
                  Detail
                </button>
              </div>
            </div>
          </div>

          <!-- ===== Pagination ===== -->
          <div v-if="!isLoading && filteredList.length > 0" class="service-pagination">
            <div class="pagination-info">
              แสดง <strong>{{ pageStart }}–{{ pageEnd }}</strong> จาก
              <strong>{{ filteredList.length.toLocaleString('th-TH') }}</strong> รายการ
            </div>

            <div class="pagination-controls">
              <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(1)" title="หน้าแรก">
                <i class="fa-solid fa-angles-left"></i>
              </button>
              <button class="page-btn" :disabled="currentPage === 1" @click="goPrev" title="ก่อนหน้า">
                <i class="fa-solid fa-angle-left"></i>
              </button>

              <template v-for="(p, idx) in pageNumbers" :key="idx">
                <span v-if="p === '...'" class="page-ellipsis">…</span>
                <button v-else class="page-btn page-num" :class="{ active: p === currentPage }" @click="goToPage(p)">
                  {{ p }}
                </button>
              </template>

              <button class="page-btn" :disabled="currentPage === totalPages" @click="goNext" title="ถัดไป">
                <i class="fa-solid fa-angle-right"></i>
              </button>
              <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(totalPages)" title="หน้าสุดท้าย">
                <i class="fa-solid fa-angles-right"></i>
              </button>
            </div>

            <div class="pagination-size">
              <label for="page-size">ต่อหน้า</label>
              <select id="page-size" v-model.number="pageSize">
                <option v-for="opt in PAGE_SIZE_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ===== Modal: รายละเอียดการให้บริการ ===== -->
    <template #overlays>
      <transition name="pop">
        <div v-if="showServiceModal && selectedService" class="modal-overlay" @click.self="closeServiceModal">
          <div class="service-detail-card shadow-lg">
            <div class="service-modal-head">
              <div class="service-modal-head-text">
                <span class="service-modal-eyebrow">
                  <i class="fa-solid fa-clipboard-list"></i> รายละเอียดการให้บริการ
                </span>
                <h3>{{ selectedService.service_code }}</h3>
              </div>
              <button class="close-x service-close-x" @click="closeServiceModal" aria-label="ปิด">×</button>
            </div>

            <div class="service-detail-body">
              <div class="service-detail-hero">
                <div class="service-detail-hero-main">
                  <span class="service-detail-avatar" aria-hidden="true">
                    <i class="fa-solid fa-user"></i>
                  </span>
                  <div class="service-detail-hero-text">
                    <span class="service-detail-label">ผู้ใช้บริการ</span>
                    <strong>{{ selectedService.user_name }}</strong>
                  </div>
                </div>
                <span class="service-status-badge service-detail-status" :class="`status-${selectedService.service_status}`">
                  <i :class="{
                    'fa-solid fa-circle-check': selectedService.service_status === 'completed',
                    'fa-solid fa-spinner': selectedService.service_status === 'in_progress',
                    'fa-solid fa-hourglass-half': selectedService.service_status === 'pending',
                    'fa-solid fa-circle-xmark': selectedService.service_status === 'cancelled'
                  }"></i>
                  {{ SERVICE_STATUS_LABEL[selectedService.service_status] }}
                </span>
              </div>

              <div class="service-detail-grid">
                <div class="service-detail-item">
                  <span class="service-detail-label"><i class="fa-solid fa-barcode"></i> รหัสบริการ</span>
                  <span class="service-detail-value mono">{{ selectedService.service_code }}</span>
                </div>
                <div class="service-detail-item">
                  <span class="service-detail-label"><i class="fa-regular fa-calendar"></i> วันที่</span>
                  <span class="service-detail-value">{{ formatThaiDate(selectedService.service_date) }}</span>
                </div>
                <div class="service-detail-item">
                  <span class="service-detail-label"><i class="fa-solid fa-user-doctor"></i> เภสัช</span>
                  <span class="service-detail-value">{{ getPharmacistDisplayName(selectedService) }}</span>
                </div>
                <div class="service-detail-item">
                  <span class="service-detail-label"><i class="fa-solid fa-store"></i> ร้านยาเภสัช</span>
                  <span
                    class="service-detail-value service-store-value"
                    :class="{ 'is-empty': !String(selectedService?.store_name || selectedService?.work_place || '').trim() }"
                  >
                    {{ getPharmacyStoreName(selectedService) }}
                  </span>
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

.mgmt-hero-stats {
  position: relative;
}

.btn-refresh-service {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-refresh-service:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ===== Service Table Header ===== */
.service-table-header {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1.2fr auto;
  gap: 16px;
  align-items: center;
  padding: 14px 24px;
  background: linear-gradient(90deg, #f1f4ff 0%, #f5f0ff 100%);
  border-top: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #4a5170;
}

.service-th {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.service-th i {
  color: #6366f1;
  font-size: 0.85rem;
}

.service-th.th-action {
  justify-self: end;
  padding-right: 0.5rem;
}

.service-store-value {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  white-space: normal;
  line-height: 1.35;
}

.service-store-value i {
  color: #6366f1;
  flex-shrink: 0;
}

.service-store-value.is-empty {
  color: #94a3b8;
  font-weight: 600;
}

.service-store-value.is-empty i {
  color: #cbd5e1;
}

/* รวมกับแถวข้อมูลที่เปลี่ยนเป็น 2 คอลัมน์ตั้งแต่ ≤1024px → ซ่อน header ตารางให้ตรงกัน ไม่เหลื่อม */
@media (max-width: 1024px) {
  .service-table-header { display: none; }
}

/* จอแคบ/แท็บเล็ตแนวนอน (1025–1280px): ลดขนาดตัวอักษร/ป้าย/ปุ่ม ให้ข้อความไม่ถูกตัดและดูพอดี */
@media (min-width: 1025px) and (max-width: 1280px) {
  .mgmt-hero-title { font-size: 1.18rem; }
  .mgmt-hero-subtitle { font-size: 0.8rem; }
  .service-list-title { font-size: 0.95rem; }
  .service-list-subtitle { font-size: 0.78rem; }

  .service-table-header,
  .service-row {
    gap: 10px;
    padding-left: 16px;
    padding-right: 16px;
  }
  .service-table-header { font-size: 0.7rem; }
  .service-cell-value { font-size: 0.82rem; }
  .service-type-badge,
  .service-format-badge,
  .service-status-badge { font-size: 0.72rem; padding: 4px 9px; }
  .btn-service-detail { font-size: 0.76rem; padding: 8px 14px; }
}

/* ===== Pagination ===== */
.service-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid #e7e9f3;
  background: #fafbff;
  border-radius: 0 0 14px 14px;
}

.pagination-info {
  color: #5a6378;
  font-size: 0.9rem;
}

.pagination-info strong {
  color: #2c3346;
  font-weight: 600;
}

.pagination-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.page-btn {
  min-width: 36px;
  height: 36px;
  padding: 0 0.55rem;
  border: 1px solid #d8dcec;
  border-radius: 8px;
  background: #fff;
  color: #4a5170;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.page-btn:hover:not(:disabled):not(.active) {
  background: #eef1ff;
  border-color: #b9c2ea;
  color: #2c3a8a;
}

.page-btn.active {
  background: linear-gradient(135deg, #5b6cf7, #7b5cf7);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
  box-shadow: 0 4px 10px rgba(91, 108, 247, 0.3);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 36px;
  color: #9aa3bf;
}

.pagination-size {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  color: #5a6378;
}

.pagination-size select {
  padding: 0.35rem 0.6rem;
  border: 1px solid #d8dcec;
  border-radius: 8px;
  background: #fff;
  color: #2c3346;
  font-size: 0.88rem;
  cursor: pointer;
}

@media (max-width: 640px) {
  .service-pagination {
    justify-content: center;
  }
  .pagination-info {
    order: 3;
    width: 100%;
    text-align: center;
  }
}

/* ===== Highlight row เมื่อเปิดผ่าน ?code=SRV-XXX ===== */
.service-row-highlight {
  position: relative;
  background: linear-gradient(90deg, #fef9c3 0%, #ecfccb 100%) !important;
  box-shadow: inset 4px 0 0 #16a34a;
  animation: serviceHighlightPulse 1.8s ease-in-out 2;
}
@keyframes serviceHighlightPulse {
  0%, 100% { box-shadow: inset 4px 0 0 #16a34a, 0 0 0 0 rgba(22, 163, 74, 0); }
  50% { box-shadow: inset 4px 0 0 #16a34a, 0 0 0 6px rgba(22, 163, 74, 0.18); }
}

:global(html.dark) .service-detail-card {
  background: #0f172a !important;
  border: 1px solid rgba(96, 165, 250, 0.36) !important;
  color: #f8fafc !important;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.6) !important;
}

:global(html.dark) .service-detail-card .service-modal-head {
  background: linear-gradient(135deg, #0b1437 0%, #1e3a8a 100%) !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.32) !important;
}

:global(html.dark) .service-detail-card .service-modal-head h3,
:global(html.dark) .service-detail-card .service-modal-eyebrow {
  color: #ffffff !important;
}

:global(html.dark) .service-detail-card .service-close-x {
  background: rgba(255, 255, 255, 0.14) !important;
  border-color: rgba(255, 255, 255, 0.22) !important;
  color: #ffffff !important;
}

:global(html.dark) .service-detail-card .service-detail-body {
  background: #0f172a !important;
}

:global(html.dark) .service-detail-card .service-detail-hero {
  background: linear-gradient(135deg, #1e293b 0%, #172554 100%) !important;
  border-color: rgba(125, 211, 252, 0.28) !important;
}

:global(html.dark) .service-detail-card .service-detail-hero-text strong {
  color: #ffffff !important;
}

:global(html.dark) .service-detail-card .service-detail-hero .service-detail-label {
  color: #93c5fd !important;
}

:global(html.dark) .service-detail-card .service-detail-status.service-status-badge.status-completed {
  background: rgba(22, 163, 74, 0.42) !important;
  border-color: rgba(74, 222, 128, 0.6) !important;
  color: #ffffff !important;
}

:global(html.dark) .service-detail-card .service-detail-status.service-status-badge.status-pending {
  background: rgba(217, 119, 6, 0.42) !important;
  border-color: rgba(251, 191, 36, 0.6) !important;
  color: #ffffff !important;
}

:global(html.dark) .service-detail-card .service-detail-status.service-status-badge.status-in_progress {
  background: rgba(2, 132, 199, 0.42) !important;
  border-color: rgba(56, 189, 248, 0.6) !important;
  color: #ffffff !important;
}

:global(html.dark) .service-detail-card .service-detail-status.service-status-badge.status-cancelled {
  background: rgba(220, 38, 38, 0.42) !important;
  border-color: rgba(248, 113, 113, 0.6) !important;
  color: #ffffff !important;
}

:global(html.dark) .service-detail-card .service-detail-status i {
  color: inherit !important;
}

:global(html.dark) .service-detail-card .service-detail-item {
  background: #1e293b !important;
  border: 1px solid rgba(125, 211, 252, 0.34) !important;
  color: #f8fafc !important;
}

:global(html.dark) .service-detail-card .service-detail-label {
  color: #dbeafe !important;
}

:global(html.dark) .service-detail-card .service-detail-label i {
  color: #93c5fd !important;
}

:global(html.dark) .service-detail-card .service-detail-value,
:global(html.dark) .service-detail-card .service-detail-note {
  color: #ffffff !important;
}

:global(html.dark) .service-detail-card .service-detail-value.mono {
  color: #c4b5fd !important;
}
</style>
