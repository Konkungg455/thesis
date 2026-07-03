import { ref, computed } from 'vue';
import { useAuthConfig } from '~/composables/useAuthConfig';
import { useAuthUser } from '~/composables/useAuthUser';

export function useAuthLogin(roleKey) {
    const router = useRouter();
    const { loginConfigs } = useAuthConfig();
    const { persistUser } = useAuthUser();
    const config = computed(() => loginConfigs.value[roleKey]);

    const email = ref('');
    const password = ref('');
    const remember = ref(false);
    const showPassword = ref(false);
    const isLoading = ref(false);
    const errorMessage = ref('');

    const saveUserSession = (userData, role) => {
        if (!userData) return;
        persistUser({ ...userData, role: userData.role || role });
    };

    const resolveRedirect = (data) => {
        if (data?.redirect) {
            try {
                const url = new URL(data.redirect);
                return url.pathname + url.search;
            } catch {
                return data.redirect;
            }
        }
        return config.value.defaultRedirect;
    };

    const emailKey = `remember_email_${roleKey}`;
    const passwordKey = `remember_password_${roleKey}`;

    const saveRememberedCredentials = () => {
        if (!import.meta.client) return;
        localStorage.setItem(emailKey, email.value.trim());
        localStorage.setItem(passwordKey, password.value);
    };

    const clearRememberedCredentials = () => {
        if (!import.meta.client) return;
        localStorage.removeItem(emailKey);
        localStorage.removeItem(passwordKey);
    };

    const loadRememberedCredentials = () => {
        if (!import.meta.client) return;
        const savedEmail = localStorage.getItem(emailKey);
        if (!savedEmail) return;
        email.value = savedEmail;
        const savedPassword = localStorage.getItem(passwordKey);
        if (savedPassword) password.value = savedPassword;
        remember.value = true;
    };

    const login = async () => {
        errorMessage.value = '';
        if (!email.value.trim() || !password.value) {
            errorMessage.value = 'กรุณากรอกอีเมลและรหัสผ่าน';
            return;
        }

        isLoading.value = true;
        try {
            const body = {
                email_account: email.value.trim(),
                password_account: password.value,
                remember: remember.value
            };

            const data = await $fetch(config.value.endpoint, {
                method: 'POST',
                body,
                credentials: 'include',
            });

            if (data.status === 'success') {
                saveUserSession(data.user, config.value.role);
                if (import.meta.client) {
                    if (remember.value) {
                        saveRememberedCredentials();
                    } else {
                        clearRememberedCredentials();
                    }
                }
                // ปล่อยปุ่มทันที — ไม่รอหน้าใหม่โหลดเสร็จ (กัน "กำลังตรวจสอบ" ค้างนาน)
                isLoading.value = false;
                router.push(resolveRedirect(data));
                return;
            }

            if (data.status === 'pending' || data.status === 'rejected' || data.status === 'locked') {
                errorMessage.value = data.message || 'ไม่สามารถเข้าสู่ระบบได้';
                return;
            }

            errorMessage.value = data.message || 'เข้าสู่ระบบไม่สำเร็จ';
        } catch (err) {
            console.error('Login error:', err);
            errorMessage.value = err?.data?.message
                || err?.response?._data?.message
                || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่';
        } finally {
            isLoading.value = false;
        }
    };

    onMounted(() => {
        loadRememberedCredentials();
    });

    watch(remember, (val) => {
        if (!import.meta.client) return;
        if (val && email.value) {
            saveRememberedCredentials();
        } else if (!val) {
            clearRememberedCredentials();
        }
    });

    watch([email, password], () => {
        if (!import.meta.client || !remember.value) return;
        saveRememberedCredentials();
    });

    return {
        config: computed(() => config.value),
        email,
        password,
        remember,
        showPassword,
        isLoading,
        errorMessage,
        login
    };
}
