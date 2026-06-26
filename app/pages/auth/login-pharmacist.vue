<script setup>
definePageMeta({ layout: false });
</script>

<template>
    <AuthRoleLayout role="pharmacist">
        <AuthLoginForm role-key="pharmacist" />
    </AuthRoleLayout>
</template>

<style>
@import '~/assets/auth-login.css';
</style>
