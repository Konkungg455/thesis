<script setup>
definePageMeta({ layout: false });
</script>

<template>
    <AuthRoleLayout role="user">
        <AuthRegisterUserForm />
    </AuthRoleLayout>
</template>

<style>
@import '~/assets/auth-login.css';
</style>
