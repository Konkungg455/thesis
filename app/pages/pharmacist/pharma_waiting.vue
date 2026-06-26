<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useApiBase } from '~/composables/useApiBase';

definePageMeta({ middleware: 'user-only' });

const route = useRoute();
const router = useRouter();
const { imagesPharma, apiUrl } = useApiBase();
const defaultAvatar = imagesPharma('default.png');

const isCreating = ref(true); 
const statusText = ref("กำลังส่งคำขอหาเภสัชกร...");
let pollTimer = null;

// 🆕 ตัวจับเวลา — เภสัชต้องตอบรับภายใน 5 นาที ไม่งั้นยกเลิกแล้วดีดกลับไปเลือกใหม่
const WAIT_LIMIT_SEC = 5 * 60;
const remainingSec = ref(WAIT_LIMIT_SEC);
let countdownTimer = null;

const countdownDisplay = computed(() => {
    const m = Math.floor(remainingSec.value / 60);
    const s = remainingSec.value % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});

// 1. ดึง ID หมอจาก URL (เพื่อใช้สร้าง Request)
const pharmacistId = computed(() => route.query.id || '1');

/**
 * 2. ฟังก์ชันสร้างคำขอปรึกษา (เรียกทันทีที่เข้าหน้า)
 */
const initRequest = async () => {
    const body = new FormData();
    body.append('id_pharma', pharmacistId.value);
    body.append('privilege', route.query.privilege || 'normal');
    body.append('consult_method', route.query.method || 'chat');
    body.append('booking_type', route.query.type || 'now');
    body.append('delivery_prepaid', route.query.delivery_prepaid === 'true' ? '1' : '0');

    // 🆕 แนบ session ปัจจุบันของห้องแชท AI ที่ผู้ป่วยกำลังคุยอยู่ตอนกด "ปรึกษาเภสัช"
    //    ฝั่งเภสัชจะได้เห็นประวัติแชทตรง session นั้นๆ ไม่ใช่ session ล่าสุดเฉยๆ
    //    ลองอ่าน 3 แหล่ง ตามลำดับความน่าเชื่อถือ: URL query > localStorage > none
    let activeSid = (route.query.bot_session_id || '').toString();
    if (!activeSid && import.meta.client) {
        try { activeSid = localStorage.getItem('telebot_active_bot_session') || ''; } catch {}
    }
    if (activeSid) {
        body.append('bot_session_id', activeSid);
        console.log('[pharma_waiting] sending bot_session_id =', activeSid);
    } else {
        console.warn('[pharma_waiting] no bot_session_id available — pharmacist will see latest session as fallback');
    }
    
    try {
        const res = await $fetch(apiUrl('consult-handler.php?action=create_request'), {
            method: 'POST',
            body,
            credentials: 'include' 
        });

        if (res.status === 'success') {
            isCreating.value = false;
            statusText.value = "รอเภสัชกรตอบรับคำขอของคุณ...";
            startPolling(); // 🚩 เริ่มเฝ้ารอจนกว่าหมอจะกดรับสาย
            startCountdown(); // 🆕 เริ่มจับเวลา 5 นาที
        }
    } catch (err) {
        console.error("Error creating request:", err);
        statusText.value = "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
    }
};

/**
 * 3. ฟังก์ชันเช็คสถานะ (Polling) ทุกๆ 3 วินาที
 */
const startPolling = () => {
    pollTimer = setInterval(async () => {
        try {
            const data = await $fetch(apiUrl('consult-handler.php?action=check_user_status'), {
                credentials: 'include'
            });

            // ✅ ถ้าหมอกดรับสาย (accepted) ให้พาไปหน้าแชททันที
            if (data && data.status === 'accepted') {
                stopPolling();
                router.push({
                    path: '/user/chat', // 🚩 ปลายทางที่เพื่อนต้องการ
                    query: { id: data.id_pharma } // ส่ง ID หมอไปเปิดห้องแชท
                });
            } 
            // ❌ ถ้าหมอปฏิเสธ (rejected)
            else if (data && data.status === 'rejected') {
                stopPolling();
                alert("ขออภัย เภสัชกรไม่สะดวกรับสายในขณะนี้");
                router.push('/');
            }
        } catch (err) {
            console.error("Polling error:", err);
        }
    }, 3000);
};

const stopPolling = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
};

// 🆕 จับเวลาถอยหลัง 5 นาที — หมดเวลา → ยกเลิกคำขอ + ดีดกลับไปเลือกเภสัชใหม่
const startCountdown = () => {
    stopCountdown();
    remainingSec.value = WAIT_LIMIT_SEC;
    countdownTimer = setInterval(() => {
        if (remainingSec.value <= 1) {
            stopCountdown();
            handleTimeoutExpired();
            return;
        }
        remainingSec.value -= 1;
    }, 1000);
};

const stopCountdown = () => {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
};

const handleTimeoutExpired = async () => {
    stopPolling();
    statusText.value = 'หมดเวลา — กำลังพาคุณกลับไปเลือกเภสัชใหม่...';
    // พยายามยกเลิกคำขอที่ค้างอยู่ฝั่ง backend (ถ้ามี endpoint)
    try {
        const fd = new FormData();
        fd.append('status', 'cancelled');
        await $fetch(apiUrl('consult-handler.php?action=cancel_user_waiting'), {
            method: 'POST', body: fd, credentials: 'include'
        }).catch(() => {});
    } catch {}
    alert('เภสัชกรไม่ได้ตอบรับภายใน 5 นาที — กรุณาเลือกเภสัชกรท่านอื่น');
    // เก็บ bot_session_id ไว้ใน query เพื่อให้ flow ต่อไปยังเชื่อมกับ session เดิม
    const activeSid = (route.query.bot_session_id || '').toString();
    router.push({
        path: '/pharmacist/location',
        query: activeSid ? { bot_session_id: activeSid } : {}
    });
};

onMounted(() => {
    if (route.query.from_payment === '1') {
        isCreating.value = false;
        statusText.value = 'รอเภสัชกรตอบรับคำขอของคุณ...';
        startPolling();
        startCountdown();
        return;
    }
    initRequest();
});

onUnmounted(() => { 
    stopPolling();
    stopCountdown();
});
</script>

<template>
    <div class="telepharmacy-loading-page">
        <Header />
        
        <div class="main-content">
            <div class="status-card">
                <div class="search-animation">
                    <div class="pulse-circle"></div>
                    <div class="pulse-circle-2"></div>
                    <div class="avatar-container">
                        <img :src="defaultAvatar" alt="Doctor" class="doctor-avatar">
                    </div>
                </div>

                <div class="text-content">
                    <h1 class="status-title" v-if="!isCreating">กำลังรอเภสัชกร</h1>
                    <h1 class="status-title" v-else>กำลังเริ่มการเชื่อมต่อ</h1>
                    <p class="status-subtitle">{{ statusText }}</p>
                </div>

                <div class="waiting-box" v-if="!isCreating">
                    <div class="loading-bar-container">
                        <div class="loading-bar-infinite"></div>
                    </div>
                    <p class="wait-text">กรุณาอย่าปิดหน้านี้ ระบบจะพาคุณเข้าสู่ห้องแชทอัตโนมัติ</p>
                    <!-- 🆕 countdown 5 นาที -->
                    <div class="countdown-box" :class="{ 'countdown-box--urgent': remainingSec <= 60 }">
                        <i class="fa-solid fa-hourglass-half"></i>
                        <span>หมดเวลาภายใน <strong>{{ countdownDisplay }}</strong> นาที</span>
                    </div>
                </div>

                <div class="action-section">
                    <button @click="router.push('/')" class="btn-skip">
                        ยกเลิกการรอ
                    </button>
                </div>

                <div class="tips-box">
                    <p>💡 <b>คำแนะนำ:</b> เภสัชกรมักจะตอบรับภายใน 1-2 นาที กรุณาเปิดเสียงลำโพงไว้ด้วยครับ</p>
                </div>
            </div>
        </div>

        <Footer />
    </div>
</template>

<style scoped>
/* CSS ส่วนเดิม + เพิ่มเติม Loading แบบวิ่งวน */
.loading-bar-infinite {
    background: #00a699;
    height: 100%;
    width: 30%;
    border-radius: 10px;
    animation: moveBar 2s infinite linear;
}

@keyframes moveBar {
    0% { margin-left: -30%; }
    100% { margin-left: 100%; }
}

/* ส่วน CSS อื่นๆ ใช้ตามเดิมที่นายส่งมาได้เลยครับ */
.telepharmacy-loading-page { background-color: #ffffff; min-height: 100vh; display: flex; flex-direction: column; font-family: 'Kanit', sans-serif; }
.main-content { flex: 1; display: flex; justify-content: center; align-items: center; padding: 20px; }
.status-card { background: white; padding: 40px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); text-align: center; max-width: 450px; width: 100%; }
.search-animation { position: relative; width: 120px; height: 120px; margin: 0 auto 30px; }
.doctor-avatar { width: 80px; height: 80px; position: relative; z-index: 5; background: white; border-radius: 50%; padding: 5px; }
.pulse-circle, .pulse-circle-2 { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; background-color: rgba(0, 166, 153, 0.2); border-radius: 50%; animation: pulse 2s infinite; }
.pulse-circle-2 { animation-delay: 1s; }
@keyframes pulse { 0% { width: 80px; height: 80px; opacity: 1; } 100% { width: 150px; height: 150px; opacity: 0; } }
.status-title { color: #00a699; font-size: 24px; margin-bottom: 8px; }
.status-subtitle { color: #666; font-size: 16px; margin-bottom: 30px; }
.loading-bar-container { background: #eee; height: 8px; border-radius: 10px; overflow: hidden; margin-bottom: 12px; }
.wait-text { font-size: 14px; color: #888; }
.btn-skip { background: none; border: 1px solid #ddd; padding: 10px 20px; border-radius: 30px; color: #555; cursor: pointer; margin-top: 25px; transition: 0.3s; }
.tips-box { margin-top: 30px; padding: 15px; background: #e6f6f5; border-radius: 12px; font-size: 13px; color: #00796b; }

/* 🆕 countdown 5 นาที */
.countdown-box {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    padding: 10px 18px;
    background: #eef2ff;
    color: #4338ca;
    border: 1px solid #c7d2fe;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 500;
}
.countdown-box i { font-size: 16px; }
.countdown-box strong { font-variant-numeric: tabular-nums; font-weight: 700; }
.countdown-box--urgent {
    background: #fff1f2;
    color: #be123c;
    border-color: #fecdd3;
    animation: pulseRed 1s ease-in-out infinite alternate;
}
@keyframes pulseRed {
    from { transform: scale(1); }
    to { transform: scale(1.04); }
}
</style>