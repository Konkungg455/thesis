import { computed } from 'vue';

export const AUTH_ROLES = {
    user: {
        key: 'user',
        label: 'ผู้ใช้งาน',
        loginPath: '/auth/login-user',
        registerPath: '/auth/register-user',
        verifyBackPath: '/auth/register-user-address',
        forgotPath: '/auth/forgot-user',
        verifyType: 'user'
    },
    pharmacist: {
        key: 'pharmacist',
        label: 'เภสัชกร',
        loginPath: '/auth/login-pharmacist',
        registerPath: '/auth/register-pharmacist',
        verifyBackPath: '/auth/register-pharmacist',
        forgotPath: '/auth/forgot-pharmacist',
        verifyType: 'pharmacist'
    },
    store: {
        key: 'store',
        label: 'เจ้าของร้าน',
        loginPath: '/auth/login-store',
        registerPath: '/auth/register-store',
        verifyBackPath: '/auth/register-store-shop',
        forgotPath: '/auth/forgot-store',
        verifyType: 'store'
    },
    admin: {
        key: 'admin',
        label: 'ผู้ดูแลระบบ',
        loginPath: '/auth/login-admin',
        registerPath: '/auth/register-admin',
        verifyBackPath: '/auth/register-admin',
        forgotPath: '/auth/forgot-admin',
        verifyType: 'admin'
    }
};

/** @returns {import('vue').ComputedRef<string>} */
export function useApiBaseRef() {
    const { $getApiBase } = useNuxtApp();
    return computed(() => $getApiBase());
}

export function buildLoginConfigs(apiBase) {
    const base = apiBase.replace(/\/$/, '');
    return {
        user: {
            role: 'user',
            title: 'เข้าสู่ระบบ',
            subtitle: 'TELEBOT-PHARMACY',
            endpoint: `${base}/process-login.php`,
            defaultRedirect: '/',
            registerPath: '/auth/register-user',
            forgotPath: '/auth/forgot-user',
            otherLogins: [
                { label: 'เภสัชกร', to: '/auth/login-pharmacist' },
                { label: 'เจ้าของร้าน', to: '/auth/login-store' },
                { label: 'ผู้ดูแลระบบ', to: '/auth/login-admin' }
            ]
        },
        pharmacist: {
            role: 'pharmacist',
            title: 'เข้าสู่ระบบ',
            subtitle: 'เภสัชกร',
            endpoint: `${base}/process-login-phamacy.php`,
            defaultRedirect: '/dashboard',
            registerPath: '/auth/register-pharmacist',
            forgotPath: '/auth/forgot-pharmacist',
            otherLogins: [
                { label: 'ผู้ใช้งาน', to: '/auth/login-user' },
                { label: 'เจ้าของร้าน', to: '/auth/login-store' },
                { label: 'ผู้ดูแลระบบ', to: '/auth/login-admin' }
            ]
        },
        store: {
            role: 'store',
            title: 'เข้าสู่ระบบ',
            subtitle: 'เจ้าของร้านยา',
            endpoint: `${base}/process-login-store.php`,
            defaultRedirect: '/shop/shop_detail',
            registerPath: '/auth/register-store',
            forgotPath: '/auth/forgot-store',
            otherLogins: [
                { label: 'ผู้ใช้งาน', to: '/auth/login-user' },
                { label: 'เภสัชกร', to: '/auth/login-pharmacist' },
                { label: 'ผู้ดูแลระบบ', to: '/auth/login-admin' }
            ]
        },
        admin: {
            role: 'admin',
            title: 'เข้าสู่ระบบ',
            subtitle: 'ผู้ดูแลระบบ',
            endpoint: `${base}/process-login-admin.php`,
            defaultRedirect: '/admin_dashboard_page',
            registerPath: '/auth/register-admin',
            forgotPath: '/auth/forgot-admin',
            otherLogins: [
                { label: 'ผู้ใช้งาน', to: '/auth/login-user' },
                { label: 'เภสัชกร', to: '/auth/login-pharmacist' },
                { label: 'เจ้าของร้าน', to: '/auth/login-store' }
            ]
        }
    };
}

export function useAuthConfig() {
    const apiBase = useApiBaseRef();
    const loginConfigs = computed(() => buildLoginConfigs(apiBase.value));
    return { apiBase, loginConfigs };
}
