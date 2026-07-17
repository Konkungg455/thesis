<script setup>
/**
 * 🚩 /admin/prescriptions_admin — ติดตามการบันทึกใบสรุปรายการยา PDF
 */
import { ref, computed, onMounted, watch } from 'vue'
import { formatMedDetailsWithQty } from '@/utils/prescription'
import { matchPrescriptionSearch, PRESCRIPTION_SEARCH_TOPICS, PRESCRIPTION_SEARCH_PLACEHOLDERS } from '@/utils/prescriptionSearch'

definePageMeta({ middleware: 'admin-only' })

const formatMedSummary = (item) => formatMedDetailsWithQty(item?.med_details, item?.med_qty)

const historyData = ref([])
const searchQuery = ref('')
const searchTopic = ref('all')
const isLoading = ref(false)

const searchPlaceholder = computed(() =>
  PRESCRIPTION_SEARCH_PLACEHOLDERS[searchTopic.value] || PRESCRIPTION_SEARCH_PLACEHOLDERS.all,
)

const handleFetch = async () => {
  isLoading.value = true
  try {
    const res = await $fetch(useNuxtApp().$apiUrl('get-prescriptions.php'), { credentials: 'include' })
    historyData.value = res.status === 'success' ? res.data : []
  } catch (err) {
    console.error('Fetch error:', err)
    historyData.value = []
  } finally {
    isLoading.value = false
  }
}

const filteredList = computed(() => {
  const q = searchQuery.value.trim()
  if (!q) return historyData.value
  const qLower = q.toLowerCase()
  return historyData.value.filter((item) => {
    if (matchPrescriptionSearch(item, q, searchTopic.value)) return true
    if (searchTopic.value === 'all' || searchTopic.value === 'med') {
      return formatMedSummary(item).toLowerCase().includes(qLower)
    }
    return false
  })
})

const uniquePharmaCount = computed(() => {
  const set = new Set()
  historyData.value.forEach(item => {
    const key = item.id_pharma || item.pharmacist_username || item.pharmacist_name || item.doctor_name
    if (key) set.add(String(key).trim())
  })
  return set.size
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

watch([searchQuery, searchTopic], () => resetPage())

const viewPDF = (id) => {
  window.open(`/prescription-view?id=${id}`, '_blank')
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('th-TH')
}

onMounted(() => {
  handleFetch()
})
</script>

<template>
  <AdminLayout active-tab="prescriptions">
    <div class="management-view fade-in">
      <section class="search-section">
        <!-- ===== Hero ===== -->
        <div class="presc-hero">
          <div class="presc-hero-left">
            <div class="presc-hero-icon">
              <i class="fa-solid fa-file-prescription"></i>
            </div>
            <div>
              <h2 class="presc-hero-title">ติดตามใบสรุปรายการยา PDF</h2>
              <p class="presc-hero-subtitle">ดูประวัติการบันทึกใบสรุปรายการยาของเภสัชกรทุกท่านในระบบ</p>
            </div>
          </div>
          <div class="presc-hero-stats">
            <div class="presc-stat-card total">
              <span class="presc-stat-label">รายการทั้งหมด</span>
              <span class="presc-stat-value">{{ historyData.length.toLocaleString('th-TH') }}</span>
              <i class="fa-solid fa-file-prescription presc-stat-bg"></i>
            </div>
            <div class="presc-stat-card pharma">
              <span class="presc-stat-label">เภสัชกรที่บันทึก</span>
              <span class="presc-stat-value">{{ uniquePharmaCount.toLocaleString('th-TH') }} <small>ท่าน</small></span>
              <i class="fa-solid fa-user-doctor presc-stat-bg"></i>
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
                <option
                  v-for="opt in PRESCRIPTION_SEARCH_TOPICS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>
          <div v-if="searchQuery" class="mgmt-search-hint">
            พบ <strong>{{ filteredList.length }}</strong> รายการจากคำค้น "{{ searchQuery }}"
          </div>
        </div>

        <!-- ===== Table ===== -->
        <div v-if="isLoading" class="presc-loading">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>กำลังโหลดข้อมูลใบสรุปรายการยา...</span>
        </div>

        <div v-else-if="filteredList.length === 0" class="presc-empty">
          <div class="presc-empty-icon">
            <i class="fa-solid fa-folder-open"></i>
          </div>
          <h3>{{ searchQuery ? 'ไม่พบรายการที่ตรงกับคำค้น' : 'ยังไม่มีประวัติการบันทึกใบสรุปรายการยา' }}</h3>
          <p>{{ searchQuery ? 'ลองเปลี่ยนคำค้นใหม่ หรือเคลียร์คำค้นเพื่อดูรายการทั้งหมด' : 'เมื่อเภสัชกรบันทึกใบสรุปรายการยา รายการจะปรากฏที่นี่' }}</p>
        </div>

        <div v-else class="presc-table-card">
          <table class="presc-table">
            <thead>
              <tr>
                <th class="th-no">ลำดับ</th>
                <th>วันที่ - เวลา</th>
                <th>ผู้ใช้บริการ</th>
                <th>รายการยา</th>
                <th>อาการป่วย</th>
                <th>เภสัชกรผู้บันทึก</th>
                <th class="th-action">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in pagedList" :key="item.id">
                <td class="td-no">
                  <span class="td-no-badge">{{ pageStart + index }}</span>
                </td>
                <td>
                  <div class="date-cell">
                    <i class="fa-regular fa-clock"></i>
                    <span>{{ formatDate(item.created_at) }}</span>
                  </div>
                </td>
                <td>
                  <div class="patient-cell">
                    <strong>{{ item.patient_full_name || item.patient_name || '-' }}</strong>
                  </div>
                </td>
                <td>
                  <div class="med-cell" :title="formatMedSummary(item)">
                    <i class="fa-solid fa-pills"></i>
                    <span>{{ formatMedSummary(item) || '-' }}</span>
                  </div>
                </td>
                <td>
                  <div class="symptom-cell" :title="item.symptom_name">
                    <i class="fa-solid fa-notes-medical"></i>
                    <span>{{ item.symptom_name || '-' }}</span>
                  </div>
                </td>
                <td>
                  <div class="pharma-cell">
                    <div class="pharma-chip" :title="item.doctor_name">
                      <i class="fa-solid fa-user-doctor"></i>
                      <span>{{ item.pharmacist_name || (item.doctor_name || 'เภสัชกร').replace(/^ภก\.\s*/, '') || '-' }}</span>
                    </div>
                    <small v-if="item.store_name || item.work_place" class="pharma-store">
                      <i class="fa-solid fa-store"></i>
                      {{ item.store_name || item.work_place }}
                    </small>
                    <small v-else class="pharma-store pharma-store--empty">
                      <i class="fa-solid fa-store-slash"></i>
                      ยังไม่ระบุร้านยา
                    </small>
                  </div>
                </td>
                <td class="td-action">
                  <button @click="viewPDF(item.id)" class="btn-view-pdf" title="เปิดดูใบสรุปรายการยา PDF">
                    <i class="fa-solid fa-file-pdf"></i>
                    ดูใบสรุปรายการยา
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
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
  </AdminLayout>
</template>

<style scoped>
@import "@/assets/admin_dashboard_page.css";
@import "@/assets/admin-shared.css";

/* 🏪 บรรทัดร้านยา (แทน @username) */
.pharma-store {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #4338ca;
    background: linear-gradient(90deg, #eef2ff 0%, #e0e7ff 100%);
    padding: 3px 8px;
    border-radius: 6px;
    border-left: 3px solid #818cf8;
    font-weight: 600;
    margin-top: 4px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.pharma-store i { font-size: 10px; }

/* 🩺 อาการป่วย (คอลัมน์หลังรายการยา) */
.symptom-cell {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 220px;
    color: #0f766e;
}
.symptom-cell i { color: #14b8a6; flex-shrink: 0; }
.symptom-cell span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.pharma-store--empty {
    color: #94a3b8;
    background: #f1f5f9;
    border-left-color: #cbd5e1;
    font-style: italic;
    font-weight: 500;
}
/* ตารางยาว — scroll ในกรอบ ไม่ดันชิดขอบจอ */
.presc-table-card {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
</style>
