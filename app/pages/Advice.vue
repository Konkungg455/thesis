<script setup lang="ts">
import Symptom_Categories from '~/components/Symptom_Categories.vue';

const route = useRoute();
const { tryRedirectFromAdvice } = useAdviceEntry();

const startFresh = computed(() => String(route.query.new || '') === '1');

onMounted(() => {
    tryRedirectFromAdvice(startFresh.value);
});
</script>

<template>
    <div class="page-wrapper">
        <Header />
        <main class="content-area">
            <Symptom_Categories />
        </main>
        <Footer />
    </div>
</template>

<style scoped>
.page-wrapper {
    display: flex;
    flex-direction: column;
    min-height: 100vh; /* ให้ความสูงอย่างน้อยเท่ากับหน้าจอพอดี */
}

.content-area {
    flex-grow: 1; /* ส่วนนี้จะยืดขยายเพื่อดัน Footer ลงไปข้างล่างสุดเสมอ */
    padding-top: 80px; /* เว้นระยะจาก Header (ปรับตามความสูง Header ของคุณ) */
    padding-bottom: 40px; /* เว้นระยะก่อนถึง Footer */
}
</style>