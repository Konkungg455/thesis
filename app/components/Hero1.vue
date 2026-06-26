<template>
    <div class="hero-wave-wrap">
    <section class="hero">
        <!-- Decorative background -->
        <span class="hero-blob blob-top" aria-hidden="true"></span>
        <span class="hero-blob blob-bottom" aria-hidden="true"></span>

        <div class="hero-container">

            <!-- LEFT -->
            <div class="hero-left">
                <h1>
                    แพลตฟอร์มการให้คำปรึกษาเรื่องการรักษาและยา
                    <span>โดยเภสัชกร</span>
                </h1>

                <p>Telepharmacy พร้อมปรึกษาทุกพื้นที่</p>

                <NuxtLink to="/" class="btn-primary">ใช้งานเลย</NuxtLink>
            </div>

            <!-- RIGHT -->
            <div class="hero-right">
                <div class="hero-image-frame">
                    <span class="frame-circle" aria-hidden="true"></span>
                    <span class="frame-ring" aria-hidden="true"></span>
                    <img src="/images/pharmacist-hero.png"
                         alt="Telepharmacy Banner"
                         class="hero-image"
                         loading="eager"
                         decoding="async" />
                </div>
            </div>
        </div>
    </section>
    <svg class="wave-up" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true">
        <!-- พื้นโทนเดียวกับ hero (#f6faff) ในส่วนที่อยู่เหนือเส้นคลื่น -->
        <rect width="1440" height="320" fill="#f6faff"/>
        <path fill="#00469D" fill-opacity="1"
            d="M0,96L26.7,106.7C53.3,117,107,139,160,149.3C213.3,160,267,160,320,154.7C373.3,149,427,139,480,133.3C533.3,128,587,128,640,144C693.3,160,747,192,800,197.3C853.3,203,907,181,960,160C1013.3,139,1067,117,1120,112C1173.3,107,1227,117,1280,112C1333.3,107,1387,85,1413,74.7L1440,64L1440,320L1413.3,320C1386.7,320,1333,320,1280,320C1226.7,320,1173,320,1120,320C1066.7,320,1013,320,960,320C906.7,320,853,320,800,320C746.7,320,693,320,640,320C586.7,320,533,320,480,320C426.7,320,373,320,320,320C266.7,320,213,320,160,320C106.7,320,53,320,27,320L0,320Z">
        </path>
    </svg>
    </div>
</template>

<style scoped>
@import "@/assets/hero1.css";
</style>
