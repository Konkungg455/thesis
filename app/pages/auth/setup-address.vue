<script setup>
definePageMeta({ layout: false });

const router = useRouter();
const route = useRoute();
const { $getApiBase } = useNuxtApp();

const accountId = computed(() => Number(route.query.account_id || 0));
const emailFromQuery = computed(() => String(route.query.email || ''));
const phoneFromQuery = computed(() => String(route.query.phone || ''));
const nameFromQuery = computed(() => String(route.query.name || '').trim());
const isFirstTime = computed(() => String(route.query.first || '') === '1');

const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const form = ref({
    house_no: '',
    road: 'ไม่มี',
    sub_district: '',
    district: '',
    province: '',
    zipcode: ''
});

/* — โหลดที่อยู่เก่ามาแสดง (กรณีผู้ใช้แก้ไขที่อยู่ภายหลัง) */
const loadExisting = async () => {
    if (!accountId.value) return;
    try {
        const res = await $fetch(`${$getApiBase()}/vue-get-account-address.php`, {
            method: 'POST',
            body: { id_account: accountId.value },
            credentials: 'include'
        });
        if (res?.status === 'success' && res.address) {
            const a = res.address;
            form.value = {
                house_no: a.house_no || '',
                road: a.road ?? a.moo ?? 'ไม่มี',
                sub_district: a.sub_district || '',
                district: a.district || '',
                province: a.province || '',
                zipcode: a.zipcode || ''
            };
        }
    } catch (err) {
        // เงียบไว้ — ถ้ายังไม่มีก็ถือว่าเริ่มกรอกใหม่
        console.warn('load address:', err);
    }
};

onMounted(() => {
    if (!accountId.value) {
        errorMessage.value = 'ไม่พบรหัสบัญชี กรุณาสมัครสมาชิกใหม่อีกครั้ง';
        return;
    }
    loadExisting();
});

const submit = async () => {
    errorMessage.value = '';
    successMessage.value = '';
    if (!accountId.value) {
        errorMessage.value = 'ไม่พบรหัสบัญชี';
        return;
    }
    isLoading.value = true;
    try {
        const body = new FormData();
        body.append('id_account', String(accountId.value));
        Object.entries(form.value).forEach(([k, v]) => body.append(k, v ?? ''));

        const data = await $fetch(`${$getApiBase()}/vue-save-account-address.php`, {
            method: 'POST',
            body,
            credentials: 'include'
        });
        if (data?.status === 'success') {
            successMessage.value = isFirstTime.value
                ? 'บันทึกที่อยู่เรียบร้อย! กำลังนำคุณไปยังหน้าเข้าสู่ระบบ…'
                : 'บันทึกที่อยู่เรียบร้อย! กำลังกลับไปหน้าโปรไฟล์…';
            // ครั้งแรก (จากตอนสมัคร) → ไปหน้า login
            // ครั้งถัดไป (แก้จากหน้าโปรไฟล์) → กลับไปหน้าโปรไฟล์
            const target = isFirstTime.value
                ? (data.redirect || '/auth/login-user')
                : '/user/profile';
            setTimeout(() => {
                router.push(target);
            }, 900);
        } else {
            errorMessage.value = data?.message || 'บันทึกไม่สำเร็จ';
        }
    } catch (err) {
        console.error(err);
        errorMessage.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    } finally {
        isLoading.value = false;
    }
};

const skipForNow = () => {
    router.push(isFirstTime.value ? '/auth/login-user' : '/user/profile');
};

/* ---- ระบบกรอกที่อยู่อัตโนมัติ ---- */
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
</script>

<template>
    <AuthRoleLayout role="user">
        <div class="addr-page">
            <NuxtLink v-if="!isFirstTime" to="/user/history" class="addr-back">
                <i class="fa-solid fa-arrow-left"></i> กลับ
            </NuxtLink>

            <div class="addr-card">
                <!-- HEADER -->
                <div class="addr-hero">
                    <div class="hero-icon-wrap">
                        <i class="fa-solid fa-location-dot"></i>
                    </div>
                    <h1>ข้อมูลที่อยู่จัดส่ง</h1>
                    <p class="hero-sub">
                        <template v-if="isFirstTime">
                            เกือบเสร็จแล้ว <span v-if="nameFromQuery">คุณ {{ nameFromQuery }}</span>!
                            <br>กรอกที่อยู่ของคุณเพื่อใช้สำหรับการรับยา / ใบสรุปรายการยา
                        </template>
                        <template v-else>
                            แก้ไขที่อยู่ของคุณได้ตลอดเวลา ข้อมูลนี้ใช้สำหรับจัดส่งและออกใบสรุปรายการยา
                        </template>
                    </p>
                </div>

                <!-- ALERT -->
                <div v-if="errorMessage" class="alert alert-error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>{{ errorMessage }}</span>
                </div>
                <div v-if="successMessage" class="alert alert-success">
                    <i class="fa-solid fa-circle-check"></i>
                    <span>{{ successMessage }}</span>
                </div>

                <!-- FORM -->
                <form class="addr-form" @submit.prevent="submit">
                    <!-- กลุ่ม 1: ที่อยู่ -->
                    <div class="form-section">
                        <div class="section-head">
                            <span class="section-dot"><i class="fa-solid fa-house"></i></span>
                            <div>
                                <h3>ที่อยู่</h3>
                                <small>ที่อยู่บ้านหรือสถานที่จัดส่งหลัก</small>
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

                    <!-- หมายเหตุ: เบอร์ติดต่อ/อีเมล ใช้ของบัญชีหลัก แก้ไขได้ที่หน้า "โปรไฟล์" -->
                    <p class="hint-line">
                        <i class="fa-solid fa-circle-info"></i>
                        เบอร์โทรและอีเมลใช้จากข้อมูลบัญชีของคุณ
                        <template v-if="phoneFromQuery">— <strong>{{ phoneFromQuery }}</strong></template>
                        <template v-if="emailFromQuery"> · <strong>{{ emailFromQuery }}</strong></template>
                        <br>
                        ต้องการแก้ไขเบอร์/อีเมล ไปที่หน้า "โปรไฟล์ของฉัน"
                    </p>

                    <!-- ACTIONS -->
                    <div class="action-bar">
                        <button v-if="isFirstTime"
                                type="button"
                                class="btn-skip"
                                :disabled="isLoading"
                                @click="skipForNow">
                            ข้ามไปก่อน
                        </button>
                        <button type="submit" class="btn-save" :disabled="isLoading">
                            <i v-if="isLoading" class="fa-solid fa-spinner fa-spin"></i>
                            <i v-else class="fa-solid fa-floppy-disk"></i>
                            {{ isLoading ? 'กำลังบันทึก…' : (isFirstTime ? 'บันทึก & เข้าสู่ระบบ' : 'บันทึกที่อยู่') }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </AuthRoleLayout>
</template>

<style scoped>
.addr-page {
    min-height: 100vh;
    padding: 90px 16px 60px;
    background:
        radial-gradient(1100px 600px at 12% -10%, #dbeafe 0%, transparent 60%),
        radial-gradient(900px 500px at 100% 110%, #ede9fe 0%, transparent 60%),
        linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}

.addr-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #1d4ed8;
    text-decoration: none;
    margin: 0 0 16px;
    padding: 10px 16px;
    font-weight: 800;
    font-size: 0.92rem;
    letter-spacing: 0.01em;
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(239, 246, 255, 0.96) 100%);
    border: 1px solid rgba(96, 165, 250, 0.42);
    border-radius: 999px;
    box-shadow: 0 10px 24px rgba(37, 99, 235, 0.14);
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}
.addr-back i {
    transition: transform 0.18s ease;
}
.addr-back:hover {
    color: #0f172a;
    border-color: #2563eb;
    box-shadow: 0 14px 30px rgba(37, 99, 235, 0.22);
    transform: translateY(-1px);
}
.addr-back:hover i {
    transform: translateX(-3px);
}
.addr-back:active {
    transform: translateY(0);
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.16);
}

.addr-card {
    max-width: 780px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 22px;
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
    border: 1px solid #e2e8f0;
    overflow: hidden;
}

/* ============== HERO ============== */
.addr-hero {
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
.addr-hero h1 {
    margin: 0;
    font-size: 1.7rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
}
.hero-sub {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 0.95rem;
    line-height: 1.6;
}
.hero-sub span { color: #1d4ed8; font-weight: 700; }

/* ============== ALERTS ============== */
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
.alert-error {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
}
.alert-success {
    background: #f0fdf4;
    color: #166534;
    border: 1px solid #bbf7d0;
}

/* ============== FORM ============== */
.addr-form { padding: 24px 28px 28px; }

.form-section {
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 18px 18px 20px;
    margin-bottom: 18px;
    background: #fbfdff;
    transition: border-color 0.2s;
}
.form-section:hover { border-color: #cbd5e1; }

.section-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
}
.section-head h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    color: #1e293b;
}
.section-head small { color: #94a3b8; font-size: 0.78rem; }
.section-dot {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, #3b82f6, #60a5fa);
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 0.95rem;
}
.section-dot.contact {
    background: linear-gradient(135deg, #10b981, #34d399);
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
}
.form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.form-field label {
    color: #334155;
    font-size: 0.85rem;
    font-weight: 700;
}
.form-field .req { color: #ef4444; }
.form-field input {
    padding: 11px 13px;
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    font-size: 0.95rem;
    color: #0f172a;
    background: white;
    transition: all 0.2s;
    width: 100%;
    box-sizing: border-box;
}
.form-field input::placeholder { color: #cbd5e1; }
.form-field input:focus {
    outline: none;
    border-color: #6366f1;
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
    display: flex;
    flex-wrap: wrap;
    gap: 4px 6px;
    align-items: flex-start;
}
.hint-line i { color: #0284c7; margin-right: 4px; margin-top: 3px; }
.hint-line strong { color: #0c4a6e; font-weight: 700; }

/* ============== ACTIONS ============== */
.action-bar {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 8px;
    flex-wrap: wrap;
}
.btn-save, .btn-skip {
    border: none;
    cursor: pointer;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 700;
    padding: 12px 22px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
}
.btn-save {
    background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
    color: white;
    box-shadow: 0 6px 18px rgba(99, 102, 241, 0.35);
}
.btn-save:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 24px rgba(99, 102, 241, 0.45);
}
.btn-save:disabled { opacity: 0.7; cursor: wait; }

.btn-skip {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
}
.btn-skip:hover:not(:disabled) {
    background: #e2e8f0;
    color: #1e293b;
}
.btn-skip:disabled { opacity: 0.6; cursor: not-allowed; }

@media (max-width: 640px) {
    .addr-page { padding: 80px 12px 40px; }
    .addr-hero { padding: 28px 18px 22px; }
    .addr-hero h1 { font-size: 1.4rem; }
    .alert { margin-left: 18px; margin-right: 18px; }
    .addr-form { padding: 18px 18px 22px; }
    .form-grid { grid-template-columns: 1fr; }
    .action-bar { justify-content: stretch; }
    .btn-save, .btn-skip { width: 100%; justify-content: center; }
}
</style>
