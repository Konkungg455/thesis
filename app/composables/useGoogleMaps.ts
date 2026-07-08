const MAPS_SRC = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyCxhub76nika5eL95vmihYBl8mczVclBrA&libraries=places,geometry';

let loadPromise: Promise<void> | null = null;

/** โหลด Google Maps เฉพาะเมื่อผู้ใช้กดค้นหาร้านยา (ไม่บล็อกหน้าแรก) */
export function loadGoogleMaps(): Promise<void> {
    if (import.meta.server) {
        return Promise.resolve();
    }

    if (typeof google !== 'undefined' && google.maps?.places) {
        return Promise.resolve();
    }

    if (loadPromise) {
        return loadPromise;
    }

    loadPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-google-maps="1"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = MAPS_SRC;
        script.async = true;
        script.defer = true;
        script.dataset.googleMaps = '1';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Google Maps failed to load'));
        document.head.appendChild(script);
    });

    return loadPromise;
}
