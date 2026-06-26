<script setup>
definePageMeta({ layout: false });
</script>

<template>
    <AuthRoleLayout role="user">
        <AuthForgotPasswordForm role-key="user" />
    </AuthRoleLayout>
</template>

<style>
@import '~/assets/auth-login.css';
</style>
