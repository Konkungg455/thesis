/** โหลดข้อมูลผู้ใช้จาก localStorage ทันทีที่เปิดแอป (ก่อน Header mount) */
import { isPharmaPortalPath } from '~/utils/pharmaPortalPaths';

export default defineNuxtPlugin(() => {
    const { loadFromStorage, syncFromServer, user } = useAuthUser();
    loadFromStorage();

    if (import.meta.client) {
        const router = useRouter();
        const syncPharmaPortalBg = (path: string) => {
            document.documentElement.classList.toggle('pharma-portal-page', isPharmaPortalPath(path));
        };
        syncPharmaPortalBg(router.currentRoute.value.path);
        router.afterEach((to) => syncPharmaPortalBg(to.path));
    }

    // หน้า login ไม่ต้อง sync กับ DB ทันที — ลด request ซ้ำตอนกดเข้าสู่ระบบ
    if (import.meta.client && window.location.pathname.startsWith('/auth/')) {
        return;
    }

    // guest ไม่ต้องยิง get-user-session — ลด cold start บน Vercel
    if (user.value) {
        syncFromServer().catch(() => {});
    }
});
