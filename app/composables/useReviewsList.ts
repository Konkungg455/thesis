type ReviewRow = {
    firstname: string;
    lastname: string;
    rating: string | number;
    images_account?: string;
    comment: string;
};

export type ReviewItem = {
    name: string;
    rating: number;
    image: string;
    text: string;
};

/** รีวิวหน้าแรก — ใช้ /api/home/summary ร่วมกับเภสัช (request เดียว) */
export function useReviewsList() {
    const route = useRoute();
    const { imagesAccount } = useApiBase();
    const isHome = computed(() => route.path === '/');

    const home = useHomeSummaryData();

    const standalone = useAsyncData<ReviewRow[]>(
        'reviews-list',
        () => $fetch<ReviewRow[]>('/api/bff/review-get.php', { timeout: 15_000 }),
        {
            default: () => [],
            immediate: route.path !== '/',
        },
    );

    const rawRows = computed(() => (
        isHome.value ? (home.data.value?.reviews ?? []) : (standalone.data.value ?? [])
    ));

    const pending = computed(() => (
        isHome.value ? home.pending.value : standalone.pending.value
    ));

    const refresh = async () => {
        if (isHome.value) {
            await home.refresh();
        } else {
            await standalone.refresh();
        }
    };

    const reviews = computed<ReviewItem[]>(() => {
        if (!Array.isArray(rawRows.value)) return [];
        return rawRows.value.map((item) => ({
            name: `${item.firstname || ''} ${item.lastname || ''}`.trim(),
            rating: parseInt(String(item.rating), 10) || 0,
            image: imagesAccount(item.images_account || 'default.png'),
            text: item.comment || '',
        }));
    });

    const isLoading = computed(() => pending.value && reviews.value.length === 0);

    return {
        reviews,
        isLoading,
        pending,
        refresh,
        fetchReviews: refresh,
    };
}
