<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useApiBase } from '~/composables/useApiBase';
import { usePharmacistStatus } from '~/composables/usePharmacistStatus';

const router = useRouter();
const { imagesPharma } = useApiBase();
const { computeStatus } = usePharmacistStatus();
const { pharmacists, isLoading, loadError, refresh, refreshWithGps, clearGpsCache } = usePharmacistsList();

const userPos = ref(null);          // { lat, lng } ของผู้ใช้ ถ้าอนุญาต GPS
const locationStatus = ref('idle'); // idle | locating | granted | denied | unavailable
const nowTick = ref(Date.now());    // ใช้ทริกเกอร์ recompute สถานะทุก 30 วินาที
let statusTimer = null;

/* ================= 2. ขอตำแหน่ง user (ถ้าผู้ใช้อนุญาต) ================= */
const getUserPosition = () =>
    new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            locationStatus.value = 'unavailable';
            resolve(null);
            return;
        }
        locationStatus.value = 'locating';
        navigator.geolocation.getCurrentPosition(
            (position) => {
                locationStatus.value = 'granted';
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            () => {
                locationStatus.value = 'denied';
                resolve(null);
            },
            { enableHighAccuracy: false, timeout: 3000, maximumAge: 120000 }
        );
    });

onMounted(() => {
    clearGpsCache();
    getUserPosition().then((pos) => {
        if (pos) {
            userPos.value = pos;
            refreshWithGps(pos.lat, pos.lng);
        }
    });

    statusTimer = setInterval(() => {
        nowTick.value = Date.now();
    }, 30 * 1000);
});

onBeforeUnmount(() => {
    if (statusTimer) clearInterval(statusTimer);
});

/* ================= สถานะ online/offline ================= */
const pharmacistsWithStatus = computed(() => {
    // อ้างถึง nowTick.value เพื่อให้ computed re-run ทุกครั้งที่ tick
    const now = new Date(nowTick.value);
    return pharmacists.value.map((p) => ({
        ...p,
        statusInfo: computeStatus(p.time, now)
    }));
});

// เรียงให้ "ออนไลน์" มาก่อน (รักษาลำดับระยะทางภายในกลุ่มเดียวกัน)
const sortedPharmacists = computed(() => {
    const order = { online: 0, break: 1, closed_today: 2, not_set: 3 };
    return [...pharmacistsWithStatus.value].sort((a, b) => {
        const oa = order[a.statusInfo.status] ?? 9;
        const ob = order[b.statusInfo.status] ?? 9;
        return oa - ob;
    });
});

/* ================= 4. Functions ================= */
const goToDetail = (id) => {
    router.push(`/pharmacist/${id}`);
};

const DEFAULT_AVATAR = imagesPharma('default.png');

const pharmaImageUrl = (staff) => {
    const file = (staff?.image || '').trim();
    if (!file) return DEFAULT_AVATAR;
    return imagesPharma(file);
};

const onImgError = (e) => {
    e.target.src = DEFAULT_AVATAR;
};

const formatDistance = (km) => {
    if (km === null || km === undefined) return null;
    const n = Number(km);
    if (!Number.isFinite(n)) return null;
    if (n < 1) return `${Math.round(n * 1000)} ม.`;
    return `${n.toFixed(n < 10 ? 1 : 0)} กม.`;
};
</script>

<template>
    <div class="container-wrapper">
        <div class="header-group">
            <h1 class="main-title">เจ้าหน้าที่เภสัชแนะนำ</h1>
        </div>

        <div v-if="locationStatus === 'denied' || locationStatus === 'unavailable'" class="location-hint">
            <i class="fa-solid fa-circle-info"></i>
            ไม่สามารถใช้ตำแหน่งของคุณได้ — แสดงรายชื่อเภสัชกรโดยไม่จัดเรียงตามระยะทาง
        </div>

        <div v-if="loadError" class="load-error-box">
            <p>{{ loadError }}</p>
            <button type="button" class="retry-btn" @click="refresh()">ลองใหม่</button>
        </div>

        <div v-else-if="isLoading" class="loading-box">
            <div class="spinner"></div>
            <p>กำลังค้นหาเภสัชกรที่ออนไลน์...</p>
        </div>

        <div v-else-if="sortedPharmacists.length > 0" class="pharmacist-grid">
            <div 
                v-for="staff in sortedPharmacists.slice(0, 3)" 
                :key="staff.id" 
                class="staff-card"
                :class="`status-${staff.statusInfo.status}`"
                @click="goToDetail(staff.id)"
            >
                <div class="status-badge" :class="`badge-${staff.statusInfo.color}`">
                    <span class="dot"></span>
                    <span v-if="staff.statusInfo.status === 'online'">ออนไลน์</span>
                    <span v-else-if="staff.statusInfo.status === 'break'">พักช่วง</span>
                    <span v-else-if="staff.statusInfo.status === 'closed_today'">หยุดวันนี้</span>
                    <span v-else>ไม่ระบุเวลา</span>
                </div>

                <div v-if="staff.distance_km !== null && staff.distance_km !== undefined" class="distance-chip">
                    <i class="fa-solid fa-location-dot"></i>
                    {{ formatDistance(staff.distance_km) }}
                </div>

                <div class="image-container">
                    <img :src="pharmaImageUrl(staff)" :alt="staff.name" @error="onImgError" />
                    <div v-if="staff.statusInfo.status !== 'online'" class="offline-overlay">
                        <i class="fa-regular fa-moon"></i>
                    </div>
                </div>
                
                <div class="info-content">
                    <h2 class="staff-name">{{ staff.name }}</h2>
                    <div class="time-slot">
                        <span class="clock-icon">🕒</span>
                        <span>
                            {{ staff.statusInfo.label }}
                            <span v-if="staff.statusInfo.status !== 'online' && staff.statusInfo.nextOpen" class="next-open">
                                <br>เปิดอีกครั้ง: {{ staff.statusInfo.nextOpen.dayTH }}
                                {{ staff.statusInfo.nextOpen.start }} น.
                            </span>
                        </span>
                    </div>
                    <div class="footer-card">
                        <span class="tag-label" :title="staff.store_name || ''">
                            <i class="fa-solid fa-store"></i>
                            {{ staff.store_name || 'ยังไม่มีร้านยา' }}
                        </span>
                        <span class="btn-more">ดูรายละเอียด ></span>
                    </div>
                </div>
            </div>
        </div>

        <div v-else class="empty-state">
            <p>ขณะนี้ยังไม่มีเภสัชกรออนไลน์ในระบบ</p>
        </div>

        <div class="action-footer">
            <button class="btn-view-all" @click="router.push('/pharmacist/all')">
                ดูเภสัชทั้งหมด
            </button>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/Doctor_card.css";

/* --- สไตล์เพิ่มเติม --- */
.loading-box {
    text-align: center;
    padding: 50px;
    color: #00469c;
}

.load-error-box {
    text-align: center;
    padding: 1.25rem 1rem;
    margin: 0 0 1rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
    color: #b91c1c;
}

.load-error-box p {
    margin: 0 0 0.75rem;
}

.retry-btn {
    border: none;
    background: #dc2626;
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    cursor: pointer;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #00469c;
    border-radius: 50%;
    margin: 0 auto 15px;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.status-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(255, 255, 255, 0.95);
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: bold;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}

.status-badge .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}

.badge-green { color: #16a34a; }
.badge-green .dot {
    background: #16a34a;
    box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2);
    animation: pulse-green 1.6s ease-in-out infinite;
}
.badge-orange { color: #d97706; }
.badge-orange .dot { background: #f59e0b; }
.badge-red { color: #dc2626; }
.badge-red .dot { background: #dc2626; }
.badge-gray { color: #64748b; }
.badge-gray .dot { background: #94a3b8; }

@keyframes pulse-green {
    0%, 100% { box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2); }
    50% { box-shadow: 0 0 0 6px rgba(22, 163, 74, 0.1); }
}

/* Card ที่ offline จะดูจางลงนิดหน่อย */
.staff-card.status-break,
.staff-card.status-closed_today,
.staff-card.status-not_set {
    opacity: 0.85;
}
.staff-card.status-break:hover,
.staff-card.status-closed_today:hover,
.staff-card.status-not_set:hover {
    opacity: 1;
}

.image-container {
    position: relative;
}

.offline-overlay {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.85);
    font-size: 2.5rem;
}

.next-open {
    font-size: 0.78rem;
    opacity: 0.85;
}

.distance-chip {
    position: absolute;
    top: 10px;
    left: 10px;
    background: #00469c;
    color: #ffffff;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 700;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 6px rgba(0, 70, 156, 0.3);
}

.distance-chip i {
    font-size: 0.7rem;
}

.location-hint {
    background: #fff8e1;
    border: 1px solid #ffe082;
    color: #8a6d3b;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 0.85rem;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
}

.header-group {
    justify-content: center;
    width: 100%;
    text-align: center;
}

.main-title {
    width: 100%;
    text-align: center;
}

.footer-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    gap: 8px;
}

.tag-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 60%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.tag-label i {
    flex-shrink: 0;
    font-size: 0.8rem;
}

.btn-more {
    font-size: 0.85rem;
    color: #ffffff;
    font-weight: bold;
    flex-shrink: 0;
}

.staff-card {
    cursor: pointer;
    position: relative;
    transition: all 0.3s ease;
}

.staff-card:hover {
    transform: translateY(-8px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}
</style>
