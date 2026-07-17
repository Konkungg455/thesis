<script setup>
/**
 * /shop/prescriptions — เจ้าของร้านยา ดูใบสรุปรายการยา PDF ที่เภสัชกรในร้านบันทึก
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

const formatDate = (s) => {
    if (!s) return { date: '-', time: '' }
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return { date: '-', time: '' }
    return {
        date: d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    }
}
const formatPrice = (p) => p ? parseFloat(p).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '0.00'
const viewPDF = (id) => window.open(`/prescription-view?id=${id}`, '_blank')
const patientName = (item) => item.patient_full_name || item.patient_name || '-'
const pharmaName = (item) => item.pharmacist_name || item.doctor_name || '-'
const medPreview = (raw) => {
    const text = String(raw || '').trim()
    if (!text) return '-'
    const first = text.split(/[,;\n]/)[0]?.trim() || text
    return first.length > 42 ? `${first.slice(0, 42)}…` : first
}

const stats = computed(() => {
    const list = filteredList.value
    const totalAmount = list.reduce((sum, x) => sum + (parseFloat(x.total_amount) || 0), 0)
    const pharmaKeys = new Set()
    list.forEach((item) => {
        const key = String(item.id_pharma || item.pharmacist_username || item.pharmacist_name || '').trim()
        if (key) pharmaKeys.add(key)
    })
    const isFiltered = pharmaFilter.value !== 'all' || !!searchQuery.value.trim()
    return {
        total: list.length,
        pharmaCount: isFiltered ? pharmaKeys.size : pharmaOptions.value.length,
        totalAmount,
        isFiltered,
    }
})

onMounted(handleFetch)
</script>

<template>
    <div class="shop-presc-page">
        <Header_store />

        <main class="shop-presc-main">
            <section class="shop-presc-hero">
                <div class="shop-presc-hero-glow" aria-hidden="true"></div>
                <div class="shop-presc-hero-left">
                    <div class="shop-presc-icon">
                        <i class="fa-solid fa-file-prescription"></i>
                    </div>
                    <div class="shop-presc-hero-copy">
                        <span class="shop-presc-eyebrow">เอกสารร้านยา</span>
                        <h1>ใบสรุปรายการยา PDF ของร้าน</h1>
                        <p>ติดตามใบสรุปรายการยาที่เภสัชกรในร้านของคุณบันทึก พร้อมเปิดดู PDF ได้ทันที</p>
                    </div>
                </div>
                <div class="shop-presc-stats">
                    <div class="shop-presc-stat">
                        <span class="stat-ico" aria-hidden="true"><i class="fa-solid fa-file-lines"></i></span>
                        <div>
                            <span class="stat-label">{{ stats.isFiltered ? 'รายการที่พบ' : 'ใบสรุปรายการยาทั้งหมด' }}</span>
                            <span class="stat-value">{{ stats.total.toLocaleString('th-TH') }}</span>
                        </div>
                    </div>
                    <div class="shop-presc-stat">
                        <span class="stat-ico" aria-hidden="true"><i class="fa-solid fa-user-doctor"></i></span>
                        <div>
                            <span class="stat-label">{{ stats.isFiltered ? 'เภสัชกรในรายการ' : 'เภสัชกรในร้าน' }}</span>
                            <span class="stat-value">{{ stats.pharmaCount }}</span>
                        </div>
                    </div>
                    <div class="shop-presc-stat shop-presc-stat--accent">
                        <span class="stat-ico" aria-hidden="true"><i class="fa-solid fa-baht-sign"></i></span>
                        <div>
                            <span class="stat-label">{{ stats.isFiltered ? 'มูลค่ารวมที่กรอง' : 'มูลค่ารวม' }}</span>
                            <span class="stat-value">฿ {{ formatPrice(stats.totalAmount) }}</span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="shop-presc-filter">
                <div class="filter-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input
                        v-model="searchQuery"
                        type="search"
                        placeholder="ค้นหาผู้ใช้บริการ / HN / ยา / เภสัชกร..."
                        aria-label="ค้นหาใบสรุปรายการยา"
                    />
                    <button v-if="searchQuery" type="button" @click="searchQuery = ''" class="clear-btn" aria-label="ล้างคำค้น">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="filter-select">
                    <label for="shop-presc-pharma"><i class="fa-solid fa-filter"></i> เภสัชกร</label>
                    <select id="shop-presc-pharma" v-model="pharmaFilter">
                        <option value="all">ทั้งหมด</option>
                        <option v-for="opt in pharmaOptions" :key="opt.id" :value="opt.id">
                            {{ opt.name }}
                        </option>
                    </select>
                </div>
                <div v-if="searchQuery.trim() || pharmaFilter !== 'all'" class="filter-hint">
                    พบ <strong>{{ filteredList.length }}</strong> รายการ
                </div>
            </section>

            <section class="shop-presc-content">
                <div v-if="isLoading" class="state-block">
                    <div class="state-spinner" aria-hidden="true"></div>
                    <p>กำลังโหลดข้อมูล...</p>
                </div>
                <div v-else-if="fetchError" class="state-block error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>{{ fetchError }}</p>
                </div>
                <div v-else-if="filteredList.length === 0" class="state-block">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>{{ searchQuery || pharmaFilter !== 'all' ? 'ไม่พบรายการที่ตรงกับเงื่อนไข' : 'ยังไม่มีใบสรุปรายการยาในระบบ' }}</p>
                </div>

                <template v-else>
                    <div class="shop-presc-table-wrap">
                        <table class="shop-presc-table">
                            <thead>
                                <tr>
                                    <th class="th-no">#</th>
                                    <th>วันที่ - เวลา</th>
                                    <th>ผู้ใช้บริการ</th>
                                    <th>เภสัชกรผู้บันทึก</th>
                                    <th>รายการยา</th>
                                    <th class="text-right">ยอดรวม</th>
                                    <th class="th-action">PDF</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(item, idx) in pagedList" :key="item.id">
                                    <td class="td-no"><span class="row-index">{{ pageStart + idx }}</span></td>
                                    <td>
                                        <div class="date-cell">
                                            <span class="date-main">{{ formatDate(item.created_at).date }}</span>
                                            <span class="date-time"><i class="fa-regular fa-clock"></i> {{ formatDate(item.created_at).time }}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="patient-cell">
                                            <strong>{{ patientName(item) }}</strong>
                                            <small class="hn-line"><i class="fa-solid fa-id-card-clip"></i> {{ item.hn_no || '-' }}</small>
                                        </div>
                                    </td>
                                    <td>
                                        <span class="pharma-chip"><i class="fa-solid fa-user-doctor"></i> {{ pharmaName(item) }}</span>
                                    </td>
                                    <td class="med-cell" :title="item.med_details">
                                        <span class="med-chip"><i class="fa-solid fa-pills"></i> {{ medPreview(item.med_details) }}</span>
                                    </td>
                                    <td class="text-right amount-cell">
                                        ฿ {{ formatPrice(item.total_amount) }}
                                    </td>
                                    <td class="td-action">
                                        <button type="button" class="btn-pdf" @click="viewPDF(item.id)">
                                            <i class="fa-solid fa-file-pdf"></i> PDF
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="shop-presc-cards">
                        <article v-for="(item, idx) in pagedList" :key="`card-${item.id}`" class="presc-card">
                            <header class="presc-card-head">
                                <span class="row-index">{{ pageStart + idx }}</span>
                                <div class="date-cell">
                                    <span class="date-main">{{ formatDate(item.created_at).date }}</span>
                                    <span class="date-time"><i class="fa-regular fa-clock"></i> {{ formatDate(item.created_at).time }}</span>
                                </div>
                                <button type="button" class="btn-pdf" @click="viewPDF(item.id)">
                                    <i class="fa-solid fa-file-pdf"></i> PDF
                                </button>
                            </header>
                            <div class="presc-card-body">
                                <div class="presc-card-row">
                                    <span class="card-label">ผู้ใช้บริการ</span>
                                    <strong>{{ patientName(item) }}</strong>
                                    <small class="hn-line"><i class="fa-solid fa-id-card-clip"></i> {{ item.hn_no || '-' }}</small>
                                </div>
                                <div class="presc-card-row">
                                    <span class="card-label">เภสัชกร</span>
                                    <span class="pharma-chip"><i class="fa-solid fa-user-doctor"></i> {{ pharmaName(item) }}</span>
                                </div>
                                <div class="presc-card-row">
                                    <span class="card-label">รายการยา</span>
                                    <span class="med-chip"><i class="fa-solid fa-pills"></i> {{ medPreview(item.med_details) }}</span>
                                </div>
                                <div class="presc-card-row presc-card-row--amount">
                                    <span class="card-label">ยอดรวม</span>
                                    <span class="amount-cell">฿ {{ formatPrice(item.total_amount) }}</span>
                                </div>
                            </div>
                        </article>
                    </div>
                </template>

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
.shop-presc-page {
    --presc-ink: #0f172a;
    --presc-muted: #64748b;
    --presc-line: #e2e8f0;
    --presc-blue: #1d4ed8;
    --presc-blue-deep: #0b3d91;
    --presc-sky: #38bdf8;
    --presc-surface: #ffffff;
    background:
        radial-gradient(1200px 420px at 8% -10%, rgba(56, 189, 248, 0.14), transparent 55%),
        radial-gradient(900px 380px at 100% 0%, rgba(29, 78, 216, 0.1), transparent 50%),
        #f1f5f9;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}
.shop-presc-main {
    flex: 1;
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
    padding: 28px 20px 64px;
}

.shop-presc-hero {
    position: relative;
    overflow: hidden;
    background: linear-gradient(125deg, #0b3d91 0%, #1d4ed8 48%, #0284c7 100%);
    color: #fff;
    border-radius: 24px;
    padding: 28px 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
    box-shadow: 0 18px 40px rgba(11, 61, 145, 0.28);
}
.shop-presc-hero-glow {
    position: absolute;
    inset: auto -80px -120px auto;
    width: 280px;
    height: 280px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(253, 224, 71, 0.28), transparent 68%);
    pointer-events: none;
}
.shop-presc-hero-left {
    position: relative;
    display: flex;
    align-items: center;
    gap: 18px;
    min-width: 260px;
    flex: 1 1 320px;
}
.shop-presc-icon {
    width: 68px;
    height: 68px;
    border-radius: 20px;
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.1));
    border: 1px solid rgba(255, 255, 255, 0.28);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.75rem;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
    flex-shrink: 0;
}
.shop-presc-eyebrow {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #fde68a;
    margin-bottom: 6px;
}
.shop-presc-hero h1 {
    margin: 0 0 6px;
    font-size: clamp(1.25rem, 2.2vw, 1.55rem);
    font-weight: 800;
    line-height: 1.25;
}
.shop-presc-hero p {
    margin: 0;
    opacity: 0.92;
    font-size: 0.92rem;
    line-height: 1.5;
    max-width: 36rem;
}
.shop-presc-stats {
    position: relative;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
}
.shop-presc-stat {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.14);
    padding: 12px 16px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(8px);
    min-width: 148px;
}
.shop-presc-stat--accent {
    background: rgba(253, 224, 71, 0.16);
    border-color: rgba(253, 224, 71, 0.35);
}
.stat-ico {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.18);
    flex-shrink: 0;
}
.stat-label {
    display: block;
    font-size: 0.75rem;
    opacity: 0.88;
    margin-bottom: 2px;
}
.stat-value {
    display: block;
    font-size: 1.2rem;
    font-weight: 800;
    letter-spacing: -0.02em;
}

.shop-presc-filter {
    margin: 20px 0 18px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    background: var(--presc-surface);
    border: 1px solid var(--presc-line);
    border-radius: 18px;
    padding: 14px 16px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
.filter-search {
    position: relative;
    flex: 1;
    min-width: 220px;
}
.filter-search i.fa-magnifying-glass {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
}
.filter-search input {
    width: 100%;
    padding: 12px 42px 12px 42px;
    border-radius: 12px;
    border: 1px solid var(--presc-line);
    background: #f8fafc;
    color: var(--presc-ink);
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.filter-search input:focus {
    outline: none;
    background: #fff;
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}
.clear-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 50%;
    background: #e2e8f0;
    color: #475569;
    cursor: pointer;
}
.filter-select {
    display: flex;
    align-items: center;
    gap: 10px;
}
.filter-select label {
    font-weight: 700;
    color: var(--presc-muted);
    font-size: 0.88rem;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
}
.filter-select select {
    height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid var(--presc-line);
    background: #f8fafc;
    font-weight: 600;
    min-width: 190px;
    color: var(--presc-ink);
}
.filter-hint {
    margin-left: auto;
    font-size: 0.88rem;
    color: var(--presc-muted);
}
.filter-hint strong { color: var(--presc-blue); }

.state-block {
    background: var(--presc-surface);
    border-radius: 18px;
    padding: 64px 20px;
    text-align: center;
    color: var(--presc-muted);
    border: 1px dashed #cbd5e1;
}
.state-block i {
    font-size: 2.4rem;
    display: block;
    margin-bottom: 12px;
    color: #94a3b8;
}
.state-block.error {
    color: #b91c1c;
    border-color: #fca5a5;
    background: #fef2f2;
}
.state-block.error i { color: #ef4444; }
.state-spinner {
    width: 42px;
    height: 42px;
    margin: 0 auto 14px;
    border-radius: 50%;
    border: 3px solid #dbeafe;
    border-top-color: #2563eb;
    animation: presc-spin 0.8s linear infinite;
}
@keyframes presc-spin { to { transform: rotate(360deg); } }

.shop-presc-table-wrap {
    background: var(--presc-surface);
    border-radius: 18px;
    border: 1px solid var(--presc-line);
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
    overflow: hidden;
    overflow-x: auto;
}
.shop-presc-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}
.shop-presc-table thead th {
    background: linear-gradient(135deg, #0b3d91 0%, #1d4ed8 55%, #2563eb 100%);
    color: #fff;
    padding: 15px 16px;
    text-align: left;
    font-weight: 700;
    font-size: 0.84rem;
    letter-spacing: 0.01em;
}
.shop-presc-table thead th.th-no { width: 56px; text-align: center; }
.shop-presc-table thead th.th-action { width: 110px; text-align: center; }
.shop-presc-table thead th.text-right { text-align: right; }
.shop-presc-table tbody td {
    padding: 15px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: var(--presc-ink);
    vertical-align: middle;
}
.shop-presc-table tbody tr {
    transition: background 0.15s;
}
.shop-presc-table tbody tr:nth-child(even) { background: #f8fafc; }
.shop-presc-table tbody tr:hover { background: #eff6ff; }
.shop-presc-table tbody tr:last-child td { border-bottom: 0; }

.row-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    border-radius: 8px;
    background: #e2e8f0;
    color: #334155;
    font-weight: 800;
    font-size: 0.8rem;
}
.td-no { text-align: center; }
.date-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.date-main {
    font-weight: 700;
    color: var(--presc-ink);
    font-size: 0.92rem;
}
.date-time {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--presc-muted);
    font-size: 0.8rem;
}
.patient-cell strong {
    display: block;
    font-size: 0.95rem;
}
.hn-line {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--presc-muted);
    font-size: 0.78rem;
    margin-top: 3px;
}
.pharma-chip,
.med-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.3;
}
.pharma-chip {
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
}
.med-chip {
    background: #f0f9ff;
    color: #0369a1;
    border: 1px solid #bae6fd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.med-cell { max-width: 260px; }
.amount-cell {
    font-weight: 800;
    color: #0b3d91;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
}
.td-action { text-align: center; }
.btn-pdf {
    background: linear-gradient(135deg, #ef4444, #b91c1c);
    color: #fff;
    border: 0;
    padding: 8px 14px;
    border-radius: 10px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: transform 0.12s, box-shadow 0.15s;
}
.btn-pdf:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(185, 28, 28, 0.32);
}

.shop-presc-cards { display: none; }
.presc-card {
    background: var(--presc-surface);
    border: 1px solid var(--presc-line);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
}
.presc-card-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: linear-gradient(135deg, #eff6ff, #f8fafc);
    border-bottom: 1px solid var(--presc-line);
}
.presc-card-head .btn-pdf { margin-left: auto; }
.presc-card-body { padding: 14px 16px 16px; display: grid; gap: 12px; }
.presc-card-row { display: grid; gap: 4px; }
.card-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94a3b8;
}
.presc-card-row--amount {
    padding-top: 8px;
    border-top: 1px dashed var(--presc-line);
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.presc-card-row--amount .amount-cell { font-size: 1.05rem; }

@media (max-width: 900px) {
    .shop-presc-table-wrap { display: none; }
    .shop-presc-cards {
        display: grid;
        gap: 12px;
    }
    .filter-hint { width: 100%; margin-left: 0; }
}

@media (max-width: 640px) {
    .shop-presc-main { padding: 16px 14px 48px; }
    .shop-presc-hero { padding: 20px; border-radius: 18px; }
    .shop-presc-hero-left { align-items: flex-start; }
    .shop-presc-icon { width: 52px; height: 52px; font-size: 1.35rem; border-radius: 14px; }
    .shop-presc-stat { min-width: calc(50% - 6px); flex: 1 1 calc(50% - 6px); }
    .shop-presc-stat--accent { flex: 1 1 100%; }
    .filter-select { width: 100%; }
    .filter-select select { flex: 1; min-width: 0; }
}
</style>
