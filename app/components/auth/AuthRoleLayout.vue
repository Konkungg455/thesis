<script setup>
defineProps({
    role: {
        type: String,
        required: true,
        validator: (v) => ['user', 'pharmacist', 'store', 'admin'].includes(v)
    }
});
</script>

<template>
    <div class="auth-page-layout">
        <Header v-if="role === 'user' || role === 'admin'" />
        <Pharmacy_header v-else-if="role === 'pharmacist'" />
        <header_store v-else-if="role === 'store'" />

        <main class="auth-page-layout__main">
            <slot />
        </main>

        <Footer />
    </div>
</template>
