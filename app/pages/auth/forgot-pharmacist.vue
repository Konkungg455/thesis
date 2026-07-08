<script setup>
definePageMeta({ layout: false });
</script>

<template>
    <AuthRoleLayout role="pharmacist">
        <AuthForgotPasswordForm role-key="pharmacist" />
    </AuthRoleLayout>
</template>

<style>
@import '~/assets/auth-login.css';
</style>
