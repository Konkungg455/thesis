<script setup>
/**
 * 🚩 /admin/prescriptions_admin — ติดตามการบันทึกใบสั่งยา PDF
 */
import { ref, computed, onMounted, watch } from 'vue'

definePageMeta({ middleware: 'admin-only' })

const historyData = ref([])
const searchQuery = ref('')
const isLoading = ref(false)

const handleFetch = async () => {
  isLoading.value = true
  try {
    const base = useNuxtApp().$getApiBase()
    const res = await $fetch(`${base}/get-prescriptions.php`, { credentials: 'include' })
    historyData.value = res.status === 'success' ? res.data : []
  } catch (err) {
    console.error('Fetch error:', err)
    historyData.value = []
  } finally {
    isLoading.value = false
  }
}

const filteredList = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return historyData.value
  return historyData.value.filter(item =>
    item.patient_name?.toLowerCase().includes(q) ||
    item.patient_full_name?.toLowerCase().includes(q) ||
    item.hn_no?.toString().toLowerCase().includes(q) ||
    item.pharmacist_name?.toLowerCase().includes(q) ||
    item.doctor_name?.toLowerCase().includes(q) ||
    item.pharmacist_username?.toLowerCase().includes(q) ||
    item.med_details?.toLowerCase().includes(q)
  )
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

watch(searchQuery, () => resetPage())

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
              <h2 class="presc-hero-title">ติดตามการบันทึกยา PDF</h2>
              <p class="presc-hero-subtitle">ดูประวัติการบันทึกใบสั่งยาของเภสัชกรทุกท่านในระบบ</p>
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
        <div class="presc-search-wrap">
          <div class="presc-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" v-model="searchQuery"
              placeholder="ค้นหาชื่อผู้ป่วย / HN / ชื่อเภสัชกร / ชื่อยา...">
            <button v-if="searchQuery" class="presc-search-clear" @click="searchQuery = ''" title="ล้างคำค้น">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div v-if="searchQuery" class="presc-search-hint">
            พบ <strong>{{ filteredList.length }}</strong> รายการจากคำค้น "{{ searchQuery }}"
          </div>
        </div>

        <!-- ===== Table ===== -->
        <div v-if="isLoading" class="presc-loading">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>กำลังโหลดข้อมูลใบสั่งยา...</span>
        </div>

        <div v-else-if="filteredList.length === 0" class="presc-empty">
          <div class="presc-empty-icon">
            <i class="fa-solid fa-folder-open"></i>
          </div>
          <h3>{{ searchQuery ? 'ไม่พบรายการที่ตรงกับคำค้น' : 'ยังไม่มีประวัติการบันทึกใบสั่งยา' }}</h3>
          <p>{{ searchQuery ? 'ลองเปลี่ยนคำค้นใหม่ หรือเคลียร์คำค้นเพื่อดูรายการทั้งหมด' : 'เมื่อเภสัชกรบันทึกใบสั่งยา รายการจะปรากฏที่นี่' }}</p>
        </div>

        <div v-else class="presc-table-card">
          <table class="presc-table">
            <thead>
              <tr>
                <th class="th-no">ลำดับ</th>
                <th>วันที่ - เวลา</th>
                <th>ผู้ป่วย (HN)</th>
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
                    <small>
                      <i class="fa-solid fa-id-card-clip"></i>
                      HN: {{ item.hn_no || '-' }}
                    </small>
                  </div>
                </td>
                <td>
                  <div class="med-cell" :title="item.med_details">
                    <i class="fa-solid fa-pills"></i>
                    <span>{{ item.med_details || '-' }}</span>
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
                  <button @click="viewPDF(item.id)" class="btn-view-pdf" title="เปิดดูใบสั่งยา PDF">
                    <i class="fa-solid fa-file-pdf"></i>
                    ดูใบสั่งยา
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
</style>
