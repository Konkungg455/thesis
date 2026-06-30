/** โหลดข้อมูลผู้ใช้จาก localStorage ทันทีที่เปิดแอป (ก่อน Header mount) */
export default defineNuxtPlugin(() => {
    const { loadFromStorage, syncFromServer } = useAuthUser();
    loadFromStorage();

    // หน้า login ไม่ต้อง sync กับ DB ทันที — ลด request ซ้ำตอนกดเข้าสู่ระบบ
    if (import.meta.client && window.location.pathname.startsWith('/auth/')) {
        return;
    }

    syncFromServer().catch(() => {});
});
