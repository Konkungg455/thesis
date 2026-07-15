<script setup>
import { AUTH_ROLES } from '~/composables/useAuthConfig';
import {
    PHONE_MAX_LENGTH,
    blockInvalidPhoneKeys,
    clampPhoneInputValue,
    validatePhoneMessage,
} from '~/utils/phone';

import { stashRegistrationOtpFallback } from '~/utils/registrationOtp';

const { apiBase } = useApiBase();

const router = useRouter();
const role = AUTH_ROLES.store;
const isLoading = ref(false);
const errorMessage = ref('');
const step1 = ref(null);

const STEP1_KEY = 'store_register_step1';
const STEP2_KEY = 'store_register_step2';
const STEP2_SCHEDULE_KEY = 'store_register_step2_schedule';

const form = ref({
    store_name: '',
    house_no: '',
    road: '',
    sub_district: '',
    district: '',
    province: '',
    zipcode: '',
    store_phone: '',
    store_email: '',
    google_maps_url: '',
    bank_name: '',
    bank_account_name: '',
    bank_account_number: ''
});
const qrPaymentFile = ref(null);
const qrPaymentPreview = ref('');

// ค่าเริ่มต้น: จันทร์–ศุกร์ (5 วัน) — เพิ่มวัน/แก้เวลาได้
const DAY_ORDER = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const DEFAULT_WORKDAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
const makeDefaultRows = () =>
    DEFAULT_WORKDAYS.map((day) => ({ day, open: '08:00', close: '20:00' }));
const scheduleRows = ref(makeDefaultRows());

onMounted(() => {
    if (!import.meta.client) return;
    const raw = sessionStorage.getItem(STEP1_KEY);
    if (!raw) {
        router.replace('/auth/register-store');
        return;
    }
    try {
        step1.value = JSON.parse(raw);
    } catch {
        sessionStorage.removeItem(STEP1_KEY);
        router.replace('/auth/register-store');
        return;
    }
    // 💾 โหลด form ที่กรอกค้างไว้ (กรณีย้อนกลับมาแก้)
    const savedForm = sessionStorage.getItem(STEP2_KEY);
    if (savedForm) {
        try {
            const parsed = JSON.parse(savedForm);
            Object.keys(form.value).forEach((k) => {
                if (parsed[k] !== undefined && parsed[k] !== '') form.value[k] = parsed[k];
            });
        } catch { /* ignore */ }
    }
    const savedSchedule = sessionStorage.getItem(STEP2_SCHEDULE_KEY);
    if (savedSchedule) {
        try {
            const arr = JSON.parse(savedSchedule);
            if (Array.isArray(arr) && arr.length > 0) {
                scheduleRows.value = arr;
            }
        } catch { /* ignore */ }
    }
    preloadAddress();
});

// 💾 save form + ตารางเวลา ทุกครั้งที่กรอก
watch(form, (v) => {
    if (!import.meta.client) return;
    try { sessionStorage.setItem(STEP2_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}, { deep: true });
watch(scheduleRows, (v) => {
    if (!import.meta.client) return;
    try { sessionStorage.setItem(STEP2_SCHEDULE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}, { deep: true });

const goBack = () => {
    router.push('/auth/register-store');
};

const onQrPaymentChange = (e) => {
    const file = e.target.files?.[0];
    qrPaymentFile.value = file || null;
    qrPaymentPreview.value = file ? URL.createObjectURL(file) : '';
};

const addSchedule = () => {
    // ขึ้นวันถัดไปต่อจากแถวล่าสุด และใช้เวลาเดียวกับแถวล่าสุด
    const last = scheduleRows.value[scheduleRows.value.length - 1]
        || { day: DAY_ORDER[0], open: '08:00', close: '20:00' };
    const idx = DAY_ORDER.indexOf(last.day);
    const nextDay = DAY_ORDER[(idx + 1) % DAY_ORDER.length];
    scheduleRows.value.push({ day: nextDay, open: last.open || '08:00', close: last.close || '20:00' });
};
const removeSchedule = (i) => {
    if (scheduleRows.value.length > 1) scheduleRows.value.splice(i, 1);
};

/* ---- ระบบกรอกที่อยู่อัตโนมัติ ---- */
const { search: searchAddress, preload: preloadAddress } = useThaiAddress();
const addrSuggestions = ref([]);
const showAddrSuggest = ref(false);
const addrSearching = ref(false);
const activeAddrField = ref('');
let addrTimer = null;

const getAddrQuery = (field) => {
    if (field === 'zipcode') return form.value.zipcode;
    if (field === 'district') return form.value.district;
    return form.value.sub_district;
};

const onAddrInput = (field) => {
    activeAddrField.value = field;
    const q = getAddrQuery(field);
    clearTimeout(addrTimer);
    if (!q || String(q).trim().length < 2) {
        addrSuggestions.value = [];
        showAddrSuggest.value = false;
        addrSearching.value = false;
        return;
    }
    addrTimer = setTimeout(async () => {
        addrSearching.value = true;
        showAddrSuggest.value = true;
        try {
            addrSuggestions.value = await searchAddress(q, 8);
        } finally {
            addrSearching.value = false;
        }
    }, 250);
};

const pickAddress = (item) => {
    form.value.sub_district = item.subDistrict;
    form.value.district = item.district;
    form.value.province = item.province;
    form.value.zipcode = item.zipcode;
    showAddrSuggest.value = false;
    addrSuggestions.value = [];
};

const hideAddrSuggestSoon = () => {
    setTimeout(() => { showAddrSuggest.value = false; }, 150);
};

const onStorePhoneInput = () => {
    form.value.store_phone = clampPhoneInputValue(form.value.store_phone);
};

/* ---- validate client-side ก่อนส่ง OTP ---- */
const validate = () => {
    const f = form.value;
    if (!f.store_name?.trim()) return 'กรุณากรอกชื่อร้าน';
    if (!f.house_no?.trim()) return 'กรุณากรอกบ้านเลขที่';
    if (!f.sub_district?.trim()) return 'กรุณากรอกตำบล';
    if (!f.district?.trim()) return 'กรุณากรอกอำเภอ';
    if (!f.province?.trim()) return 'กรุณากรอกจังหวัด';
    if (!f.zipcode?.trim()) return 'กรุณากรอกรหัสไปรษณีย์';
    if (!/^[0-9]{5}$/.test(f.zipcode.trim())) return 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
    const storePhoneErr = validatePhoneMessage(f.store_phone);
    if (storePhoneErr) return storePhoneErr.replace('เบอร์โทร', 'เบอร์ร้าน');
    if (!f.store_email?.trim()) return 'กรุณากรอกอีเมลร้าน';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.store_email.trim())) return 'รูปแบบอีเมลร้านไม่ถูกต้อง';

    // ตารางเปิด-ปิดต้องครบทุกแถวที่ผู้ใช้เพิ่มไว้
    const validRows = scheduleRows.value.filter(r => r.day || r.open || r.close);
    if (validRows.length === 0) return 'กรุณาเพิ่มเวลาเปิด-ปิดอย่างน้อย 1 รายการ';
    for (const r of validRows) {
        if (!r.day) return 'กรุณาเลือกวันให้ครบทุกแถวของตารางเวลา';
        if (!r.open || !r.close) return `กรุณากรอกเวลาเปิด-ปิดของวัน${r.day}ให้ครบ`;
        if (r.open >= r.close) return `เวลาปิดของวัน${r.day}ต้องมากกว่าเวลาเปิด`;
    }
    return '';
};

const submit = async () => {
    if (!step1.value) return;
    errorMessage.value = '';
    const err = validate();
    if (err) {
        errorMessage.value = err;
        return;
    }
    isLoading.value = true;
    try {
        const body = new FormData();
        Object.entries(form.value).forEach(([k, v]) => body.append(k, v));
        if (qrPaymentFile.value) {
            body.append('qr_payment_file', qrPaymentFile.value);
        }
        scheduleRows.value.forEach((row) => {
            if (row.day) {
                body.append('work_day[]', row.day);
                body.append('open_time[]', row.open);
                body.append('close_time[]', row.close);
            }
        });
        body.append('reg_username', step1.value.username);
        body.append('reg_password_plain', step1.value.password || '');
        body.append('reg_firstname', step1.value.firstname);
        body.append('reg_lastname', step1.value.lastname);
        body.append('reg_personal_phone', step1.value.personal_phone);
        body.append('reg_personal_email', step1.value.personal_email);
        body.append('reg_license_file', step1.value.license_file || '');

        const data = await $fetch(`${apiBase.value}/process-register-step2.php`, {
            method: 'POST',
            body,
            credentials: 'include'
        });
        if (data.status === 'success') {
            const email = step1.value.personal_email;
            stashRegistrationOtpFallback('store', email, data);
            // 💾 เก็บ draft ไว้จนกว่า OTP จะยืนยันสำเร็จ — ผู้ใช้กลับมาแก้ได้
            await router.push(data.redirect || `/auth/verify-otp?type=store&email=${encodeURIComponent(email)}`);
        } else {
            errorMessage.value = data.message || 'ส่ง OTP ไม่สำเร็จ';
        }
    } catch {
        errorMessage.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
    <div class="auth-page">
        <button type="button" class="auth-back" @click="goBack">
            <i class="fa-solid fa-arrow-left"></i> กลับไปแก้ข้อมูลส่วนตัว
        </button>
        <div class="auth-card auth-form-wide">
            <div class="auth-header">
                <h1>ข้อมูลร้านยา</h1>
                <p>ขั้นตอนที่ 2</p>
            </div>
            <div v-if="errorMessage" class="auth-error">{{ errorMessage }}</div>
            <form v-if="step1" class="auth-form-grid" @submit.prevent="submit">
                <div class="auth-field full">
                    <label>ชื่อร้าน <span class="req">*</span></label>
                    <input v-model="form.store_name" type="text" required />
                </div>
                <div class="auth-field">
                    <label>บ้านเลขที่ <span class="req">*</span></label>
                    <input v-model="form.house_no" type="text" required />
                </div>
                <div class="auth-field">
                    <label>ถนน</label>
                    <input v-model="form.road" type="text" placeholder="เช่น พหลโยธิน หรือ ไม่มี" />
                </div>
                <div class="auth-field full addr-hint">
                    <small>
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        พิมพ์ <strong>ตำบล</strong> · <strong>อำเภอ</strong> หรือ <strong>รหัสไปรษณีย์</strong>
                        อย่างน้อย 2 ตัวอักษร — เลือกจากรายการแล้วระบบจะกรอกอำเภอ จังหวัด และรหัสไปรษณีย์ให้อัตโนมัติ
                    </small>
                </div>
                <div class="auth-field addr-field">
                    <label>ตำบล <span class="req">*</span></label>
                    <input v-model="form.sub_district" type="text"
                           autocomplete="off"
                           placeholder="พิมพ์ชื่อตำบล เช่น อินทประมูล"
                           @input="onAddrInput('sub_district')"
                           @focus="onAddrInput('sub_district')"
                           @blur="hideAddrSuggestSoon"
                           required />
                    <ul v-if="showAddrSuggest && activeAddrField === 'sub_district'"
                        class="addr-suggest">
                        <li v-if="addrSearching" class="addr-suggest-status">กำลังค้นหา...</li>
                        <li v-else-if="!addrSuggestions.length" class="addr-suggest-status">ไม่พบที่อยู่ที่ตรงกัน</li>
                        <li v-for="(s, idx) in addrSuggestions" v-else :key="idx"
                            @mousedown.prevent="pickAddress(s)">
                            <i class="fa-solid fa-location-dot"></i> {{ s.label }}
                        </li>
                    </ul>
                </div>
                <div class="auth-field addr-field">
                    <label>อำเภอ <span class="req">*</span></label>
                    <input v-model="form.district" type="text"
                           autocomplete="off"
                           placeholder="พิมพ์ชื่ออำเภอ"
                           @input="onAddrInput('district')"
                           @focus="onAddrInput('district')"
                           @blur="hideAddrSuggestSoon"
                           required />
                    <ul v-if="showAddrSuggest && activeAddrField === 'district'"
                        class="addr-suggest">
                        <li v-if="addrSearching" class="addr-suggest-status">กำลังค้นหา...</li>
                        <li v-else-if="!addrSuggestions.length" class="addr-suggest-status">ไม่พบที่อยู่ที่ตรงกัน</li>
                        <li v-for="(s, idx) in addrSuggestions" v-else :key="idx"
                            @mousedown.prevent="pickAddress(s)">
                            <i class="fa-solid fa-location-dot"></i> {{ s.label }}
                        </li>
                    </ul>
                </div>
                <div class="auth-field">
                    <label>จังหวัด <span class="req">*</span></label>
                    <input v-model="form.province" type="text" placeholder="เช่น อ่างทอง" required />
                </div>
                <div class="auth-field addr-field">
                    <label>รหัสไปรษณีย์ <span class="req">*</span></label>
                    <input v-model="form.zipcode" type="text"
                           inputmode="numeric"
                           autocomplete="off"
                           pattern="\d{5}"
                           maxlength="5"
                           placeholder="14120"
                           @input="onAddrInput('zipcode')"
                           @focus="onAddrInput('zipcode')"
                           @blur="hideAddrSuggestSoon"
                           required />
                    <ul v-if="showAddrSuggest && activeAddrField === 'zipcode'"
                        class="addr-suggest">
                        <li v-if="addrSearching" class="addr-suggest-status">กำลังค้นหา...</li>
                        <li v-else-if="!addrSuggestions.length" class="addr-suggest-status">ไม่พบที่อยู่ที่ตรงกัน</li>
                        <li v-for="(s, idx) in addrSuggestions" v-else :key="idx"
                            @mousedown.prevent="pickAddress(s)">
                            <i class="fa-solid fa-location-dot"></i> {{ s.label }}
                        </li>
                    </ul>
                </div>
                <div class="auth-field full">
                    <label>เบอร์ร้าน <span class="req">*</span></label>
                    <input
                        v-model="form.store_phone"
                        type="text"
                        inputmode="numeric"
                        :maxlength="PHONE_MAX_LENGTH"
                        required
                        @input="onStorePhoneInput"
                        @keydown="blockInvalidPhoneKeys"
                    />
                </div>
                <div class="auth-field full">
                    <label>อีเมลร้าน <span class="req">*</span></label>
                    <input v-model="form.store_email" type="email" required />
                </div>
                <div class="auth-field full">
                    <label>
                        ลิงก์ Google Maps ของร้าน
                        <small style="color:#94a3b8;">(สำหรับฟีเจอร์ค้นหาร้านยาใกล้ฉัน — ไม่บังคับ)</small>
                    </label>
                    <input
                        v-model="form.google_maps_url"
                        type="url"
                        placeholder="https://maps.app.goo.gl/..."
                    />
                    <small style="display:block;color:#64748b;margin-top:6px;font-size:12px;line-height:1.5;">
                        <i class="fa-solid fa-circle-info"></i>
                        เปิด Google Maps → ค้นหาร้านของคุณ → กดปุ่ม "แชร์" → "คัดลอกลิงก์" → วางที่ช่องนี้
                        <br>
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        ระบบจะหาพิกัดให้อัตโนมัติ
                    </small>
                </div>

                <div class="auth-field full payment-section">
                    <label>
                        ช่องทางชำระเงิน
                        <small style="color:#94a3b8;">(ไม่บังคับ — ใช้แนบไปกับอีเมลใบสรุปรายการยา)</small>
                    </label>
                    <input v-model="form.bank_name" type="text" placeholder="ธนาคาร เช่น กสิกรไทย / ไทยพาณิชย์" />
                    <input v-model="form.bank_account_name" type="text" placeholder="ชื่อบัญชี" />
                    <input v-model="form.bank_account_number" type="text" inputmode="numeric" placeholder="เลขบัญชี" />
                    <div v-if="qrPaymentPreview" class="qr-payment-box">
                        <img :src="qrPaymentPreview" alt="QR Payment" class="qr-payment-img" />
                    </div>
                    <input type="file" accept="image/*" @change="onQrPaymentChange" />
                    <small style="display:block;color:#64748b;margin-top:6px;font-size:12px;line-height:1.5;">
                        <i class="fa-solid fa-circle-info"></i>
                        ถ้าอัปโหลด QR Payment ระบบจะแนบรูปนี้ไปกับอีเมลใบสรุปรายการยาให้ผู้ใช้งาน
                    </small>
                </div>

                <div class="auth-field full">
                    <label>เวลาเปิด-ปิด <span class="req">*</span></label>
                    <div v-for="(row, i) in scheduleRows" :key="i" class="auth-work-row">
                        <select v-model="row.day" required>
                            <option value="" disabled>วัน</option>
                            <option value="จันทร์">จันทร์</option>
                            <option value="อังคาร">อังคาร</option>
                            <option value="พุธ">พุธ</option>
                            <option value="พฤหัสบดี">พฤหัสบดี</option>
                            <option value="ศุกร์">ศุกร์</option>
                            <option value="เสาร์">เสาร์</option>
                            <option value="อาทิตย์">อาทิตย์</option>
                        </select>
                        <input v-model="row.open" type="time" required />
                        <span>ถึง</span>
                        <input v-model="row.close" type="time" required />
                        <button v-if="i === scheduleRows.length - 1" type="button" class="auth-btn-small auth-btn-add" @click="addSchedule">+</button>
                        <button v-else type="button" class="auth-btn-small auth-btn-remove" @click="removeSchedule(i)">×</button>
                    </div>
                </div>
                <div class="full">
                    <button type="submit" class="auth-submit" :disabled="isLoading">
                        {{ isLoading ? 'กำลังส่ง OTP...' : 'สมัครสมาชิก & ส่ง OTP' }}
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/auth-login.css";

.auth-card.auth-form-wide { overflow: visible; }

/* ===== Autocomplete ที่อยู่ ===== */
.addr-hint small {
    display: block;
    color: #64748b;
    font-size: 12px;
    line-height: 1.55;
    padding: 8px 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
}
.addr-hint i { color: #6366f1; margin-right: 4px; }
.addr-field { position: relative; z-index: 1; }
.addr-field:focus-within { z-index: 20; }
.addr-suggest {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 30;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
    max-height: 260px;
    overflow-y: auto;
}
.addr-suggest li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border-radius: 8px;
    font-size: 0.88rem;
    color: #1e293b;
    cursor: pointer;
    transition: background 0.12s;
}
.addr-suggest li:hover { background: #eef2ff; }
.addr-suggest li i { color: #6366f1; font-size: 0.8rem; flex-shrink: 0; }
.addr-suggest-status {
    color: #64748b;
    font-size: 0.85rem;
    cursor: default;
    pointer-events: none;
}
.addr-suggest-status:hover { background: transparent; }

/* reset <button> ให้ใช้ style เดียวกับ NuxtLink ที่มี class .auth-back */
button.auth-back {
    background: transparent;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
}

.payment-section {
    display: grid;
    gap: 10px;
}
.qr-payment-box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    padding: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
}
.qr-payment-img {
    width: 180px;
    max-width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: contain;
    border-radius: 8px;
    background: #fff;
}
</style>
