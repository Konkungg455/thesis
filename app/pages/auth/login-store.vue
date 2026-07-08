<script setup>
definePageMeta({ layout: false });
</script>

<template>
    <AuthRoleLayout role="store">
        <AuthLoginForm role-key="store" />
    </AuthRoleLayout>
</template>

<style>
@import '~/assets/auth-login.css';
</style>
