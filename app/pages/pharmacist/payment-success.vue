<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useApiBase } from '~/composables/useApiBase';

definePageMeta({ middleware: 'user-only' });

const route = useRoute();
const router = useRouter();
const { apiUrl } = useApiBase();

const countdown = ref(5); // ปรับลดเหลือ 5 วินาทีเพื่อให้ทันใจ
let timer = null;

// 1. ดึงข้อมูลจาก Query String (id ของเภสัชกรที่ลูกค้าเลือกซื้อบริการ)
const pharmacistId = computed(() => route.query.id || '1');

/**
 * 2. ฟังก์ชันสร้างคำขอปรึกษา (ไปบันทึกใน DB สถานะ waiting)
 * และส่งผู้ใช้กลับหน้าแรก
 */
const createRequestAndGoHome = async () => {
    stopTimer();
    
    const body = new FormData();
    body.append('id_pharma', pharmacistId.value);
    body.append('privilege', route.query.privilege || 'normal');
    body.append('consult_method', route.query.method || 'chat');
    body.append('booking_type', route.query.type || 'now');
    body.append('delivery_prepaid', route.query.delivery_prepaid === 'true' ? '1' : '0');
    if (route.query.date) body.append('appointment_date', String(route.query.date));
    if (route.query.time) body.append('appointment_time', String(route.query.time));
    const botSid = String(route.query.bot_session_id || '').trim();
    if (botSid) body.append('bot_session_id', botSid);
    
    try {
        const res = await $fetch(apiUrl('consult-handler.php?action=create_request'), {
            method: 'POST',
            body,
            credentials: 'include' 
        });

        if (res.status === 'success') {
            console.log("บันทึกคำขอเรียบร้อย");
        }
    } catch (err) {
        console.error("เกิดข้อผิดพลาด:", err);
    } finally {
        router.push({
            path: '/pharmacist/pharma_waiting',
            query: {
                id: pharmacistId.value,
                privilege: route.query.privilege || 'normal',
                method: route.query.method || 'chat',
                type: route.query.type || 'now',
                delivery_prepaid: route.query.delivery_prepaid || 'false',
                date: route.query.date || '',
                time: route.query.time || '',
                bot_session_id: route.query.bot_session_id || '',
                from_payment: '1',
            }
        });
    }
};

onMounted(() => {
    // เริ่มนับถอยหลัง
    timer = setInterval(() => {
        if (countdown.value > 0) {
            countdown.value--;
        } else {
            createRequestAndGoHome();
        }
    }, 1000);
});

const stopTimer = () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

onUnmounted(() => {
    stopTimer();
});
</script>

<template>
    <div class="success-page">
        <Header />
        
        <div class="container-success">
            <div class="success-card">
                <div class="status-icon">
                    <div class="circle-check">
                        <span class="check-mark">✓</span>
                    </div>
                </div>

                <h1 class="title">ชำระเงินสำเร็จ</h1>
                <p class="subtitle">เราได้รับการชำระเงินของคุณเรียบร้อยแล้ว</p>

                <div class="info-box">
                    <p class="redirect-text">
                        กำลังพาคุณกลับหน้าหลักเพื่อรอเภสัชกรในอีก 
                        <span class="seconds">{{ countdown }}</span> วินาที
                    </p>
                    <div class="progress-bar">
                        <div class="progress-fill" :style="{ width: (countdown * 20) + '%' }"></div>
                    </div>
                </div>

                <div class="action-group">
                    <button @click="createRequestAndGoHome" class="btn-primary">
                        ไปหน้ารอเภสัชทันที 👩‍⚕️
                    </button>
                </div>
                
                <p class="hint-text">*คุณสามารถดูสถานะการตอบรับได้ที่เมนู "กระดิ่ง" ในหน้าแรก</p>
            </div>
        </div>

        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/payment-success.css";
</style>