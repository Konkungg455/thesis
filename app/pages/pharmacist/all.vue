<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useApiBase } from '~/composables/useApiBase';
import { usePharmacistStatus } from '~/composables/usePharmacistStatus';

const router = useRouter();
const { apiUrl, imagesPharma } = useApiBase();
const { computeStatus } = usePharmacistStatus();

const pharmacists = ref([]);
const isLoading = ref(true);

const userPos = ref(null);
const locationStatus = ref('idle');     // idle | locating | granted | denied | unavailable
const maxDistanceKm = ref(10);           // 0 = ไม่จำกัด, ค่าเริ่มต้น 10 กม.
const statusFilter = ref('all');        // all | online | break | closed_today
const nowTick = ref(Date.now());
let statusTimer = null;

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
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    });

const fetchPharmacists = async () => {
    isLoading.value = true;
    try {
        let url = apiUrl('get_pharmacists.php');
        if (userPos.value) {
            url += `?lat=${userPos.value.lat}&lng=${userPos.value.lng}`;
        }
        const response = await $fetch(url, { credentials: 'include' });
        if (response.status === 'success') {
            pharmacists.value = response.data ?? [];
        }
    } catch (err) {
        console.error("Fetch Error:", err);
    } finally {
        isLoading.value = false;
    }
};

const requestLocation = async () => {
    userPos.value = await getUserPosition();
    await fetchPharmacists();
};

onMounted(async () => {
    userPos.value = await getUserPosition();
    await fetchPharmacists();
    statusTimer = setInterval(() => {
        nowTick.value = Date.now();
    }, 30 * 1000);
});

onBeforeUnmount(() => {
    if (statusTimer) clearInterval(statusTimer);
});

// แนบสถานะกับเภสัชกรแต่ละคน + re-compute เมื่อ nowTick เปลี่ยน
const pharmacistsWithStatus = computed(() => {
    const now = new Date(nowTick.value);
    return pharmacists.value.map((p) => ({
        ...p,
        statusInfo: computeStatus(p.time, now)
    }));
});

// นับจำนวนแต่ละสถานะ (ใช้แสดงในแท็บ)
const statusCounts = computed(() => {
    const counts = { all: 0, online: 0, break: 0, closed_today: 0, not_set: 0 };
    pharmacistsWithStatus.value.forEach((p) => {
        counts.all++;
        counts[p.statusInfo.status] = (counts[p.statusInfo.status] || 0) + 1;
    });
    return counts;
});

const filteredPharmacists = computed(() => {
    let list = pharmacistsWithStatus.value;

    // กรองตามสถานะ
    if (statusFilter.value !== 'all') {
        list = list.filter((p) => p.statusInfo.status === statusFilter.value);
    }

    // กรองตามระยะทาง
    if (userPos.value && maxDistanceKm.value > 0) {
        list = list.filter((p) => {
            if (p.distance_km === null || p.distance_km === undefined) return false;
            return Number(p.distance_km) <= Number(maxDistanceKm.value);
        });
    }

    // เรียง: online → break → closed_today (ภายในกลุ่มเดียวกันจะคงลำดับเดิม / ระยะใกล้ก่อน)
    const order = { online: 0, break: 1, closed_today: 2, not_set: 3 };
    return [...list].sort((a, b) => {
        const oa = order[a.statusInfo.status] ?? 9;
        const ob = order[b.statusInfo.status] ?? 9;
        return oa - ob;
    });
});

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
    <Header />
    <div class="container-wrapper">
        <div class="header-group">
            <h1 class="main-title">รายชื่อเภสัชกรทั้งหมด</h1>
            <p v-if="!isLoading">
                พบเภสัชกรทั้งหมด <strong>{{ filteredPharmacists.length }}</strong> ท่าน
                <span v-if="userPos && maxDistanceKm > 0">
                    (ภายในรัศมี {{ maxDistanceKm }} กม.)
                </span>
            </p>
            <p v-else>กำลังโหลดรายชื่อเภสัชกร...</p>
        </div>

        <!-- แท็บกรองตามสถานะ -->
        <div class="status-tabs">
            <button
                type="button"
                class="status-tab"
                :class="{ active: statusFilter === 'all' }"
                @click="statusFilter = 'all'"
            >
                <span class="tab-label">ทั้งหมด</span>
                <span class="tab-count">{{ statusCounts.all }}</span>
            </button>
            <button
                type="button"
                class="status-tab tab-online"
                :class="{ active: statusFilter === 'online' }"
                @click="statusFilter = 'online'"
            >
                <span class="dot dot-online"></span>
                <span class="tab-label">ออนไลน์ตอนนี้</span>
                <span class="tab-count">{{ statusCounts.online }}</span>
            </button>
            <button
                type="button"
                class="status-tab tab-break"
                :class="{ active: statusFilter === 'break' }"
                @click="statusFilter = 'break'"
            >
                <span class="dot dot-break"></span>
                <span class="tab-label">พักช่วง/รอเปิด</span>
                <span class="tab-count">{{ statusCounts.break }}</span>
            </button>
            <button
                type="button"
                class="status-tab tab-closed"
                :class="{ active: statusFilter === 'closed_today' }"
                @click="statusFilter = 'closed_today'"
            >
                <span class="dot dot-closed"></span>
                <span class="tab-label">หยุดวันนี้</span>
                <span class="tab-count">{{ statusCounts.closed_today }}</span>
            </button>
        </div>

        <!-- ตัวกรองระยะทาง -->
        <div class="distance-filter-bar">
            <div v-if="userPos" class="distance-filter">
                <label>
                    <i class="fa-solid fa-location-crosshairs"></i>
                    ระยะทางจากคุณ:
                </label>
                <select v-model.number="maxDistanceKm" class="filter-select">
                    <option :value="0">ทั้งหมด (ไม่จำกัดระยะ)</option>
                    <option :value="2">ภายใน 2 กม.</option>
                    <option :value="5">ภายใน 5 กม.</option>
                    <option :value="10">ภายใน 10 กม.</option>
                    <option :value="25">ภายใน 25 กม.</option>
                    <option :value="50">ภายใน 50 กม.</option>
                    <option :value="100">ภายใน 100 กม.</option>
                </select>
            </div>
            <div v-else class="distance-filter denied-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>ไม่สามารถใช้ตำแหน่งของคุณได้ ระบบจะไม่จัดเรียงตามระยะทาง</span>
                <button type="button" class="btn-retry-loc" @click="requestLocation">
                    <i class="fa-solid fa-arrows-rotate"></i> ลองใหม่
                </button>
            </div>
        </div>

        <div v-if="isLoading" class="loading-box">
            <div class="spinner"></div>
            <p>กำลังดึงข้อมูล...</p>
        </div>

        <div v-else-if="filteredPharmacists.length > 0" class="pharmacist-grid">
            <div
                v-for="staff in filteredPharmacists"
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
                    <p class="time-slot status-line">
                        <i class="fa-regular fa-clock"></i>
                        {{ staff.statusInfo.label }}
                    </p>
                    <p v-if="staff.statusInfo.status !== 'online' && staff.statusInfo.nextOpen" class="next-open-line">
                        เปิดอีกครั้ง: {{ staff.statusInfo.nextOpen.dayTH }}
                        {{ staff.statusInfo.nextOpen.start }} น.
                    </p>
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
            <i class="fa-solid fa-user-doctor empty-icon"></i>
            <p v-if="statusFilter === 'online'">ยังไม่มีเภสัชกรออนไลน์ตอนนี้ ลองดูแท็บอื่นนะครับ</p>
            <p v-else-if="statusFilter === 'break'">ไม่มีเภสัชกรที่อยู่ในช่วงพักตอนนี้</p>
            <p v-else-if="statusFilter === 'closed_today'">ทุกคนเปิดทำการในวันนี้</p>
            <p v-else-if="userPos && maxDistanceKm > 0">
                ไม่พบเภสัชกรในรัศมี {{ maxDistanceKm }} กม. ลองขยายระยะการค้นหา
            </p>
            <p v-else>ยังไม่มีเภสัชกรในระบบ</p>
        </div>

        <div class="action-footer">
            <button class="btn-back-home" @click="router.push('/')">
                <i class="fa-solid fa-house"></i>
                <span>กลับหน้าหลัก</span>
            </button>
        </div>
    </div>
    <Footer />
</template>

<style scoped>
@import "@/assets/Doctor_card.css";

.header-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    margin-bottom: 24px;
    width: 100%;
}

.main-title {
    font-size: 2rem;
    color: #00469c;
    margin-bottom: 10px;
    font-weight: 600;
}

.header-group p {
    font-size: 1.1rem;
    color: #666;
    margin: 0;
}

/* ============ Status Tabs ============ */
.status-tabs {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-bottom: 20px;
}

.status-tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    color: #475569;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.status-tab:hover {
    border-color: #00469c;
    color: #00469c;
    transform: translateY(-1px);
}

.status-tab.active {
    background: #00469c;
    border-color: #00469c;
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(0, 70, 156, 0.25);
}

.status-tab .tab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 26px;
    padding: 0 8px;
    height: 22px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #334155;
    font-size: 0.75rem;
    font-weight: 700;
}

.status-tab.active .tab-count {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
}

.status-tab .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
}
.dot-online { background: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.2); }
.dot-break { background: #f59e0b; }
.dot-closed { background: #dc2626; }

/* ============ Distance Filter Bar ============ */
.distance-filter-bar {
    display: flex;
    justify-content: center;
    margin-bottom: 30px;
}

.distance-filter {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    background: #f1f6ff;
    border: 1px solid #cfe1ff;
    border-radius: 999px;
    color: #00469c;
    font-weight: 500;
    box-shadow: 0 2px 6px rgba(0, 70, 156, 0.08);
}

.distance-filter label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.95rem;
}

.filter-select {
    border: 1px solid #cfe1ff;
    background: #ffffff;
    color: #00469c;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    outline: none;
}

.filter-select:focus {
    border-color: #00469c;
    box-shadow: 0 0 0 3px rgba(0, 70, 156, 0.15);
}

.distance-filter.denied-state {
    background: #fff7ed;
    border-color: #fed7aa;
    color: #9a3412;
    font-weight: 500;
    font-size: 0.9rem;
}

.btn-retry-loc {
    border: none;
    background: #f97316;
    color: white;
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.btn-retry-loc:hover {
    background: #ea580c;
}

/* ============ Distance Chip / Status Badge on card ============ */
.staff-card {
    position: relative;
    cursor: pointer;
    transition: all 0.3s ease;
}

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
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
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
    color: rgba(255, 255, 255, 0.85);
    font-size: 2.5rem;
}

.status-line {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
}

.next-open-line {
    margin: 4px 0 0;
    font-size: 0.8rem;
    opacity: 0.85;
    color: rgba(255, 255, 255, 0.95);
}

.distance-chip {
    position: absolute;
    top: 10px;
    left: 10px;
    background: #00469c;
    color: #ffffff;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 6px rgba(0, 70, 156, 0.3);
}

.distance-chip i {
    font-size: 0.7rem;
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
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 13px;
}

/* ============ Empty / Loading ============ */
.loading-box {
    text-align: center;
    padding: 50px;
    color: #00469c;
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

.empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #64748b;
}

.empty-icon {
    font-size: 3rem;
    color: #cbd5e1;
    margin-bottom: 12px;
}

/* ============ Footer button ============ */
.action-footer {
    display: flex;
    justify-content: center;
    margin-top: 50px;
    padding-bottom: 50px;
}

.btn-back-home {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 28px;
    background-color: #ffffff;
    color: #00469c;
    border: 2px solid #00469c;
    border-radius: 50px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px rgba(0, 70, 156, 0.1);
}

.btn-back-home:hover {
    background-color: #00469c;
    color: #ffffff;
    transform: translateY(-3px);
    box-shadow: 0 8px 15px rgba(0, 70, 156, 0.2);
}

.btn-back-home:active {
    transform: translateY(0);
    box-shadow: 0 2px 5px rgba(0, 70, 156, 0.2);
}

.btn-back-home i {
    font-size: 1.1rem;
}
</style>
