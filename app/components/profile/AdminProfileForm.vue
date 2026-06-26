<script setup>
const { apiUrl, imagesAccount } = useApiBase();
const { persistUser } = useAuthUser();

const loading = ref(true);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const profile = ref(null);
const phoneNumber = ref('');
const passwordNew = ref('');
const passwordConfirm = ref('');
const avatarPreview = ref('');
const avatarFile = ref(null);
const fileInput = ref(null);
const avatarVersion = ref(Date.now());

const avatarSrc = computed(() => {
    if (avatarPreview.value) return avatarPreview.value;
    const file = profile.value?.images_account;
    if (file && file !== 'default.png') {
        return `${imagesAccount(file)}?v=${avatarVersion.value}`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.value?.username_account || 'Admin')}&background=00469c&color=fff&size=160`;
});

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

        if (res.data.role_account !== 'admin') {
            errorMessage.value = 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น';
            profile.value = null;
        }
    } catch {
        errorMessage.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    } finally {
        loading.value = false;
    }
};

const onPickAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
        errorMessage.value = 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP';
        e.target.value = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        errorMessage.value = 'ขนาดไฟล์ต้องไม่เกิน 5 MB';
        e.target.value = '';
        return;
    }
    errorMessage.value = '';
    avatarFile.value = file;
    avatarPreview.value = URL.createObjectURL(file);
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
        body.append('phone_number', phoneNumber.value);
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

        if (avatarFile.value && !res.new_image) {
            errorMessage.value = 'อัปโหลดรูปโปรไฟล์ไม่สำเร็จ กรุณาใช้ไฟล์ JPG, PNG หรือ WEBP';
            return;
        }

        successMessage.value = res.message || 'อัปเดตข้อมูลสำเร็จ';
        if (res.user) {
            persistUser(res.user);
        }
        passwordNew.value = '';
        passwordConfirm.value = '';
        avatarFile.value = null;
        avatarPreview.value = '';
        if (fileInput.value) fileInput.value = '';
        avatarVersion.value = Date.now();
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
        <NuxtLink to="/admin_dashboard_page" class="profile-back">
            <i class="fa-solid fa-arrow-left"></i> กลับไปแผงควบคุม
        </NuxtLink>

        <div class="profile-wrap">
            <div v-if="loading" class="profile-loading">
                <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...
            </div>

            <div v-else-if="profile" class="profile-card">
                <h1 class="profile-title">Profile</h1>
                <div class="profile-badge-wrap">
                    <span class="profile-badge profile-badge-admin">
                        <i class="fa-solid fa-shield-halved"></i> ผู้ดูแลระบบ
                    </span>
                </div>

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
                            <input type="text" class="readonly" :value="profile.gender" readonly />
                        </div>
                        <div class="profile-field">
                            <label>อายุ</label>
                            <input type="text" class="readonly" :value="profile.old" readonly />
                        </div>

                        <div v-if="!profile.is_admin_table" class="profile-field">
                            <label>ส่วนสูง</label>
                            <input type="text" class="readonly" :value="profile.height" readonly />
                        </div>
                        <div v-if="!profile.is_admin_table" class="profile-field">
                            <label>น้ำหนัก</label>
                            <input type="text" class="readonly" :value="profile.weight" readonly />
                        </div>

                        <div class="profile-field full">
                            <label>หมายเลขโทรศัพท์ <span class="req">*</span></label>
                            <input v-model="phoneNumber" type="text" class="editable" required />
                        </div>

                        <div class="profile-field full">
                            <label>อีเมล</label>
                            <input type="email" class="readonly" :value="profile.email_account" readonly />
                        </div>

                        <p class="profile-section-title">เปลี่ยนรหัสผ่าน (ไม่บังคับ)</p>

                        <div class="profile-field full">
                            <label>รหัสผ่านใหม่</label>
                            <input v-model="passwordNew" type="password" class="editable" autocomplete="new-password" />
                        </div>
                        <div class="profile-field full">
                            <label>ยืนยันรหัสผ่านใหม่</label>
                            <input v-model="passwordConfirm" type="password" class="editable"
                                   autocomplete="new-password" />
                        </div>
                    </div>

                    <button type="submit" class="profile-submit" :disabled="saving">
                        {{ saving ? 'กำลังบันทึก...' : 'อัปเดตข้อมูล' }}
                    </button>
                </form>
            </div>

            <div v-else class="profile-card">
                <div class="profile-msg error">{{ errorMessage || 'ไม่พบข้อมูลโปรไฟล์' }}</div>
                <NuxtLink to="/auth" class="profile-back">เข้าสู่ระบบ</NuxtLink>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* badge "ผู้ดูแลระบบ" — โทนสีน้ำเงิน/ทองเพื่อแยกความเป็น admin */
.profile-badge-admin {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e;
    border: 1px solid #fcd34d;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.profile-badge-admin i {
    color: #d97706;
}
</style>
