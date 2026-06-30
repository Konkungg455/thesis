import { computed } from 'vue';

/** กัน sync ซ้ำทุก Header / ทุกหน้า — ลดการยิง Supabase */
const SYNC_TTL_MS = 90_000;
let lastSyncAt = 0;
let syncInFlight = null;

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
    const imagesAccount = (file) => nuxtApp.$imagesAccount?.(file) ?? `${apiBase.value}/images_account/${file}`;
    const imagesPharma = (file) => nuxtApp.$imagesPharma?.(file) ?? `${apiBase.value}/images_pharma/${file}`;

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
            return nuxtApp.$storeProfileImage?.(file) ?? `${apiBase.value}/uploads/store_profiles/${file}`;
        }
        return imagesAccount(file);
    });

    const persistUser = (payload, options = {}) => {
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
        if (options.markSynced !== false) {
            lastSyncAt = Date.now();
        }
    };

    const clearUser = () => {
        user.value = null;
        lastSyncAt = 0;
        syncInFlight = null;
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
            persistUser(parsed, { markSynced: false });
        } catch {
            localStorage.removeItem('user_data');
            localStorage.removeItem('user_role');
        }
    };

    const performSync = async () => {
        const config = useRuntimeConfig();
        const useBff = Boolean(String(config.public.supabaseUrl || '').trim())
            && config.public.useSupabaseBackend !== false;

        if (useBff && user.value) {
            try {
                const u = user.value;
                const query = {};
                if (u.id_account) {
                    query.id_account = u.id_account;
                    query.username = u.username || u.username_account;
                    query.role = u.role || u.role_account;
                    query.image = u.image;
                }
                if (u.id_pharma) {
                    query.id_pharma = u.id_pharma;
                    query.username = u.username || u.username_pharma;
                    query.image = u.image;
                }
                if (u.id_store_accounts || u.store_id) {
                    query.id_store_accounts = u.id_store_accounts || u.store_id;
                    query.username = u.username || u.firstname;
                    query.image = u.image;
                }
                if (u.id_account_admin) {
                    query.id_account_admin = u.id_account_admin;
                    query.username = u.username || u.username_account;
                    query.image = u.image;
                }

                const response = await $fetch(apiUrl('get-user-session.php'), { query });
                if (response.authenticated && response.user) {
                    const parsed = { ...response.user };
                    if (parsed.role === 'member') parsed.role = 'user';
                    persistUser(parsed);
                    return true;
                }
                if (response?.status === 'deleted') {
                    clearUser();
                    return false;
                }
                return true;
            } catch (err) {
                console.warn('syncFromServer (bff) failed, using cached user:', err);
                return true;
            }
        }

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

    const syncFromServer = async (options = {}) => {
        loadFromStorage();

        const force = Boolean(options.force);
        if (!force && user.value && Date.now() - lastSyncAt < SYNC_TTL_MS) {
            return true;
        }

        if (syncInFlight && !force) {
            return syncInFlight;
        }

        syncInFlight = performSync();
        try {
            return await syncInFlight;
        } finally {
            syncInFlight = null;
            lastSyncAt = Date.now();
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
