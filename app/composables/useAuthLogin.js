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
                timeout: 12_000,
            });

            if (data.status === 'success') {
                saveUserSession(data.user, config.value.role);
                if (import.meta.client && remember.value) {
                    localStorage.setItem(`remember_email_${roleKey}`, email.value.trim());
                }
                // ปล่อยปุ่มทันที — ไม่รอหน้าใหม่โหลดเสร็จ (กัน "กำลังตรวจสอบ" ค้างนาน)
                isLoading.value = false;
                router.push(resolveRedirect(data));
                return;
            }

            if (data.status === 'pending' || data.status === 'rejected') {
                errorMessage.value = data.message || 'ไม่สามารถเข้าสู่ระบบได้';
                return;
            }

            errorMessage.value = data.message || 'เข้าสู่ระบบไม่สำเร็จ';
        } catch (err) {
            console.error('Login error:', err);
            const timedOut = err?.name === 'FetchError' && /timeout|aborted/i.test(String(err?.message || ''));
            errorMessage.value = timedOut
                ? 'เซิร์ฟเวอร์ตอบช้าเกินไป — รอ Nuxt เปิดเสร็จแล้วลองใหม่ (หรือใช้ npm run dev:nuxt)'
                : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่';
        } finally {
            isLoading.value = false;
        }
    };

    onMounted(() => {
        if (!import.meta.client) return;
        const savedEmail = localStorage.getItem(`remember_email_${roleKey}`);
        if (savedEmail) {
            email.value = savedEmail;
            remember.value = true;
        }
    });

    watch(remember, (val) => {
        if (!import.meta.client) return;
        const key = `remember_email_${roleKey}`;
        if (val && email.value) {
            localStorage.setItem(key, email.value.trim());
        } else {
            localStorage.removeItem(key);
        }
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
