<script setup>
definePageMeta({ layout: false });
</script>

<template>
    <AuthRoleLayout role="pharmacist">
        <AuthRegisterPharmacistForm />
    </AuthRoleLayout>
</template>

<style>
@import '~/assets/auth-login.css';
</style>
