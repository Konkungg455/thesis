<template>
    <!-- ขั้นตอนการใช้งาน-->
    <section class="tele-section">
        <!-- ฝั่งซ้าย -->
        <div class="tele-left">
            <h1 class="tele-heading">
                <span class="tele-heading__text">ขั้นตอนการใช้ง่ายๆ</span>
                <span class="tele-heading__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path fill="currentColor" d="M12 2.5C7.03 2.5 3 6.2 3 10.75c0 1.95.82 3.74 2.18 5.1L3.5 21.5l5.55-2.95c.95.28 1.96.42 2.95.42 4.97 0 9-3.7 9-8.25S16.97 2.5 12 2.5Z"/>
                        <path fill="#0288d1" d="M12 7.5v3.25M12 13.75h.01" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
                    </svg>
                </span>
            </h1>
            <p class="subtitle">
                ของ <span class="tele-brand">Telebotpharmacy</span>
            </p>

            <div class="steps">
                <div class="step">
                    <div class="step-media">
                        <span class="step-num">1</span>
                        <img src="https://ik.imagekit.io/pcqen5m7p/coding-a-website.png" alt="">
                    </div>
                    <p>สมัครบัญชี</p>
                </div>
                <div class="step">
                    <div class="step-media">
                        <span class="step-num">2</span>
                        <img src="https://ik.imagekit.io/pcqen5m7p/designer-desk.png" alt="">
                    </div>
                    <p>กดปุ่มปรึกษาอาการ</p>
                </div>
                <div class="step">
                    <div class="step-media">
                        <span class="step-num">3</span>
                        <img src="https://ik.imagekit.io/pcqen5m7p/designer-working.png" alt="">
                    </div>
                    <p>กรอกข้อมูล</p>
                </div>
                <div class="step">
                    <div class="step-media">
                        <span class="step-num">4</span>
                        <img src="https://ik.imagekit.io/pcqen5m7p/machine-learning.png" alt="">
                    </div>
                    <p>กดเริ่ม chat</p>
                </div>
                <div class="step">
                    <div class="step-media">
                        <span class="step-num">5</span>
                        <img src="https://ik.imagekit.io/pcqen5m7p/online-romance.png" alt="">
                    </div>
                    <p>ใช้งานได้เลย</p>
                </div>
            </div>
        </div>
        <!-- ฝั่งขวา -->
        <div class="tele-right">
            <span class="phone-bg-blob" aria-hidden="true"></span>
            <span class="phone-bg-ring" aria-hidden="true"></span>
            <img src="/images/tutorial-phone.png" alt="Doctor on phone" class="phone-image">
        </div>
    </section>
</template>

<style scoped>
@import "@/assets/tele_tutorial.css";
</style>
