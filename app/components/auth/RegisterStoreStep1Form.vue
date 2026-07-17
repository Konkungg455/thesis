<script setup>
import { AUTH_ROLES } from '~/composables/useAuthConfig';
import {
    PHONE_MAX_LENGTH,
    blockInvalidPhoneKeys,
    clampPhoneInputValue,
    validatePhoneMessage,
} from '~/utils/phone';

const { apiBase } = useApiBase();

const router = useRouter();
const role = AUTH_ROLES.store;
const isLoading = ref(false);
const errorMessage = ref('');
const licenseFile = ref(null);
const licenseLabel = ref('เลือกไฟล์ใบอนุญาตร้านยา');

const STEP1_KEY = 'store_register_step1';
const STEP1_DRAFT_KEY = 'store_register_step1_draft';

const form = ref({
    username: '',
    firstname: '',
    lastname: '',
    password: '',
    confirm_password: '',
    personal_phone: '',
    personal_email: ''
});

/* ---- โหลด draft ที่กรอกค้างไว้ (กรณีย้อนกลับมาแก้) ---- */
onMounted(() => {
    if (!import.meta.client) return;
    try {
        // ลำดับโหลด: ถ้ามี step1 ที่อัปโหลดไฟล์แล้ว → ใช้ข้อมูลนั้น, ไม่งั้นใช้ draft
        const raw = sessionStorage.getItem(STEP1_KEY) || sessionStorage.getItem(STEP1_DRAFT_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            Object.keys(form.value).forEach((k) => {
                if (saved[k] !== undefined) form.value[k] = saved[k];
            });
            if (saved.license_label) licenseLabel.value = saved.license_label;
        }
    } catch { /* ignore */ }
});

/* ---- บันทึก draft ลง sessionStorage ทุกครั้งที่กรอก ---- */
watch(form, (v) => {
    if (!import.meta.client) return;
    try {
        sessionStorage.setItem(STEP1_DRAFT_KEY, JSON.stringify(v));
    } catch { /* ignore */ }
}, { deep: true });

const onFileChange = (e) => {
    const f = e.target.files?.[0];
    licenseFile.value = f || null;
    licenseLabel.value = f ? f.name : 'เลือกไฟล์ใบอนุญาตร้านยา';
};

/* ---- validate client-side ก่อนข้ามไป step 2 ---- */
const validate = () => {
    const f = form.value;
    if (!f.username?.trim()) return 'กรุณากรอก Username';
    if (!f.firstname?.trim()) return 'กรุณากรอกชื่อ';
    if (!f.lastname?.trim()) return 'กรุณากรอกนามสกุล';
    if (!f.password) return 'กรุณากรอกรหัสผ่าน';
    if (f.password.length < 8) return 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร';
    if (!f.confirm_password) return 'กรุณายืนยันรหัสผ่าน';
    if (f.password !== f.confirm_password) return 'รหัสผ่านไม่ตรงกัน';
    const phoneErr = validatePhoneMessage(f.personal_phone);
    if (phoneErr) return phoneErr;
    if (!f.personal_email?.trim()) return 'กรุณากรอกอีเมล';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.personal_email.trim())) return 'รูปแบบอีเมลไม่ถูกต้อง';
    if (!licenseFile.value) return 'กรุณาอัปโหลดไฟล์ใบอนุญาตร้านยา';
    return '';
};

const onPhoneInput = () => {
    form.value.personal_phone = clampPhoneInputValue(form.value.personal_phone);
};

const submit = async () => {
    errorMessage.value = '';
    const err = validate();
    if (err) {
        errorMessage.value = err;
        return;
    }
    isLoading.value = true;
    try {
        // ⚡ ถ้าเคยอัปโหลดไฟล์แล้ว (มี license_file ใน sessionStorage) ไม่ต้องส่งไปอัพใหม่
        const existingRaw = sessionStorage.getItem(STEP1_KEY);
        let existingLicense = '';
        if (existingRaw) {
            try { existingLicense = JSON.parse(existingRaw)?.license_file || ''; } catch { /* ignore */ }
        }

        let licenseFilename = existingLicense;
        // ส่งไป backend เฉพาะกรณีเลือกไฟล์ใหม่ หรือยังไม่เคยอัพไฟล์มาก่อน
        if (licenseFile.value || !existingLicense) {
            const body = new FormData();
            Object.entries(form.value).forEach(([k, v]) => body.append(k, v));
            if (licenseFile.value) body.append('license_file', licenseFile.value);

            const data = await $fetch(`${apiBase.value}/process-register-step1.php`, {
                method: 'POST',
                body,
                credentials: 'include'
            });
            if (data.status !== 'success') {
                errorMessage.value = data.message || 'บันทึกไม่สำเร็จ';
                return;
            }
            licenseFilename = data.license_file || existingLicense;
        }

        if (import.meta.client) {
            sessionStorage.setItem(STEP1_KEY, JSON.stringify({
                ...form.value,
                license_file: licenseFilename,
                license_label: licenseLabel.value
            }));
        }
        await router.push('/auth/register-store-shop');
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
                <h1>สมัครเจ้าของร้าน</h1>
                <p>ขั้นตอนที่ 1 — ข้อมูลส่วนตัว</p>
            </div>
            <div v-if="errorMessage" class="auth-error">{{ errorMessage }}</div>
            <form class="auth-form-grid" @submit.prevent="submit">
                <div class="auth-field full">
                    <label>Username <span class="req">*</span></label>
                    <input v-model="form.username" type="text" required />
                </div>
                <div class="auth-field">
                    <label>ชื่อ <span class="req">*</span></label>
                    <input v-model="form.firstname" type="text" required />
                </div>
                <div class="auth-field">
                    <label>นามสกุล <span class="req">*</span></label>
                    <input v-model="form.lastname" type="text" required />
                </div>
                <div class="auth-field full">
                    <label>รหัสผ่าน <span class="req">*</span></label>
                    <input v-model="form.password" type="password" minlength="8" required />
                </div>
                <div class="auth-field full">
                    <label>ยืนยันรหัสผ่าน <span class="req">*</span></label>
                    <input v-model="form.confirm_password" type="password" minlength="8" required />
                </div>
                <div class="auth-field full">
                    <label>เบอร์โทร <span class="req">*</span></label>
                    <input
                        v-model="form.personal_phone"
                        type="text"
                        inputmode="numeric"
                        :maxlength="PHONE_MAX_LENGTH"
                        required
                        @input="onPhoneInput"
                        @keydown="blockInvalidPhoneKeys"
                    />
                </div>
                <div class="auth-field full">
                    <label>อีเมล <span class="req">*</span></label>
                    <input v-model="form.personal_email" type="email" required />
                </div>
                <div class="auth-field full">
                    <label>ใบอนุญาตร้านยา <span class="req">*</span></label>
                    <label class="auth-upload-box">
                        <i class="fa-solid fa-cloud-arrow-up"></i> {{ licenseLabel }}
                        <input type="file" accept="image/*,.pdf" @change="onFileChange" />
                    </label>
                </div>
                <div class="full">
                    <button type="submit" class="auth-submit" :disabled="isLoading">
                        {{ isLoading ? 'กำลังบันทึก...' : 'ถัดไป' }}
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/auth-login.css";
</style>
