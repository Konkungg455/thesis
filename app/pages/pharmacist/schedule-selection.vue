<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'

definePageMeta({ middleware: 'user-only' });

const router = useRouter();
const route = useRoute();

const bookingDate = ref('');
const bookingTime = ref('');

const isGoldCard = computed(() => route.query.privilege === 'gold_card');
const hasDelivery = computed(() => route.query.delivery_prepaid === 'true');
const currentAmount = computed(() => route.query.amount || (isGoldCard.value ? '0' : '100'));
const consultMethod = computed(() => route.query.method || 'chat');

const methodLabel = computed(() => ({
    video: 'โทรแบบวิดีโอ',
    voice: 'โทรแบบเสียง',
    chat: 'พิมพ์แชท',
}[consultMethod.value] || 'พิมพ์แชท'));

const timeSlots = computed(() => {
    const slots = [];
    for (let h = 8; h <= 20; h++) {
        for (const m of [0, 15, 30, 45]) {
            if (h === 20 && m > 0) break;
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            const endH = m === 45 ? h + 1 : h;
            const endM = m === 45 ? 0 : m + 15;
            const eh = String(endH).padStart(2, '0');
            const em = String(endM).padStart(2, '0');
            slots.push(`${hh}.${mm} - ${eh}.${em}`);
        }
    }
    return slots;
});

const minDate = computed(() => new Date().toISOString().split('T')[0]);

const handleNext = () => {
    if (!bookingDate.value || !bookingTime.value) {
        alert('กรุณาเลือกวันที่และเวลาที่ต้องการนัดหมาย');
        return;
    }

    router.push({
        path: '/pharmacist/payment',
        query: { 
            ...route.query, 
            type: 'appointment',
            date: bookingDate.value, 
            time: bookingTime.value,
        }
    });
};
</script>

<template>
    <div class="schedule-page">
        <Header />
        <div class="container-schedule">
            
            <div class="schedule-card" :class="{ 'gold-theme': isGoldCard }">
                <button class="back-arrow" @click="router.back()">
                    <span class="icon">↩</span>
                </button>

                <h1 class="title">เลือกวันเวลาที่สะดวก</h1>

                <div class="selection-summary">
                    <div class="summary-item">
                        <span>ช่องทางปรึกษา:</span>
                        <strong>{{ methodLabel }}</strong>
                    </div>
                    <div class="summary-item">
                        <span>สิทธิ์การรักษา:</span>
                        <span :class="{ 'gold-text': isGoldCard }">
                            {{ isGoldCard ? 'บัตรทอง (ฟรีค่าปรึกษา)' : 'สิทธิ์ปกติ' }}
                        </span>
                    </div>
                    <div v-if="hasDelivery" class="summary-item">
                        <span>บริการเพิ่มเติม:</span>
                        <span class="delivery-text">จ่ายค่าขนส่งยาล่วงหน้า (+50.-)</span>
                    </div>
                </div>

                <div class="form-group">
                    <div class="input-block">
                        <label for="date">วันที่ต้องการนัดหมาย</label>
                        <div class="input-wrapper">
                            <input 
                                type="date" 
                                id="date" 
                                v-model="bookingDate"
                                class="custom-input"
                                :min="minDate"
                            />
                        </div>
                    </div>

                    <div class="input-block">
                        <label for="time">เวลาที่สะดวก (ช่วงละ 15 นาที)</label>
                        <div class="input-wrapper">
                            <select
                                id="time"
                                v-model="bookingTime"
                                class="custom-input"
                            >
                                <option value="" disabled>-- เลือกช่วงเวลา --</option>
                                <option v-for="slot in timeSlots" :key="slot" :value="slot">
                                    {{ slot }}
                                </option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="final-price-box">
                    <span>ยอดชำระเมื่อยืนยัน:</span>
                    <strong class="price-val">{{ currentAmount }} บาท</strong>
                </div>

                <button class="btn-submit" @click="handleNext">
                    ยืนยันเวลาและชำระเงิน
                </button>
            </div>

        </div>
        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/schedule-selection.css";

.selection-summary {
    background: #f1f5f9;
    padding: 15px;
    border-radius: 12px;
    margin-bottom: 20px;
    font-size: 0.9rem;
}

.summary-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
    gap: 12px;
}

.gold-text { color: #b45309; font-weight: bold; }
.delivery-text { color: #3b82f6; font-weight: bold; }

.final-price-box {
    margin: 25px 0;
    padding-top: 15px;
    border-top: 2px dashed #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 1.1rem;
}

.price-val {
    font-size: 1.4rem;
    color: #1e293b;
}

.gold-theme .btn-submit {
    background: linear-gradient(135deg, #d4af37 0%, #b8860b 100%);
}

.gold-theme .selection-summary {
    background: #fef3c7;
    border: 1px solid #fde68a;
}

.custom-input {
    width: 100%;
}
</style>
