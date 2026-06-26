<script setup>
useHead({ title: 'แก้ไขโปรไฟล์ - TELEBOT PHARMACY' });
definePageMeta({ middleware: 'user-only' });
</script>

<template>
    <div class="profile-page-layout">
        <Header />
        <main class="profile-page">
            <ProfileUserProfileForm />
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
