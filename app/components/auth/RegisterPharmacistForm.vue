<script setup>
import { AUTH_ROLES } from '~/composables/useAuthConfig';
import { blockInvalidAgeKeys, clampAgeInputValue, validateAgeMessage } from '~/utils/age';
import {
    PHONE_MAX_LENGTH,
    blockInvalidPhoneKeys,
    clampPhoneInputValue,
    validatePhoneMessage,
} from '~/utils/phone';

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
const storePickerOpen = ref(false);
const storePickerRef = ref(null);

const storeDisplayName = (store) => {
    const name = String(store?.store_name || '').trim();
    if (name) return name;
    const id = Number(store?.id || 0);
    return id > 0 ? `ร้าน #${id}` : '';
};

const selectedStoreLabel = computed(() => {
    if (!form.value.id_store) return 'ไม่มี';
    const hit = stores.value.find((s) => String(s.id) === String(form.value.id_store));
    return hit ? storeDisplayName(hit) || 'ไม่มี' : 'ไม่มี';
});

const pickStore = (id) => {
    form.value.id_store = id ? String(id) : '';
    storePickerOpen.value = false;
};

const loadStores = async () => {
    try {
        const data = await $fetch(`${apiBase.value}/get-stores.php`, { credentials: 'include' });
        if (data?.status === 'success' && Array.isArray(data.stores)) {
            stores.value = data.stores
                .filter((s) => {
                    const status = String(s.admin_status || 'approved');
                    return status === 'approved' && Number(s.is_deleted || 0) === 0 && Number(s.id) > 0;
                })
                .map((s) => ({
                    ...s,
                    store_name: storeDisplayName(s),
                }))
                .filter((s) => String(s.store_name || '').trim())
                .sort((a, b) => String(a.store_name).localeCompare(String(b.store_name), 'th'));
        }
    } catch (e) {
        console.error('โหลดรายชื่อร้านไม่สำเร็จ:', e);
    }
};

const onStorePickerDocClick = (event) => {
    if (!storePickerRef.value?.contains(event.target)) {
        storePickerOpen.value = false;
    }
};

onMounted(() => {
    loadStores();
    document.addEventListener('click', onStorePickerDocClick);
});

onBeforeUnmount(() => {
    document.removeEventListener('click', onStorePickerDocClick);
});

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

const fillAllWorkDays = () => {
    const ref = workRows.value[0] || { start: '08:00', end: '17:00' };
    const start = ref.start || '08:00';
    const end = ref.end || '17:00';
    workRows.value = DAY_ORDER.map((day) => ({ day, start, end }));
};

const onFileChange = (e) => {
    const f = e.target.files?.[0];
    licenseFile.value = f || null;
    licenseLabel.value = f ? f.name : 'เลือกไฟล์ใบวิชาชีพ';
};

const onAgeInput = () => {
    form.value.age_pharma = clampAgeInputValue(form.value.age_pharma);
};

const onPhoneInput = () => {
    form.value.phone = clampPhoneInputValue(form.value.phone);
};

const submit = async () => {
    errorMessage.value = '';
    const ageErr = validateAgeMessage(form.value.age_pharma);
    if (ageErr) {
        errorMessage.value = ageErr;
        return;
    }
    const phoneErr = validatePhoneMessage(form.value.phone);
    if (phoneErr) {
        errorMessage.value = phoneErr;
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
                    <input
                        v-model="form.phone"
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
                    <input v-model="form.email" type="email" required />
                </div>
                <div ref="storePickerRef" class="auth-field full store-picker-field">
                    <label>ร้านยาที่ทำงานอยู่</label>
                    <button
                        type="button"
                        class="store-picker-trigger"
                        :class="{ open: storePickerOpen }"
                        :aria-expanded="storePickerOpen"
                        @click.stop="storePickerOpen = !storePickerOpen"
                    >
                        <span class="store-picker-value">{{ selectedStoreLabel }}</span>
                        <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                    </button>
                    <ul v-if="storePickerOpen" class="store-picker-list" role="listbox">
                        <li role="option">
                            <button type="button" :class="{ active: !form.id_store }" @click="pickStore('')">ไม่มี</button>
                        </li>
                        <li v-for="s in stores" :key="s.id" role="option">
                            <button
                                type="button"
                                :class="{ active: String(form.id_store) === String(s.id) }"
                                @click="pickStore(s.id)"
                            >
                                {{ s.store_name }}
                            </button>
                        </li>
                    </ul>
                </div>
                <div class="auth-field full">
                    <div class="auth-work-label-row">
                        <label>เวลาทำงาน <span class="req">*</span></label>
                        <button type="button" class="auth-work-fill-all" @click="fillAllWorkDays">
                            <i class="fa-regular fa-calendar-plus" aria-hidden="true"></i>
                            เพิ่มทุกวัน
                        </button>
                    </div>
                    <div v-for="(row, i) in workRows" :key="i" class="auth-work-row">
                        <select v-model="row.day" :required="i === 0 || !!row.start || !!row.end">
                            <option value="" disabled hidden>เลือกวัน</option>
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

.auth-card.auth-form-wide {
    overflow: visible;
}

.store-picker-field {
    position: relative;
    z-index: 1;
}

.store-picker-field:focus-within,
.store-picker-field:has(.store-picker-trigger.open) {
    z-index: 40;
}

.store-picker-trigger {
    width: 100%;
    min-height: 48px;
    padding: 12px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #fff;
    color: #0f172a;
    font: inherit;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.2s, box-shadow 0.2s;
}

.store-picker-trigger.open,
.store-picker-trigger:focus-visible {
    outline: none;
    border-color: #00469c;
    box-shadow: 0 0 0 3px rgba(0, 70, 156, 0.12);
}

.store-picker-value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.store-picker-trigger i {
    color: #94a3b8;
    transition: transform 0.2s ease;
}

.store-picker-trigger.open i {
    transform: rotate(180deg);
}

.store-picker-list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 50;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
    max-height: 240px;
    overflow-y: auto;
}

.store-picker-list button {
    width: 100%;
    border: none;
    background: transparent;
    color: #0f172a;
    text-align: left;
    padding: 10px 12px;
    border-radius: 8px;
    font: inherit;
    cursor: pointer;
}

.store-picker-list button:hover,
.store-picker-list button.active {
    background: #eff6ff;
    color: #00469c;
}

.auth-work-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
}

.auth-work-label-row label {
    margin-bottom: 0;
}

.auth-work-fill-all {
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #00469c;
    border-radius: 999px;
    padding: 6px 12px;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: background 0.2s, border-color 0.2s;
}

.auth-work-fill-all:hover {
    background: #dbeafe;
    border-color: #93c5fd;
}
</style>
