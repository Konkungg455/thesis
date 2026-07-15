<script setup>
import {
    PHONE_MAX_LENGTH,
    blockInvalidPhoneKeys,
    clampPhoneInputValue,
    validatePhoneMessage,
} from '~/utils/phone';

const { apiUrl, imagesAccount, apiBase } = useApiBase();
const { user } = useAuthUser();
const router = useRouter();

const loading = ref(true);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const profile = ref(null);
const phoneNumber = ref('');
const personalDisease = ref('');
const passwordNew = ref('');
const passwordConfirm = ref('');
const avatarPreview = ref('');
const avatarFile = ref(null);
const fileInput = ref(null);

/* ============ 🆕 ที่อยู่ของฉัน ============ */
const addressData = ref(null);
const isLoadingAddress = ref(true);
const hasAddress = computed(() => !!addressData.value);

const genderLabel = computed(() => {
    if (!profile.value?.gender) return '-';
    const g = String(profile.value.gender).trim();
    if (g === 'M' || g === 'ชาย') return 'ชาย';
    if (g === 'F' || g === 'หญิง') return 'หญิง';
    return g;
});

const fetchAddress = async () => {
    isLoadingAddress.value = true;
    try {
        const idAccount = profile.value?.id_account || user.value?.id_account || user.value?.id || 0;
        const res = await $fetch(apiUrl('vue-get-account-address.php'), {
            method: 'POST',
            credentials: 'include',
            body: idAccount ? { id_account: idAccount } : {},
        });
        addressData.value = (res?.status === 'success' && res.has_address) ? res.address : null;
    } catch (err) {
        console.warn('fetch address failed', err);
        addressData.value = null;
    } finally {
        isLoadingAddress.value = false;
    }
};

const formatAddressLine = (a) => {
    if (!a) return '';
    const parts = [];
    if (a.house_no) parts.push(a.house_no);
    const roadVal = a.road ?? a.moo;
    if (roadVal && roadVal !== '-' && roadVal !== 'ไม่มี') parts.push('ถ. ' + roadVal);
    if (a.sub_district) parts.push('ต.' + a.sub_district);
    if (a.district) parts.push('อ.' + a.district);
    if (a.province) parts.push('จ.' + a.province);
    if (a.zipcode) parts.push(a.zipcode);
    return parts.join(' ');
};

const goEditAddress = () => {
    const id = addressData.value?.id_account || profile.value?.id_account || 0;
    router.push(id ? `/auth/setup-address?account_id=${id}` : '/auth/setup-address');
};

const avatarSrc = computed(() => {
    if (avatarPreview.value) return avatarPreview.value;
    if (profile.value?.images_account) {
        return imagesAccount(profile.value.images_account);
    }
    return imagesAccount('default.png');
});

const loadProfile = async () => {
    loading.value = true;
    errorMessage.value = '';
    try {
        const res = await $fetch(apiUrl('vue-get-user-profile.php'), { credentials: 'include' });
        if (res.status !== 'success') {
            errorMessage.value = res.message || 'โหลดข้อมูลไม่สำเร็จ';
            return;
        }
        profile.value = res.data;
        phoneNumber.value = res.data.phone_number || '';
        personalDisease.value = res.data.personal_disease || '';
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

const onPhoneInput = () => {
    phoneNumber.value = clampPhoneInputValue(phoneNumber.value);
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

    const phoneErr = validatePhoneMessage(phoneNumber.value);
    if (phoneErr) {
        errorMessage.value = phoneErr;
        saving.value = false;
        return;
    }

    try {
        const body = new FormData();
        body.append('phone_number', phoneNumber.value);
        body.append('personal_disease', personalDisease.value);
        if (passwordNew.value) {
            body.append('password_new', passwordNew.value);
            body.append('password_confirm', passwordConfirm.value);
        }
        if (avatarFile.value) {
            body.append('images_account', avatarFile.value);
        }

        const res = await $fetch(apiUrl('vue-update-user-profile.php'), {
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

onMounted(async () => {
    await loadProfile();
    await fetchAddress();
});
</script>

<template>
    <div class="profile-shell">
        <NuxtLink to="/" class="profile-back">
            <i class="fa-solid fa-arrow-left"></i> กลับหน้าหลัก
        </NuxtLink>

        <div class="profile-wrap">
        <div v-if="loading" class="profile-loading">
            <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...
        </div>

        <div v-else-if="profile" class="profile-card">
            <h1 class="profile-title">Profile</h1>

            <div v-if="errorMessage" class="profile-msg error">{{ errorMessage }}</div>
            <div v-if="successMessage" class="profile-msg success">{{ successMessage }}</div>

            <form @submit.prevent="submit">
                <div class="profile-avatar-wrap">
                    <img :src="avatarSrc" alt="รูปโปรไฟล์" class="profile-avatar" />
                    <label class="profile-avatar-btn">
                        <i class="fa-solid fa-camera"></i>
                        <input ref="fileInput" type="file" accept="image/*" @change="onPickAvatar" />
                    </label>
                </div>

                <div class="profile-display-name">{{ profile.username_account }}</div>

                <div class="profile-grid">
                    <div class="profile-field full">
                        <label>User <span class="req">*</span></label>
                        <input type="text" class="readonly" :value="profile.username_account" readonly />
                    </div>

                    <div class="profile-field">
                        <label>ชื่อ <span class="req">*</span></label>
                        <input type="text" class="readonly" :value="profile.firstname" readonly />
                    </div>
                    <div class="profile-field">
                        <label>นามสกุล <span class="req">*</span></label>
                        <input type="text" class="readonly" :value="profile.lastname" readonly />
                    </div>

                    <div class="profile-field">
                        <label>เพศ</label>
                        <input type="text" class="readonly" :value="genderLabel" readonly />
                    </div>
                    <div class="profile-field">
                        <label>อายุ</label>
                        <input type="text" class="readonly" :value="profile.old" readonly />
                    </div>

                    <div class="profile-field">
                        <label>ส่วนสูง</label>
                        <input type="text" class="readonly" :value="profile.height" readonly />
                    </div>
                    <div class="profile-field">
                        <label>น้ำหนัก</label>
                        <input type="text" class="readonly" :value="profile.weight" readonly />
                    </div>

                    <div class="profile-field full">
                        <label>หมายเลขโทรศัพท์ <span class="req">*</span></label>
                        <input
                            v-model="phoneNumber"
                            type="text"
                            class="editable"
                            inputmode="numeric"
                            :maxlength="PHONE_MAX_LENGTH"
                            required
                            @input="onPhoneInput"
                            @keydown="blockInvalidPhoneKeys"
                        />
                    </div>

                    <div class="profile-field full">
                        <label>อีเมล</label>
                        <input type="email" class="readonly" :value="profile.email_account" readonly />
                    </div>

                    <div class="profile-field full">
                        <label>โรคประจำตัว</label>
                        <input v-model="personalDisease" type="text" class="editable" />
                    </div>

                    <!-- 🆕 ที่อยู่จัดส่ง -->
                    <div class="profile-field full">
                        <label>
                            <i class="fa-solid fa-location-dot" style="color:#6366f1;"></i>
                            ที่อยู่จัดส่ง
                        </label>
                        <div class="addr-box" v-if="!isLoadingAddress">
                            <template v-if="hasAddress">
                                <div class="addr-box__body">
                                    <div class="addr-box__line">{{ formatAddressLine(addressData) }}</div>
                                    <div class="addr-box__meta" v-if="addressData?.updated_at">
                                        <i class="fa-regular fa-clock"></i>
                                        อัปเดตล่าสุด {{ new Date(addressData.updated_at.replace(' ','T')).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) }}
                                    </div>
                                </div>
                                <button type="button" class="addr-box__btn addr-box__btn--edit" @click="goEditAddress">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                    แก้ไขที่อยู่
                                </button>
                            </template>
                            <template v-else>
                                <div class="addr-box__body addr-box__body--empty">
                                    <i class="fa-solid fa-circle-info"></i>
                                    คุณยังไม่ได้ตั้งค่าที่อยู่จัดส่ง
                                </div>
                                <button type="button" class="addr-box__btn addr-box__btn--add" @click="goEditAddress">
                                    <i class="fa-solid fa-plus"></i>
                                    เพิ่มที่อยู่
                                </button>
                            </template>
                        </div>
                        <div v-else class="addr-box addr-box--loading">
                            <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดที่อยู่...
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
                    {{ saving ? 'กำลังบันทึก...' : 'อัปเดตข้อมูล' }}
                </button>
            </form>
        </div>

        <div v-else class="profile-card">
            <div class="profile-msg error">{{ errorMessage || 'ไม่พบข้อมูลโปรไฟล์' }}</div>
            <NuxtLink to="/auth/login-user" class="profile-back">เข้าสู่ระบบ</NuxtLink>
        </div>
        </div>
    </div>
</template>

<style scoped>
/* ============ 🆕 ที่อยู่จัดส่ง — Address Box ============ */
.addr-box {
    margin-top: 6px;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1.5px solid #e2e8f0;
    border-radius: 14px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    transition: all 0.2s ease;
}
.addr-box:hover {
    border-color: #6366f1;
    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.10);
}
.addr-box--loading {
    color: #64748b;
    font-size: 0.9rem;
    justify-content: center;
}

.addr-box__body {
    flex: 1;
    min-width: 200px;
    color: #1e293b;
}
.addr-box__line {
    font-weight: 600;
    line-height: 1.55;
    word-break: break-word;
    margin-bottom: 4px;
}
.addr-box__meta {
    color: #94a3b8;
    font-size: 0.78rem;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.addr-box__body--empty {
    color: #94a3b8;
    font-style: italic;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.addr-box__body--empty i { color: #cbd5e1; }

.addr-box__btn {
    border: none;
    cursor: pointer;
    padding: 10px 18px;
    border-radius: 10px;
    font-size: 0.88rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s ease;
    white-space: nowrap;
}
.addr-box__btn--edit {
    background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.30);
}
.addr-box__btn--edit:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(99, 102, 241, 0.42);
    filter: brightness(1.05);
}
.addr-box__btn--add {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.28);
}
.addr-box__btn--add:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(16, 185, 129, 0.40);
    filter: brightness(1.05);
}

@media (max-width: 600px) {
    .addr-box { flex-direction: column; align-items: stretch; }
    .addr-box__btn { justify-content: center; width: 100%; }
}
</style>

