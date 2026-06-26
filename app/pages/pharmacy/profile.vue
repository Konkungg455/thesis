<script setup>
useHead({ title: 'แก้ไขโปรไฟล์เภสัช - TELEBOT PHARMACY' });
definePageMeta({ middleware: 'pharmacist-only' });
</script>

<template>
    <div class="profile-page-layout">
        <Pharmacy_header />
        <main class="profile-page">
            <ProfilePharmacistProfileForm />
        </main>
        <Footer />
    </div>
</template>

<style>
@import '~/assets/profile.css';

.profile-page-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.profile-page-layout .profile-page {
    flex: 1;
    min-height: 0;
}
</style>
