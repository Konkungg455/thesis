<script setup>
definePageMeta({ layout: false });
</script>

<template>
    <AuthRoleLayout role="admin">
        <AuthLoginForm role-key="admin" />
    </AuthRoleLayout>
</template>

<style>
@import '~/assets/auth-login.css';
</style>
