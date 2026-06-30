<script setup lang="ts">
/**
 * pages/index.vue — Landing page
 *  - 🚩 Smart redirect: ถ้าผู้ใช้ล็อกอินค้างอยู่ในฐานะ admin/pharmacist/store
 *    → เด้งไป "หน้าแรกของ role ตัวเอง" อัตโนมัติ
 *  - user หรือ guest → เห็นหน้า landing ตามปกติ
 */
import Doctor_card from '~/components/Doctor_card.vue';
import Doctor_counte from '~/components/Doctor_counte.vue';
import Location_Pharmacy from '~/components/Location_Pharmacy.vue';
import Symptom_Categories from '~/components/Symptom_Categories.vue';
import Tele_tutorial from '~/components/tele_tutorial.vue';

definePageMeta({ middleware: 'smart-home' });

// โหลดเภสัช + รีวิวพร้อม SSR (ยิง API ครั้งเดียว ไม่รอ onMounted)
usePharmacistsList();
useReviewsList();
</script>

<template>
  <div>
    <Header/>
    <Hero1/>
    <br>
    <br>
    <Tele_tutorial/>  
    <Symptom_Categories/>
    <Doctor_counte/>
    <Doctor_card/>
    <br>
    <br>
    <Location_Pharmacy/>
    <Review/>
    <Footer/>
  </div>
</template>
