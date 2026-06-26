<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

definePageMeta({ middleware: 'user-only' });

const route = useRoute();
const router = useRouter();

// สถานะการเลือกช่องทาง
const selectedMethod = ref('chat');

// สถานะการใช้สิทธิ์ (บัตรทอง/ปกติ)
const isGoldCard = ref(false);

// คำนวณราคาสรุปเฉพาะค่าปรึกษา (ไม่มีค่าส่งยา 50 บาทในโหมดฉุกเฉิน)
const totalPrice = computed(() => {
    return isGoldCard.value ? 0 : 100;
});

// ฟังก์ชันสลับสิทธิ์
const togglePrivilege = () => {
    isGoldCard.value = !isGoldCard.value;
};

// ไปหน้าถัดไปพร้อมส่งค่าทั้งหมดไปใน Query
const handleNext = () => {
    router.push({
        path: '/pharmacist/booking-type',
        query: {
            id: route.query.id,
            method: selectedMethod.value,
            privilege: isGoldCard.value ? 'gold_card' : 'normal',
            emergency: 'true',
            amount: totalPrice.value
        }
    });
};
</script>

<template>
    <div class="selection-page">
        <Header />
        <div class="container-selection">

            <div class="selection-card" :class="{ 'gold-theme': isGoldCard }">

                <button class="back-arrow" @click="router.back()">
                    <span class="icon">↩</span>
                </button>

                <h1 class="title">เลือกช่องทางการปรึกษาฉุกเฉิน</h1>
                <div class="duration">
                    <span class="clock-icon">🕒</span> 15 นาที
                </div>

                <div class="emergency-note">
                    <span class="icon">🚨</span>
                    โหมดฉุกเฉิน: ข้ามการยืนยันค่าส่งยา 50 บาท เพื่อเข้าคุยเภสัชกรให้เร็วที่สุด
                </div>

                <div class="method-group">
                    <div v-for="method in [
                        { id: 'video', label: 'โทรแบบวิดีโอ', icon: '📹' },
                        { id: 'voice', label: 'โทรแบบเสียง', icon: '📞' },
                        { id: 'chat', label: 'พิมพ์แชท', icon: '💬' }
                    ]" :key="method.id" class="method-card" :class="{ active: selectedMethod === method.id }"
                        @click="selectedMethod = method.id">
                        <div class="method-left">
                            <span class="icon">{{ method.icon }}</span>
                            <span class="label">{{ method.label }}</span>
                        </div>
                        <span class="price">{{ isGoldCard ? '0 บาท' : '100 บาท' }}</span>
                    </div>
                </div>

                <div class="summary-total">
                    <span>ยอดรวมชำระตอนนี้:</span>
                    <span class="total-amount">{{ totalPrice }} บาท</span>
                </div>

                <p class="warning-text">
                    ใช้งานอย่างมีประสิทธิภาพแนะนำ โทรเสียง และ โทรวิดีโอ
                </p>

                <div class="button-group">
                    <button class="btn-submit" @click="handleNext">
                        ถัดไป
                    </button>

                    <button class="btn-privilege" :class="{ 'active-gold': isGoldCard }" @click="togglePrivilege">
                        {{ isGoldCard ? 'ใช้สิทธิ์ปกติ' : 'ใช้สิทธิ์บัตรทอง' }}
                    </button>
                </div>
            </div>

        </div>
        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/consult-selection.css";

.emergency-note {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 0 16px;
    padding: 12px;
    border-radius: 10px;
    background: #fff4f4;
    border: 1px solid #fecaca;
    color: #b91c1c;
    font-size: 0.9rem;
    text-align: left;
}
</style>
