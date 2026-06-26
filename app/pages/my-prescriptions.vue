<script setup>
/**
 * /my-prescriptions — ติดตามใบสั่งยา PDF ที่เภสัชกรบันทึกให้ผู้ใช้คนนี้
 */
import { ref, computed, onMounted, watch } from 'vue'

definePageMeta({ middleware: 'pharmacist-only' })

const { apiUrl } = useApiBase()
const historyData = ref([])
const isLoading = ref(false)
const searchQuery = ref('')
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
            fetchError.value = res?.message || 'ไม่พบข้อมูลใบสั่งยา'
        }
    } catch (err) {
        console.error(err)
        historyData.value = []
        fetchError.value = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — กรุณาเข้าสู่ระบบใหม่'
    } finally {
        isLoading.value = false
    }
}

const filteredList = computed(() => {
    const q = searchQuery.value.toLowerCase().trim()
    if (!q) return historyData.value
    return historyData.value.filter(item =>
        item.med_details?.toLowerCase().includes(q) ||
        item.doctor_name?.toLowerCase().includes(q) ||
        item.pharmacist_name?.toLowerCase().includes(q) ||
        item.hn_no?.toString().toLowerCase().includes(q) ||
        item.prescription_date?.toLowerCase().includes(q)
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

watch(searchQuery, () => resetPage())

const formatDate = (s) => s ? new Date(s).toLocaleString('th-TH') : '-'
const formatPrice = (p) => p ? parseFloat(p).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '0.00'
const viewPDF = (id) => window.open(`/prescription-view?id=${id}`, '_blank')

onMounted(handleFetch)
</script>

<template>
    <div class="presc-page">
        <Header />

        <main class="presc-main">
            <section class="presc-hero">
                <div class="presc-hero-icon">
                    <i class="fa-solid fa-file-prescription"></i>
                </div>
                <div class="presc-hero-text">
                    <h1>ใบสั่งยาของฉัน</h1>
                    <p>ติดตามและพิมพ์ซ้ำใบสั่งยา PDF ที่เภสัชกรบันทึกให้คุณ</p>
                </div>
                <div class="presc-hero-stats">
                    <div class="presc-stat-card">
                        <span class="presc-stat-label">ใบสั่งยาทั้งหมด</span>
                        <span class="presc-stat-value">{{ historyData.length.toLocaleString('th-TH') }}</span>
                    </div>
                </div>
            </section>

            <section class="presc-search-row">
                <div class="presc-search-input">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input v-model="searchQuery"
                           placeholder="ค้นหาชื่อยา / ชื่อเภสัชกร / HN / วันที่..." />
                    <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </section>

            <section class="presc-content">
                <div v-if="isLoading" class="state-block">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <p>กำลังโหลดใบสั่งยา...</p>
                </div>

                <div v-else-if="fetchError" class="state-block error-block">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>{{ fetchError }}</p>
                </div>

                <div v-else-if="filteredList.length === 0" class="state-block">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>{{ searchQuery ? 'ไม่พบรายการที่ตรงกับคำค้น' : 'ยังไม่มีใบสั่งยาที่บันทึก' }}</p>
                </div>

                <div v-else class="presc-grid">
                    <article v-for="(item, idx) in pagedList" :key="item.id" class="presc-card">
                        <div class="presc-card-head">
                            <span class="presc-no">#{{ pageStart + idx }}</span>
                            <span class="presc-date">
                                <i class="fa-regular fa-clock"></i> {{ formatDate(item.created_at) }}
                            </span>
                        </div>
                        <div class="presc-card-body">
                            <div class="presc-meta-row">
                                <i class="fa-solid fa-user-doctor"></i>
                                <span>{{ item.doctor_name || item.pharmacist_name || 'เภสัชกร' }}</span>
                            </div>
                            <div class="presc-meta-row">
                                <i class="fa-solid fa-id-card-clip"></i>
                                <span>HN: {{ item.hn_no || '-' }}</span>
                            </div>
                            <div class="presc-meta-row med">
                                <i class="fa-solid fa-pills"></i>
                                <span class="med-text" :title="item.med_details">{{ item.med_details || '-' }}</span>
                            </div>
                            <div class="presc-meta-row total">
                                <i class="fa-solid fa-coins"></i>
                                <span>ยอดรวม <strong>฿ {{ formatPrice(item.total_amount) }}</strong></span>
                            </div>
                        </div>
                        <div class="presc-card-action">
                            <button class="btn-view-pdf" @click="viewPDF(item.id)">
                                <i class="fa-solid fa-file-pdf"></i> ดู / พิมพ์ PDF
                            </button>
                        </div>
                    </article>
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
.presc-page { background: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; }
.presc-main { flex: 1; max-width: 1200px; width: 100%; margin: 0 auto; padding: 28px 20px 60px; }

.presc-hero {
    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
    color: #fff;
    border-radius: 22px;
    padding: 28px 30px;
    display: flex;
    align-items: center;
    gap: 22px;
    flex-wrap: wrap;
    box-shadow: 0 10px 30px rgba(30, 58, 138, 0.25);
}
.presc-hero-icon {
    width: 64px; height: 64px; border-radius: 18px;
    background: rgba(255,255,255,0.2);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 1.8rem;
}
.presc-hero-text { flex: 1; min-width: 220px; }
.presc-hero-text h1 { margin: 0 0 4px; font-size: 1.6rem; font-weight: 700; }
.presc-hero-text p { margin: 0; opacity: .85; }
.presc-stat-card {
    background: rgba(255,255,255,0.15);
    padding: 14px 22px;
    border-radius: 14px;
    text-align: center;
    backdrop-filter: blur(6px);
}
.presc-stat-label { display: block; font-size: .85rem; opacity: .85; }
.presc-stat-value { display: block; font-size: 1.5rem; font-weight: 800; }

.presc-search-row { margin: 22px 0 18px; }
.presc-search-input {
    position: relative; max-width: 520px;
}
.presc-search-input i.fa-magnifying-glass {
    position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
    color: #94a3b8;
}
.presc-search-input input {
    width: 100%; padding: 14px 44px 14px 44px;
    border-radius: 14px; border: 1px solid #e2e8f0;
    background: #fff; font-size: 1rem;
}
.clear-btn {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    width: 32px; height: 32px; border: 0; border-radius: 50%;
    background: #f1f5f9; color: #475569; cursor: pointer;
}

.presc-content { display: flex; flex-direction: column; gap: 18px; }
.state-block {
    background: #fff; border-radius: 16px; padding: 60px 20px;
    text-align: center; color: #64748b;
    border: 1px dashed #cbd5e1;
}
.state-block i { font-size: 2.4rem; margin-bottom: 12px; display: block; color: #94a3b8; }
.error-block { color: #b91c1c; border-color: #fca5a5; background: #fef2f2; }
.error-block i { color: #ef4444; }

.presc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 16px;
}
.presc-card {
    background: #fff; border-radius: 18px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 18px rgba(15,23,42,0.05);
    overflow: hidden; display: flex; flex-direction: column;
    transition: transform .15s, box-shadow .15s;
}
.presc-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(15,23,42,0.08);
}
.presc-card-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px;
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    color: #1e3a8a;
    font-weight: 600;
    border-bottom: 1px solid rgba(30,58,138,0.08);
}
.presc-no { font-size: .9rem; }
.presc-date { font-size: .85rem; opacity: .85; }
.presc-card-body { padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.presc-meta-row { display: flex; align-items: flex-start; gap: 8px; font-size: .9rem; color: #334155; }
.presc-meta-row i { color: #3b82f6; margin-top: 3px; }
.presc-meta-row.med .med-text { word-break: break-word; }
.presc-meta-row.total strong { color: #1e3a8a; }

.presc-card-action { padding: 0 18px 16px; }
.btn-view-pdf {
    width: 100%; padding: 10px 14px;
    border-radius: 10px; border: 0;
    background: linear-gradient(135deg, #ef4444, #b91c1c);
    color: #fff; font-weight: 600;
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    transition: transform .12s;
}
.btn-view-pdf:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(239,68,68,.35); }

@media (max-width: 640px) {
    .presc-hero { padding: 22px; }
    .presc-hero-text h1 { font-size: 1.3rem; }
}
</style>
