<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

definePageMeta({
    middleware: 'pharmacist-only'
})

const { apiBase, apiUrl } = useApiBase()
const { user, syncFromServer } = useAuthUser()
const route = useRoute()

const sidebarOpen = ref(false)
const toggleSidebar = () => { sidebarOpen.value = !sidebarOpen.value }
const closeSidebar = () => { sidebarOpen.value = false }
watch(() => route.fullPath, closeSidebar)

const isAuthorized = ref(false)
const checkAuth = () => {
    if (!import.meta.client) return false
    try {
        const role = localStorage.getItem('user_role')
        const raw = localStorage.getItem('user_data')
        const u = raw ? JSON.parse(raw) : null
        return role === 'pharmacist' || u?.role === 'pharmacist' || Number(u?.id_pharma) > 0
    } catch {
        return false
    }
}

const idPharma = computed(() => {
    const u = user.value;
    if (!u) return 0;
    const raw = u.id_pharma ?? u.id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
});

// --- รายการสลิปของตัวเอง ---
const slips = ref([])
const isLoading = ref(false)
const errorMsg = ref('')

const loadSlips = async () => {
    if (!idPharma.value) {
        errorMsg.value = 'ไม่พบรหัสเภสัชกร — กรุณาเข้าสู่ระบบใหม่';
        return;
    }
    isLoading.value = true
    errorMsg.value = ''
    try {
        const data = await $fetch(apiUrl('get-pharmacist-billing-slips.php'), {
            credentials: 'include',
            query: {
                id_pharma: idPharma.value,
                role: 'pharmacist',
                t: Date.now(),
            },
        })
        if (data?.status === 'success') {
            slips.value = data.slips || []
        } else {
            errorMsg.value = data?.message || 'โหลดข้อมูลไม่สำเร็จ'
        }
    } catch (e) {
        console.error('loadSlips', e)
        errorMsg.value = e?.data?.message || e?.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
    } finally {
        isLoading.value = false
    }
}

// --- สรุปยอด ---
const summary = computed(() => {
    const out = { totalApproved: 0, totalPending: 0, totalRejected: 0, countAll: slips.value.length, countApproved: 0, countPending: 0, countRejected: 0 }
    for (const s of slips.value) {
        const amt = Number(s.amount) || 0
        if (s.status === 'approved') { out.totalApproved += amt; out.countApproved++ }
        else if (s.status === 'pending') { out.totalPending += amt; out.countPending++ }
        else if (s.status === 'rejected') { out.totalRejected += amt; out.countRejected++ }
    }
    return out
})

// --- Filter ---
const filterStatus = ref('all') // all | pending | approved | rejected
const searchText = ref('')

const filteredSlips = computed(() => {
    const q = searchText.value.trim().toLowerCase()
    return slips.value.filter(s => {
        if (filterStatus.value !== 'all' && s.status !== filterStatus.value) return false
        if (q) {
            const hay = `${s.store_name || ''} ${s.note || ''} ${s.amount}`.toLowerCase()
            if (!hay.includes(q)) return false
        }
        return true
    })
})

// --- ฟอร์มอัปโหลดสลิป ---
const form = ref({
    amount: '',
    transfer_date: '',
    note: ''
})
const fromPrescriptionId = computed(() => Number(route.query.prescription_id || 0))
const fromPatientId = computed(() => Number(route.query.patient_id || 0))
const fromAmount = computed(() => {
    const n = Number(route.query.amount || 0)
    return Number.isFinite(n) && n > 0 ? n : 0
})
const isFromPrescriptionFlow = computed(() =>
    String(route.query.from_rx || '') === '1' && fromPrescriptionId.value > 0 && fromPatientId.value > 0
)

const buildSystemBillingMarker = () => {
    if (!isFromPrescriptionFlow.value) return ''
    return `[BILLING_CTX:patient=${fromPatientId.value};rx=${fromPrescriptionId.value}]`
}
const slipFile = ref(null)
const slipPreview = ref('')
const slipLabel = ref('เลือกไฟล์รูปสลิปการโอน')
const isUploading = ref(false)
const uploadMsg = ref('')
const showUploadCard = ref(true)

const onSlipChange = (e) => {
    const f = e.target.files?.[0]
    slipFile.value = f || null
    slipLabel.value = f ? f.name : 'เลือกไฟล์รูปสลิปการโอน'
    if (f) {
        const reader = new FileReader()
        reader.onload = (ev) => { slipPreview.value = ev.target.result }
        reader.readAsDataURL(f)
    } else {
        slipPreview.value = ''
    }
}

const resetForm = () => {
    form.value = { amount: '', transfer_date: '', note: '' }
    slipFile.value = null
    slipPreview.value = ''
    slipLabel.value = 'เลือกไฟล์รูปสลิปการโอน'
    uploadMsg.value = ''
}

const submitSlip = async () => {
    uploadMsg.value = ''
    if (!idPharma.value) {
        uploadMsg.value = 'ไม่พบรหัสเภสัชกร — กรุณาเข้าสู่ระบบใหม่'
        return
    }
    if (!slipFile.value) {
        uploadMsg.value = 'กรุณาแนบรูปสลิปการโอน'
        return
    }
    if (!form.value.amount || Number(form.value.amount) <= 0) {
        uploadMsg.value = 'กรุณากรอกจำนวนเงิน'
        return
    }
    isUploading.value = true
    try {
        const body = new FormData()
        body.append('id_pharma', idPharma.value)
        body.append('amount', form.value.amount)
        body.append('transfer_date', form.value.transfer_date)
        const plainNote = String(form.value.note || '').trim()
        const marker = buildSystemBillingMarker()
        const noteToSend = marker ? [plainNote, marker].filter(Boolean).join('\n') : plainNote
        body.append('note', noteToSend)
        body.append('slip_image', slipFile.value)

        const data = await $fetch(apiUrl('upload-billing-slip.php'), {
            method: 'POST',
            body,
            credentials: 'include'
        })
        if (data?.status === 'success') {
            uploadMsg.value = data.message || 'อัปโหลดสำเร็จ'
            resetForm()
            await loadSlips()
        } else {
            uploadMsg.value = data?.message || 'อัปโหลดไม่สำเร็จ'
        }
    } catch (e) {
        console.error('submitSlip', e)
        uploadMsg.value = e?.data?.message || e?.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
    } finally {
        isUploading.value = false
    }
}

const slipUrl = (filename) => filename ? `${apiBase.value}/uploads/slips/${filename}` : ''
const formatMoney = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatDateTime = (iso) => iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
const formatDateShort = (iso) => iso ? new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'

const statusLabel = {
    pending: 'รออนุมัติ',
    approved: 'อนุมัติแล้ว',
    rejected: 'ถูกปฏิเสธ'
}
const statusIcon = {
    pending: 'fa-clock',
    approved: 'fa-circle-check',
    rejected: 'fa-circle-xmark'
}

const previewImage = ref('')
const openPreview = (filename) => { previewImage.value = slipUrl(filename) }
const closePreview = () => { previewImage.value = '' }

onMounted(async () => {
    isAuthorized.value = checkAuth()
    if (!isAuthorized.value) return
    await syncFromServer({ force: true })
    if (fromAmount.value > 0 && !form.value.amount) {
        form.value.amount = String(fromAmount.value)
    }
    if (isFromPrescriptionFlow.value && !form.value.note) {
        form.value.note = `ค่ายาใบสรุปรายการยา #${fromPrescriptionId.value}`
    }
    if (idPharma.value) await loadSlips()
})
</script>

<template>
    <div class="admin-layout">
        <Pharmacy_header />

        <div class="mobile-topbar">
            <button class="hamburger" @click="toggleSidebar" aria-label="menu">
                <i class="fa-solid fa-bars"></i>
            </button>
            <div class="mobile-title">
                <i class="fa-solid fa-receipt"></i> รายการบัญชี
            </div>
        </div>

        <transition name="fade-bd">
            <div v-if="sidebarOpen" class="sidebar-backdrop" @click="closeSidebar"></div>
        </transition>

        <div class="main-content">
            <aside class="sidebar" :class="{ open: sidebarOpen }">
                <div class="sidebar-brand">
                    <i class="fa-solid fa-receipt"></i>
                    <span>รายการบัญชี</span>
                    <button class="sidebar-close" @click="closeSidebar" aria-label="ปิดเมนู">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <NuxtLink to="/history" class="menu-item" @click="closeSidebar">
                    <i class="fa-solid fa-file-medical"></i> ประวัติใบสรุปรายการยา
                </NuxtLink>
                <NuxtLink to="/billing" class="menu-item active" @click="closeSidebar">
                    <i class="fa-solid fa-receipt"></i> รายการบัญชี
                </NuxtLink>
            </aside>

            <section class="billing-section">
                <!-- ===== Hero Header ===== -->
                <div class="hero">
                    <div class="hero-icon">
                        <i class="fa-solid fa-wallet"></i>
                    </div>
                    <div class="hero-text">
                        <h2>รายการบัญชี</h2>
                        <p>แนบหลักฐานการโอนเงินเข้าร้านยา เพื่อให้เจ้าของร้านตรวจสอบและอนุมัติ</p>
                    </div>
                    <button class="btn-refresh" @click="loadSlips" :disabled="isLoading">
                        <i class="fa-solid fa-rotate" :class="{ spin: isLoading }"></i>
                        <span>โหลดใหม่</span>
                    </button>
                </div>

                <div v-if="isFromPrescriptionFlow" class="rx-flow-banner">
                    <i class="fa-solid fa-truck-medical"></i>
                    <span>
                        กำลังส่งข้อมูลจากใบสรุปรายการยา #{{ fromPrescriptionId }} —
                        เมื่อร้านอนุมัติสลิป ระบบจะแจ้งผู้ใช้ในแชทอัตโนมัติ
                    </span>
                </div>

                <!-- ===== Summary Cards ===== -->
                <div class="summary-grid">
                    <div class="stat-card stat-total">
                        <div class="stat-icon"><i class="fa-solid fa-coins"></i></div>
                        <div class="stat-body">
                            <div class="stat-label">ยอดที่อนุมัติแล้ว</div>
                            <div class="stat-value">฿ {{ formatMoney(summary.totalApproved) }}</div>
                            <div class="stat-meta">{{ summary.countApproved }} รายการ</div>
                        </div>
                    </div>

                    <div class="stat-card stat-pending">
                        <div class="stat-icon"><i class="fa-solid fa-clock"></i></div>
                        <div class="stat-body">
                            <div class="stat-label">รอเจ้าของร้านอนุมัติ</div>
                            <div class="stat-value">฿ {{ formatMoney(summary.totalPending) }}</div>
                            <div class="stat-meta">{{ summary.countPending }} รายการ</div>
                        </div>
                    </div>

                    <div class="stat-card stat-rejected">
                        <div class="stat-icon"><i class="fa-solid fa-circle-xmark"></i></div>
                        <div class="stat-body">
                            <div class="stat-label">ถูกปฏิเสธ</div>
                            <div class="stat-value">฿ {{ formatMoney(summary.totalRejected) }}</div>
                            <div class="stat-meta">{{ summary.countRejected }} รายการ</div>
                        </div>
                    </div>
                </div>

                <!-- ===== Upload Card ===== -->
                <div class="upload-card">
                    <button class="card-collapse-btn" @click="showUploadCard = !showUploadCard">
                        <span class="card-title">
                            <i class="fa-solid fa-cloud-arrow-up"></i>
                            ส่งหลักฐานการโอนใหม่
                        </span>
                        <i class="fa-solid fa-chevron-down chevron" :class="{ open: showUploadCard }"></i>
                    </button>

                    <transition name="slide-down">
                        <div v-show="showUploadCard" class="card-body">
                            <transition name="fade">
                                <div v-if="uploadMsg" class="upload-msg" :class="{ 'is-error': !uploadMsg.includes('สำเร็จ') && !uploadMsg.includes('เรียบร้อย') }">
                                    <i class="fa-solid" :class="!uploadMsg.includes('สำเร็จ') && !uploadMsg.includes('เรียบร้อย') ? 'fa-triangle-exclamation' : 'fa-circle-check'"></i>
                                    {{ uploadMsg }}
                                </div>
                            </transition>

                            <form class="upload-form" @submit.prevent="submitSlip">
                                <div class="form-grid">
                                    <div class="field">
                                        <label><i class="fa-solid fa-coins"></i> จำนวนเงิน (บาท) <span class="req">*</span></label>
                                        <div class="input-prefix">
                                            <span class="prefix-icon">฿</span>
                                            <input v-model="form.amount" type="number" step="0.01" min="0" required placeholder="0.00" />
                                        </div>
                                    </div>

                                    <div class="field">
                                        <label><i class="fa-regular fa-calendar"></i> วันที่-เวลาโอน</label>
                                        <input v-model="form.transfer_date" type="datetime-local" />
                                    </div>

                                    <div class="field full">
                                        <label><i class="fa-solid fa-pen"></i> หมายเหตุ</label>
                                        <textarea v-model="form.note" rows="2" placeholder="เช่น เงินรอบสัปดาห์ที่ 21-25 พ.ค."></textarea>
                                    </div>

                                    <div class="field full">
                                        <label><i class="fa-solid fa-image"></i> รูปสลิป <span class="req">*</span></label>
                                        <label class="upload-box" :class="{ 'has-file': !!slipFile }">
                                            <div v-if="!slipPreview" class="upload-empty">
                                                <i class="fa-solid fa-cloud-arrow-up upload-big-icon"></i>
                                                <div class="upload-text">
                                                    <strong>คลิกเพื่อเลือกรูปสลิป</strong>
                                                    <small>JPG, PNG, WEBP (สูงสุด ~5 MB)</small>
                                                </div>
                                            </div>
                                            <div v-else class="upload-with-preview">
                                                <img :src="slipPreview" alt="preview" class="preview-thumb" />
                                                <div class="preview-info">
                                                    <strong>{{ slipLabel }}</strong>
                                                    <small>คลิกเพื่อเปลี่ยนรูป</small>
                                                </div>
                                            </div>
                                            <input type="file" accept="image/*" @change="onSlipChange" />
                                        </label>
                                    </div>
                                </div>

                                <div class="form-actions">
                                    <button type="button" class="btn-secondary" :disabled="isUploading" @click="resetForm">
                                        <i class="fa-solid fa-eraser"></i> ล้างฟอร์ม
                                    </button>
                                    <button type="submit" class="btn-primary" :disabled="isUploading">
                                        <i class="fa-solid" :class="isUploading ? 'fa-spinner fa-spin' : 'fa-paper-plane'"></i>
                                        {{ isUploading ? 'กำลังส่ง...' : 'ส่งสลิป' }}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </transition>
                </div>

                <!-- ===== Toolbar (filter + search) ===== -->
                <div class="toolbar">
                    <div class="tabs">
                        <button :class="{ active: filterStatus === 'all' }" @click="filterStatus = 'all'">
                            <i class="fa-solid fa-list"></i> ทั้งหมด
                            <span class="badge">{{ summary.countAll }}</span>
                        </button>
                        <button :class="{ active: filterStatus === 'pending' }" @click="filterStatus = 'pending'">
                            <i class="fa-solid fa-clock"></i> รออนุมัติ
                            <span class="badge badge-pending">{{ summary.countPending }}</span>
                        </button>
                        <button :class="{ active: filterStatus === 'approved' }" @click="filterStatus = 'approved'">
                            <i class="fa-solid fa-circle-check"></i> อนุมัติแล้ว
                            <span class="badge badge-approved">{{ summary.countApproved }}</span>
                        </button>
                        <button :class="{ active: filterStatus === 'rejected' }" @click="filterStatus = 'rejected'">
                            <i class="fa-solid fa-circle-xmark"></i> ปฏิเสธ
                            <span class="badge badge-rejected">{{ summary.countRejected }}</span>
                        </button>
                    </div>
                    <div class="search-box">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input v-model="searchText" type="text" placeholder="ค้นหาชื่อร้าน / หมายเหตุ / จำนวน..." />
                        <button v-if="searchText" class="clear-btn" @click="searchText = ''" title="ล้าง">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>

                <!-- ===== History ===== -->
                <div class="history-card">
                    <div v-if="errorMsg" class="error-banner">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        {{ errorMsg }}
                    </div>

                    <div v-if="isLoading && !slips.length" class="loading-state">
                        <div class="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>

                    <div v-else-if="!filteredSlips.length && !errorMsg" class="empty-state">
                        <div class="empty-icon">
                            <i class="fa-regular fa-folder-open"></i>
                        </div>
                        <h4>{{ searchText || filterStatus !== 'all' ? 'ไม่พบรายการที่ตรงกัน' : 'ยังไม่มีการส่งสลิป' }}</h4>
                        <p v-if="!searchText && filterStatus === 'all'">เริ่มแนบสลิปการโอนจากฟอร์มด้านบนได้เลย</p>
                        <button v-else class="btn-link" @click="searchText = ''; filterStatus = 'all'">
                            <i class="fa-solid fa-rotate-left"></i> ล้างตัวกรอง
                        </button>
                    </div>

                    <!-- Desktop table -->
                    <table v-else class="history-table">
                        <thead>
                            <tr>
                                <th style="width: 72px;">สลิป</th>
                                <th style="width: 150px;">วันที่ส่ง</th>
                                <th style="width: 170px;">ร้าน</th>
                                <th style="min-width: 180px;">หมายเหตุ</th>
                                <th style="width: 150px;">วันที่โอน</th>
                                <th style="width: 130px;" class="text-right">จำนวนเงิน</th>
                                <th style="width: 150px;" class="text-center">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in filteredSlips" :key="s.id">
                                <td>
                                    <div class="slip-thumb-wrap" @click="openPreview(s.slip_image)">
                                        <img :src="slipUrl(s.slip_image)" class="slip-thumb" alt="slip" />
                                        <div class="thumb-overlay">
                                            <i class="fa-solid fa-magnifying-glass-plus"></i>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div class="cell-main">{{ formatDateShort(s.created_at) }}</div>
                                    <small class="cell-sub">{{ formatDateTime(s.created_at).split(' ').slice(-1)[0] }}</small>
                                </td>
                                <td>
                                    <div class="store-info">
                                        <i class="fa-solid fa-store"></i>
                                        <span>{{ s.store_name || '—' }}</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="note-cell">{{ s.note || '—' }}</div>
                                </td>
                                <td>{{ formatDateTime(s.transfer_date) }}</td>
                                <td class="text-right">
                                    <strong class="amount-text">฿ {{ formatMoney(s.amount) }}</strong>
                                </td>
                                <td class="text-center">
                                    <span class="status-pill" :class="`st-${s.status}`">
                                        <i class="fa-solid" :class="statusIcon[s.status]"></i>
                                        {{ statusLabel[s.status] }}
                                    </span>
                                    <div v-if="s.reviewed_note" class="reviewed-note">
                                        <i class="fa-solid fa-comment"></i> {{ s.reviewed_note }}
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Mobile cards -->
                    <div class="mobile-list" v-if="filteredSlips.length">
                        <div v-for="s in filteredSlips" :key="`m-${s.id}`" class="mobile-card">
                            <div class="mc-head">
                                <div class="slip-thumb-wrap small" @click="openPreview(s.slip_image)">
                                    <img :src="slipUrl(s.slip_image)" class="slip-thumb" alt="slip" />
                                </div>
                                <div class="mc-head-text">
                                    <div class="mc-store"><i class="fa-solid fa-store"></i> {{ s.store_name || '-' }}</div>
                                    <div class="mc-date">{{ formatDateTime(s.created_at) }}</div>
                                </div>
                                <span class="status-pill" :class="`st-${s.status}`">
                                    <i class="fa-solid" :class="statusIcon[s.status]"></i>
                                    {{ statusLabel[s.status] }}
                                </span>
                            </div>
                            <div class="mc-body">
                                <div class="mc-row">
                                    <span class="mc-label">จำนวนเงิน</span>
                                    <strong class="amount-text">฿ {{ formatMoney(s.amount) }}</strong>
                                </div>
                                <div v-if="s.transfer_date" class="mc-row">
                                    <span class="mc-label">วันที่โอน</span>
                                    <span>{{ formatDateTime(s.transfer_date) }}</span>
                                </div>
                                <div class="mc-row">
                                    <span class="mc-label">หมายเหตุ</span>
                                    <span class="text-muted">{{ s.note || '—' }}</span>
                                </div>
                                <div v-if="s.reviewed_note" class="mc-row mc-reviewed">
                                    <i class="fa-solid fa-comment"></i> {{ s.reviewed_note }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <!-- ===== Preview modal ===== -->
        <transition name="zoom">
            <div v-if="previewImage" class="preview-overlay" @click.self="closePreview">
                <button class="preview-close" @click="closePreview"><i class="fa-solid fa-xmark"></i></button>
                <img :src="previewImage" alt="slip preview" class="preview-img" />
            </div>
        </transition>

        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/history.css";

/* 🔧 บังคับ drawer มือถือให้ทำงาน + คลิกได้แน่นอน — scoped (มี [data-v]) + !important
   ชนะกฎ .sidebar ที่รั่วมาจาก CSS หน้าอื่น (global) ตอนสลับหน้าแบบ SPA */
@media (max-width: 900px) {
    .mobile-topbar {
        display: flex !important;
        position: relative;
        z-index: 91;
    }
    .hamburger {
        position: relative;
        z-index: 1;
        pointer-events: auto;
        cursor: pointer;
    }
    .sidebar-close { display: flex !important; }

    .sidebar-backdrop {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2400 !important;
    }

    .sidebar {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: auto !important;
        bottom: 0 !important;
        height: 100vh !important;
        width: 86% !important;
        max-width: 360px !important;
        z-index: 2500 !important;
        transform: translateX(-105%) !important;
        transition: transform 0.3s ease !important;
        overflow-y: auto !important;
        align-self: auto !important;
        display: flex !important;
        flex-direction: column !important;
        background: linear-gradient(180deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%) !important;
        color: #fff !important;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45) !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
    }
    .sidebar.open { transform: translateX(0) !important; }

    .sidebar > *,
    .sidebar a,
    .sidebar button,
    .sidebar input,
    .sidebar .menu-item {
        pointer-events: auto !important;
        position: relative;
        z-index: 1;
    }
}

/* ===== Section wrapper ===== */
.billing-section {
    padding: 24px 28px 60px;
    max-width: 1280px;
    margin: 0 auto;
    width: 100%;
}

/* ===== Hero header ===== */
.hero {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 22px 24px;
    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 60%, #06b6d4 100%);
    border-radius: 20px;
    color: #fff;
    margin-bottom: 24px;
    box-shadow: 0 10px 30px rgba(30, 58, 138, 0.25);
    position: relative;
    overflow: hidden;
}
.hero::before {
    content: '';
    position: absolute;
    top: -40px; right: -40px;
    width: 180px; height: 180px;
    background: rgba(255,255,255,0.08);
    border-radius: 50%;
}
.hero::after {
    content: '';
    position: absolute;
    bottom: -60px; left: 30%;
    width: 160px; height: 160px;
    background: rgba(255,255,255,0.06);
    border-radius: 50%;
}
.hero-icon {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: rgba(255,255,255,0.18);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
    flex-shrink: 0;
    z-index: 1;
    box-shadow: 0 6px 20px rgba(0,0,0,0.15);
}
.hero-text { flex: 1; z-index: 1; }
.hero-text h2 {
    margin: 0 0 4px;
    font-size: 1.55rem;
    font-weight: 800;
}
.hero-text p {
    margin: 0;
    font-size: 0.92rem;
    opacity: 0.92;
}
.btn-refresh {
    background: rgba(255,255,255,0.18);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.25);
    padding: 10px 18px;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: 0.2s;
    z-index: 1;
    backdrop-filter: blur(8px);
}
.btn-refresh:hover:not(:disabled) {
    background: rgba(255,255,255,0.3);
    transform: translateY(-1px);
}
.btn-refresh:disabled { opacity: 0.6; cursor: not-allowed; }

.rx-flow-banner {
    margin: -6px 0 18px;
    border: 1px solid #bfdbfe;
    background: linear-gradient(135deg, #eff6ff, #ecfeff);
    color: #1e3a8a;
    border-radius: 12px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
    font-weight: 600;
}

/* ===== Summary cards ===== */
.summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}
.stat-card {
    background: #fff;
    border-radius: 16px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
    position: relative;
    overflow: hidden;
    transition: transform 0.25s, box-shadow 0.25s;
}
.stat-card:hover { transform: translateY(-3px); box-shadow: 0 12px 24px rgba(15, 23, 42, 0.1); }
.stat-card::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 4px;
    border-radius: 4px 0 0 4px;
}
.stat-card.stat-total::before { background: linear-gradient(180deg, #10b981, #059669); }
.stat-card.stat-pending::before { background: linear-gradient(180deg, #f59e0b, #d97706); }
.stat-card.stat-rejected::before { background: linear-gradient(180deg, #ef4444, #b91c1c); }

.stat-icon {
    width: 54px;
    height: 54px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 1.4rem;
    flex-shrink: 0;
}
.stat-card.stat-total .stat-icon { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35); }
.stat-card.stat-pending .stat-icon { background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 6px 16px rgba(245, 158, 11, 0.35); }
.stat-card.stat-rejected .stat-icon { background: linear-gradient(135deg, #ef4444, #b91c1c); box-shadow: 0 6px 16px rgba(239, 68, 68, 0.35); }

.stat-body { flex: 1; min-width: 0; }
.stat-label {
    font-size: 0.83rem;
    color: #64748b;
    font-weight: 600;
    margin-bottom: 4px;
}
.stat-value {
    font-size: 1.45rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.15;
    word-break: break-word;
}
.stat-meta {
    font-size: 0.78rem;
    color: #94a3b8;
    margin-top: 4px;
}

/* ===== Upload card ===== */
.upload-card {
    background: #fff;
    border-radius: 18px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
    margin-bottom: 22px;
    overflow: hidden;
}
.card-collapse-btn {
    width: 100%;
    background: linear-gradient(135deg, #f0f9ff 0%, #ecfeff 100%);
    border: none;
    padding: 16px 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    border-bottom: 1px solid #e2e8f0;
}
.card-title {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 1.05rem;
    font-weight: 700;
    color: #0369a1;
}
.card-title i { color: #0ea5e9; }
.chevron {
    color: #64748b;
    transition: transform 0.25s;
}
.chevron.open { transform: rotate(180deg); }

.card-body { padding: 22px; }

.upload-msg {
    padding: 12px 16px;
    border-radius: 12px;
    margin-bottom: 16px;
    background: #dcfce7;
    color: #166534;
    border: 1px solid #bbf7d0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    font-size: 0.92rem;
}
.upload-msg.is-error {
    background: #fef2f2;
    color: #991b1b;
    border-color: #fecaca;
}

.form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
}
.field { display: flex; flex-direction: column; }
.field.full { grid-column: 1 / -1; }
.field label {
    font-size: 0.85rem;
    color: #334155;
    margin-bottom: 8px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.field label i { color: #3b82f6; font-size: 0.85rem; }
.field label .req { color: #ef4444; }

.field input,
.field textarea {
    padding: 12px 14px;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    font-size: 0.95rem;
    font-family: inherit;
    transition: 0.2s;
    background: #f8fafc;
    color: #0f172a;
}
.field input:focus, .field textarea:focus {
    border-color: #3b82f6;
    outline: none;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
    background: #fff;
}

.input-prefix {
    position: relative;
    display: flex;
    align-items: center;
}
.input-prefix .prefix-icon {
    position: absolute;
    left: 14px;
    color: #64748b;
    font-weight: 700;
    pointer-events: none;
}
.input-prefix input {
    padding-left: 32px;
    width: 100%;
}

.upload-box {
    position: relative;
    border: 2px dashed #cbd5e1;
    padding: 28px 22px;
    border-radius: 14px;
    text-align: center;
    cursor: pointer;
    color: #64748b;
    transition: 0.25s;
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 160px;
}
.upload-box:hover { border-color: #3b82f6; background: #eff6ff; color: #3b82f6; }
.upload-box.has-file { border-style: solid; border-color: #10b981; background: #f0fdf4; }
.upload-box input { display: none; }

.upload-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    text-align: center;
}
.upload-big-icon { font-size: 2.6rem; color: #94a3b8; }
.upload-box:hover .upload-big-icon { color: #3b82f6; }
.upload-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}
.upload-text strong { color: #1e293b; font-size: 1rem; }
.upload-text small { color: #94a3b8; font-size: 0.82rem; }

.upload-with-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    text-align: left;
    width: 100%;
}
.preview-thumb {
    width: 88px;
    height: 88px;
    object-fit: cover;
    border-radius: 12px;
    border: 1px solid #d1fae5;
    box-shadow: 0 4px 10px rgba(0,0,0,0.05);
}
.preview-info { display: flex; flex-direction: column; gap: 4px; }
.preview-info strong { color: #065f46; font-size: 0.92rem; word-break: break-all; }
.preview-info small { color: #10b981; }

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px dashed #e2e8f0;
}
.btn-primary, .btn-secondary {
    padding: 11px 22px;
    border: none;
    border-radius: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: 0.2s;
    font-size: 0.95rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.btn-primary {
    background: linear-gradient(135deg, #3b82f6, #1e3a8a);
    color: #fff;
    box-shadow: 0 6px 16px rgba(59,130,246,0.3);
}
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(59,130,246,0.4); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
.btn-secondary {
    background: #f1f5f9;
    color: #475569;
}
.btn-secondary:hover:not(:disabled) { background: #e2e8f0; }

/* ===== Toolbar ===== */
.toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
}
.tabs {
    display: inline-flex;
    background: #fff;
    border-radius: 14px;
    padding: 6px;
    gap: 4px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 8px rgba(15,23,42,0.04);
    flex-wrap: wrap;
}
.tabs button {
    background: transparent;
    border: none;
    padding: 8px 14px;
    border-radius: 10px;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.88rem;
    transition: 0.2s;
}
.tabs button:hover { background: #f1f5f9; color: #334155; }
.tabs button.active {
    background: linear-gradient(135deg, #3b82f6, #1e3a8a);
    color: #fff;
    box-shadow: 0 4px 10px rgba(59,130,246,0.3);
}
.tabs button.active .badge { background: rgba(255,255,255,0.25); color: #fff; }

.badge {
    display: inline-block;
    background: #e2e8f0;
    color: #475569;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    min-width: 22px;
    text-align: center;
}
.badge-pending { background: #fef3c7; color: #92400e; }
.badge-approved { background: #d1fae5; color: #065f46; }
.badge-rejected { background: #fee2e2; color: #991b1b; }

.search-box {
    position: relative;
    flex: 1;
    max-width: 360px;
    min-width: 220px;
}
.search-box i.fa-magnifying-glass {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
}
.search-box input {
    width: 100%;
    padding: 11px 38px 11px 40px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #fff;
    font-size: 0.92rem;
    transition: 0.2s;
}
.search-box input:focus {
    border-color: #3b82f6;
    outline: none;
    box-shadow: 0 0 0 4px rgba(59,130,246,0.12);
}
.clear-btn {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: #f1f5f9;
    border: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    color: #64748b;
}
.clear-btn:hover { background: #e2e8f0; }

/* ===== History card / table ===== */
.history-card {
    background: #fff;
    border-radius: 18px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
    overflow: hidden;
}

.history-table {
    width: 100%;
    border-collapse: collapse;
}
.history-table thead th {
    background: #f8fafc;
    color: #475569;
    text-align: left;
    padding: 14px 18px;
    font-size: 0.82rem;
    font-weight: 700;
    border-bottom: 1px solid #e2e8f0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.history-table tbody td {
    padding: 14px 18px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
    color: #334155;
    font-size: 0.92rem;
}
.history-table tbody tr:hover { background: #f8fafc; }
.history-table tbody tr:last-child td { border-bottom: none; }
.text-right { text-align: right; }
.text-center { text-align: center; }

.cell-main { font-weight: 600; color: #0f172a; }
.cell-sub { color: #94a3b8; font-size: 0.78rem; }

.slip-thumb-wrap {
    position: relative;
    width: 52px;
    height: 52px;
    cursor: pointer;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
}
.slip-thumb-wrap.small { width: 56px; height: 56px; }
.slip-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.25s;
}
.thumb-overlay {
    position: absolute;
    inset: 0;
    background: rgba(15,23,42,0.55);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
}
.slip-thumb-wrap:hover .thumb-overlay { opacity: 1; }
.slip-thumb-wrap:hover .slip-thumb { transform: scale(1.1); }

.store-info {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    color: #0f172a;
    word-break: break-word;
}
.store-info i { color: #3b82f6; flex-shrink: 0; }

.note-cell {
    color: #475569;
    font-size: 0.9rem;
    line-height: 1.45;
    word-break: break-word;
    white-space: pre-wrap;
}
.text-muted { color: #94a3b8; font-size: 0.83rem; }

.amount-text { color: #047857; font-size: 1.02rem; font-weight: 800; }

.status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
}
.status-pill i { font-size: 0.78rem; }
.status-pill.st-pending { background: #fef3c7; color: #92400e; }
.status-pill.st-approved { background: #d1fae5; color: #065f46; }
.status-pill.st-rejected { background: #fee2e2; color: #991b1b; }

.reviewed-note {
    margin-top: 6px;
    font-size: 0.78rem;
    color: #64748b;
    font-style: italic;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.reviewed-note i { color: #94a3b8; }

/* ===== Mobile cards ===== */
.mobile-list { display: none; padding: 14px; }
.mobile-card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 12px;
    box-shadow: 0 2px 6px rgba(15,23,42,0.04);
}
.mc-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px dashed #e2e8f0;
}
.mc-head-text { flex: 1; min-width: 0; }
.mc-store { font-weight: 700; color: #0f172a; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 6px; }
.mc-store i { color: #3b82f6; }
.mc-date { color: #64748b; font-size: 0.78rem; margin-top: 3px; }

.mc-body { display: flex; flex-direction: column; gap: 8px; }
.mc-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
    gap: 12px;
}
.mc-label { color: #64748b; font-weight: 600; font-size: 0.83rem; }
.mc-reviewed {
    background: #f8fafc;
    border-radius: 8px;
    padding: 8px 10px;
    color: #64748b;
    font-size: 0.83rem;
    font-style: italic;
    display: flex;
    gap: 6px;
}

/* ===== Loading / Empty ===== */
.loading-state, .empty-state {
    padding: 50px 24px;
    text-align: center;
    color: #64748b;
}
.spinner {
    width: 44px;
    height: 44px;
    border: 4px solid #e2e8f0;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
    margin: 0 auto 14px;
}
.empty-icon {
    font-size: 3rem;
    color: #cbd5e1;
    margin-bottom: 12px;
}
.empty-state h4 { margin: 0 0 6px; color: #334155; font-size: 1.05rem; }
.empty-state p { margin: 0; color: #94a3b8; font-size: 0.9rem; }
.btn-link {
    background: none;
    border: none;
    color: #3b82f6;
    cursor: pointer;
    font-weight: 600;
    margin-top: 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.btn-link:hover { text-decoration: underline; }

/* ===== Error banner ===== */
.error-banner {
    background: #fef2f2;
    color: #991b1b;
    padding: 14px 18px;
    border-radius: 12px;
    border: 1px solid #fecaca;
    margin: 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
}

/* ===== Preview overlay ===== */
.preview-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 30px;
}
.preview-img {
    max-width: 90vw;
    max-height: 90vh;
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
}
.preview-close {
    position: absolute;
    top: 20px;
    right: 24px;
    background: rgba(255,255,255,0.18);
    color: #fff;
    border: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    font-size: 1.4rem;
    cursor: pointer;
    backdrop-filter: blur(8px);
}
.preview-close:hover { background: rgba(255,255,255,0.3); }

/* ===== Animations ===== */
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.slide-down-enter-active, .slide-down-leave-active {
    transition: all 0.3s ease;
    overflow: hidden;
}
.slide-down-enter-from, .slide-down-leave-to {
    max-height: 0;
    opacity: 0;
    padding-top: 0;
    padding-bottom: 0;
}
.slide-down-enter-to, .slide-down-leave-from {
    max-height: 1000px;
    opacity: 1;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.zoom-enter-active, .zoom-leave-active { transition: opacity 0.2s; }
.zoom-enter-from, .zoom-leave-to { opacity: 0; }
.zoom-enter-active .preview-img, .zoom-leave-active .preview-img {
    transition: transform 0.25s;
}
.zoom-enter-from .preview-img, .zoom-leave-to .preview-img { transform: scale(0.9); }

/* ===== Responsive ===== */
@media (max-width: 980px) {
    .summary-grid { grid-template-columns: 1fr 1fr; }
    .stat-card.stat-rejected { grid-column: 1 / -1; }
}
@media (max-width: 768px) {
    .billing-section { padding: 16px 14px 60px; }
    .hero {
        flex-direction: column;
        text-align: center;
        padding: 20px 18px;
    }
    .hero-icon { margin: 0 auto; }
    .btn-refresh { width: 100%; justify-content: center; }
    .summary-grid { grid-template-columns: 1fr; }
    .stat-card.stat-rejected { grid-column: auto; }
    .form-grid { grid-template-columns: 1fr; }
    .toolbar { flex-direction: column; align-items: stretch; }
    /* ทำให้แท็บกระจายเต็มความกว้าง + ขึ้นบรรทัดใหม่ได้ครบทุกอัน (ไม่ตัด "ปฏิเสธ") */
    .tabs {
        display: flex;
        flex-wrap: wrap;
        width: 100%;
        overflow-x: visible;
    }
    .tabs button {
        flex: 1 1 calc(50% - 4px);
        justify-content: center;
        white-space: nowrap;
        padding: 9px 8px;
        font-size: 0.82rem;
    }
    .search-box { max-width: none; }

    .history-table { display: none; }
    .mobile-list { display: block; }
    .empty-state { padding: 30px 16px; }
}
@media (max-width: 480px) {
    .hero-text h2 { font-size: 1.25rem; }
    .stat-value { font-size: 1.25rem; }
    .form-actions { flex-direction: column-reverse; }
    .form-actions button { width: 100%; justify-content: center; }
    /* 4 แท็บ แบ่ง 2 คอลัมน์ให้เห็น "ปฏิเสธ" ครบ ไม่ล้นจอ */
    .tabs button {
        flex: 1 1 calc(50% - 4px);
        gap: 5px;
        padding: 8px 6px;
        font-size: 0.78rem;
    }
    .tabs button .badge { font-size: 0.66rem; min-width: 18px; padding: 1px 6px; }
}
</style>
