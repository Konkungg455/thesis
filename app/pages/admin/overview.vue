<script setup>
/**
 * 🚩 /admin/overview — alternate route สำหรับ Overview
 *    redirect ไปที่ /admin_dashboard_page (หน้า Home หลัก) เพื่อไม่ให้เกิด content ซ้ำซ้อน
 *    ถ้าต้องการให้แสดง overview เต็มในเส้นทางนี้แทน ให้ก๊อปเนื้อหาจาก admin_dashboard_page.vue มาใส่
 */
definePageMeta({
  middleware: [
    () => navigateTo('/admin_dashboard_page', { replace: true }),
  ],
})
</script>

<template>
  <div></div>
</template>
