<script setup>
definePageMeta({ layout: false });

const route = useRoute();
const roleKey = computed(() => {
    const t = route.query.type || 'user';
    return ['user', 'pharmacist', 'store', 'admin'].includes(t) ? t : 'user';
});
</script>

<template>
    <AuthRoleLayout :role="roleKey">
        <AuthResetPasswordForm :role-key="roleKey" />
    </AuthRoleLayout>
</template>

<style>
@import '~/assets/auth-login.css';
</style>
