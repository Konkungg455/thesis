<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

definePageMeta({ middleware: 'user-only' });

const route = useRoute();
const router = useRouter();

const resolveBotSessionId = () => {
    const fromQuery = String(route.query.bot_session_id || '').trim();
    if (fromQuery) return fromQuery;
    if (import.meta.client) {
        try {
            return localStorage.getItem('telebot_active_bot_session') || '';
        } catch { /* ignore */ }
    }
    return '';
};

/** มาจากปุ่ม "ติดต่อเภสัชกรของเราทันที" → ซ่อนรับทราบค่าส่ง 50 บาท */
const isEmergencyConsult = computed(() => {
    const q = String(route.query.emergency || '').trim();
    if (q === '1' || q === 'true') return true;
    if (import.meta.client) {
        try {
            return localStorage.getItem('telebot_skip_delivery_fee') === '1';
        } catch { /* ignore */ }
    }
    return false;
});

// สถานะการเลือกช่องทาง
const selectedMethod = ref('chat');

// 🚩 เปลี่ยนจาก "จ่ายล่วงหน้า" เป็น "รับทราบเงื่อนไขค่าส่ง 50 บาท"
const hasAcceptedDeliveryFee = ref(false);

// ค่าปรึกษา (ไม่บวก 50 บาทค่าส่ง)
const totalPrice = computed(() => 100);

const canSubmit = computed(() => isEmergencyConsult.value || hasAcceptedDeliveryFee.value);

// ไปหน้าถัดไปพร้อมส่งค่าทั้งหมดไปใน Query
const handleNext = () => {
    if (!isEmergencyConsult.value && !hasAcceptedDeliveryFee.value) {
        alert("กรุณากดยืนยันรับทราบค่าจัดส่งยาเพิ่มเติมกรณีมีการออกใบสรุปรายการยา");
        return;
    }

    router.push({
        path: '/pharmacist/booking-type',
        query: {
            id: route.query.id,
            method: selectedMethod.value,
            privilege: 'normal',
            delivery_accepted: (!isEmergencyConsult.value && hasAcceptedDeliveryFee.value) ? 'true' : 'false',
            amount: totalPrice.value,
            ...(isEmergencyConsult.value ? { emergency: '1' } : {}),
            ...(resolveBotSessionId() ? { bot_session_id: resolveBotSessionId() } : {}),
        }
    });
};
</script>

<template>
    <div class="selection-page">
        <Header />
        <div class="container-selection">

            <div class="selection-card">

                <button class="back-arrow" @click="router.back()">
                    <span class="icon">↩</span>
                </button>

                <h1 class="title">เลือกช่องทางการปรึกษา</h1>
                <div class="duration">
                    <span class="clock-icon">🕒</span> 15 นาที
                </div>

                <!-- รายการช่องทาง -->
                <div class="method-group">
                    <div
                        v-for="method in [
                            { id: 'video', label: 'โทรแบบวิดีโอ', icon: '📹' },
                            { id: 'voice', label: 'โทรแบบเสียง', icon: '📞' },
                            { id: 'chat', label: 'พิมพ์แชท', icon: '💬' }
                        ]"
                        :key="method.id"
                        class="method-card"
                        :class="{ active: selectedMethod === method.id }"
                        @click="selectedMethod = method.id"
                    >
                        <div class="method-left">
                            <span class="icon">{{ method.icon }}</span>
                            <span class="label">{{ method.label }}</span>
                        </div>
                        <span class="price">100 บาท</span>
                    </div>
                </div>

                <!-- รับทราบค่าส่ง — ซ่อนเมื่อมาจากเส้นทางฉุกเฉิน -->
                <div
                    v-if="!isEmergencyConsult"
                    class="delivery-notice-box"
                    @click="hasAcceptedDeliveryFee = !hasAcceptedDeliveryFee"
                    :class="{ 'active-notice': hasAcceptedDeliveryFee }"
                >
                    <div class="checkbox-wrapper">
                        <div class="custom-check" :class="{ checked: hasAcceptedDeliveryFee }">
                            <span v-if="hasAcceptedDeliveryFee">✓</span>
                        </div>
                        <div class="notice-text">
                            <span class="delivery-label">รับทราบค่าจัดส่งยา 50 บาท</span>
                            <small class="delivery-sub">(เก็บเงินปลายทางเมื่อส่งยา)</small>
                        </div>
                    </div>
                    <span class="delivery-icon">📦</span>
                </div>

                <div class="summary-total">
                    <span>ยอดรวมชำระตอนนี้:</span>
                    <span class="total-amount">{{ totalPrice }} บาท</span>
                </div>

                <p class="warning-text">
                    ใช้งานอย่างมีประสิทธิภาพแนะนำ โทรเสียง และ โทรวิดีโอ
                </p>

                <div class="button-group">
                    <button class="btn-submit" @click="handleNext" :disabled="!canSubmit">
                        ถัดไป
                    </button>
                </div>
            </div>

        </div>
        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/consult-selection.css";

.delivery-notice-box {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px;
    border-radius: 12px;
    margin: 15px 0;
    cursor: pointer;
    border: 2px solid #e2e8f0;
    background: #f8fafc;
    transition: all 0.2s;
}

.active-notice {
    border-color: #3b82f6;
    background: #eff6ff;
}

.gold-theme .active-notice {
    border-color: #d4af37;
    background: #fffdf5;
}

.checkbox-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;
}

.custom-check {
    width: 22px;
    height: 22px;
    border: 2px solid #cbd5e1;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    color: white;
    font-size: 12px;
}

.custom-check.checked {
    background: #3b82f6;
    border-color: #3b82f6;
}

.gold-theme .custom-check.checked {
    background: #d4af37;
    border-color: #d4af37;
}

.notice-text {
    display: flex;
    flex-direction: column;
    text-align: left;
}

.delivery-label {
    font-weight: bold;
    color: #1e293b;
    font-size: 0.95rem;
}

.delivery-sub {
    color: #64748b;
    font-size: 0.8rem;
}

.delivery-icon {
    font-size: 1.4rem;
}

.summary-total {
    display: flex;
    justify-content: space-between;
    padding: 15px 5px;
    font-weight: bold;
    font-size: 1.1rem;
    border-top: 1px dashed #cbd5e1;
    margin-top: 5px;
}

.total-amount {
    color: #1e293b;
    font-size: 1.4rem;
}

.btn-submit:disabled {
    background-color: #cbd5e1;
    cursor: not-allowed;
}
</style>
