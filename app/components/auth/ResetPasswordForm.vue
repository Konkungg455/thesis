<script setup>
import { AUTH_ROLES } from '~/composables/useAuthConfig';

const { apiBase } = useApiBase();

const props = defineProps({
    roleKey: { type: String, required: true }
});

const route = useRoute();
const router = useRouter();
const role = AUTH_ROLES[props.roleKey];

const token = computed(() => route.query.token || '');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const username = ref('');
const isLoading = ref(false);
const tokenValid = ref(false);
const tokenChecked = ref(false);
const errorMessage = ref('');

onMounted(async () => {
    if (!token.value) {
        errorMessage.value = 'ลิงก์ไม่ถูกต้อง';
        tokenChecked.value = true;
        return;
    }
    try {
        const data = await $fetch(`${apiBase.value}/vue-check-reset-token.php`, {
            params: { type: props.roleKey, token: token.value },
            credentials: 'include'
        });
        if (data.status === 'success') {
            tokenValid.value = true;
            username.value = data.username || '';
        } else {
            errorMessage.value = data.message || 'ลิงก์หมดอายุ';
        }
    } catch {
        errorMessage.value = 'ตรวจสอบลิงก์ไม่สำเร็จ';
    } finally {
        tokenChecked.value = true;
    }
});

const submit = async () => {
    errorMessage.value = '';
    if (password.value.length < 8) {
        errorMessage.value = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
        return;
    }
    if (password.value !== confirmPassword.value) {
        errorMessage.value = 'รหัสผ่านไม่ตรงกัน';
        return;
    }
    isLoading.value = true;
    try {
        const data = await $fetch(`${apiBase.value}/vue-reset-password.php`, {
            method: 'POST',
            body: {
                type: props.roleKey,
                token: token.value,
                password: password.value,
                confirm_password: confirmPassword.value
            },
            credentials: 'include'
        });
        if (data.status === 'success') {
            alert(data.message);
            await router.push(data.redirect || role.loginPath);
        } else {
            errorMessage.value = data.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ';
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
                <h1>ตั้งรหัสผ่านใหม่</h1>
                <p>{{ role.label }}</p>
            </div>
            <div v-if="!tokenChecked" class="auth-footer">กำลังตรวจสอบลิงก์...</div>
            <template v-else-if="tokenValid">
                <p v-if="username" class="auth-footer" style="margin-bottom: 16px;">บัญชี: <strong>{{ username }}</strong></p>
                <div v-if="errorMessage" class="auth-error">{{ errorMessage }}</div>
                <form @submit.prevent="submit">
                    <div class="auth-field">
                        <label>รหัสผ่านใหม่</label>
                        <div class="auth-input-wrap">
                            <input v-model="password" :type="showPassword ? 'text' : 'password'" minlength="8" required />
                            <button type="button" class="auth-toggle-pw" @click="showPassword = !showPassword">
                                <i :class="showPassword ? 'fa-solid fa-eye-slash' : 'fa-regular fa-eye'"></i>
                            </button>
                        </div>
                    </div>
                    <div class="auth-field">
                        <label>ยืนยันรหัสผ่าน</label>
                        <input v-model="confirmPassword" type="password" minlength="8" required />
                    </div>
                    <button type="submit" class="auth-submit" :disabled="isLoading">ยืนยันการเปลี่ยนรหัสผ่าน</button>
                </form>
            </template>
            <div v-else class="auth-error">{{ errorMessage }}</div>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/auth-login.css";
</style>
