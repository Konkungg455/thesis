<script setup>
useHead({ title: 'แก้ไขข้อมูลส่วนตัว - ผู้ดูแลระบบ' });
definePageMeta({ middleware: 'admin-only' });
</script>

<template>
    <div class="admin-profile-page">
        <Header_admin />
        <main class="profile-page">
            <ProfileAdminProfileForm />
        </main>
        <Footer />
    </div>
</template>

<style>
@import '~/assets/profile.css';

.admin-profile-page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: #ffffff;
}
.admin-profile-page .profile-page {
    flex: 1;
    min-height: 0;
    background: #ffffff;
}
</style>
