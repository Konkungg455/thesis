<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import qrPaymentImage from '@/assets/images/payment/qrpayment_mockup.jpg';

definePageMeta({ middleware: 'user-only' });

const route = useRoute();
const router = useRouter();

/* ================= 1. ดึงข้อมูลและคำนวณราคาใหม่ ================= */

const pharmacistId = computed(() => route.query.id || '1');
const consultMethod = computed(() => route.query.method || 'chat');
const privilege = computed(() => route.query.privilege || 'normal');
const consultType = computed(() => route.query.type || 'now');

// เช็คสิทธิ์บัตรทอง
const isGoldCard = computed(() => privilege.value === 'gold_card');

// 🚩 ใหม่: สถานะการจ่ายค่าส่งล่วงหน้า (ดึงค่าจากหน้าเลือกช่องทาง หรือให้ติ๊กใหม่ที่นี่)
const isDeliveryPrepaid = ref(route.query.delivery_prepaid === 'true');

// คำนวณราคาสรุป: บัตรทอง 0 บาท / ปกติ 100 บาท + ค่าส่ง 50 บาท (ถ้าติ๊ก)
const totalPrice = computed(() => {
    const consultFee = isGoldCard.value ? 0 : 100; // 🚩 แก้เป็น 0 บาทตามสั่ง
    const deliveryFee = isDeliveryPrepaid.value ? 50 : 0;
    return consultFee + deliveryFee;
});

const cardInfo = ref({ name: '', number: '', expiry: '', cvv: '' });
const cardErrors = ref({ name: '', number: '', expiry: '', cvv: '' });
const cardTouched = ref({ name: false, number: false, expiry: false, cvv: false });
const paymentMethod = ref('card');
const qrCountdownSeconds = ref(60);
let qrTimer = null;

/* ================= 💳 Card validation / auto-format ================= */

// คำนวณค่ายอดเงินที่จะหักจริง (ใช้ในการ์ดพรีวิว)
const cardBrand = computed(() => {
    const num = cardInfo.value.number.replace(/\s+/g, '');
    if (/^4/.test(num)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(num)) return 'mastercard';
    if (/^3[47]/.test(num)) return 'amex';
    if (/^35/.test(num)) return 'jcb';
    return 'generic';
});

const cardBrandLabel = computed(() => ({
    visa: 'VISA',
    mastercard: 'MASTERCARD',
    amex: 'AMEX',
    jcb: 'JCB',
    generic: 'CARD',
}[cardBrand.value]));

const maskedCardNumber = computed(() => {
    const raw = cardInfo.value.number.replace(/\s+/g, '').padEnd(16, '•');
    return raw.slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
});

const formatCardNumber = (val) => {
    const digits = String(val || '').replace(/\D/g, '').slice(0, 19);
    return digits.replace(/(.{4})/g, '$1 ').trim();
};

const formatExpiry = (val) => {
    const digits = String(val || '').replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return digits.slice(0, 2) + '/' + digits.slice(2);
};

const onCardNumberInput = (e) => {
    cardInfo.value.number = formatCardNumber(e.target.value);
    validateField('number');
};

const onExpiryInput = (e) => {
    cardInfo.value.expiry = formatExpiry(e.target.value);
    validateField('expiry');
};

const onCvvInput = (e) => {
    cardInfo.value.cvv = String(e.target.value || '').replace(/\D/g, '').slice(0, 4);
    validateField('cvv');
};

const onNameInput = (e) => {
    // อนุญาตเฉพาะ A-Z a-z ช่องว่าง . - ' (ชื่อบนบัตร)
    cardInfo.value.name = String(e.target.value || '').replace(/[^A-Za-z\u0E00-\u0E7F .'\-]/g, '').toUpperCase().slice(0, 30);
    validateField('name');
};

// ตรวจสอบ Luhn
const luhnValid = (numStr) => {
    const digits = numStr.replace(/\D/g, '');
    if (digits.length < 12) return false;
    let sum = 0;
    let dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = parseInt(digits[i], 10);
        if (dbl) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
        dbl = !dbl;
    }
    return sum % 10 === 0;
};

const validateField = (field) => {
    const v = cardInfo.value;
    cardTouched.value[field] = true;
    if (field === 'name') {
        cardErrors.value.name = v.name.trim().length < 3
            ? 'กรุณากรอกชื่อบนบัตร (อย่างน้อย 3 ตัวอักษร)' : '';
    }
    if (field === 'number') {
        const digits = v.number.replace(/\s+/g, '');
        if (!digits) cardErrors.value.number = 'กรุณากรอกหมายเลขบัตร';
        else if (digits.length < 13) cardErrors.value.number = 'หมายเลขบัตรต้องมีอย่างน้อย 13 หลัก';
        else if (!luhnValid(digits)) cardErrors.value.number = 'หมายเลขบัตรไม่ถูกต้อง';
        else cardErrors.value.number = '';
    }
    if (field === 'expiry') {
        const m = v.expiry.match(/^(\d{2})\/(\d{2})$/);
        if (!m) {
            cardErrors.value.expiry = 'รูปแบบ MM/YY';
        } else {
            const mm = parseInt(m[1], 10);
            const yy = parseInt(m[2], 10);
            if (mm < 1 || mm > 12) cardErrors.value.expiry = 'เดือนต้องอยู่ระหว่าง 01-12';
            else {
                const now = new Date();
                const curYY = now.getFullYear() % 100;
                const curMM = now.getMonth() + 1;
                if (yy < curYY || (yy === curYY && mm < curMM)) {
                    cardErrors.value.expiry = 'บัตรหมดอายุแล้ว';
                } else cardErrors.value.expiry = '';
            }
        }
    }
    if (field === 'cvv') {
        const len = cardBrand.value === 'amex' ? 4 : 3;
        cardErrors.value.cvv = v.cvv.length !== len
            ? `CVV ต้องมี ${len} หลัก` : '';
    }
};

const isCardFormValid = computed(() => {
    const v = cardInfo.value;
    if (!v.name.trim() || !v.number.trim() || !v.expiry.trim() || !v.cvv.trim()) return false;
    if (cardErrors.value.name || cardErrors.value.number || cardErrors.value.expiry || cardErrors.value.cvv) return false;
    // re-check ทุก field
    const digits = v.number.replace(/\s+/g, '');
    if (digits.length < 13 || !luhnValid(digits)) return false;
    const m = v.expiry.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return false;
    const needCvv = cardBrand.value === 'amex' ? 4 : 3;
    if (v.cvv.length !== needCvv) return false;
    return v.name.trim().length >= 3;
});

const validateAllCardFields = () => {
    validateField('name');
    validateField('number');
    validateField('expiry');
    validateField('cvv');
};

const isQrExpired = computed(() => qrCountdownSeconds.value <= 0);
const qrCountdownText = computed(() => {
    const minutes = Math.floor(qrCountdownSeconds.value / 60).toString().padStart(2, '0');
    const seconds = (qrCountdownSeconds.value % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
});

const stopQrCountdown = () => {
    if (qrTimer) {
        clearInterval(qrTimer);
        qrTimer = null;
    }
};

const startQrCountdown = () => {
    stopQrCountdown();
    qrCountdownSeconds.value = 60;
    qrTimer = setInterval(() => {
        if (qrCountdownSeconds.value > 0) {
            qrCountdownSeconds.value -= 1;
            return;
        }
        stopQrCountdown();
    }, 1000);
};

const setPaymentMethod = (method) => {
    paymentMethod.value = method;
};

watch(paymentMethod, (method) => {
    if (method === 'qr') {
        startQrCountdown();
        return;
    }
    stopQrCountdown();
});

onBeforeUnmount(() => {
    stopQrCountdown();
});

/* ================= 2. ฟังก์ชันชำระเงิน ================= */

const isProcessing = ref(false);

const processPayment = () => {
    if (paymentMethod.value === 'qr' && isQrExpired.value) {
        return;
    }

    // 🚩 ถ้าจ่ายด้วยบัตร → บังคับกรอก + ผ่าน validation ทุกช่อง
    if (paymentMethod.value === 'card') {
        validateAllCardFields();
        if (!isCardFormValid.value) {
            alert('⚠️ กรุณากรอกข้อมูลบัตรเครดิตให้ครบถ้วนและถูกต้อง');
            return;
        }
    }

    // จำลองหน่วงเวลาการประมวลผลธนาคาร 1.2 วินาที
    isProcessing.value = true;
    setTimeout(() => {
        isProcessing.value = false;
        router.push({
            path: '/pharmacist/payment-success',
            query: {
                id: pharmacistId.value,
                method: consultMethod.value,
                privilege: privilege.value,
                type: consultType.value,
                pay_method: paymentMethod.value,
                delivery_prepaid: isDeliveryPrepaid.value,
                amount: totalPrice.value,
                // ส่ง 4 ตัวท้ายบัตรไปแสดงในหน้า success (จำลอง)
                ...(paymentMethod.value === 'card' ? {
                    card_last4: cardInfo.value.number.replace(/\s+/g, '').slice(-4),
                    card_brand: cardBrand.value,
                } : {}),
            },
        });
    }, 1200);
};
</script>

<template>
    <div class="payment-page">
        <Header />
        
        <div class="container-payment">
            <div class="payment-card" :class="{ 'gold-card-border': isGoldCard }">
                <button class="back-arrow" @click="router.back()">
                    <span class="icon">↩</span>
                </button>

                <h1 class="title">การชำระเงิน</h1>

                <!-- ส่วนแสดงสิทธิ์ -->
                <div v-if="isGoldCard" class="privilege-badge gold-text">
                    ✨ ใช้สิทธิ์บัตรทอง: ฟรีค่าปรึกษา (0.-)
                </div>

                <!-- 🚩 ส่วนเลือกค่าจัดส่งยาล่วงหน้า (แบบติ๊ก) -->
                <!-- <div class="delivery-tick-box" @click="isDeliveryPrepaid = !isDeliveryPrepaid">
                    <div class="checkbox-container">
                        <div class="custom-check" :class="{ 'is-checked': isDeliveryPrepaid }">
                            <span v-if="isDeliveryPrepaid">✓</span>
                        </div>
                        <span class="label-text">จ่ายค่าขนส่งยาล่วงหน้า</span>
                    </div>
                    <span class="fee-text">+ 50 บาท</span>
                </div> -->

                <div class="card-type-section">
                    <p class="section-label">ช่องทางชำระเงิน</p>
                    <div class="method-switch">
                        <button
                            class="method-btn"
                            :class="{ active: paymentMethod === 'card' }"
                            @click="setPaymentMethod('card')"
                        >
                            บัตรเครดิต/เดบิต
                        </button>
                        <button
                            class="method-btn"
                            :class="{ active: paymentMethod === 'qr' }"
                            @click="setPaymentMethod('qr')"
                        >
                            QR Payment
                        </button>
                    </div>
                </div>

                <div v-if="paymentMethod === 'card'" class="form-payment">
                    <!-- 💳 Card preview (จำลองหน้าบัตร) -->
                    <div class="card-preview" :class="`brand-${cardBrand}`">
                        <div class="card-top">
                            <span class="card-chip">▮▮▮</span>
                            <span class="card-brand-label">{{ cardBrandLabel }}</span>
                        </div>
                        <div class="card-number">{{ maskedCardNumber }}</div>
                        <div class="card-bottom">
                            <div>
                                <div class="card-mini-label">CARD HOLDER</div>
                                <div class="card-mini-value">{{ cardInfo.name || 'YOUR NAME' }}</div>
                            </div>
                            <div>
                                <div class="card-mini-label">EXPIRES</div>
                                <div class="card-mini-value">{{ cardInfo.expiry || 'MM/YY' }}</div>
                            </div>
                        </div>
                    </div>

                    <div class="input-block">
                        <label>ชื่อบนบัตร <span class="req">*</span></label>
                        <input
                            type="text"
                            :value="cardInfo.name"
                            @input="onNameInput"
                            @blur="validateField('name')"
                            placeholder="เช่น MR JOHN DOE"
                            class="custom-input"
                            :class="{ invalid: cardTouched.name && cardErrors.name }"
                            autocomplete="cc-name"
                        />
                        <small v-if="cardTouched.name && cardErrors.name" class="err-msg">
                            ⚠️ {{ cardErrors.name }}
                        </small>
                    </div>

                    <div class="input-block">
                        <label>หมายเลขบัตร <span class="req">*</span></label>
                        <input
                            type="text"
                            inputmode="numeric"
                            :value="cardInfo.number"
                            @input="onCardNumberInput"
                            @blur="validateField('number')"
                            placeholder="1234 5678 9012 3456"
                            class="custom-input card-number-input"
                            :class="{ invalid: cardTouched.number && cardErrors.number }"
                            autocomplete="cc-number"
                            maxlength="23"
                        />
                        <small v-if="cardTouched.number && cardErrors.number" class="err-msg">
                            ⚠️ {{ cardErrors.number }}
                        </small>
                        <small v-else-if="cardInfo.number" class="hint-msg">
                            🔒 ระบบจำลอง — ตัวเลขทดสอบ: 4242 4242 4242 4242 (Visa)
                        </small>
                    </div>

                    <div class="input-row">
                        <div class="input-block">
                            <label>วันหมดอายุ <span class="req">*</span></label>
                            <input
                                type="text"
                                inputmode="numeric"
                                :value="cardInfo.expiry"
                                @input="onExpiryInput"
                                @blur="validateField('expiry')"
                                placeholder="MM/YY"
                                class="custom-input"
                                :class="{ invalid: cardTouched.expiry && cardErrors.expiry }"
                                autocomplete="cc-exp"
                                maxlength="5"
                            />
                            <small v-if="cardTouched.expiry && cardErrors.expiry" class="err-msg">
                                ⚠️ {{ cardErrors.expiry }}
                            </small>
                        </div>
                        <div class="input-block">
                            <label>CVV <span class="req">*</span></label>
                            <input
                                type="password"
                                inputmode="numeric"
                                :value="cardInfo.cvv"
                                @input="onCvvInput"
                                @blur="validateField('cvv')"
                                :placeholder="cardBrand === 'amex' ? '4 หลัก' : '3 หลัก'"
                                class="custom-input"
                                :class="{ invalid: cardTouched.cvv && cardErrors.cvv }"
                                autocomplete="cc-csc"
                                :maxlength="cardBrand === 'amex' ? 4 : 3"
                            />
                            <small v-if="cardTouched.cvv && cardErrors.cvv" class="err-msg">
                                ⚠️ {{ cardErrors.cvv }}
                            </small>
                        </div>
                    </div>

                    <div class="secure-note">
                        🔒 ข้อมูลของคุณถูกเข้ารหัสด้วย SSL — ระบบนี้เป็นการ <b>จำลอง</b> ไม่มีการเรียกเก็บเงินจริง
                    </div>
                </div>
                <div v-else class="qr-payment-section">
                    <img :src="qrPaymentImage" alt="QR Payment" class="qr-payment-image" />
                    <p class="qr-countdown-label">กรุณาชำระเงินภายใน</p>
                    <p class="qr-countdown-time" :class="{ expired: isQrExpired }">{{ qrCountdownText }}</p>
                    <button v-if="isQrExpired" class="btn-refresh-qr" @click="startQrCountdown">
                        สร้าง QR ใหม่
                    </button>
                </div>

                <!-- ปุ่มจ่ายเงินแสดงราคาสรุป -->
                <button
                    class="btn-pay-submit"
                    :class="{ 'btn-gold': isGoldCard, 'is-processing': isProcessing }"
                    :disabled="
                        isProcessing ||
                        (paymentMethod === 'qr' && isQrExpired) ||
                        (paymentMethod === 'card' && totalPrice > 0 && !isCardFormValid)
                    "
                    @click="processPayment"
                >
                    <span v-if="isProcessing" class="processing-state">
                        <span class="spinner-pay"></span> กำลังประมวลผลการชำระเงิน...
                    </span>
                    <template v-else>
                        <span class="price-label">ยอดรวม {{ totalPrice }} บาท</span>
                        <span class="pay-label">
                            {{
                                totalPrice === 0
                                    ? 'ยืนยันสิทธิ์ฟรี'
                                    : paymentMethod === 'qr'
                                        ? 'ยืนยันการชำระด้วย QR'
                                        : 'ชำระเงินตอนนี้ 💳'
                            }}
                        </span>
                    </template>
                </button>
            </div>
        </div>

        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/payment.css";

/* 🚩 CSS เพิ่มเติมสำหรับตัวติ๊กค่าส่งยาล่วงหน้า */
.delivery-tick-box {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8fafc;
    padding: 12px 15px;
    border-radius: 10px;
    margin-bottom: 20px;
    cursor: pointer;
    border: 1px solid #e2e8f0;
    transition: 0.3s;
}

.delivery-tick-box:hover {
    background: #f1f5f9;
}

.checkbox-container {
    display: flex;
    align-items: center;
    gap: 10px;
}

.custom-check {
    width: 20px;
    height: 20px;
    border: 2px solid #cbd5e1;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    color: white;
    font-size: 14px;
}

.is-checked {
    background: #3b82f6;
    border-color: #3b82f6;
}

.gold-card-border .is-checked {
    background: #d4af37;
    border-color: #d4af37;
}

.label-text {
    font-size: 0.95rem;
    color: #475569;
}

.fee-text {
    font-weight: bold;
    color: #3b82f6;
}

.gold-text {
    color: #b8860b;
    font-weight: bold;
    margin-bottom: 10px;
}

.btn-gold {
    background: linear-gradient(135deg, #d4af37 0%, #b8860b 100%) !important;
}

.method-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
}

.method-btn {
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #334155;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s ease;
}

.method-btn.active {
    border-color: #0ea5e9;
    color: #0369a1;
    background: #e0f2fe;
}

.qr-payment-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
}

.qr-payment-image {
    width: 100%;
    max-width: 320px;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
}

.qr-countdown-label {
    margin: 0;
    color: #475569;
}

.qr-countdown-time {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    color: #0f766e;
}

.qr-countdown-time.expired {
    color: #dc2626;
}

.btn-refresh-qr {
    border: none;
    background: #0ea5e9;
    color: white;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
}

/* ============ 💳 Card preview (จำลองหน้าบัตร) ============ */
.card-preview {
    background: linear-gradient(135deg, #1e3a8a 0%, #0ea5e9 100%);
    color: #fff;
    border-radius: 14px;
    padding: 18px 20px;
    margin-bottom: 18px;
    box-shadow: 0 14px 30px rgba(15, 23, 42, 0.22);
    position: relative;
    overflow: hidden;
    font-family: 'Courier New', monospace;
    letter-spacing: 1px;
}
.card-preview::before {
    content: '';
    position: absolute;
    top: -40px; right: -40px;
    width: 140px; height: 140px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 50%;
}
.card-preview::after {
    content: '';
    position: absolute;
    bottom: -60px; left: -30px;
    width: 160px; height: 160px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 50%;
}
.card-preview.brand-visa       { background: linear-gradient(135deg, #1a1f71 0%, #0066b2 100%); }
.card-preview.brand-mastercard { background: linear-gradient(135deg, #d97706 0%, #b91c1c 100%); }
.card-preview.brand-amex       { background: linear-gradient(135deg, #047857 0%, #064e3b 100%); }
.card-preview.brand-jcb        { background: linear-gradient(135deg, #4338ca 0%, #7c3aed 100%); }

.card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    position: relative; z-index: 1;
}
.card-chip {
    background: linear-gradient(135deg, #fef3c7 0%, #f59e0b 100%);
    color: #78350f;
    font-weight: bold;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    letter-spacing: 1px;
}
.card-brand-label {
    font-weight: bold;
    font-size: 1.1rem;
    text-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.card-number {
    font-size: 1.4rem;
    font-weight: bold;
    margin-bottom: 22px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.2);
    position: relative; z-index: 1;
}

.card-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    position: relative; z-index: 1;
}
.card-mini-label {
    font-size: 0.65rem;
    opacity: 0.7;
    letter-spacing: 1.5px;
    margin-bottom: 4px;
}
.card-mini-value {
    font-size: 0.9rem;
    font-weight: bold;
    text-transform: uppercase;
}

/* ============ Input states ============ */
.req { color: #dc2626; }
.custom-input.invalid {
    border-color: #dc2626 !important;
    background: #fef2f2;
}
.err-msg {
    display: block;
    color: #dc2626;
    font-size: 0.78rem;
    margin-top: 4px;
}
.hint-msg {
    display: block;
    color: #64748b;
    font-size: 0.75rem;
    margin-top: 4px;
}

.secure-note {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #15803d;
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 0.82rem;
    margin-top: 8px;
    text-align: center;
}

/* ============ Pay button states ============ */
.btn-pay-submit:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none !important;
}

.processing-state {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    justify-content: center;
}
.spinner-pay {
    width: 18px;
    height: 18px;
    border: 3px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin-pay 0.7s linear infinite;
    display: inline-block;
}
@keyframes spin-pay {
    to { transform: rotate(360deg); }
}
</style>