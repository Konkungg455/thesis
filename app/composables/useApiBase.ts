import { computed } from 'vue';

export function useApiBase() {
    const nuxtApp = useNuxtApp() as ReturnType<typeof useNuxtApp> & {
        $getApiBase: () => string;
        $apiUrl: (path: string) => string;
        $n8nChatUrl: () => string;
        $resolveMediaUrl: (folder: string, file?: string | null) => string;
        $imagesAccount: (file?: string | null) => string;
        $imagesPharma: (file?: string | null) => string;
        $uploadsChat: (file: string) => string;
        $storeProfileImage: (file?: string | null) => string;
    };

    const apiBase = computed(() => nuxtApp.$getApiBase());

    return {
        apiBase,
        n8nBase: computed(() => (nuxtApp.$getN8nBase ? nuxtApp.$getN8nBase() : '')),
        get apiUrl() {
            return nuxtApp.$apiUrl;
        },
        get n8nChatUrl() {
            return nuxtApp.$n8nChatUrl || (() => '');
        },
        resolveMediaUrl: (folder: string, file?: string | null) =>
            nuxtApp.$resolveMediaUrl(folder, file),
        imagesAccount: (file?: string | null) => nuxtApp.$imagesAccount(file),
        imagesPharma: (file?: string | null) => nuxtApp.$imagesPharma(file),
        uploadsChat: (file: string) => nuxtApp.$uploadsChat(file),
        storeProfileImage: (file?: string | null) => nuxtApp.$storeProfileImage(file),
    };
}
