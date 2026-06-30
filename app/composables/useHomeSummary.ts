type PharmacistRow = {
    id: number;
    name: string;
    time: string;
    image: string;
    store_id: number | null;
    store_name: string;
    store_address: string;
    store_lat: number | null;
    store_lng: number | null;
    distance_km: number | null;
};

type PharmacistsResponse = {
    status: string;
    data: PharmacistRow[];
    total?: number;
    message?: string;
};

type ReviewRow = {
    firstname: string;
    lastname: string;
    rating: string | number;
    images_account?: string;
    comment: string;
};

export type HomeSummary = {
    pharmacists: PharmacistsResponse;
    reviews: ReviewRow[];
};

const emptyHome = (): HomeSummary => ({
    pharmacists: { status: 'success', data: [] },
    reviews: [],
});

/** หน้าแรก — ใช้ key เดียวกันเพื่อ dedupe SSR (1 request แทน 2) */
export function useHomeSummaryData() {
    const route = useRoute();

    return useAsyncData<HomeSummary>(
        'home-summary',
        () => {
            if (route.path !== '/') {
                return Promise.resolve(emptyHome());
            }
            return $fetch<HomeSummary>('/api/home/summary', { timeout: 25_000 });
        },
        { default: emptyHome },
    );
}

export type { PharmacistRow, PharmacistsResponse, ReviewRow };
