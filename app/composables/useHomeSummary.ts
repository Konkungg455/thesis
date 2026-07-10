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

    /** โหลดใหม่ — bustCache=true เฉพาะปุ่มรีเฟรช (ไม่ยิง nocache ทุกครั้งที่เปิดหน้า) */
    const reload = async (bustCache = false) => {
        const url = bustCache ? '/api/home/summary?nocache=1' : '/api/home/summary';
        const fresh = await $fetch<HomeSummary>(url, { timeout: 25_000 });
        if (fresh) {
            result.data.value = fresh;
        }
        return fresh;
    };

    // SSR/ISR ว่างเมื่อ DB cold — retry ฝั่ง client เท่านั้น (ไม่ทำลาย cache ถ้ามีข้อมูลแล้ว)
    onMounted(async () => {
        if (route.path !== '/') return;
        if (!isHomeEmpty(result.data.value)) return;

        for (let i = 0; i < 3; i++) {
            try {
                await result.refresh();
                if (!isHomeEmpty(result.data.value)) return;
                await new Promise((r) => setTimeout(r, 700 * (i + 1)));
            } catch {
                /* cold start retry */
            }
        }
    });

    return { ...result, reload };
}

export type { PharmacistRow, PharmacistsResponse, ReviewRow };
