<script setup>
const { apiUrl, imagesAccount } = useApiBase();
const { persistUser } = useAuthUser();

const DAY_OPTIONS = [
    { code: 'Mon', label: 'จันทร์' },
    { code: 'Tue', label: 'อังคาร' },
    { code: 'Wed', label: 'พุธ' },
    { code: 'Thu', label: 'พฤหัสบดี' },
    { code: 'Fri', label: 'ศุกร์' },
    { code: 'Sat', label: 'เสาร์' },
    { code: 'Sun', label: 'อาทิตย์' }
];

// ค่าเริ่มต้นวันทำการ: จันทร์–ศุกร์ (5 วัน) — เพิ่มวัน/แก้เวลาได้
const DEFAULT_WORKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const makeDefaultSchedules = () =>
    DEFAULT_WORKDAYS.map((day) => ({ day, start: '08:00', end: '20:00' }));

const loading = ref(true);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const profile = ref(null);

const acc = ref({
    username: '',
    firstname: '',
    lastname: '',
    personal_phone: '',
    personal_email: ''
});
const det = ref({
    store_name: '',
    house_no: '',
    road: '',
    sub_district: '',
    district: '',
    province: '',
    zipcode: '',
    store_phone: '',
    store_email: '',
    google_maps_url: '',
    bank_name: '',
    bank_account_name: '',
    bank_account_number: ''
});
const schedules = ref(makeDefaultSchedules());
const passwordNew = ref('');
const passwordConfirm = ref('');

const licenseUrl = ref('');
const licenseFile = ref(null);
const licensePreview = ref('');

const profileUrl = ref('');
const avatarFile = ref(null);
const avatarPreview = ref('');

const qrPaymentUrl = ref('');
const qrPaymentFile = ref(null);
const qrPaymentPreview = ref('');

const avatarSrc = computed(() => {
    if (avatarPreview.value) return avatarPreview.value;
    if (profileUrl.value) return apiUrl(profileUrl.value);
    return imagesAccount('default.png');
});

const onPickAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    avatarFile.value = file;
    avatarPreview.value = URL.createObjectURL(file);
};

const loadProfile = async () => {
    loading.value = true;
    errorMessage.value = '';
    try {
        const res = await $fetch(apiUrl('vue-get-store-profile.php'), { credentials: 'include' });
        if (res.status !== 'success') {
            errorMessage.value = res.message || 'โหลดข้อมูลไม่สำเร็จ';
            return;
        }
        profile.value = res.data;
        acc.value = {
            username: res.data.username || '',
            firstname: res.data.firstname || '',
            lastname: res.data.lastname || '',
            personal_phone: res.data.personal_phone || '',
            personal_email: res.data.personal_email || ''
        };
        det.value = {
            store_name: res.data.details.store_name || '',
            house_no: res.data.details.house_no || '',
            road: res.data.details.road ?? res.data.details.moo ?? '',
            sub_district: res.data.details.sub_district || '',
            district: res.data.details.district || '',
            province: res.data.details.province || '',
            zipcode: res.data.details.zipcode || '',
            store_phone: res.data.details.store_phone || '',
            store_email: res.data.details.store_email || '',
            google_maps_url: res.data.details.google_maps_url || '',
            bank_name: res.data.details.bank_name || '',
            bank_account_name: res.data.details.bank_account_name || '',
            bank_account_number: res.data.details.bank_account_number || ''
        };
        const opens = (res.data.schedules || []).filter((s) => s.is_open);
        schedules.value = opens.length
            ? opens.map((s) => ({ day: s.day_of_week, start: s.open_time || '08:00', end: s.close_time || '20:00' }))
            : makeDefaultSchedules();
        licenseUrl.value = res.data.license_url ? apiUrl(res.data.license_url) : '';
        profileUrl.value = res.data.profile_url || '';
        qrPaymentUrl.value = res.data.details.qr_payment_url ? apiUrl(res.data.details.qr_payment_url) : '';
        avatarFile.value = null;
        avatarPreview.value = '';
        qrPaymentFile.value = null;
        qrPaymentPreview.value = '';
    } catch {
        errorMessage.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    } finally {
        loading.value = false;
    }
};

const onPickLicense = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    licenseFile.value = file;
    licensePreview.value = URL.createObjectURL(file);
};

const onPickQrPayment = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    qrPaymentFile.value = file;
    qrPaymentPreview.value = URL.createObjectURL(file);
};

const addSchedule = () => {
    // ขึ้นวันถัดไปต่อจากแถวล่าสุด และใช้เวลาเดียวกับแถวล่าสุด
    const order = DAY_OPTIONS.map((o) => o.code);
    const last = schedules.value[schedules.value.length - 1]
        || { day: order[0], start: '08:00', end: '20:00' };
    const idx = order.indexOf(last.day);
    const nextDay = order[(idx + 1) % order.length];
    schedules.value.push({ day: nextDay, start: last.start, end: last.end });
};
const removeSchedule = (i) => {
    if (schedules.value.length <= 1) return;
    schedules.value.splice(i, 1);
};

/* ---- ระบบกรอกที่อยู่อัตโนมัติ ---- */
const { search: searchAddress, preload: preloadAddress } = useThaiAddress();
const addrSuggestions = ref([]);
const showAddrSuggest = ref(false);
const activeAddrField = ref('');
let addrTimer = null;

const onAddrInput = (field) => {
    activeAddrField.value = field;
    const q = field === 'zipcode' ? det.value.zipcode : det.value.sub_district;
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
    det.value.sub_district = item.subDistrict;
    det.value.district = item.district;
    det.value.province = item.province;
    det.value.zipcode = item.zipcode;
    showAddrSuggest.value = false;
    addrSuggestions.value = [];
};

const hideAddrSuggestSoon = () => {
    setTimeout(() => { showAddrSuggest.value = false; }, 150);
};

onMounted(() => preloadAddress());


const submit = async () => {
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
        body.append('firstname', acc.value.firstname);
        body.append('lastname', acc.value.lastname);
        body.append('personal_phone', acc.value.personal_phone);

        body.append('store_name', det.value.store_name);
        body.append('house_no', det.value.house_no);
        body.append('road', det.value.road);
        body.append('sub_district', det.value.sub_district);
        body.append('district', det.value.district);
        body.append('province', det.value.province);
        body.append('zipcode', det.value.zipcode);
        body.append('store_phone', det.value.store_phone);
        body.append('store_email', det.value.store_email);
        body.append('google_maps_url', det.value.google_maps_url);
        body.append('bank_name', det.value.bank_name);
        body.append('bank_account_name', det.value.bank_account_name);
        body.append('bank_account_number', det.value.bank_account_number);

        schedules.value.forEach((s) => {
            if (s.day && s.start && s.end) {
                body.append('work_day[]', s.day);
                body.append('open_time[]', s.start);
                body.append('close_time[]', s.end);
            }
        });

        if (passwordNew.value) {
            body.append('password_new', passwordNew.value);
            body.append('password_confirm', passwordConfirm.value);
        }
        if (licenseFile.value) {
            body.append('license_file', licenseFile.value);
        }
        if (avatarFile.value) {
            body.append('profile_store_account', avatarFile.value);
        }
        if (qrPaymentFile.value) {
            body.append('qr_payment_file', qrPaymentFile.value);
        }

        const res = await $fetch(apiUrl('vue-update-store-profile.php'), {
            method: 'POST',
            body,
            credentials: 'include'
        });

        if (res.status !== 'success') {
            errorMessage.value = res.message || 'บันทึกไม่สำเร็จ';
            return;
        }

        successMessage.value = res.message || 'บันทึกข้อมูลสำเร็จ';
        if (res.user) persistUser(res.user);
        passwordNew.value = '';
        passwordConfirm.value = '';
        licenseFile.value = null;
        licensePreview.value = '';
        qrPaymentFile.value = null;
        qrPaymentPreview.value = '';
        await loadProfile();
    } catch {
        errorMessage.value = 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่';
    } finally {
        saving.value = false;
    }
};

onMounted(loadProfile);
</script>

<template>
    <div class="profile-shell">
        <NuxtLink to="/shop/shop_detail" class="profile-back">
            <i class="fa-solid fa-arrow-left"></i> กลับหน้าหลัก
        </NuxtLink>

        <div class="profile-wrap wide">
            <div v-if="loading" class="profile-loading">
                <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...
            </div>

            <div v-else-if="profile" class="profile-card">
                <h1 class="profile-title">แก้ไขประวัติร้านยา</h1>
                <div class="profile-badge-wrap">
                    <span class="profile-badge store-badge">
                        <i class="fa-solid fa-store"></i> เจ้าของร้านยา
                    </span>
                </div>

                <div v-if="errorMessage" class="profile-msg error">{{ errorMessage }}</div>
                <div v-if="successMessage" class="profile-msg success">{{ successMessage }}</div>

                <form @submit.prevent="submit">
                    <!-- รูปโปรไฟล์เจ้าของร้าน -->
                    <div class="profile-avatar-wrap">
                        <img :src="avatarSrc" alt="รูปโปรไฟล์เจ้าของร้าน" class="profile-avatar" />
                        <label class="profile-avatar-btn">
                            <i class="fa-solid fa-camera"></i>
                            <input type="file" accept="image/*" @change="onPickAvatar" />
                        </label>
                    </div>

                    <!-- ===== ส่วนที่ 1: ข้อมูลส่วนตัวเจ้าของร้าน ===== -->
                    <h3 class="section-head"><i class="fa-solid fa-user"></i> ข้อมูลส่วนตัวเจ้าของร้าน</h3>
                    <div class="profile-grid">
                        <div class="profile-field full">
                            <label>ชื่อผู้ใช้งาน (Username)</label>
                            <input type="text" class="readonly" :value="acc.username" readonly />
                        </div>
                        <div class="profile-field">
                            <label>ชื่อจริง <span class="req">*</span></label>
                            <input v-model="acc.firstname" type="text" class="editable" required />
                        </div>
                        <div class="profile-field">
                            <label>นามสกุล <span class="req">*</span></label>
                            <input v-model="acc.lastname" type="text" class="editable" required />
                        </div>
                        <div class="profile-field">
                            <label>เบอร์โทรส่วนตัว <span class="req">*</span></label>
                            <input v-model="acc.personal_phone" type="text" class="editable" required />
                        </div>
                        <div class="profile-field">
                            <label>อีเมลส่วนตัว</label>
                            <input type="email" class="readonly" :value="acc.personal_email" readonly />
                        </div>
                    </div>

                    <!-- ===== ส่วนที่ 2: ข้อมูลร้านยา ===== -->
                    <h3 class="section-head"><i class="fa-solid fa-shop"></i> ข้อมูลร้านยา</h3>
                    <div class="profile-grid">
                        <div class="profile-field full">
                            <label>ชื่อร้าน <span class="req">*</span></label>
                            <input v-model="det.store_name" type="text" class="editable" required />
                        </div>
                        <div class="profile-field">
                            <label>บ้านเลขที่ <span class="req">*</span></label>
                            <input v-model="det.house_no" type="text" class="editable" required />
                        </div>
                        <div class="profile-field">
                            <label>ถนน</label>
                            <input v-model="det.road" type="text" class="editable" />
                        </div>
                        <div class="profile-field addr-field">
                            <label>ตำบล <span class="req">*</span></label>
                            <input v-model="det.sub_district" type="text" class="editable"
                                   autocomplete="off" placeholder="พิมพ์ชื่อตำบล"
                                   @input="onAddrInput('sub_district')"
                                   @focus="onAddrInput('sub_district')"
                                   @blur="hideAddrSuggestSoon" required />
                            <ul v-if="showAddrSuggest && activeAddrField === 'sub_district' && addrSuggestions.length"
                                class="addr-suggest">
                                <li v-for="(s, idx) in addrSuggestions" :key="idx"
                                    @mousedown.prevent="pickAddress(s)">
                                    <i class="fa-solid fa-location-dot"></i> {{ s.label }}
                                </li>
                            </ul>
                        </div>
                        <div class="profile-field">
                            <label>อำเภอ <span class="req">*</span></label>
                            <input v-model="det.district" type="text" class="editable" required />
                        </div>
                        <div class="profile-field">
                            <label>จังหวัด <span class="req">*</span></label>
                            <input v-model="det.province" type="text" class="editable" required />
                        </div>
                        <div class="profile-field addr-field">
                            <label>รหัสไปรษณีย์ <span class="req">*</span></label>
                            <input v-model="det.zipcode" type="text" class="editable"
                                   autocomplete="off"
                                   @input="onAddrInput('zipcode')"
                                   @focus="onAddrInput('zipcode')"
                                   @blur="hideAddrSuggestSoon" required />
                            <ul v-if="showAddrSuggest && activeAddrField === 'zipcode' && addrSuggestions.length"
                                class="addr-suggest">
                                <li v-for="(s, idx) in addrSuggestions" :key="idx"
                                    @mousedown.prevent="pickAddress(s)">
                                    <i class="fa-solid fa-location-dot"></i> {{ s.label }}
                                </li>
                            </ul>
                        </div>
                        <div class="profile-field">
                            <label>เบอร์ร้าน <span class="req">*</span></label>
                            <input v-model="det.store_phone" type="text" class="editable" required />
                        </div>
                        <div class="profile-field">
                            <label>อีเมลร้าน <span class="req">*</span></label>
                            <input v-model="det.store_email" type="email" class="editable" required />
                        </div>

                        <!-- ตารางเวลาเปิดร้าน -->
                        <div class="profile-field full">
                            <label>เวลาเปิด-ปิดร้าน <span class="req">*</span></label>
                            <div
                                v-for="(row, index) in schedules"
                                :key="index"
                                class="profile-schedule-row"
                            >
                                <select v-model="row.day" class="editable">
                                    <option v-for="d in DAY_OPTIONS" :key="d.code" :value="d.code">{{ d.label }}</option>
                                </select>
                                <input v-model="row.start" type="time" class="editable" />
                                <span style="font-size: 12px; color: #64748b;">ถึง</span>
                                <input v-model="row.end" type="time" class="editable" />
                                <button
                                    v-if="index === 0"
                                    type="button"
                                    class="profile-btn-icon profile-btn-add"
                                    title="เพิ่มวัน"
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
                            <small class="hint">
                                <i class="fa-solid fa-circle-info"></i>
                                วันที่ไม่ได้ใส่ จะถูกบันทึกเป็น "ปิดทำการ"
                            </small>
                        </div>
                    </div>

                    <!-- ===== ส่วนที่ 3: ช่องทางชำระเงิน ===== -->
                    <h3 class="section-head">
                        <i class="fa-solid fa-credit-card"></i> ช่องทางชำระเงิน
                        <span class="optional-tag">ไม่บังคับ — ใช้แนบไปกับอีเมลใบสั่งยา</span>
                    </h3>
                    <div class="profile-grid">
                        <div class="profile-field">
                            <label>ธนาคาร</label>
                            <input v-model="det.bank_name" type="text" class="editable" placeholder="เช่น กสิกรไทย / ไทยพาณิชย์" />
                        </div>
                        <div class="profile-field">
                            <label>ชื่อบัญชี</label>
                            <input v-model="det.bank_account_name" type="text" class="editable" placeholder="ชื่อบัญชีร้านยา" />
                        </div>
                        <div class="profile-field full">
                            <label>เลขบัญชี</label>
                            <input v-model="det.bank_account_number" type="text" class="editable" inputmode="numeric" placeholder="เลขบัญชีธนาคาร" />
                        </div>
                        <div class="profile-field full">
                            <label>รูป QR Payment</label>
                            <div v-if="qrPaymentPreview || qrPaymentUrl" class="qr-payment-box">
                                <img
                                    :src="qrPaymentPreview || qrPaymentUrl"
                                    alt="QR Payment"
                                    class="qr-payment-img"
                                />
                            </div>
                            <input type="file" accept="image/*" @change="onPickQrPayment" class="editable" />
                            <small class="hint">
                                <i class="fa-solid fa-circle-info"></i>
                                รองรับ jpg, png, webp ระบบจะแนบรูปนี้ในอีเมลใบสั่งยาให้ลูกค้า
                            </small>
                        </div>
                    </div>

                    <!-- ===== ส่วนที่ 4: ตำแหน่งร้านบนแผนที่ ===== -->
                    <h3 class="section-head">
                        <i class="fa-solid fa-map-location-dot"></i> ตำแหน่งร้านบนแผนที่
                        <span class="optional-tag">สำหรับฟีเจอร์ "ค้นหาร้านยาใกล้ฉัน"</span>
                    </h3>
                    <div class="profile-grid">
                        <div class="profile-field full">
                            <label>ลิงก์ Google Maps ของร้าน</label>
                            <input
                                v-model="det.google_maps_url"
                                type="url"
                                class="editable"
                                placeholder="https://maps.app.goo.gl/..."
                            />
                            <div class="help-card">
                                <div class="help-title">
                                    <i class="fa-solid fa-circle-info"></i> วิธีคัดลอกลิงก์ร้าน (ทำครั้งเดียว)
                                </div>
                                <ol class="help-steps">
                                    <li>เปิดแอป Google Maps</li>
                                    <li>ค้นหาชื่อร้านยาของคุณ</li>
                                    <li>กดปุ่ม <b>"แชร์"</b> (รูปลูกศร <i class="fa-solid fa-share-nodes"></i>)</li>
                                    <li>กด <b>"คัดลอกลิงก์"</b></li>
                                    <li>กลับมาวางในช่องด้านบน แล้วกดอัปเดต</li>
                                </ol>
                                <p class="help-note">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                                    ระบบจะหาพิกัดร้านให้อัตโนมัติ คุณไม่ต้องกรอกอะไรเพิ่ม
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- ===== ส่วนที่ 5: ใบประกอบกิจการ ===== -->
                    <h3 class="section-head"><i class="fa-solid fa-id-card"></i> ใบประกอบกิจการ</h3>
                    <div class="profile-grid">
                        <div class="profile-field full">
                            <label>เอกสาร / รูปใบประกอบ</label>
                            <div v-if="licensePreview || licenseUrl" class="profile-license-box">
                                <img
                                    :src="licensePreview || licenseUrl"
                                    alt="ใบประกอบ"
                                    class="profile-license"
                                />
                            </div>
                            <input type="file" accept="image/*,application/pdf" @change="onPickLicense" class="editable" />
                            <small class="hint">
                                <i class="fa-solid fa-circle-info"></i>
                                รองรับ jpg, png, webp, pdf
                            </small>
                        </div>
                    </div>

                    <!-- ===== ส่วนที่ 6: เปลี่ยนรหัสผ่าน ===== -->
                    <h3 class="section-head"><i class="fa-solid fa-lock"></i> เปลี่ยนรหัสผ่าน (ไม่บังคับ)</h3>
                    <div class="profile-grid">
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
                        {{ saving ? 'กำลังบันทึก...' : 'อัปเดตข้อมูลร้านยา' }}
                    </button>
                </form>
            </div>

            <div v-else class="profile-card">
                <div class="profile-msg error">{{ errorMessage || 'ไม่พบข้อมูลร้านยา' }}</div>
                <NuxtLink to="/auth/login-store" class="profile-back">เข้าสู่ระบบเจ้าของร้าน</NuxtLink>
            </div>
        </div>
    </div>
</template>

<style scoped>
.store-badge {
    background: linear-gradient(135deg, #00469c, #0066d6) !important;
    color: white !important;
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

.section-head {
    margin: 30px 0 14px;
    font-size: 16px;
    color: #00469c;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.section-head:first-of-type { margin-top: 10px; }

.hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: #64748b;
    font-size: 0.8rem;
}

.optional-tag {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 400;
    margin-left: 8px;
}

.help-card {
    margin-top: 12px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 12px;
    padding: 16px 18px;
}
.help-title {
    font-weight: 600;
    color: #0369a1;
    margin-bottom: 10px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.help-steps {
    margin: 0;
    padding-left: 22px;
    color: #334155;
    font-size: 14px;
    line-height: 1.8;
}
.help-steps li b { color: #0369a1; }
.help-note {
    margin: 12px 0 0;
    padding: 10px 12px;
    background: #fef3c7;
    border-radius: 8px;
    color: #78350f;
    font-size: 13px;
    line-height: 1.5;
    display: flex;
    align-items: center;
    gap: 8px;
}

.qr-payment-box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 10px;
    padding: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
}
.qr-payment-img {
    width: 180px;
    max-width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: contain;
    border-radius: 8px;
    background: #fff;
}
</style>
