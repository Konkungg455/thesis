<script setup>
/**
 * /shop/prescriptions — เจ้าของร้านยา ดูใบสั่งยา PDF ที่เภสัชกรในร้านบันทึก
 */
import { ref, computed, onMounted, watch } from 'vue'

definePageMeta({ middleware: 'store-only' })

const { apiUrl } = useApiBase()
const historyData = ref([])
const isLoading = ref(false)
const searchQuery = ref('')
const pharmaFilter = ref('all')
const fetchError = ref('')

const handleFetch = async () => {
    isLoading.value = true
    fetchError.value = ''
    try {
        const res = await $fetch(apiUrl('get-prescriptions.php'), { credentials: 'include' })
        if (res?.status === 'success' && Array.isArray(res.data)) {
            historyData.value = res.data
        } else {
            historyData.value = []
            fetchError.value = res?.message || 'ไม่พบข้อมูล'
        }
    } catch (err) {
        console.error(err)
        historyData.value = []
        fetchError.value = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — กรุณาเข้าสู่ระบบใหม่'
    } finally {
        isLoading.value = false
    }
}

const pharmaOptions = computed(() => {
    const set = new Map()
    historyData.value.forEach(item => {
        const id = item.id_pharma || item.pharmacist_username || item.pharmacist_name
        if (!id) return
        const key = String(id)
        const name = item.pharmacist_name || item.doctor_name || item.pharmacist_username || 'เภสัชกร'
        if (!set.has(key)) set.set(key, name)
    })
    return Array.from(set, ([id, name]) => ({ id, name }))
})

const filteredList = computed(() => {
    let list = historyData.value
    if (pharmaFilter.value !== 'all') {
        list = list.filter(item => {
            const id = String(item.id_pharma || item.pharmacist_username || item.pharmacist_name || '')
            return id === pharmaFilter.value
        })
    }
    const q = searchQuery.value.toLowerCase().trim()
    if (!q) return list
    return list.filter(item =>
        item.patient_full_name?.toLowerCase().includes(q) ||
        item.patient_name?.toLowerCase().includes(q) ||
        item.med_details?.toLowerCase().includes(q) ||
        item.pharmacist_name?.toLowerCase().includes(q) ||
        item.hn_no?.toString().toLowerCase().includes(q)
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

watch([searchQuery, pharmaFilter], () => resetPage())

const formatDate = (s) => s ? new Date(s).toLocaleString('th-TH') : '-'
const formatPrice = (p) => p ? parseFloat(p).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '0.00'
const viewPDF = (id) => window.open(`/prescription-view?id=${id}`, '_blank')

const stats = computed(() => {
    const list = historyData.value
    const totalAmount = list.reduce((sum, x) => sum + (parseFloat(x.total_amount) || 0), 0)
    return {
        total: list.length,
        pharmaCount: pharmaOptions.value.length,
        totalAmount,
    }
})

onMounted(handleFetch)
</script>

<template>
    <div class="shop-presc-page">
        <Header_store />

        <main class="shop-presc-main">
            <section class="shop-presc-hero">
                <div class="shop-presc-hero-left">
                    <div class="shop-presc-icon">
                        <i class="fa-solid fa-file-prescription"></i>
                    </div>
                    <div>
                        <h1>ใบสั่งยา PDF ของร้าน</h1>
                        <p>ติดตามใบสั่งยาที่เภสัชกรในร้านของคุณบันทึก</p>
                    </div>
                </div>
                <div class="shop-presc-stats">
                    <div class="shop-presc-stat">
                        <span class="stat-label">ใบสั่งยาทั้งหมด</span>
                        <span class="stat-value">{{ stats.total.toLocaleString('th-TH') }}</span>
                    </div>
                    <div class="shop-presc-stat">
                        <span class="stat-label">เภสัชกรในร้าน</span>
                        <span class="stat-value">{{ stats.pharmaCount }}</span>
                    </div>
                    <div class="shop-presc-stat">
                        <span class="stat-label">มูลค่ารวม</span>
                        <span class="stat-value">฿ {{ formatPrice(stats.totalAmount) }}</span>
                    </div>
                </div>
            </section>

            <section class="shop-presc-filter">
                <div class="filter-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input v-model="searchQuery"
                           placeholder="ค้นหาชื่อผู้ป่วย / HN / ยา / เภสัชกร..." />
                    <button v-if="searchQuery" @click="searchQuery = ''" class="clear-btn">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="filter-select">
                    <label>เภสัชกร</label>
                    <select v-model="pharmaFilter">
                        <option value="all">ทั้งหมด</option>
                        <option v-for="opt in pharmaOptions" :key="opt.id" :value="opt.id">
                            {{ opt.name }}
                        </option>
                    </select>
                </div>
            </section>

            <section class="shop-presc-content">
                <div v-if="isLoading" class="state-block">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <p>กำลังโหลดข้อมูล...</p>
                </div>
                <div v-else-if="fetchError" class="state-block error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>{{ fetchError }}</p>
                </div>
                <div v-else-if="filteredList.length === 0" class="state-block">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>{{ searchQuery || pharmaFilter !== 'all' ? 'ไม่พบรายการที่ตรงกับเงื่อนไข' : 'ยังไม่มีใบสั่งยาในระบบ' }}</p>
                </div>

                <div v-else class="shop-presc-table-wrap">
                    <table class="shop-presc-table">
                        <thead>
                            <tr>
                                <th class="th-no">#</th>
                                <th>วันที่ - เวลา</th>
                                <th>ผู้ป่วย (HN)</th>
                                <th>เภสัชกรผู้บันทึก</th>
                                <th>รายการยา</th>
                                <th class="text-right">ยอดรวม</th>
                                <th class="th-action">PDF</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(item, idx) in pagedList" :key="item.id">
                                <td class="td-no">{{ pageStart + idx }}</td>
                                <td>
                                    <div class="date-cell">
                                        <i class="fa-regular fa-clock"></i> {{ formatDate(item.created_at) }}
                                    </div>
                                </td>
                                <td>
                                    <strong>{{ item.patient_full_name || item.patient_name || '-' }}</strong>
                                    <small class="hn-line"><i class="fa-solid fa-id-card-clip"></i> {{ item.hn_no || '-' }}</small>
                                </td>
                                <td>
                                    <span class="pharma-chip"><i class="fa-solid fa-user-doctor"></i> {{ item.pharmacist_name || item.doctor_name || '-' }}</span>
                                </td>
                                <td class="med-cell" :title="item.med_details">
                                    <i class="fa-solid fa-pills"></i> {{ item.med_details || '-' }}
                                </td>
                                <td class="text-right amount-cell">
                                    ฿ {{ formatPrice(item.total_amount) }}
                                </td>
                                <td class="td-action">
                                    <button class="btn-pdf" @click="viewPDF(item.id)">
                                        <i class="fa-solid fa-file-pdf"></i> ดู PDF
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
        </main>

        <Footer />
    </div>
</template>

<style scoped>
.shop-presc-page { background: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; }
.shop-presc-main { flex: 1; max-width: 1280px; width: 100%; margin: 0 auto; padding: 28px 20px 60px; }

.shop-presc-hero {
    background: linear-gradient(135deg, #0d4c9e 0%, #3b82f6 100%);
    color: #fff;
    border-radius: 22px;
    padding: 28px 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
    flex-wrap: wrap;
    box-shadow: 0 10px 30px rgba(13, 76, 158, 0.25);
}
.shop-presc-hero-left { display: flex; align-items: center; gap: 18px; min-width: 240px; }
.shop-presc-icon {
    width: 64px; height: 64px; border-radius: 18px;
    background: rgba(255,255,255,0.2);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 1.8rem;
}
.shop-presc-hero h1 { margin: 0 0 4px; font-size: 1.5rem; font-weight: 700; }
.shop-presc-hero p { margin: 0; opacity: .9; }
.shop-presc-stats {
    display: flex; gap: 12px; flex-wrap: wrap;
}
.shop-presc-stat {
    background: rgba(255,255,255,0.15);
    padding: 12px 22px; border-radius: 14px; text-align: center;
    backdrop-filter: blur(6px); min-width: 130px;
}
.stat-label { display: block; font-size: .85rem; opacity: .85; }
.stat-value { display: block; font-size: 1.3rem; font-weight: 800; }

.shop-presc-filter {
    margin: 22px 0 18px;
    display: flex; gap: 14px; flex-wrap: wrap; align-items: center;
}
.filter-search { position: relative; flex: 1; min-width: 240px; max-width: 560px; }
.filter-search i.fa-magnifying-glass {
    position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8;
}
.filter-search input {
    width: 100%; padding: 13px 44px 13px 44px;
    border-radius: 12px; border: 1px solid #e2e8f0; background: #fff;
}
.clear-btn {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    width: 30px; height: 30px; border: 0; border-radius: 50%;
    background: #f1f5f9; color: #475569; cursor: pointer;
}
.filter-select { display: flex; align-items: center; gap: 10px; }
.filter-select label { font-weight: 600; color: #475569; }
.filter-select select {
    height: 44px; padding: 0 14px; border-radius: 12px;
    border: 1px solid #e2e8f0; background: #fff; font-weight: 600; min-width: 200px;
}

.state-block {
    background: #fff; border-radius: 16px; padding: 60px 20px;
    text-align: center; color: #64748b; border: 1px dashed #cbd5e1;
}
.state-block i { font-size: 2.4rem; display: block; margin-bottom: 12px; color: #94a3b8; }
.state-block.error { color: #b91c1c; border-color: #fca5a5; background: #fef2f2; }
.state-block.error i { color: #ef4444; }

.shop-presc-table-wrap {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 18px rgba(15,23,42,0.05);
    overflow-x: auto;
}
.shop-presc-table {
    width: 100%; border-collapse: collapse;
}
.shop-presc-table thead th {
    background: linear-gradient(135deg, #1e3a8a, #3b82f6);
    color: #fff; padding: 14px 16px; text-align: left; font-weight: 600;
    position: sticky; top: 0;
}
.shop-presc-table thead th.th-no { width: 56px; text-align: center; }
.shop-presc-table thead th.th-action { width: 130px; text-align: center; }
.shop-presc-table thead th.text-right { text-align: right; }
.shop-presc-table tbody td {
    padding: 14px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: #1e293b;
    vertical-align: middle;
}
.shop-presc-table tbody tr:hover { background: #f8fafc; }
.td-no { text-align: center; font-weight: 700; color: #475569; }
.date-cell { display: inline-flex; align-items: center; gap: 6px; color: #475569; font-size: .9rem; }
.hn-line { display: block; color: #64748b; font-size: .8rem; margin-top: 2px; }
.pharma-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: #eff6ff; color: #1d4ed8;
    padding: 4px 12px; border-radius: 999px; font-size: .85rem; font-weight: 600;
}
.med-cell {
    max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.med-cell i { color: #3b82f6; margin-right: 6px; }
.amount-cell { font-weight: 700; color: #1e3a8a; text-align: right; }
.td-action { text-align: center; }
.btn-pdf {
    background: linear-gradient(135deg, #ef4444, #b91c1c);
    color: #fff; border: 0; padding: 8px 14px;
    border-radius: 10px; font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    transition: transform .1s;
}
.btn-pdf:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(239,68,68,.35); }

@media (max-width: 768px) {
    .shop-presc-hero { padding: 22px; }
    .shop-presc-hero h1 { font-size: 1.2rem; }
    .shop-presc-table { font-size: .85rem; }
    .shop-presc-table thead th { padding: 10px; }
    .shop-presc-table tbody td { padding: 10px; }
    .med-cell { max-width: 160px; }
}
</style>
