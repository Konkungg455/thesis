<script setup>
useHead({ title: 'แก้ไขข้อมูลร้านยา - TELEBOT PHARMACY' });
definePageMeta({ middleware: 'store-only' });
</script>

<template>
    <div class="profile-page-layout">
        <header_store />
        <main class="profile-page">
            <ProfileStoreProfileForm />
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
