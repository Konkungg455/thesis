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

function isHomeEmpty(data: HomeSummary | null | undefined) {
    const reviews = data?.reviews?.length ?? 0;
    const pharma = data?.pharmacists?.data?.length ?? 0;
    return reviews === 0 && pharma === 0;
}

/** หน้าแรก — ใช้ key เดียวกันเพื่อ dedupe SSR (1 request แทน 2) */
export function useHomeSummaryData() {
    const route = useRoute();

    const result = useAsyncData<HomeSummary>(
        'home-summary',
        () => {
            if (route.path !== '/') {
                return Promise.resolve(emptyHome());
            }
            return $fetch<HomeSummary>('/api/home/summary', { timeout: 25_000 });
        },
        { default: emptyHome },
    );

    // SSR/ISR อาจได้ข้อมูลว่างเมื่อ DB cold — โหลดซ้ำฝั่ง client (bust BFF cache หลัง seed DB)
    onMounted(async () => {
        if (route.path !== '/') return;

        const applyFresh = async () => {
            const fresh = await $fetch<HomeSummary>('/api/home/summary?nocache=1', { timeout: 25_000 });
            if (fresh && !isHomeEmpty(fresh)) {
                result.data.value = fresh;
                return true;
            }
            return false;
        };

        if (!isHomeEmpty(result.data.value)) {
            try { await applyFresh(); } catch { /* keep SSR data */ }
            return;
        }

        for (let i = 0; i < 2; i++) {
            try {
                if (await applyFresh()) break;
                await result.refresh();
                if (!isHomeEmpty(result.data.value)) break;
                await new Promise((r) => setTimeout(r, 1200));
            } catch {
                /* retry once on cold start */
            }
        }
    });

    return result;
}

export type { PharmacistRow, PharmacistsResponse, ReviewRow };
