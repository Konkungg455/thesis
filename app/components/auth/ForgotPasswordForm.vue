<script setup>
import { AUTH_ROLES } from '~/composables/useAuthConfig';

const { apiBase } = useApiBase();

const props = defineProps({
    roleKey: { type: String, required: true }
});

const router = useRouter();
const role = AUTH_ROLES[props.roleKey];
const email = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const submit = async () => {
    errorMessage.value = '';
    successMessage.value = '';
    if (!email.value.trim()) {
        errorMessage.value = 'กรุณากรอกอีเมล';
        return;
    }
    isLoading.value = true;
    try {
        const data = await $fetch(`${apiBase.value}/vue-forgot-password.php`, {
            method: 'POST',
            body: { type: props.roleKey, email: email.value.trim() },
            credentials: 'include'
        });
        if (data.status === 'success') {
            successMessage.value = data.message;
            setTimeout(() => router.push(data.redirect || role.loginPath), 2000);
        } else {
            errorMessage.value = data.message || 'ส่งคำขอไม่สำเร็จ';
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
        <div class="auth-card">
            <div class="auth-header">
                <h1>ลืมรหัสผ่าน</h1>
                <p>{{ role.label }}</p>
            </div>
            <div v-if="errorMessage" class="auth-error">{{ errorMessage }}</div>
            <div v-if="successMessage" class="auth-success">{{ successMessage }}</div>
            <form @submit.prevent="submit">
                <div class="auth-field">
                    <label>อีเมลที่ใช้สมัคร</label>
                    <input v-model="email" type="email" placeholder="example@mail.com" required />
                </div>
                <button type="submit" class="auth-submit" :disabled="isLoading">
                    {{ isLoading ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซ็ตรหัสผ่าน' }}
                </button>
            </form>
            <div class="auth-footer">
                จำรหัสผ่านได้แล้ว? <NuxtLink :to="role.loginPath">เข้าสู่ระบบ</NuxtLink>
            </div>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/auth-login.css";
</style>
