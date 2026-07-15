<script setup>
definePageMeta({ layout: false });

import { stashRegistrationOtpFallback } from '~/utils/registrationOtp';

const router = useRouter();
const { apiBase } = useApiBase();

const STEP1_KEY = 'user_register_step1';
const STEP2_KEY = 'user_register_step2_address';
/** ตั้งเมื่อส่ง OTP แล้ว — ใช้ให้กลับจากหน้า verify-otp ได้แม้ยังไม่ยืนยัน OTP */
const OTP_PENDING_KEY = 'user_register_otp_pending';

const isLoading = ref(false);
const errorMessage = ref('');
const step1 = ref(null);

const form = ref({
    house_no: '',
    road: 'ไม่มี',
    sub_district: '',
    district: '',
    province: '',
    zipcode: ''
});

onMounted(() => {
    if (!import.meta.client) return;
    const raw = sessionStorage.getItem(STEP1_KEY);
    if (!raw) {
        // ไม่มี draft step1 — ยกเว้นกรณีที่เพิ่งส่ง OTP (ข้อมูลควรยังอยู่; ถ้าหายให้ไปสมัครใหม่)
        router.replace('/auth/register-user');
        return;
    }
    try {
        step1.value = JSON.parse(raw);
    } catch {
        sessionStorage.removeItem(STEP1_KEY);
        sessionStorage.removeItem(STEP2_KEY);
        sessionStorage.removeItem(OTP_PENDING_KEY);
        router.replace('/auth/register-user');
        return;
    }
    // 💾 โหลด form ที่กรอกไว้ (กรณีย้อนกลับมาแก้)
    const savedStep2 = sessionStorage.getItem(STEP2_KEY);
    if (savedStep2) {
        try {
            const parsed = JSON.parse(savedStep2);
            Object.keys(form.value).forEach((k) => {
                if (parsed[k] !== undefined && parsed[k] !== '') form.value[k] = parsed[k];
            });
        } catch { /* ignore */ }
    }
});

// 💾 ทุกครั้งที่ form เปลี่ยน → save ไว้ใน sessionStorage
watch(form, (v) => {
    if (!import.meta.client) return;
    try {
        sessionStorage.setItem(STEP2_KEY, JSON.stringify(v));
    } catch { /* ignore */ }
}, { deep: true });

const goBack = () => {
    // ไม่ต้องลบอะไร — form step1 และ step2 ยังอยู่ใน sessionStorage
    router.push('/auth/register-user');
};

const genderLabel = (g) => {
    if (g === 'M' || g === 'ชาย') return 'ชาย';
    if (g === 'F' || g === 'หญิง') return 'หญิง';
    return g || '-';
};

/* ---- ระบบกรอกที่อยู่อัตโนมัติ (ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์) ---- */
const { search: searchAddress, preload: preloadAddress } = useThaiAddress();
const addrSuggestions = ref([]);
const showAddrSuggest = ref(false);
const activeAddrField = ref('');
let addrTimer = null;

const onAddrInput = (field) => {
    activeAddrField.value = field;
    const q = field === 'zipcode' ? form.value.zipcode : form.value.sub_district;
    clearTimeout(addrTimer);
    if (!q || String(q).trim().length < 2) {
        addrSuggestions.value = [];
        showAddrSuggest.value = false;
        return;
    }
    addrTimer = setTimeout(async () => {
        addrSuggestions.value = await searchAddress(q, 8);
        showAddrSuggest.value = addrSuggestions.value.length > 0;
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

onMounted(() => preloadAddress());

/* ---- validate client-side ก่อนสมัครจริง + ส่ง OTP ---- */
const validate = () => {
    const f = form.value;
    if (!f.house_no?.trim()) return 'กรุณากรอกบ้านเลขที่';
    if (!f.sub_district?.trim()) return 'กรุณากรอกตำบล/แขวง';
    if (!f.district?.trim()) return 'กรุณากรอกอำเภอ/เขต';
    if (!f.province?.trim()) return 'กรุณากรอกจังหวัด';
    if (!f.zipcode?.trim()) return 'กรุณากรอกรหัสไปรษณีย์';
    if (!/^[0-9]{5}$/.test(f.zipcode.trim())) return 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
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
        const body = { ...step1.value, ...form.value };
        const data = await $fetch(`${apiBase.value}/vue-register-user.php`, {
            method: 'POST',
            body,
            credentials: 'include'
        });
        if (data?.status === 'success') {
            stashRegistrationOtpFallback('user', step1.value.email_account, data);
            // 💾 เก็บ draft ไว้จนกว่าจะยืนยัน OTP สำเร็จ (ให้กลับจาก verify-otp มาแก้ที่อยู่ได้)
            try {
                sessionStorage.setItem(STEP1_KEY, JSON.stringify(step1.value));
                sessionStorage.setItem(STEP2_KEY, JSON.stringify(form.value));
                sessionStorage.setItem(OTP_PENDING_KEY, '1');
            } catch { /* ignore */ }
            await router.push(
                data.redirect
                    || `/auth/verify-otp?type=user&email=${encodeURIComponent(step1.value.email_account)}`
            );
        } else {
            errorMessage.value = data?.message || 'สมัครไม่สำเร็จ';
        }
    } catch (err) {
        console.error(err);
        errorMessage.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
    <AuthRoleLayout role="user">
        <div class="rua-page">
            <button type="button" class="rua-back" @click="goBack">
                <i class="fa-solid fa-arrow-left"></i> กลับไปกรอกข้อมูลส่วนตัว
            </button>

            <div class="rua-card">
                <!-- HERO -->
                <div class="rua-hero">
                    <div class="hero-icon-wrap">
                        <i class="fa-solid fa-location-dot"></i>
                    </div>
                    <h1>กรอกที่อยู่จัดส่ง</h1>
                    <p class="hero-sub">
                        ขั้นตอนสุดท้ายก่อนยืนยัน OTP
                        <span v-if="step1?.firstname"> — สวัสดีคุณ <strong>{{ step1.firstname }} {{ step1.lastname }}</strong> 👋</span>
                    </p>
                    <div class="step-pills">
                        <span class="step-pill done">
                            <i class="fa-solid fa-circle-check"></i> 1. ข้อมูลส่วนตัว
                        </span>
                        <span class="step-divider"></span>
                        <span class="step-pill active">2. ที่อยู่จัดส่ง</span>
                        <span class="step-divider"></span>
                        <span class="step-pill">3. ยืนยัน OTP</span>
                    </div>
                </div>

                <div v-if="errorMessage" class="alert alert-error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>{{ errorMessage }}</span>
                </div>

                <form class="rua-form" @submit.prevent="submit">
                    <div class="form-section">
                        <div class="section-head">
                            <span class="section-dot"><i class="fa-solid fa-house"></i></span>
                            <div>
                                <h3>ที่อยู่</h3>
                                <small>ใช้สำหรับการรับยา / ออกใบสรุปรายการยา</small>
                            </div>
                        </div>

                        <div class="form-grid">
                            <div class="form-field">
                                <label>บ้านเลขที่ <span class="req">*</span></label>
                                <input v-model="form.house_no" type="text" placeholder="เช่น 16/1" required />
                            </div>
                            <div class="form-field">
                                <label>ถนน</label>
                                <input v-model="form.road" type="text" placeholder="เช่น พหลโยธิน หรือ ไม่มี" />
                            </div>
                            <div class="form-field addr-field">
                                <label>ตำบล / แขวง <span class="req">*</span></label>
                                <input v-model="form.sub_district" type="text"
                                       autocomplete="off"
                                       placeholder="พิมพ์ชื่อตำบล เช่น อินทประมูล"
                                       @input="onAddrInput('sub_district')"
                                       @focus="onAddrInput('sub_district')"
                                       @blur="hideAddrSuggestSoon"
                                       required />
                                <ul v-if="showAddrSuggest && activeAddrField === 'sub_district' && addrSuggestions.length"
                                    class="addr-suggest">
                                    <li v-for="(s, idx) in addrSuggestions" :key="idx"
                                        @mousedown.prevent="pickAddress(s)">
                                        <i class="fa-solid fa-location-dot"></i> {{ s.label }}
                                    </li>
                                </ul>
                            </div>
                            <div class="form-field">
                                <label>อำเภอ / เขต <span class="req">*</span></label>
                                <input v-model="form.district" type="text" placeholder="เช่น โพธิ์ทอง" required />
                            </div>
                            <div class="form-field">
                                <label>จังหวัด <span class="req">*</span></label>
                                <input v-model="form.province" type="text" placeholder="เช่น อ่างทอง" required />
                            </div>
                            <div class="form-field addr-field">
                                <label>รหัสไปรษณีย์ <span class="req">*</span></label>
                                <input v-model="form.zipcode" type="text" inputmode="numeric"
                                       autocomplete="off"
                                       pattern="\d{5}" maxlength="5" placeholder="14120"
                                       @input="onAddrInput('zipcode')"
                                       @focus="onAddrInput('zipcode')"
                                       @blur="hideAddrSuggestSoon"
                                       required />
                                <ul v-if="showAddrSuggest && activeAddrField === 'zipcode' && addrSuggestions.length"
                                    class="addr-suggest">
                                    <li v-for="(s, idx) in addrSuggestions" :key="idx"
                                        @mousedown.prevent="pickAddress(s)">
                                        <i class="fa-solid fa-location-dot"></i> {{ s.label }}
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <p class="hint-line">
                        <i class="fa-solid fa-circle-info"></i>
                        <template v-if="step1">
                            เพศ: <strong>{{ genderLabel(step1.gender) }}</strong>
                            · เบอร์: <strong>{{ step1.phone_number }}</strong>
                            · อีเมล: <strong>{{ step1.email_account }}</strong>
                            <br>หลังสมัครสำเร็จ สามารถแก้ไขที่อยู่/โปรไฟล์ได้ที่หน้า "โปรไฟล์ของฉัน"
                        </template>
                    </p>

                    <div class="action-bar">
                        <button type="button" class="btn-secondary" :disabled="isLoading" @click="goBack">
                            <i class="fa-solid fa-arrow-left"></i> ย้อนกลับ
                        </button>
                        <button type="submit" class="btn-primary" :disabled="isLoading">
                            <i v-if="isLoading" class="fa-solid fa-spinner fa-spin"></i>
                            <i v-else class="fa-solid fa-paper-plane"></i>
                            {{ isLoading ? 'กำลังดำเนินการ…' : 'ถัดไป' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </AuthRoleLayout>
</template>

<style scoped>
.rua-page {
    min-height: 100vh;
    padding: 90px 16px 60px;
    background: #ffffff;
}

.rua-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #475569;
    background: transparent;
    border: none;
    cursor: pointer;
    margin-bottom: 14px;
    font-weight: 600;
    font-size: 0.92rem;
}
.rua-back:hover { color: #1e293b; }

.rua-card {
    max-width: 820px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 22px;
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
    border: 1px solid #e2e8f0;
    overflow: hidden;
}

/* HERO */
.rua-hero {
    text-align: center;
    padding: 36px 28px 26px;
    background:
        radial-gradient(600px 300px at 50% -20%, rgba(59, 130, 246, 0.12), transparent 70%),
        linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
    border-bottom: 1px solid #f1f5f9;
}
.hero-icon-wrap {
    width: 68px;
    height: 68px;
    margin: 0 auto 14px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
    box-shadow:
        0 0 0 8px rgba(99, 102, 241, 0.08),
        0 8px 22px rgba(59, 130, 246, 0.35);
}
.rua-hero h1 {
    margin: 0;
    font-size: 1.7rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
}
.hero-sub {
    margin: 8px 0 14px;
    color: #64748b;
    font-size: 0.95rem;
    line-height: 1.6;
}
.hero-sub strong { color: #1d4ed8; font-weight: 800; }

/* STEP PILLS */
.step-pills {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
    justify-content: center;
}
.step-pill {
    padding: 6px 12px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #94a3b8;
    font-size: 0.78rem;
    font-weight: 700;
    border: 1px solid #e2e8f0;
}
.step-pill.done {
    background: #ecfdf5;
    color: #047857;
    border-color: #a7f3d0;
}
.step-pill.active {
    background: linear-gradient(135deg, #4f46e5, #6366f1);
    color: white;
    border-color: transparent;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}
.step-divider {
    width: 18px;
    height: 2px;
    background: #e2e8f0;
    border-radius: 2px;
}

/* ALERTS */
.alert {
    margin: 16px 28px 0;
    padding: 12px 14px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.92rem;
    font-weight: 600;
}
.alert-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }

/* FORM */
.rua-form { padding: 24px 28px 28px; }
.form-section {
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 18px 18px 20px;
    margin-bottom: 14px;
    background: #fbfdff;
}
.section-head {
    display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
}
.section-head h3 { margin: 0; font-size: 1rem; font-weight: 800; color: #1e293b; }
.section-head small { color: #94a3b8; font-size: 0.78rem; }
.section-dot {
    width: 36px; height: 36px; border-radius: 10px;
    background: linear-gradient(135deg, #3b82f6, #60a5fa);
    color: white;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0; font-size: 0.95rem;
}

.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-field label { color: #334155; font-size: 0.85rem; font-weight: 700; }
.form-field .req { color: #ef4444; }
.form-field input {
    padding: 11px 13px; border: 1.5px solid #e2e8f0; border-radius: 10px;
    font-size: 0.95rem; color: #0f172a; background: white;
    transition: all 0.2s; width: 100%; box-sizing: border-box;
}
.form-field input::placeholder { color: #cbd5e1; }
.form-field input:focus {
    outline: none; border-color: #6366f1;
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12);
}

/* ===== Autocomplete ที่อยู่ ===== */
.addr-field { position: relative; }
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

.hint-line {
    margin: 6px 4px 18px;
    padding: 12px 14px;
    background: #f0f9ff;
    border: 1px dashed #bae6fd;
    border-radius: 12px;
    color: #075985;
    font-size: 0.85rem;
    line-height: 1.55;
}
.hint-line i { color: #0284c7; margin-right: 6px; }
.hint-line strong { color: #0c4a6e; font-weight: 700; }

/* ACTIONS */
.action-bar {
    display: flex; gap: 10px; justify-content: space-between;
    margin-top: 8px; flex-wrap: wrap;
}
.btn-primary, .btn-secondary {
    border: none; cursor: pointer; border-radius: 12px;
    font-size: 0.95rem; font-weight: 700;
    padding: 12px 22px;
    display: inline-flex; align-items: center; gap: 8px;
    transition: all 0.2s;
}
.btn-primary {
    background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
    color: white;
    box-shadow: 0 6px 18px rgba(99, 102, 241, 0.35);
}
.btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 24px rgba(99, 102, 241, 0.45);
}
.btn-primary:disabled { opacity: 0.7; cursor: wait; }
.btn-secondary {
    background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;
}
.btn-secondary:hover:not(:disabled) { background: #e2e8f0; color: #1e293b; }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

@media (max-width: 640px) {
    .rua-page { padding: 80px 12px 40px; }
    .rua-hero { padding: 28px 18px 22px; }
    .rua-hero h1 { font-size: 1.4rem; }
    .alert { margin-left: 18px; margin-right: 18px; }
    .rua-form { padding: 18px 18px 22px; }
    .form-grid { grid-template-columns: 1fr; }
    .action-bar { justify-content: stretch; flex-direction: column-reverse; }
    .btn-primary, .btn-secondary { width: 100%; justify-content: center; }
}
</style>
