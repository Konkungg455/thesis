<script setup>
import { AUTH_ROLES } from '~/composables/useAuthConfig';
import { blockInvalidAgeKeys, clampAgeInputValue, validateAgeMessage } from '~/utils/age';

const router = useRouter();
const role = AUTH_ROLES.user;
const errorMessage = ref('');

const STEP1_KEY = 'user_register_step1';

const form = ref({
    username_account: '',
    firstname: '',
    lastname: '',
    gender: '',
    old: '',
    height: '',
    weight: '',
    password_account1: '',
    password_account2: '',
    phone_number: '',
    email_account: '',
    personal_disease: 'ไม่มี'
});

/* ---- โหลดค่าที่กรอกค้างไว้ (กรณีกลับมาแก้จาก step 2) ---- */
onMounted(() => {
    if (!import.meta.client) return;
    try {
        const raw = sessionStorage.getItem(STEP1_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            // โหลดทุก field รวมถึงรหัสผ่าน (sessionStorage ทำลายตอนปิด tab อยู่แล้ว)
            Object.keys(form.value).forEach((k) => {
                if (saved[k] !== undefined) form.value[k] = saved[k];
            });
        }
    } catch { /* ignore */ }
});

/* ---- save form ลง sessionStorage ทุกครั้งที่กรอก ---- */
watch(form, (v) => {
    if (!import.meta.client) return;
    try {
        sessionStorage.setItem(STEP1_KEY, JSON.stringify(v));
    } catch { /* ignore */ }
}, { deep: true });

/* ---- validate client-side ก่อนข้ามไป step 2 ---- */
const validate = () => {
    const f = form.value;
    if (!f.username_account || !f.firstname || !f.lastname
        || !f.old || !f.height || !f.weight
        || !f.password_account1 || !f.password_account2
        || !f.phone_number || !f.email_account) {
        return 'กรุณากรอกข้อมูลให้ครบถ้วน';
    }
    if (!f.gender || !['ชาย', 'หญิง'].includes(f.gender)) {
        return 'กรุณาเลือกเพศ';
    }
    const ageErr = validateAgeMessage(f.old);
    if (ageErr) return ageErr;
    if (f.password_account1.length < 8) return 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร';
    if (f.password_account1 !== f.password_account2) return 'รหัสผ่านไม่ตรงกัน';
    if (!/^[ก-๙\s]+$/.test(f.firstname)) return 'ชื่อต้องเป็นภาษาไทยเท่านั้น';
    if (!/^[ก-๙\s]+$/.test(f.lastname)) return 'นามสกุลต้องเป็นภาษาไทยเท่านั้น';
    if (!/^[0-9]{10}$/.test(f.phone_number)) return 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก';
    return '';
};

const onAgeInput = () => {
    form.value.old = clampAgeInputValue(form.value.old);
};

const submit = async () => {
    errorMessage.value = '';
    const err = validate();
    if (err) {
        errorMessage.value = err;
        return;
    }
    // 💾 บันทึก step 1 ลง sessionStorage แล้วไป step 2 (กรอกที่อยู่)
    if (import.meta.client) {
        sessionStorage.setItem(STEP1_KEY, JSON.stringify(form.value));
    }
    await router.push('/auth/register-user-address');
};
</script>

<template>
    <div class="auth-page">
        <NuxtLink :to="role.loginPath" class="auth-back"><i class="fa-solid fa-arrow-left"></i> กลับ</NuxtLink>
        <div class="auth-card auth-form-wide">
            <div class="auth-header">
                <h1>สมัครสมาชิก</h1>
                <p>ผู้ใช้งาน <span style="opacity:.7;font-size:.85em;">— ขั้นตอนที่ 1 / 2</span></p>
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
                        <option value="" disabled selected hidden>— กรุณาเลือกเพศ —</option>
                        <option value="ชาย">ชาย</option>
                        <option value="หญิง">หญิง</option>
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
                <div class="auth-field">
                    <label>ส่วนสูง (ซม.) <span class="req">*</span></label>
                    <input v-model="form.height" type="number" required />
                </div>
                <div class="auth-field">
                    <label>น้ำหนัก (กก.) <span class="req">*</span></label>
                    <input v-model="form.weight" type="number" required />
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
                <div class="auth-field full">
                    <label>โรคประจำตัว <span class="req">*</span></label>
                    <textarea v-model="form.personal_disease" rows="2" required />
                </div>
                <div class="full">
                    <button type="submit" class="auth-submit">
                        ถัดไป
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
