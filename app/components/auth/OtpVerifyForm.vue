<script setup>
import { AUTH_ROLES } from '~/composables/useAuthConfig';
import {
    applyOtpFallbackFromResponse,
    clearRegistrationOtpFallback,
    readRegistrationOtpFallback,
} from '~/utils/registrationOtp';

const { apiBase } = useApiBase();

const props = defineProps({
    roleKey: { type: String, required: true }
});

const route = useRoute();
const router = useRouter();
const role = AUTH_ROLES[props.roleKey];

// ปุ่ม "กลับ" ของหน้า verify-otp → กลับไปหน้าก่อนกดส่ง OTP ของแต่ละ role
const REGISTRATION_STORAGE_KEYS = {
    user: ['user_register_step1', 'user_register_step2_address', 'user_register_otp_pending'],
    store: ['store_register_step1', 'store_register_step1_draft', 'store_register_step2', 'store_register_step2_schedule'],
    pharmacist: [],
    admin: []
};

const BACK_BY_ROLE = {
    user:       { path: '/auth/register-user-address',  label: 'กลับไปหน้ากรอกที่อยู่' },
    store:      { path: '/auth/register-store-shop',    label: 'กลับไปหน้ารายละเอียดร้าน' },
    pharmacist: { path: '/auth/register-pharmacist',    label: 'กลับไปหน้าสมัคร' },
    admin:      { path: '/auth/register-admin',         label: 'กลับไปหน้าสมัคร' }
};
const backInfo = computed(() => BACK_BY_ROLE[props.roleKey] || { path: '/auth/register-user', label: 'กลับ' });
const goBack = () => {
    router.push(backInfo.value.path);
};

const clearRegistrationDraft = () => {
    if (!import.meta.client) return;
    const keys = REGISTRATION_STORAGE_KEYS[props.roleKey] || [];
    keys.forEach((k) => {
        try { sessionStorage.removeItem(k); } catch { /* ignore */ }
    });
};

const email = ref(route.query.email || '');
const otpCode = ref('');
const isLoading = ref(false);
const isResending = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const fallbackOtp = ref('');

const syncFallbackOtp = () => {
    const emailVal = String(email.value || route.query.email || '').trim();
    fallbackOtp.value = readRegistrationOtpFallback(role.verifyType, emailVal);
};

watch(email, syncFallbackOtp);

onMounted(() => {
    syncFallbackOtp();
});

// ⏳ cooldown 60s กันสแปม
const resendCooldown = ref(0);
let cooldownTimer = null;

const startCooldown = (seconds = 60) => {
    resendCooldown.value = seconds;
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
        resendCooldown.value -= 1;
        if (resendCooldown.value <= 0) {
            clearInterval(cooldownTimer);
            cooldownTimer = null;
        }
    }, 1000);
};

onUnmounted(() => {
    if (cooldownTimer) clearInterval(cooldownTimer);
});

const submit = async () => {
    errorMessage.value = '';
    successMessage.value = '';

    const emailVal = (email.value || '').trim();
    const otpVal = (otpCode.value || '').replace(/\s+/g, '').trim();

    if (!emailVal || !otpVal) {
        errorMessage.value = 'กรุณากรอกอีเมลและรหัส OTP';
        return;
    }
    if (!/^[0-9]{6}$/.test(otpVal)) {
        errorMessage.value = 'รหัส OTP ต้องเป็นตัวเลข 6 หลัก';
        return;
    }

    isLoading.value = true;
    try {
        const endpoint = props.roleKey === 'store'
            ? `${apiBase.value}/process-otp-verify.php`
            : `${apiBase.value}/vue-verify-otp.php`;

        const data = await $fetch(endpoint, {
            method: 'POST',
            body: {
                type: role.verifyType,
                email: emailVal,
                otp_code: otpVal
            },
            credentials: 'include'
        });

        if (data.status === 'success') {
            clearRegistrationDraft();
            clearRegistrationOtpFallback();
            alert(data.message);
            await router.push(data.redirect || role.loginPath);
        } else {
            errorMessage.value = data.message || 'รหัส OTP ไม่ถูกต้อง';
            otpCode.value = '';
        }
    } catch (err) {
        errorMessage.value = err?.data?.message
            || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง';
        otpCode.value = '';
    } finally {
        isLoading.value = false;
    }
};

const resendOtp = async () => {
    errorMessage.value = '';
    successMessage.value = '';

    const emailVal = (email.value || '').trim();
    if (!emailVal) {
        errorMessage.value = 'กรุณากรอกอีเมลก่อนขอรหัสใหม่';
        return;
    }
    if (resendCooldown.value > 0) return;

    isResending.value = true;
    try {
        const data = await $fetch(`${apiBase.value}/vue-resend-otp.php`, {
            method: 'POST',
            body: {
                type: role.verifyType,
                email: emailVal
            },
            credentials: 'include'
        });
        if (data?.status === 'success') {
            successMessage.value = data.message || 'ส่งรหัส OTP ใหม่ไปยังอีเมลของคุณเรียบร้อยแล้ว';
            const otp = applyOtpFallbackFromResponse(role.verifyType, emailVal, data);
            if (otp) fallbackOtp.value = otp;
            otpCode.value = '';
            startCooldown(60);
        } else {
            // ถ้าไม่พบ pending registration → ให้ user กลับไปสมัครใหม่
            errorMessage.value = data?.message || 'ไม่สามารถขอรหัสใหม่ได้';
            if (String(data?.message || '').includes('ไม่พบ')) {
                setTimeout(() => router.push(role.registerPath), 1800);
            }
        }
    } catch (err) {
        errorMessage.value = err?.data?.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    } finally {
        isResending.value = false;
    }
};
</script>

<template>
    <div class="auth-page">
        <button type="button" class="auth-back" @click="goBack">
            <i class="fa-solid fa-arrow-left"></i> {{ backInfo.label }}
        </button>
        <div class="auth-card">
            <div class="auth-header">
                <h1>ยืนยัน OTP</h1>
                <p>{{ role.label }}</p>
            </div>
            <div v-if="errorMessage" class="auth-error">{{ errorMessage }}</div>
            <div v-if="successMessage" class="auth-success">{{ successMessage }}</div>
            <div v-if="fallbackOtp" class="auth-otp-fallback">
                <div class="auth-otp-fallback-label">รหัส OTP ของคุณ</div>
                <div class="auth-otp-fallback-code">{{ fallbackOtp }}</div>
                <p>ไม่สามารถส่งอีเมลได้ในขณะนี้ — ใช้รหัสนี้ยืนยันตัวตน (หมดอายุใน 5 นาที)</p>
            </div>
            <form @submit.prevent="submit">
                <div class="auth-field">
                    <label>อีเมล</label>
                    <input v-model="email" type="email" required />
                </div>
                <div class="auth-field">
                    <label>รหัส OTP (6 หลัก)</label>
                    <input v-model="otpCode" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" required />
                    <small class="auth-hint">ถ้ารหัสหมดอายุหรือกรอกผิดหลายครั้ง ให้กด "ขอรหัส OTP ใหม่" ด้านล่าง</small>
                </div>
                <button type="submit" class="auth-submit" :disabled="isLoading || isResending">
                    {{ isLoading ? 'กำลังตรวจสอบ...' : 'ยืนยัน' }}
                </button>
                <button
                    type="button"
                    class="auth-resend"
                    :disabled="isLoading || isResending || resendCooldown > 0"
                    @click="resendOtp"
                >
                    <span v-if="isResending">กำลังส่งรหัสใหม่...</span>
                    <span v-else-if="resendCooldown > 0">ขอรหัสใหม่ได้อีกใน {{ resendCooldown }} วินาที</span>
                    <span v-else><i class="fa-solid fa-rotate-right"></i> ขอรหัส OTP ใหม่</span>
                </button>
            </form>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/auth-login.css";

button.auth-back {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    font: inherit;
    color: inherit;
}
button.auth-back:hover { text-decoration: underline; }

.auth-hint {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.4;
}
.auth-success {
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #6ee7b7;
    padding: 10px 14px;
    border-radius: 10px;
    margin-bottom: 14px;
    font-size: 14px;
}
.auth-otp-fallback {
    background: #eff6ff;
    border: 2px dashed #2563eb;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    text-align: center;
}
.auth-otp-fallback-label {
    font-size: 12px;
    color: #64748b;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 8px;
}
.auth-otp-fallback-code {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: 10px;
    color: #1d4ed8;
    font-family: Consolas, 'Courier New', monospace;
    line-height: 1.2;
}
.auth-otp-fallback p {
    margin: 10px 0 0;
    font-size: 13px;
    color: #475569;
    line-height: 1.5;
}
.auth-resend {
    width: 100%;
    margin-top: 10px;
    padding: 11px 14px;
    background: transparent;
    color: #2563eb;
    border: 1.5px solid #2563eb;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all .15s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}
.auth-resend:hover:not(:disabled) {
    background: #eff6ff;
}
.auth-resend:disabled {
    opacity: .55;
    cursor: not-allowed;
}
</style>
