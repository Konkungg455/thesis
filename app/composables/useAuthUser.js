import { computed } from 'vue';

/**
 * สถานะผู้ใช้ร่วมทั้งแอป (Header / pharmacy_header)
 * ใช้ useNuxtApp() โดยตรง แทน useApiBase() เพื่อไม่พังตอน SSR/ngrok
 */
export function useAuthUser() {
    const user = useState('auth-user', () => null);
    const nuxtApp = useNuxtApp();
    const getBase = () => nuxtApp.$getApiBase();

    const apiBase = computed(() => getBase());
    const apiUrl = (path) => nuxtApp.$apiUrl(path);
    const imagesAccount = (file) => `${apiBase.value}/images_account/${file}`;
    const imagesPharma = (file) => `${apiBase.value}/images_pharma/${file}`;

    const displayName = computed(() => {
        if (!user.value) return '';
        return (
            user.value.username
            || user.value.firstname
            || user.value.username_account
            || 'ผู้ใช้งาน'
        );
    });

    const profileImageUrl = computed(() => {
        if (!user.value?.image) {
            return 'https://via.placeholder.com/40';
        }
        const role = user.value.role;
        const file = user.value.image;
        if (role === 'pharmacist') {
            return imagesPharma(file);
        }
        if (role === 'store') {
            return `${apiBase.value}/uploads/store_profiles/${file}`;
        }
        return imagesAccount(file);
    });

    const persistUser = (payload) => {
        if (!import.meta.client || !payload) return;
        let role = payload.role || payload.role_account || null;
        if (role === 'member') role = 'user';
        if (!role) {
            if (Number(payload.id_account_admin) > 0) role = 'admin';
            else if (Number(payload.id_pharma) > 0) role = 'pharmacist';
            else if (Number(payload.id_store_accounts) > 0 || payload.store_id) role = 'store';
            else if (Number(payload.id_account) > 0) role = 'user';
        }
        const normalized = { ...payload, role };
        user.value = normalized;
        localStorage.setItem('user_data', JSON.stringify(normalized));
        if (role) {
            localStorage.setItem('user_role', role);
        }
    };

    const clearUser = () => {
        user.value = null;
        if (import.meta.client) {
            localStorage.removeItem('user_data');
            localStorage.removeItem('user_role');
        }
    };

    const loadFromStorage = () => {
        if (!import.meta.client) return;
        const saved = localStorage.getItem('user_data');
        if (!saved) return;
        try {
            const parsed = JSON.parse(saved);
            persistUser(parsed);
        } catch {
            localStorage.removeItem('user_data');
            localStorage.removeItem('user_role');
        }
    };

    const syncFromServer = async () => {
        loadFromStorage();
        try {
            const response = await $fetch(apiUrl('get-user-session.php'), {
                credentials: 'include',
            });
            if (response.authenticated && response.user) {
                const u = { ...response.user };
                if (u.role === 'member') u.role = 'user';
                persistUser(u);
                return true;
            }
            if (response?.status === 'deleted') {
                clearUser();
                return false;
            }
            if (!user.value) {
                clearUser();
            }
            return false;
        } catch (err) {
            console.warn('syncFromServer failed, using cached user if any:', err);
            return !!user.value;
        }
    };

    return {
        user,
        displayName,
        profileImageUrl,
        persistUser,
        clearUser,
        loadFromStorage,
        syncFromServer,
    };
}
