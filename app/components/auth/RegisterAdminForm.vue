<script setup>
import { AUTH_ROLES } from '~/composables/useAuthConfig';
import { blockInvalidAgeKeys, clampAgeInputValue, validateAgeMessage } from '~/utils/age';

import { stashRegistrationOtpFallback } from '~/utils/registrationOtp';

const { apiBase } = useApiBase();

const router = useRouter();
const role = AUTH_ROLES.admin;
const isLoading = ref(false);
const errorMessage = ref('');

const form = ref({
    username_account: '',
    firstname: '',
    lastname: '',
    gender: '',
    old: '',
    password_account1: '',
    password_account2: '',
    phone_number: '',
    email_account: ''
});

const onAgeInput = () => {
    form.value.old = clampAgeInputValue(form.value.old);
};

const submit = async () => {
    errorMessage.value = '';
    const ageErr = validateAgeMessage(form.value.old);
    if (ageErr) {
        errorMessage.value = ageErr;
        return;
    }
    isLoading.value = true;
    try {
        const data = await $fetch(`${apiBase.value}/vue-register-admin.php`, {
            method: 'POST',
            body: form.value,
            credentials: 'include'
        });
        if (data.status === 'success') {
            stashRegistrationOtpFallback('admin', form.value.email_account, data);
            await router.push(data.redirect || `/auth/verify-otp?type=admin&email=${encodeURIComponent(form.value.email_account)}`);
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
                <h1>สมัครสมาชิก</h1>
                <p>ผู้ดูแลระบบ</p>
            </div>
            <div v-if="errorMessage" class="auth-error">{{ errorMessage }}</div>
            <form class="auth-form-grid" @submit.prevent="submit">
                <div class="auth-field full">
                    <label>Username <span class="req">*</span></label>
                    <input v-model="form.username_account" type="text" required />
                </div>
                <div class="auth-field">
                    <label>ชื่อ <span class="req">*</span></label>
                    <input v-model="form.firstname" type="text" required />
                </div>
                <div class="auth-field">
                    <label>นามสกุล <span class="req">*</span></label>
                    <input v-model="form.lastname" type="text" required />
                </div>
                <div class="auth-field">
                    <label>เพศ <span class="req">*</span></label>
                    <select v-model="form.gender" required>
                        <option value="" disabled>เลือกเพศ</option>
                        <option value="M">ชาย</option>
                        <option value="F">หญิง</option>
                    </select>
                </div>
                <div class="auth-field">
                    <label>อายุ <span class="req">*</span></label>
                    <input
                        v-model="form.old"
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
                    <input v-model="form.password_account1" type="password" minlength="8" required />
                </div>
                <div class="auth-field full">
                    <label>ยืนยันรหัสผ่าน <span class="req">*</span></label>
                    <input v-model="form.password_account2" type="password" minlength="8" required />
                </div>
                <div class="auth-field full">
                    <label>เบอร์โทร <span class="req">*</span></label>
                    <input v-model="form.phone_number" type="text" maxlength="10" required />
                </div>
                <div class="auth-field full">
                    <label>อีเมล <span class="req">*</span></label>
                    <input v-model="form.email_account" type="email" required />
                </div>
                <div class="full">
                    <button type="submit" class="auth-submit" :disabled="isLoading">
                        {{ isLoading ? 'กำลังส่ง OTP...' : 'สมัครสมาชิก' }}
                    </button>
                </div>
            </form>
            <div class="auth-footer">มีบัญชีแล้ว? <NuxtLink :to="role.loginPath">เข้าสู่ระบบ</NuxtLink></div>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/auth-login.css";
</style>
