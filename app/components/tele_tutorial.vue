<template>
    <section class="tele-section">
        <div class="tele-section__glow tele-section__glow--left" aria-hidden="true"></div>
        <div class="tele-section__glow tele-section__glow--right" aria-hidden="true"></div>

        <div class="tele-left">
            <header class="tele-header">
                <span class="tele-badge">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    เริ่มใช้งานใน 5 ขั้นตอน
                </span>
                <h1 class="tele-title">
                    <span class="tele-title__text">ขั้นตอนการใช้ง่ายๆ</span>
                    <span class="tele-title__bubble" aria-hidden="true">
                        <i class="fa-solid fa-comment-medical"></i>
                    </span>
                </h1>
                <p class="tele-subtitle">
                    ของ <span class="tele-brand">Telebotpharcy</span>
                </p>
                <p class="tele-lead">
                    ปรึกษาเภสัชกรออนไลน์ได้ทันที — สมัคร กรอกอาการ แล้วเริ่มแชทได้เลย
                </p>
            </header>

            <div class="steps">
                <div v-for="(item, index) in steps" :key="item.label" class="step">
                    <div class="step-media">
                        <span class="step-num">{{ index + 1 }}</span>
                        <img :src="item.img" :alt="item.label">
                    </div>
                    <p>{{ item.label }}</p>
                </div>
            </div>
        </div>

        <div class="tele-right">
            <span class="phone-bg-blob" aria-hidden="true"></span>
            <span class="phone-bg-ring" aria-hidden="true"></span>
            <img src="/images/tutorial-phone.png" alt="Doctor on phone" class="phone-image">
        </div>
    </section>
</template>

<script setup>
const steps = [
    { label: 'สมัครบัญชี', img: 'https://ik.imagekit.io/pcqen5m7p/coding-a-website.png' },
    { label: 'กดปุ่มปรึกษาอาการ', img: 'https://ik.imagekit.io/pcqen5m7p/designer-desk.png' },
    { label: 'กรอกข้อมูล', img: 'https://ik.imagekit.io/pcqen5m7p/designer-working.png' },
    { label: 'กดเริ่ม chat', img: 'https://ik.imagekit.io/pcqen5m7p/machine-learning.png' },
    { label: 'ใช้งานได้เลย', img: 'https://ik.imagekit.io/pcqen5m7p/online-romance.png' },
];
</script>

<style scoped>
@import "@/assets/tele_tutorial.css";
</style>
