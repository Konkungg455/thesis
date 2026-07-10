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

function normalizeReviewRow(
    item: ReviewRow | Record<string, unknown>,
    imagesAccount: (path: string) => string,
): ReviewItem | null {
    const row = item as Record<string, unknown>;
    const firstname = String(row.firstname ?? row.first_name ?? '').trim();
    const lastname = String(row.lastname ?? row.last_name ?? '').trim();
    const comment = String(row.comment ?? row.review_text ?? '').trim();
    const rating = Math.max(0, Math.min(5, parseInt(String(row.rating ?? 0), 10) || 0));
    const name = `${firstname} ${lastname}`.trim();

    if (!name && !comment && rating <= 0) {
        return null;
    }

    return {
        name: name || 'ผู้ใช้บริการ',
        rating,
        image: imagesAccount(String(row.images_account ?? 'default.png')),
        text: comment,
    };
}

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
            await home.reload(true);
        } else {
            await standalone.refresh();
        }
    };

    const reviews = computed<ReviewItem[]>(() => {
        if (!Array.isArray(rawRows.value)) return [];
        return rawRows.value
            .map((item) => normalizeReviewRow(item, imagesAccount))
            .filter((item): item is ReviewItem => item !== null);
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
