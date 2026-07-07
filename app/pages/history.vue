<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

definePageMeta({
    middleware: 'pharmacist-only'
})

const { apiUrl, imagesAccount } = useApiBase()

/* ⏺ คืน URL รูปโปรไฟล์ผู้ป่วย — ถ้าไม่มี/error คืน default */
const patientAvatarUrl = (item) => {
    const file = (item?.patient_image || '').trim()
    if (!file) return imagesAccount('default.png')
    return imagesAccount(file)
}
const onAvatarError = (e) => {
    e.target.src = imagesAccount('default.png')
}
const route = useRoute()
const historyData = ref([])
const isLoading = ref(false)
const isAuthorized = ref(false)
const sidebarOpen = ref(false)
const searchQuery = ref('')

const toggleSidebar = () => { sidebarOpen.value = !sidebarOpen.value }
const closeSidebar = () => { sidebarOpen.value = false }

watch(() => route.fullPath, closeSidebar)

const checkAuth = () => {
    if (!import.meta.client) return false;
    try {
        const role = localStorage.getItem('user_role');
        const raw = localStorage.getItem('user_data');
        const user = raw ? JSON.parse(raw) : null;
        return role === 'pharmacist' || user?.role === 'pharmacist' || Number(user?.id_pharma) > 0;
    } catch {
        return false;
    }
}

const formatPharmacistName = (item) => {
    const first = (item.firstname_pharma || '').trim()
    const last = (item.lastname_pharma || '').trim()
    if (first || last) {
        return `ภก. ${first} ${last}`.trim()
    }
    return item.doctor_name || item.pharmacist_name || '-'
}

const fetchPrescriptionHistory = async () => {
    if (!isAuthorized.value) return;
    isLoading.value = true
    try {
        const res = await $fetch(apiUrl('get-prescriptions.php'), { credentials: 'include' });
        if (res.status === 'success') {
            // 🚫 ไม่โชว์รายการ placeholder ที่ระบบสร้างตอนจบบทสนทนา (ยังไม่ได้เขียนใบสรุปรายการยาจริง)
            //    — หน้าติดตามคนไข้ (tracking) ยังเห็นได้ตามเดิม แต่หน้าประวัติใบสรุปรายการยาโชว์เฉพาะใบที่บันทึกจริง
            historyData.value = (res.data || []).filter(item => Number(item.auto_created) !== 1);
        } else {
            historyData.value = [];
        }
    } catch (err) {
        console.error("Fetch error:", err);
        historyData.value = [];
    } finally {
        isLoading.value = false;
    }
}

onMounted(() => {
    isAuthorized.value = checkAuth();
    if (!isAuthorized.value) return;
    fetchPrescriptionHistory()
})

// ฟังก์ชันเปิดหน้า PDF/Print
const viewPDF = (id) => {
    // เปิดหน้าพิมพ์ใบสรุปรายการยาโดยส่ง ID ไปทาง Query Parameter
    window.open(`/prescription-view?id=${id}`, '_blank');
}

const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('th-TH');
}

const formatPrice = (price) => {
    if (!price) return '0.00';
    return parseFloat(price).toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

const formatPhone = (raw) => {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length === 10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    if (digits.length === 9)  return `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5)}`;
    return digits;
}

const filteredHistory = computed(() => {
    const q = searchQuery.value.toLowerCase().trim()
    if (!q) return historyData.value
    return historyData.value.filter(item =>
        item.patient_name?.toLowerCase().includes(q) ||
        item.patient_full_name?.toLowerCase().includes(q) ||
        item.hn_no?.toString().toLowerCase().includes(q) ||
        item.customer_code?.toLowerCase().includes(q) ||
        item.med_details?.toLowerCase().includes(q) ||
        item.doctor_name?.toLowerCase().includes(q) ||
        item.pharmacist_name?.toLowerCase().includes(q) ||
        item.clinic_name?.toLowerCase().includes(q) ||
        item.clinic_website?.toLowerCase().includes(q)
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
} = useTablePagination(filteredHistory)

watch(searchQuery, () => resetPage())
</script>

<template>
    <div class="admin-layout">
        <Pharmacy_header />

        <!-- Topbar (มือถือ): ปุ่ม hamburger -->
        <div class="mobile-topbar">
            <button class="hamburger" @click="toggleSidebar" aria-label="menu">
                <i class="fa-solid fa-bars"></i>
            </button>
            <div class="mobile-title">📜 ประวัติใบสรุปรายการยา</div>
        </div>

        <transition name="fade-bd">
            <div v-if="sidebarOpen" class="sidebar-backdrop" @click="closeSidebar"></div>
        </transition>

        <div class="main-content">
            <aside class="sidebar" :class="{ open: sidebarOpen }">
                <div class="sidebar-brand">
                    <i class="fa-solid fa-file-medical"></i>
                    <span>ประวัติใบสรุปรายการยา</span>
                    <button class="sidebar-close" @click="closeSidebar" aria-label="ปิดเมนู">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <NuxtLink to="/history" class="menu-item active" @click="closeSidebar">
                    <i class="fa-solid fa-file-medical"></i> ประวัติใบสรุปรายการยา
                </NuxtLink>
                <NuxtLink to="/billing" class="menu-item" @click="closeSidebar">
                    <i class="fa-solid fa-receipt"></i> รายการบัญชี
                </NuxtLink>
            </aside>

            <section class="history-section">
                <!-- Hero Banner -->
                <div class="hero-banner">
                    <div class="hero-icon">
                        <i class="fa-solid fa-file-medical"></i>
                    </div>
                    <div class="hero-content">
                        <h2>ประวัติการบันทึกใบสรุปรายการยา</h2>
                        <p>เก็บใบสรุปรายการยาทั้งหมดของคุณ — แตะ "ดูใบสรุปรายการยา" เพื่อพิมพ์ซ้ำ</p>
                    </div>
                    <div class="hero-stats">
                        <div class="stat-box">
                            <div class="stat-num">{{ historyData.length }}</div>
                            <div class="stat-label">ใบสรุปรายการยาทั้งหมด</div>
                        </div>
                    </div>
                </div>

                <!-- Search Bar -->
                <div class="search-toolbar">
                    <div class="history-search-input">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input v-model="searchQuery" placeholder="ค้นหาผู้ใช้บริการ / HN / ยา / แพทย์ / ร้าน..." />
                        <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''" aria-label="ล้างค้นหา">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div v-if="searchQuery" class="search-info">
                        พบ <strong>{{ filteredHistory.length }}</strong> รายการที่ตรงกับคำค้น
                    </div>
                </div>

                <div class="table-container shadow-card">
                    <div v-if="isLoading" class="loading-state">
                        <div class="spinner"></div>
                        <p>กำลังโหลดประวัติใบสรุปรายการยา...</p>
                    </div>

                    <!-- Desktop Table -->
                    <table v-else-if="filteredHistory.length > 0" class="history-table">
                        <thead>
                            <tr>
                                <th style="width: 70px;" class="text-center">ลำดับ</th>
                                <th style="width: 160px;"><i class="fa-regular fa-clock"></i> วันที่-เวลา</th>
                                <th style="width: 130px;"><i class="fa-regular fa-id-card"></i> รหัสลูกค้า</th>
                                <th style="min-width: 300px;"><i class="fa-solid fa-user"></i> ผู้ใช้บริการ</th>
                                <th><i class="fa-solid fa-prescription-bottle-medical"></i> รายการยา</th>
                                <th style="min-width: 180px;"><i class="fa-solid fa-notes-medical"></i> อาการป่วย</th>
                                <th style="width: 170px;"><i class="fa-solid fa-shop"></i> ร้านยา</th>
                                <th style="width: 120px;" class="text-right"><i class="fa-solid fa-coins"></i> ยอดรวม</th>
                                <th style="width: 110px;" class="text-center"><i class="fa-solid fa-gear"></i> จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(item, index) in pagedList" :key="item.id">
                                <td class="text-center">
                                    <span class="row-no">{{ pageStart + index }}</span>
                                </td>
                                <td>
                                    <div class="date-cell">
                                        <span class="date-main">{{ formatDate(item.created_at).split(' ')[0] }}</span>
                                        <span class="date-time">{{ formatDate(item.created_at).split(' ').slice(1).join(' ') }}</span>
                                    </div>
                                </td>
                                <td>
                                    <span class="code-chip">{{ item.customer_code || '-' }}</span>
                                </td>
                                <td>
                                    <div class="patient-cell">
                                        <img class="avatar avatar-img"
                                             :src="patientAvatarUrl(item)"
                                             :alt="item.patient_name || 'patient'"
                                             @error="onAvatarError" />
                                        <div class="patient-cell__body">
                                            <!-- บรรทัด 1: ชื่อ -->
                                            <div class="patient-line patient-line--name">
                                                <span class="patient-name-strong">{{ item.patient_name || '-' }}</span>
                                            </div>
                                            <!-- บรรทัด 2: เบอร์โทร -->
                                            <div v-if="item.patient_phone" class="patient-line patient-line--phone">
                                                <i class="fa-solid fa-phone"></i>
                                                <a :href="`tel:${item.patient_phone}`"
                                                   class="patient-phone-link"
                                                   @click.stop>{{ formatPhone(item.patient_phone) }}</a>
                                            </div>
                                            <!-- บรรทัด 3: ที่อยู่เต็ม -->
                                            <div v-if="item.patient_address" class="patient-line patient-line--address">
                                                <i class="fa-solid fa-location-dot"></i>
                                                <span>{{ item.patient_address }}</span>
                                            </div>
                                            <small class="text-muted patient-line--hn" v-if="item.hn_no">HN: {{ item.hn_no }}</small>
                                        </div>
                                    </div>
                                </td>
                                <td class="med-col">
                                    <div class="med-text">{{ item.med_details || '-' }}</div>
                                </td>
                                <td class="symptom-col">
                                    <div class="symptom-text">{{ item.symptom_name || '-' }}</div>
                                </td>
                                <td>
                                    <div class="clinic-cell">
                                        <span class="clinic-name">{{ item.clinic_name || '-' }}</span>
                                        <small v-if="item.clinic_website" class="clinic-web">{{ item.clinic_website }}</small>
                                    </div>
                                </td>
                                <td class="text-right">
                                    <span class="price-amount">{{ formatPrice(item.total_amount) }}</span>
                                </td>
                                <td class="text-center">
                                    <button @click="viewPDF(item.id)" class="btn-pdf">
                                        <i class="fa-solid fa-file-pdf"></i> ดูใบสรุปรายการยา
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Mobile Card View -->
                    <div v-if="!isLoading && filteredHistory.length > 0" class="card-list">
                        <div v-for="(item, index) in pagedList" :key="'c-'+item.id" class="patient-card">
                            <div class="card-row top">
                                <div class="card-top-left">
                                    <img class="avatar avatar-lg avatar-img"
                                         :src="patientAvatarUrl(item)"
                                         :alt="item.patient_name || 'patient'"
                                         @error="onAvatarError" />
                                    <div class="patient-cell__body">
                                        <div class="patient-line patient-line--name">
                                            <span class="patient-name">{{ item.patient_name }}</span>
                                        </div>
                                        <div v-if="item.patient_phone" class="patient-line patient-line--phone">
                                            <i class="fa-solid fa-phone"></i>
                                            <a :href="`tel:${item.patient_phone}`"
                                               class="patient-phone-link"
                                               @click.stop>{{ formatPhone(item.patient_phone) }}</a>
                                        </div>
                                        <div v-if="item.patient_address" class="patient-line patient-line--address">
                                            <i class="fa-solid fa-location-dot"></i>
                                            <span>{{ item.patient_address }}</span>
                                        </div>
                                        <div class="patient-hn">
                                            <span v-if="item.customer_code" class="code-chip-sm">{{ item.customer_code }}</span>
                                            <span v-if="item.hn_no">HN: {{ item.hn_no }}</span>
                                            <span class="separator">·</span>
                                            <span>ลำดับ {{ pageStart + index }}</span>
                                        </div>
                                    </div>
                                </div>
                                <span class="price-pill">{{ formatPrice(item.total_amount) }}</span>
                            </div>
                            <div class="card-row">
                                <span class="card-label"><i class="fa-solid fa-prescription-bottle-medical"></i> ยา</span>
                                <span class="card-value">{{ item.med_details || '-' }}</span>
                            </div>
                            <div class="card-row">
                                <span class="card-label"><i class="fa-solid fa-notes-medical"></i> อาการป่วย</span>
                                <span class="card-value">{{ item.symptom_name || '-' }}</span>
                            </div>
                            <div class="card-row">
                                <span class="card-label"><i class="fa-solid fa-shop"></i> ร้าน</span>
                                <span class="card-value">{{ item.clinic_name || '-' }}</span>
                            </div>
                            <div class="card-row">
                                <span class="card-label"><i class="fa-regular fa-clock"></i> วันที่</span>
                                <span class="card-value">{{ formatDate(item.created_at) }}</span>
                            </div>
                            <div class="card-actions">
                                <button @click="viewPDF(item.id)" class="btn-pdf">
                                    <i class="fa-solid fa-file-pdf"></i> ดูใบสรุปรายการยา
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-if="!isLoading && filteredHistory.length === 0" class="empty-state">
                        <div class="empty-icon">
                            <i class="fa-solid fa-folder-open"></i>
                        </div>
                        <h3>{{ searchQuery ? 'ไม่พบรายการที่ตรงกับคำค้น' : 'ยังไม่มีประวัติการบันทึกใบสรุปรายการยา' }}</h3>
                        <p v-if="searchQuery">ลองเปลี่ยนคำค้นใหม่ดูครับ</p>
                        <p v-else>เริ่มต้นบันทึกใบสรุปรายการยาแรกของคุณได้เลย</p>
                    </div>
                </div>

                <AdminPagination
                    v-if="!isLoading && filteredHistory.length > 0"
                    :page-start="pageStart"
                    :page-end="pageEnd"
                    :total-items="filteredHistory.length"
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
        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/history.css";

/* 🔧 บังคับ drawer มือถือให้ทำงานแน่นอน — กฎนี้เป็น scoped (มี [data-v]) จึง
   specificity สูงกว่า .sidebar.open ที่มาจากไฟล์ @import (ถูกมองเป็น global)
   กันเคสกด hamburger แล้วไม่เปิด เพราะ CSS ถูกทับตอนสลับหน้าแบบ SPA */
@media (max-width: 900px) {
    /* topbar เป็น positioned element เพื่อให้ปุ่มรับคลิกได้ชัวร์ (ต่ำกว่า navbar 1000
       เพื่อไม่บังเมนู nav) */
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

    /* นิยาม drawer มือถือใหม่แบบสมบูรณ์ + !important ทุก property
       เพื่อชนะกฎ .sidebar ที่รั่วมาจาก CSS หน้าอื่น (global) ตอนสลับหน้าแบบ SPA */
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

    /* การันตีว่าทุกอย่างใน drawer คลิกได้ (กันกฎ pointer-events:none ที่อาจรั่วมา)
       และยกเนื้อหา drawer ให้อยู่เหนือ backdrop เสมอ */
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
</style>