<script setup>
import { AUTH_ROLES } from '~/composables/useAuthConfig';
import { blockInvalidAgeKeys, clampAgeInputValue, validateAgeMessage } from '~/utils/age';

import { stashRegistrationOtpFallback } from '~/utils/registrationOtp';

const { apiBase } = useApiBase();

const router = useRouter();
const role = AUTH_ROLES.pharmacist;
const isLoading = ref(false);
const errorMessage = ref('');
const licenseFile = ref(null);
const licenseLabel = ref('เลือกไฟล์ใบวิชาชีพ');

const form = ref({
    username_pharma: '',
    firstname_pharma: '',
    lastname_pharma: '',
    gender_pharma: '',
    age_pharma: '',
    pass1: '',
    pass2: '',
    phone: '',
    email: '',
    id_store: ''
});

// ค่าเริ่มต้น: จันทร์–ศุกร์ (5 วัน) — เพิ่มวัน/แก้เวลาได้
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_WORKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const makeDefaultRows = () =>
    DEFAULT_WORKDAYS.map((day) => ({ day, start: '08:00', end: '17:00' }));
const workRows = ref(makeDefaultRows());

const stores = ref([]);
const loadStores = async () => {
    try {
        const data = await $fetch(`${apiBase.value}/get-stores.php`, { credentials: 'include' });
        if (data?.status === 'success' && Array.isArray(data.stores)) {
            stores.value = data.stores;
        }
    } catch (e) {
        console.error('โหลดรายชื่อร้านไม่สำเร็จ:', e);
    }
};
onMounted(loadStores);

const addWorkRow = () => {
    // ขึ้นวันถัดไปต่อจากแถวล่าสุด และใช้เวลาเดียวกับแถวล่าสุด
    const last = workRows.value[workRows.value.length - 1]
        || { day: DAY_ORDER[0], start: '08:00', end: '17:00' };
    const idx = DAY_ORDER.indexOf(last.day);
    const nextDay = DAY_ORDER[(idx + 1) % DAY_ORDER.length];
    workRows.value.push({ day: nextDay, start: last.start || '08:00', end: last.end || '17:00' });
};
const removeWorkRow = (i) => {
    if (workRows.value.length > 1) workRows.value.splice(i, 1);
};

const onFileChange = (e) => {
    const f = e.target.files?.[0];
    licenseFile.value = f || null;
    licenseLabel.value = f ? f.name : 'เลือกไฟล์ใบวิชาชีพ';
};

const onAgeInput = () => {
    form.value.age_pharma = clampAgeInputValue(form.value.age_pharma);
};

const submit = async () => {
    errorMessage.value = '';
    const ageErr = validateAgeMessage(form.value.age_pharma);
    if (ageErr) {
        errorMessage.value = ageErr;
        return;
    }
    if (!licenseFile.value) {
        errorMessage.value = 'กรุณาแนบใบประกอบวิชาชีพ';
        return;
    }
    isLoading.value = true;
    try {
        const body = new FormData();
        Object.entries(form.value).forEach(([k, v]) => body.append(k, v));
        workRows.value.forEach((row) => {
            if (row.day) {
                body.append('work_day[]', row.day);
                body.append('work_start[]', row.start);
                body.append('work_end[]', row.end);
            }
        });
        body.append('license_image', licenseFile.value);

        const data = await $fetch(`${apiBase.value}/vue-register-pharmacist.php`, {
            method: 'POST',
            body,
            credentials: 'include'
        });
        if (data.status === 'success') {
            stashRegistrationOtpFallback('pharmacist', form.value.email, data);
            await router.push(data.redirect || `/auth/verify-otp?type=pharmacist&email=${encodeURIComponent(form.value.email)}`);
        } else {
            errorMessage.value = data.message || 'สมัครไม่สำเร็จ';
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
        <NuxtLink :to="role.loginPath" class="auth-back"><i class="fa-solid fa-arrow-left"></i> กลับ</NuxtLink>
        <div class="auth-card auth-form-wide">
            <div class="auth-header">
                <h1>สมัครเภสัชกร</h1>
                <p>TELEBOT-PHARMACY</p>
            </div>
            <div v-if="errorMessage" class="auth-error">{{ errorMessage }}</div>
            <form class="auth-form-grid" @submit.prevent="submit">
                <div class="auth-field full">
                    <label>Username <span class="req">*</span></label>
                    <input v-model="form.username_pharma" type="text" required />
                </div>
                <div class="auth-field">
                    <label>ชื่อ <span class="req">*</span></label>
                    <input v-model="form.firstname_pharma" type="text" required />
                </div>
                <div class="auth-field">
                    <label>นามสกุล <span class="req">*</span></label>
                    <input v-model="form.lastname_pharma" type="text" required />
                </div>
                <div class="auth-field">
                    <label>เพศ <span class="req">*</span></label>
                    <select v-model="form.gender_pharma" required>
                        <option value="" disabled>เลือก</option>
                        <option value="M">ชาย</option>
                        <option value="F">หญิง</option>
                    </select>
                </div>
                <div class="auth-field">
                    <label>อายุ <span class="req">*</span></label>
                    <input
                        v-model="form.age_pharma"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        inputmode="numeric"
                        required
                        @input="onAgeInput"
                        @keydown="blockInvalidAgeKeys"
                    />
                </div>
                <div class="auth-field full">
                    <label>รหัสผ่าน <span class="req">*</span></label>
                    <input v-model="form.pass1" type="password" minlength="8" required />
                </div>
                <div class="auth-field full">
                    <label>ยืนยันรหัสผ่าน <span class="req">*</span></label>
                    <input v-model="form.pass2" type="password" minlength="8" required />
                </div>
                <div class="auth-field full">
                    <label>เบอร์โทร <span class="req">*</span></label>
                    <input v-model="form.phone" type="text" maxlength="10" required />
                </div>
                <div class="auth-field full">
                    <label>อีเมล <span class="req">*</span></label>
                    <input v-model="form.email" type="email" required />
                </div>
                <div class="auth-field full">
                    <label>เวลาทำงาน <span class="req">*</span></label>
                    <div v-for="(row, i) in workRows" :key="i" class="auth-work-row">
                        <select v-model="row.day" :required="i === 0 || !!row.start || !!row.end">
                            <option value="">วัน</option>
                            <option value="Monday">จันทร์</option>
                            <option value="Tuesday">อังคาร</option>
                            <option value="Wednesday">พุธ</option>
                            <option value="Thursday">พฤหัสบดี</option>
                            <option value="Friday">ศุกร์</option>
                            <option value="Saturday">เสาร์</option>
                            <option value="Sunday">อาทิตย์</option>
                        </select>
                        <input v-model="row.start" type="time" :required="i === 0 || !!row.day || !!row.end" />
                        <span>ถึง</span>
                        <input v-model="row.end" type="time" :required="i === 0 || !!row.day || !!row.start" />
                        <button v-if="i === workRows.length - 1" type="button" class="auth-btn-small auth-btn-add" @click="addWorkRow">+</button>
                        <button v-else type="button" class="auth-btn-small auth-btn-remove" @click="removeWorkRow(i)">×</button>
                    </div>
                </div>
                <div class="auth-field full">
                    <label>ร้านยาที่ทำงานอยู่</label>
                    <select v-model="form.id_store">
                        <option value="">ไม่มี</option>
                        <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.store_name }}</option>
                    </select>
                </div>
                <div class="auth-field full">
                    <label>ใบประกอบวิชาชีพ <span class="req">*</span></label>
                    <label class="auth-upload-box">
                        <i class="fa-solid fa-cloud-arrow-up"></i> {{ licenseLabel }}
                        <input type="file" accept="image/*" @change="onFileChange" />
                    </label>
                </div>
                <div class="full">
                    <button type="submit" class="auth-submit" :disabled="isLoading">สมัครสมาชิก</button>
                </div>
            </form>
            <div class="auth-footer">มีบัญชีแล้ว? <NuxtLink :to="role.loginPath">เข้าสู่ระบบ</NuxtLink></div>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/auth-login.css";
</style>
