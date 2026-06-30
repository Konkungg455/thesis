<script setup>
import { useAuthLogin } from '~/composables/useAuthLogin';

const props = defineProps({
    roleKey: {
        type: String,
        required: true,
        validator: (v) => ['user', 'pharmacist', 'store', 'admin'].includes(v)
    }
});

const route = useRoute();

const {
    config,
    email,
    password,
    remember,
    showPassword,
    isLoading,
    errorMessage,
    login
} = useAuthLogin(props.roleKey);

const reasonMessage = computed(() => {
    const r = String(route.query.reason || '');
    if (r === 'server_restart') return 'เซิร์ฟเวอร์ถูกรีสตาร์ท กรุณาเข้าสู่ระบบใหม่อีกครั้ง';
    if (r === 'server_down') return 'การเชื่อมต่อกับเซิร์ฟเวอร์ขาดหาย กรุณาเข้าสู่ระบบใหม่อีกครั้ง';
    if (r === 'login_required') return 'กรุณาเข้าสู่ระบบก่อนใช้งานหน้านี้';
    return '';
});

const onSubmit = (e) => {
    e.preventDefault();
    login();
};
</script>

<template>
    <div class="auth-page">
        <NuxtLink to="/auth" class="auth-back">
            <i class="fa-solid fa-arrow-left"></i> กลับ
        </NuxtLink>

        <div class="auth-card">
            <div class="auth-header">
                <h1>{{ config.title }}</h1>
                <p>{{ config.subtitle }}</p>
            </div>

            <div v-if="reasonMessage" class="auth-notice" role="status">
                <i class="fa-solid fa-circle-info"></i> {{ reasonMessage }}
            </div>

            <div v-if="errorMessage" class="auth-error" role="alert">
                {{ errorMessage }}
            </div>

            <form @submit="onSubmit">
                <div class="auth-field">
                    <label for="email">อีเมล</label>
                    <input
                        id="email"
                        v-model="email"
                        type="email"
                        placeholder="กรุณากรอกอีเมล"
                        autocomplete="email"
                        required
                    />
                </div>

                <div class="auth-field">
                    <label for="password">รหัสผ่าน</label>
                    <div class="auth-input-wrap">
                        <input
                            id="password"
                            v-model="password"
                            :type="showPassword ? 'text' : 'password'"
                            placeholder="กรุณากรอกรหัสผ่าน"
                            autocomplete="current-password"
                            required
                        />
                        <button
                            type="button"
                            class="auth-toggle-pw"
                            :aria-label="showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
                            @click="showPassword = !showPassword"
                        >
                            <i :class="showPassword ? 'fa-solid fa-eye-slash' : 'fa-regular fa-eye'"></i>
                        </button>
                    </div>
                </div>

                <div class="auth-options">
                    <label class="auth-remember">
                        <input v-model="remember" type="checkbox" />
                        <span>จดจำอีเมล</span>
                    </label>
                    <NuxtLink :to="config.forgotPath" class="auth-forgot">ลืมรหัสผ่าน?</NuxtLink>
                </div>

                <button type="submit" class="auth-submit" :disabled="isLoading">
                    {{ isLoading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ' }}
                </button>
            </form>

            <div class="auth-footer">
                ยังไม่มีบัญชี?
                <NuxtLink :to="config.registerPath">สมัครสมาชิก</NuxtLink>
            </div>

            <div class="auth-role-links">
                <NuxtLink
                    v-for="link in config.otherLogins"
                    :key="link.to"
                    :to="link.to"
                    class="auth-role-chip"
                >
                    {{ link.label }}
                </NuxtLink>
            </div>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/auth-login.css";

.auth-notice {
    background: #fff7ed;
    color: #9a3412;
    border: 1px solid #fed7aa;
    padding: 10px 14px;
    border-radius: 10px;
    margin-bottom: 14px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.auth-notice i { color: #ea580c; }
</style>
