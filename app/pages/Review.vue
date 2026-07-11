<script setup lang="ts">
import Review1 from '~/components/review1.vue';

useHead({
    bodyAttrs: { class: 'review-page-body' },
});
</script>

<template>
    <div class="review-page">
        <Header/>
        <Review1/>
        <Footer/>
    </div>
</template>

<style>
html:not(.dark) .review-page,
html:not(.dark).review-page-body,
html:not(.dark).review-page-body body,
html:not(.dark).review-page-body #__nuxt {
    background: #ffffff !important;
}

html.dark .review-page,
html.dark.review-page-body,
html.dark.review-page-body body,
html.dark.review-page-body #__nuxt {
    background: var(--app-bg) !important;
}

.review-page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

html:not(.dark) .review-page .footer-divider {
    background: #ffffff !important;
    background-image: none !important;
}

html.dark .review-page .footer-divider {
    background: var(--footer-pre-bg) !important;
    background-image: none !important;
    line-height: 0;
    overflow: hidden;
}

html.dark .review-page .footer-divider svg {
    display: block;
    width: 100%;
    height: 80px;
    fill: #020617 !important;
}

html.dark .review-page .footer-wave {
    background: #020617 !important;
    background-color: #020617 !important;
    margin-top: -1px;
    border-top: none;
}
</style>