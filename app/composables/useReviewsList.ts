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

/** รีวิวหน้าแรก — SSR + แชร์ cache ระหว่าง component */
export function useReviewsList() {
    const { imagesAccount } = useApiBase();

    const { data, pending, refresh } = useAsyncData<ReviewRow[]>(
        'reviews-list',
        () => $fetch<ReviewRow[]>('/api/bff/review-get.php', { timeout: 15_000 }),
        { default: () => [] },
    );

    const reviews = computed<ReviewItem[]>(() => {
        if (!Array.isArray(data.value)) return [];
        return data.value.map((item) => ({
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
