/** โหลดข้อมูลผู้ใช้จาก localStorage ทันทีที่เปิดแอป (ก่อน Header mount) */
export default defineNuxtPlugin(() => {
    const { loadFromStorage, syncFromServer } = useAuthUser();
    loadFromStorage();
    syncFromServer().catch(() => {});
});
