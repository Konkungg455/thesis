<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePharmacistStatus } from '~/composables/usePharmacistStatus';

const route = useRoute();
const router = useRouter();
const { apiUrl, imagesPharma } = useApiBase();
const { computeStatus, formatScheduleList } = usePharmacistStatus();

const DEFAULT_AVATAR = imagesPharma('default.png');

const staffImageUrl = computed(() => {
    const file = (staff.value?.image || '').trim();
    if (!file) return DEFAULT_AVATAR;
    return imagesPharma(file);
});

const pharmacistId = computed(() => {
    const raw = route.params.id;
    const id = Array.isArray(raw) ? raw[0] : raw;
    return id ? String(id) : '';
});

// --- 1. State สำหรับเก็บข้อมูล ---
const staff = ref(null);
const isLoading = ref(true);
const errorMessage = ref('');
const userPos = ref(null);
const nowTick = ref(Date.now());
let statusTimer = null;

const statusInfo = computed(() => {
    if (!staff.value) return null;
    // อ้าง nowTick.value เพื่อ re-compute ทุกครั้งที่ tick
    return computeStatus(staff.value.time, new Date(nowTick.value));
});

const weeklySchedule = computed(() => {
    if (!staff.value) return [];
    return formatScheduleList(staff.value.time);
});

const getUserPosition = () =>
    new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                lat: position.coords.latitude,
                lng: position.coords.longitude
            }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    });

const formatDistance = (km) => {
    if (km === null || km === undefined) return null;
    const n = Number(km);
    if (!Number.isFinite(n)) return null;
    if (n < 1) return `${Math.round(n * 1000)} ม.`;
    return `${n.toFixed(n < 10 ? 1 : 0)} กม.`;
};

const fetchPharmacist = async () => {
    const id = pharmacistId.value;
    if (!id) {
        errorMessage.value = 'รหัสเภสัชกรไม่ถูกต้อง';
        isLoading.value = false;
        return;
    }

    isLoading.value = true;
    errorMessage.value = '';
    staff.value = null;

    try {
        let url = apiUrl(`get_pharmacist_detail.php?id=${id}`);
        if (userPos.value) {
            url += `&lat=${userPos.value.lat}&lng=${userPos.value.lng}`;
        }
        const response = await $fetch(url);

        if (response.status === 'success' && response.data) {
            staff.value = response.data;
        } else {
            errorMessage.value = response.message || 'ไม่พบข้อมูลเภสัชกรในระบบ';
        }
    } catch (err) {
        console.error('Fetch Pharmacist Error:', err);
        errorMessage.value = 'ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์ได้';
    } finally {
        isLoading.value = false;
    }
};

onMounted(async () => {
    userPos.value = await getUserPosition();
    await fetchPharmacist();
    statusTimer = setInterval(() => {
        nowTick.value = Date.now();
    }, 30 * 1000);
});

onBeforeUnmount(() => {
    if (statusTimer) clearInterval(statusTimer);
});

watch(pharmacistId, fetchPharmacist);

// --- 3. ฟังก์ชันเริ่มปรึกษา ---
const handleConsult = () => {
    router.push({
        path: '/pharmacist/consult-selection',
        query: { id: pharmacistId.value }
    });
};
</script>

<template>
    <div class="pharmacist-detail-page">
        <Header />

        <div v-if="isLoading" class="loading-container">
            <div class="loader"></div>
            <p>กำลังโหลดข้อมูลเภสัชกร...</p>
        </div>

        <div class="container-detail" v-else-if="staff">
            <NuxtLink to="/" class="back-link">
                <div class="back-content">
                    <span class="arrow">←</span>
                    <span class="text">กลับหน้าหลัก</span>
                </div>
            </NuxtLink>
            <br />
            <br />
            <br />
            <div class="profile-section">
                <div class="image-box">
                    <img :src="staffImageUrl" :alt="staff.name" @error="(e) => e.target.src = DEFAULT_AVATAR" />
                    <div class="verified-badge">Professional Pharmacist</div>
                </div>

                <div class="details-box">
                    <div class="header-info">
                        <span
                            v-if="statusInfo"
                            class="status-tag"
                            :class="`status-tag-${statusInfo.color}`"
                        >
                            <span class="status-dot"></span>
                            <span v-if="statusInfo.status === 'online'">ว่าง (ออนไลน์)</span>
                            <span v-else-if="statusInfo.status === 'break'">พักช่วง / รอเปิดทำการ</span>
                            <span v-else-if="statusInfo.status === 'closed_today'">หยุดทำการวันนี้</span>
                            <span v-else>ยังไม่ระบุเวลาทำการ</span>
                        </span>
                        <h1 class="staff-name">{{ staff.name }}</h1>
                        <p class="location-text">
                            <i class="fa-solid fa-store"></i>
                            {{ staff.store_name || 'ยังไม่มีร้านยา' }}
                            <span v-if="staff.distance_km !== null && staff.distance_km !== undefined" class="distance-badge">
                                <i class="fa-solid fa-location-dot"></i>
                                ห่างจากคุณ {{ formatDistance(staff.distance_km) }}
                            </span>
                        </p>
                        <p v-if="staff.address" class="address-text">{{ staff.address }}</p>
                    </div>

                    <!-- ตารางเวลาทำการรายสัปดาห์ -->
                    <div v-if="weeklySchedule.length > 0" class="schedule-box">
                        <h3 class="schedule-title">
                            <i class="fa-regular fa-calendar"></i> ตารางเวลาทำการ
                        </h3>
                        <div class="schedule-grid">
                            <div
                                v-for="(item, i) in weeklySchedule"
                                :key="i"
                                class="schedule-item"
                                :class="{
                                    'is-today': statusInfo && statusInfo.todaySlots.some(
                                        (s) => s.start === item.start && s.end === item.end
                                    )
                                }"
                            >
                                <div class="schedule-day">{{ item.dayTH }}</div>
                                <div class="schedule-time">{{ item.start }} - {{ item.end }} น.</div>
                            </div>
                        </div>
                        <p v-if="statusInfo && statusInfo.status !== 'online' && statusInfo.nextOpen" class="next-open-text">
                            <i class="fa-regular fa-clock"></i>
                            เปิดทำการครั้งถัดไป: <strong>{{ statusInfo.nextOpen.dayTH }} {{ statusInfo.nextOpen.start }} น.</strong>
                        </p>
                    </div>

                    <div class="info-grid">
                        <div class="info-item">
                            <span class="label">สถานะตอนนี้:</span>
                            <span class="value" v-if="statusInfo">{{ statusInfo.label }}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">ค่าบริการปรึกษา:</span>
                            <span class="value highlight">{{ staff.price || '100 บาท / 15 นาที' }}</span>
                        </div>
                    </div>

                    <div class="actions">
                        <button
                            class="btn-chat"
                            :disabled="statusInfo && statusInfo.status !== 'online'"
                            @click="handleConsult"
                        >
                            <i class="icon">💬</i>
                            <span v-if="statusInfo && statusInfo.status === 'online'">เริ่มปรึกษาตอนนี้</span>
                            <span v-else>ไม่อยู่ในเวลาทำการ</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div v-else class="not-found">
            <div class="error-box">
                <div class="error-icon">⚠️</div>
                <h2>ไม่พบข้อมูลเภสัชกร</h2>
                <p>{{ errorMessage || 'ขออภัย ข้อมูลเภสัชกรรหัสนี้อาจถูกลบหรือไม่มีอยู่ในระบบ' }}</p>
                <p v-if="pharmacistId" class="error-id">รหัสที่ค้นหา: {{ pharmacistId }}</p>
                <NuxtLink to="/" class="btn-home">กลับหน้าหลัก</NuxtLink>
            </div>
        </div>

        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/id.css";

.back-link {
    display: inline-block;
    text-decoration: none;
    margin-top: 30px;
    transition: all 0.3s ease;
}

.back-content {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 24px;
    background-color: #f8fafc;
    /* สีพื้นหลังอ่อนๆ ดูสะอาด */
    color: #00469c;
    /* สีน้ำเงินประจำแบรนด์คุณ */
    border: 1.5px solid #00469c;
    border-radius: 50px;
    /* ทรงมน Capsule */
    font-weight: 500;
    font-size: 1rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.arrow {
    font-size: 1.2rem;
    transition: transform 0.3s ease;
}

/* --- เอฟเฟกต์ตอน Hover (เอาเมาส์ชี้) --- */
.back-link:hover .back-content {
    background-color: #00469c;
    /* เปลี่ยนพื้นหลังเป็นสีน้ำเงิน */
    color: #ffffff;
    /* เปลี่ยนตัวหนังสือเป็นสีขาว */
    box-shadow: 0 4px 12px rgba(0, 70, 156, 0.25);
    transform: translateY(-2px);
    /* ลอยขึ้นเล็กน้อย */
}

.back-link:hover .arrow {
    transform: translateX(-5px);
    /* ลูกศรขยับไปทางซ้ายเล็กน้อย */
}

/* เอฟเฟกต์ตอนกด (Active) */
.back-link:active .back-content {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 70, 156, 0.2);
}

.error-id {
    font-size: 0.9rem;
    color: #888;
    margin-top: 8px;
}

.location-text {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.location-text i.fa-store {
    color: #00469c;
}

.distance-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #ecfdf5;
    color: #14532d;
    border: 1px solid #bbf7d0;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    margin-left: 6px;
}

.distance-badge i {
    color: #16a34a;
}

.address-text {
    font-size: 0.9rem;
    color: #64748b;
    margin-top: 4px;
}

/* ============ Status Tag (override default .status-tag) ============ */
.status-tag {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 700;
    margin-bottom: 8px;
}
.status-tag .status-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
}
.status-tag-green {
    background: #ecfdf5;
    color: #15803d;
    border: 1px solid #bbf7d0;
}
.status-tag-green .status-dot {
    background: #16a34a;
    box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2);
    animation: pulse-green-detail 1.6s ease-in-out infinite;
}
.status-tag-orange {
    background: #fffbeb;
    color: #b45309;
    border: 1px solid #fde68a;
}
.status-tag-orange .status-dot { background: #f59e0b; }
.status-tag-red {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
}
.status-tag-red .status-dot { background: #dc2626; }
.status-tag-gray {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
}
.status-tag-gray .status-dot { background: #94a3b8; }

@keyframes pulse-green-detail {
    0%, 100% { box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2); }
    50% { box-shadow: 0 0 0 7px rgba(22, 163, 74, 0.08); }
}

/* ============ Schedule Box ============ */
.schedule-box {
    margin: 20px 0;
    padding: 18px 20px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
}

.schedule-title {
    margin: 0 0 14px;
    font-size: 1rem;
    color: #0f172a;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
}

.schedule-title i {
    color: #00469c;
}

.schedule-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
}

.schedule-item {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px 14px;
    transition: all 0.2s ease;
}

.schedule-item.is-today {
    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    border-color: #16a34a;
    box-shadow: 0 2px 8px rgba(22, 163, 74, 0.2);
}

.schedule-day {
    font-weight: 700;
    color: #0f172a;
    font-size: 0.95rem;
    margin-bottom: 2px;
}

.schedule-item.is-today .schedule-day {
    color: #166534;
}

.schedule-time {
    font-size: 0.85rem;
    color: #64748b;
}

.schedule-item.is-today .schedule-time {
    color: #15803d;
    font-weight: 600;
}

.next-open-text {
    margin: 14px 0 0;
    padding-top: 12px;
    border-top: 1px dashed #cbd5e1;
    font-size: 0.9rem;
    color: #475569;
    display: flex;
    align-items: center;
    gap: 8px;
}

.next-open-text strong {
    color: #00469c;
}

/* ============ Disabled chat button ============ */
.btn-chat:disabled {
    background: #cbd5e1 !important;
    color: #ffffff !important;
    cursor: not-allowed;
    opacity: 0.8;
}

.btn-chat:disabled:hover {
    transform: none;
}
</style>