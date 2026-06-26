import { computed } from 'vue';

/** ฐาน URL ของ PHP API + n8n — อิง hostname ปัจจุบัน (เช่น 192.168.1.117) */
export function useApiBase() {
    const { $getApiBase, $apiBase, $apiUrl, $getN8nBase, $n8nChatUrl } = useNuxtApp() as any;

    const apiBase = computed(() => $getApiBase());
    const n8nBase = computed(() => ($getN8nBase ? $getN8nBase() : ''));

    return {
        apiBase,
        n8nBase,
        get apiUrl() {
            return $apiUrl as (path: string) => string;
        },
        get n8nChatUrl() {
            return ($n8nChatUrl as () => string) || (() => '');
        },
        uploadsChat: (file: string) => `${apiBase.value}/uploads/chat/${file}`,
        imagesAccount: (file: string) => `${apiBase.value}/images_account/${file}`,
        imagesPharma: (file: string) => `${apiBase.value}/images_pharma/${file}`
    };
}
