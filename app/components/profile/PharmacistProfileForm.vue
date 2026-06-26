<script setup>
const { apiUrl, imagesPharma } = useApiBase();

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ป้ายแสดงผลภาษาไทย (ค่าที่บันทึกยังเป็นอังกฤษเพื่อให้ตรงกับ backend)
const DAY_LABELS = {
    Monday: 'จันทร์',
    Tuesday: 'อังคาร',
    Wednesday: 'พุธ',
    Thursday: 'พฤหัสบดี',
    Friday: 'ศุกร์',
    Saturday: 'เสาร์',
    Sunday: 'อาทิตย์',
};

// ค่าเริ่มต้นวันทำงาน: จันทร์–ศุกร์ (5 วัน) — ผู้ใช้สามารถเพิ่มวัน/แก้เวลาได้
const DEFAULT_WORKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const makeDefaultSchedules = () =>
    DEFAULT_WORKDAYS.map((day) => ({ day, start: '08:00', end: '17:00' }));

const loading = ref(true);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const profile = ref(null);
const phonePharma = ref('');
const schedules = ref(makeDefaultSchedules());
const passwordNew = ref('');
const passwordConfirm = ref('');
const avatarPreview = ref('');
const avatarFile = ref(null);
const licenseUrl = ref('');
const idStore = ref('');
const stores = ref([]);

const storeStatusBanner = computed(() => {
    if (!profile.value) return null;
    const hasApprovedStore = profile.value.id_store != null && profile.value.id_store !== '';
    const hasPending = profile.value.pending_store_id != null && profile.value.pending_store_id !== '';

    if (hasPending) {
        const storeLabel = profile.value.pending_store_name || profile.value.current_store_name || 'ร้านที่เลือก';
        return {
            type: 'warning',
            icon: 'fa-hourglass-half',
            title: `กำลังรอเจ้าของร้าน "${storeLabel}" อนุมัติ`,
            desc: 'คำขอของคุณถูกส่งไปแล้ว กรุณารอการอนุมัติจากเจ้าของร้านยา'
        };
    }
    if (!hasApprovedStore) {
        return {
            type: 'error',
            icon: 'fa-circle-exclamation',
            title: 'คุณถูกนำออกจากร้านยา (หรือยังไม่ได้สังกัดร้าน)',
            desc: 'กรุณาเลือกร้านที่ต้องการสมัครเข้าทำงานในช่อง "ร้านยาที่ทำงานอยู่" แล้วกดอัปเดต ระบบจะส่งคำขออนุมัติให้เจ้าของร้านอัตโนมัติ'
        };
    }
    return {
        type: 'success',
        icon: 'fa-circle-check',
        title: `คุณกำลังทำงานที่ "${profile.value.current_store_name || 'ร้านยาของคุณ'}"`,
        desc: 'บัญชีของคุณได้รับการอนุมัติจากร้านยาเรียบร้อย'
    };
});

const avatarSrc = computed(() => {
    if (avatarPreview.value) return avatarPreview.value;
    if (profile.value?.images_pharma) {
        return imagesPharma(profile.value.images_pharma);
    }
    return imagesPharma('default.png');
});

const displayName = computed(() => {
    if (!profile.value) return '';
    return `ภก. ${profile.value.firstname_pharma} ${profile.value.lastname_pharma}`;
});

const genderLabel = computed(() => {
    if (!profile.value) return '';
    return profile.value.gender_pharma === 'M' ? 'ชาย' : 'หญิง';
});

const loadProfile = async () => {
    loading.value = true;
    errorMessage.value = '';
    try {
        const res = await $fetch(apiUrl('vue-get-pharma-profile.php'), { credentials: 'include' });
        if (res.status !== 'success') {
            errorMessage.value = res.message || 'โหลดข้อมูลไม่สำเร็จ';
            return;
        }
        profile.value = res.data;
        phonePharma.value = res.data.phone_pharma || '';
        schedules.value = res.data.schedules?.length
            ? [...res.data.schedules]
            : makeDefaultSchedules();
        licenseUrl.value = res.data.license_url
            ? apiUrl(res.data.license_url)
            : '';
        if (res.data.pending_store_id != null) {
            idStore.value = String(res.data.pending_store_id);
        } else if (res.data.id_store != null) {
            idStore.value = String(res.data.id_store);
        } else {
            idStore.value = '';
        }
        stores.value = (res.data.stores || []).map((s) => ({
            id: s.id,
            name: s.name || s.store_name || `ร้าน #${s.id}`,
        }));
    } catch {
        errorMessage.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    } finally {
        loading.value = false;
    }
};

const onPickAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    avatarFile.value = file;
    avatarPreview.value = URL.createObjectURL(file);
};

const addSchedule = () => {
    // ขึ้นวันถัดไปต่อจากแถวล่าสุด และใช้เวลาเดียวกับแถวล่าสุด
    const last = schedules.value[schedules.value.length - 1]
        || { day: DEFAULT_WORKDAYS[0], start: '08:00', end: '17:00' };
    const idx = DAYS.indexOf(last.day);
    const nextDay = DAYS[(idx + 1) % DAYS.length];
    schedules.value.push({ day: nextDay, start: last.start, end: last.end });
};

const removeSchedule = (index) => {
    if (schedules.value.length <= 1) return;
    schedules.value.splice(index, 1);
};

const openLicense = () => {
    if (licenseUrl.value) {
        window.open(licenseUrl.value, '_blank');
    }
};

const submit = async () => {
    if (!profile.value) return;
    saving.value = true;
    errorMessage.value = '';
    successMessage.value = '';

    if (passwordNew.value && passwordNew.value !== passwordConfirm.value) {
        errorMessage.value = 'รหัสผ่านใหม่ไม่ตรงกัน';
        saving.value = false;
        return;
    }

    try {
        const body = new FormData();
        body.append('phone_pharma', phonePharma.value);
        body.append('id_store', idStore.value);
        schedules.value.forEach((s) => {
            body.append('work_day[]', s.day);
            body.append('work_start[]', s.start);
            body.append('work_end[]', s.end);
        });
        if (passwordNew.value) {
            body.append('password_new', passwordNew.value);
            body.append('password_confirm', passwordConfirm.value);
        }
        if (avatarFile.value) {
            body.append('images_pharma', avatarFile.value);
        }

        const res = await $fetch(apiUrl('vue-update-pharma-profile.php'), {
            method: 'POST',
            body,
            credentials: 'include'
        });

        if (res.status !== 'success') {
            errorMessage.value = res.message || 'บันทึกไม่สำเร็จ';
            return;
        }

        successMessage.value = res.message || 'อัปเดตข้อมูลสำเร็จ';
        if (res.user) {
            localStorage.setItem('user_data', JSON.stringify(res.user));
        }
        passwordNew.value = '';
        passwordConfirm.value = '';
        avatarFile.value = null;
        await loadProfile();
    } catch {
        errorMessage.value = 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่';
    } finally {
        saving.value = false;
    }
};

onMounted(loadProfile);
</script>

<style scoped>
.store-banner {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 16px 20px;
    border-radius: 14px;
    margin-bottom: 22px;
    border: 1px solid;
}
.store-banner.banner-error { background: #fef2f2; border-color: #fecaca; color: #7f1d1d; }
.store-banner.banner-warning { background: #fefce8; border-color: #fde68a; color: #713f12; }
.store-banner.banner-success { background: #ecfdf5; border-color: #bbf7d0; color: #14532d; }

.banner-icon {
    font-size: 1.5rem;
    line-height: 1;
    padding-top: 2px;
    flex-shrink: 0;
}
.store-banner.banner-error .banner-icon { color: #dc2626; }
.store-banner.banner-warning .banner-icon { color: #d97706; }
.store-banner.banner-success .banner-icon { color: #16a34a; }

.banner-text strong {
    display: block;
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 0.95rem;
}
.banner-text p { margin: 0; font-size: 0.85rem; line-height: 1.5; opacity: 0.85; }

.hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: #64748b;
    font-size: 0.8rem;
}
</style>

<template>
    <div class="profile-shell">
        <NuxtLink to="/pharmacy_web" class="profile-back">
            <i class="fa-solid fa-arrow-left"></i> กลับหน้าหลัก
        </NuxtLink>

        <div class="profile-wrap wide">
        <div v-if="loading" class="profile-loading">
            <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...
        </div>

        <div v-else-if="profile" class="profile-card">
            <h1 class="profile-title">Profile</h1>
            <div class="profile-badge-wrap">
                <span class="profile-badge">
                    <i class="fa-solid fa-user-doctor"></i> เภสัชกรวิชาชีพ
                </span>
            </div>

            <div v-if="errorMessage" class="profile-msg error">{{ errorMessage }}</div>
            <div v-if="successMessage" class="profile-msg success">{{ successMessage }}</div>

            <div v-if="storeStatusBanner" class="store-banner" :class="`banner-${storeStatusBanner.type}`">
                <div class="banner-icon"><i class="fa-solid" :class="storeStatusBanner.icon"></i></div>
                <div class="banner-text">
                    <strong>{{ storeStatusBanner.title }}</strong>
                    <p>{{ storeStatusBanner.desc }}</p>
                </div>
            </div>

            <form @submit.prevent="submit">
                <div class="profile-avatar-wrap">
                    <img :src="avatarSrc" alt="รูปโปรไฟล์" class="profile-avatar" />
                    <label class="profile-avatar-btn">
                        <i class="fa-solid fa-camera"></i>
                        <input type="file" accept="image/*" @change="onPickAvatar" />
                    </label>
                </div>

                <div class="profile-display-name">{{ displayName }}</div>

                <div class="profile-grid">
                    <div class="profile-field full">
                        <label>ชื่อผู้ใช้งาน (Username)</label>
                        <input type="text" class="readonly" :value="profile.username_pharma" readonly />
                    </div>

                    <div class="profile-field">
                        <label>อายุ</label>
                        <input type="text" class="readonly" :value="`${profile.age_pharma} ปี`" readonly />
                    </div>
                    <div class="profile-field">
                        <label>เพศ</label>
                        <input type="text" class="readonly" :value="genderLabel" readonly />
                    </div>

                    <div class="profile-field full">
                        <label>หมายเลขโทรศัพท์ <span class="req">*</span></label>
                        <input v-model="phonePharma" type="text" class="editable" required />
                    </div>

                    <div class="profile-field full">
                        <label>อีเมลวิชาชีพ</label>
                        <input type="email" class="readonly" :value="profile.email_pharma" readonly />
                    </div>

                    <div class="profile-field full">
                        <label>ตารางเวลาปฏิบัติงาน <span class="req">*</span></label>
                        <div
                            v-for="(row, index) in schedules"
                            :key="index"
                            class="profile-schedule-row"
                        >
                            <select v-model="row.day" class="editable">
                                <option v-for="d in DAYS" :key="d" :value="d">{{ DAY_LABELS[d] || d }}</option>
                            </select>
                            <input v-model="row.start" type="time" class="editable" />
                            <span style="font-size: 12px; color: #64748b;">ถึง</span>
                            <input v-model="row.end" type="time" class="editable" />
                            <button
                                v-if="index === 0"
                                type="button"
                                class="profile-btn-icon profile-btn-add"
                                title="เพิ่มช่วงเวลา"
                                @click="addSchedule"
                            >
                                <i class="fa-solid fa-plus"></i>
                            </button>
                            <button
                                v-else
                                type="button"
                                class="profile-btn-icon profile-btn-remove"
                                title="ลบ"
                                @click="removeSchedule(index)"
                            >
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div class="profile-field full">
                        <label>ร้านยาที่ทำงานอยู่ <span class="req">*</span></label>
                        <select v-model="idStore" class="editable">
                            <option value="">— ไม่มี (ลาออกจากร้าน) —</option>
                            <option v-for="s in stores" :key="s.id" :value="String(s.id)">
                                {{ s.name }}
                            </option>
                        </select>
                        <small class="hint">
                            <i class="fa-solid fa-circle-info"></i>
                            หากเปลี่ยนร้าน ระบบจะส่งคำขออนุมัติให้เจ้าของร้านใหม่โดยอัตโนมัติ
                        </small>
                    </div>

                    <div v-if="licenseUrl" class="profile-field full">
                        <label>ใบประกอบวิชาชีพเภสัช</label>
                        <div class="profile-license-box">
                            <img
                                :src="licenseUrl"
                                alt="ใบประกอบวิชาชีพ"
                                class="profile-license"
                                @click="openLicense"
                            />
                        </div>
                    </div>

                    <p class="profile-section-title">เปลี่ยนรหัสผ่าน (ไม่บังคับ)</p>

                    <div class="profile-field full">
                        <label>รหัสผ่านใหม่</label>
                        <input v-model="passwordNew" type="password" class="editable" autocomplete="new-password" />
                    </div>
                    <div class="profile-field full">
                        <label>ยืนยันรหัสผ่านใหม่</label>
                        <input v-model="passwordConfirm" type="password" class="editable" autocomplete="new-password" />
                    </div>
                </div>

                <button type="submit" class="profile-submit" :disabled="saving">
                    {{ saving ? 'กำลังบันทึก...' : 'อัปเดตข้อมูลโปรไฟล์' }}
                </button>
            </form>
        </div>

        <div v-else class="profile-card">
            <div class="profile-msg error">{{ errorMessage || 'ไม่พบข้อมูลโปรไฟล์' }}</div>
            <NuxtLink to="/auth/login-pharmacist" class="profile-back">เข้าสู่ระบบเภสัช</NuxtLink>
        </div>
        </div>
    </div>
</template>

