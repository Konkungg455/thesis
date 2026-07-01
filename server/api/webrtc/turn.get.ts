/** ดึง TURN credentials — Metered.ca / env static (cache 23 ชม.) */
const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
];

const FALLBACK_TURN = [
    {
        urls: [
            'turn:global.relay.metered.ca:80?transport=udp',
            'turn:global.relay.metered.ca:443?transport=tcp',
            'turns:global.relay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
];

let cache: { iceServers: unknown[]; hasTurn: boolean; expiresAt: number } | null = null;

function hasTurnEntry(servers: unknown[]): boolean {
    return servers.some((s) => {
        const urls = s && typeof s === 'object' ? (s as { urls?: string | string[] }).urls : '';
        const joined = Array.isArray(urls) ? urls.join(' ') : String(urls || '');
        return joined.includes('turn:') || joined.includes('turns:');
    });
}

function staticTurnFromConfig(config: ReturnType<typeof useRuntimeConfig>) {
    const pub = config.public as {
        turnUrls?: string;
        turnUsername?: string;
        turnCredential?: string;
    };
    const urls = String(pub.turnUrls || '').split(',').map((s) => s.trim()).filter(Boolean);
    const username = String(pub.turnUsername || '').trim();
    const credential = String(pub.turnCredential || '').trim();
    if (!urls.length || !username || !credential) return null;
    return {
        urls: urls.length === 1 ? urls[0] : urls,
        username,
        credential,
    };
}

export default defineEventHandler(async () => {
    const config = useRuntimeConfig();
    const apiKey = String(config.meteredApiKey || '').trim();
    const appName = String(config.meteredAppName || 'telebotpharmacy').trim();

    if (cache && cache.expiresAt > Date.now()) {
        return { iceServers: cache.iceServers, source: 'metered-cache', hasTurn: cache.hasTurn };
    }

    let turnServers: unknown[] = [];
    let source = 'none';

    if (apiKey) {
        try {
            const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
            const fetched = await $fetch<unknown[]>(url, { timeout: 12000 });
            if (Array.isArray(fetched) && fetched.length) {
                turnServers = fetched;
                source = 'metered';
            }
        } catch (e) {
            console.warn('[webrtc/turn] Metered fetch failed:', e);
        }
    }

    if (!turnServers.length) {
        const staticTurn = staticTurnFromConfig(config);
        if (staticTurn) {
            turnServers = [staticTurn];
            source = 'env-static';
        }
    }

    if (!turnServers.length) {
        turnServers = FALLBACK_TURN;
        source = 'fallback-public';
    }

    const iceServers = [...STUN_SERVERS, ...turnServers];
    const hasTurn = hasTurnEntry(turnServers);

    cache = { iceServers, hasTurn, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
    return { iceServers, source, hasTurn };
});
