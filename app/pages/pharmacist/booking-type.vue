<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

definePageMeta({ middleware: 'user-only' });

const router = useRouter();
const route = useRoute();

// ค่าเริ่มต้นคือ 'now' (ติดต่อตอนนี้)
const bookingType = ref('now'); 

// ดึงข้อมูลราคามาแสดงเพื่อความชัดเจน (Optional)
const isGoldCard = route.query.privilege === 'gold_card';
const hasDelivery = route.query.delivery_prepaid === 'true';

const handleFinalNext = () => {
    if (bookingType.value === 'now') {
        // ✅ กรณีเลือก "ติดต่อตอนนี้" -> ไปหน้าชำระเงิน (ส่ง Query ทั้งหมดต่อไปด้วย)
        router.push({
            path: '/pharmacist/payment',
            query: { 
                ...route.query, // เก็บค่า id, method, privilege, delivery_prepaid, amount ไว้
                type: 'now' 
            }
        });
    } else {
        // ✅ กรณีเลือก "จองล่วงหน้า" -> ไปหน้าเลือกเวลา
        router.push({
            path: '/pharmacist/schedule-selection',
            query: { 
                ...route.query, 
                type: 'appointment' 
            }
        });
    }
};
</script>

<template>
    <div class="booking-page">
        <Header />
        <div class="container-booking">
            
            <div class="booking-card" :class="{ 'gold-theme': isGoldCard }">
                <!-- ปุ่มย้อนกลับ -->
                <button class="back-arrow" @click="router.back()">
                    <span class="icon">↩</span>
                </button>

                <h1 class="title">เลือกการติดต่อเภสัช</h1>

                <!-- สรุปสิทธิ์สั้นๆ ให้ผู้ใช้มั่นใจ -->
                <div v-if="isGoldCard" class="status-mini-badge">
                    ✨ สิทธิ์บัตรทอง (ค่าปรึกษา 0.-)
                </div>

                <div class="option-group">
                    <!-- ตัวเลือก: ติดต่อตอนนี้ -->
                    <div 
                        class="option-item" 
                        :class="{ active: bookingType === 'now' }" 
                        @click="bookingType = 'now'"
                    >
                        <div class="option-content">
                            <span class="icon">
                                <svg viewBox="0 0 24 24" width="1.5em" height="1.5em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                </svg>
                            </span>
                            <div class="text-group">
                                <span class="label">ติดต่อตอนนี้</span>
                                <small>เริ่มสนทนาทันทีหลังชำระเงิน</small>
                            </div>
                        </div>
                    </div>

                    <!-- ตัวเลือก: จองล่วงหน้า -->
                    <div 
                        class="option-item" 
                        :class="{ active: bookingType === 'appointment' }" 
                        @click="bookingType = 'appointment'"
                    >
                        <div class="option-content">
                            <span class="icon-clock">
                                <svg viewBox="0 0 24 24" width="1.5em" height="1.5em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="9"></circle>
                                    <path d="M12 7v5l3 2"></path>
                                </svg>
                            </span>
                            <div class="text-group">
                                <span class="label">จองล่วงหน้า</span>
                                <small>นัดหมายเวลาที่สะดวก</small>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- แสดงสรุปยอดเงินเล็กน้อยก่อนไปหน้าชำระเงิน -->
                <div class="price-summary-box">
                    <span>ยอดชำระเบื้องต้น:</span>
                    <strong>{{ route.query.amount || (isGoldCard ? '0' : '100') }} บาท</strong>
                </div>

                <button class="btn-submit" @click="handleFinalNext">
                    {{ bookingType === 'now' ? 'ไปที่หน้าชำระเงิน' : 'เลือกวันเวลา' }}
                </button>
            </div>

        </div>
        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/booking-type.css";

/* 🚩 CSS เพิ่มเติมสำหรับความสวยงาม */
.status-mini-badge {
    background: #fef3c7;
    color: #b45309;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 0.85rem;
    display: inline-block;
    margin-bottom: 15px;
    font-weight: bold;
}

.text-group {
    display: flex;
    flex-direction: column;
    text-align: left;
    margin-left: 10px;
}
.price-summary-box {
    margin: 20px 0;
    padding: 10px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.gold-theme .active .label {
    color: #d4af37;
}

.gold-theme .btn-submit {
    background: linear-gradient(135deg, #d4af37 0%, #b8860b 100%);
}
</style>