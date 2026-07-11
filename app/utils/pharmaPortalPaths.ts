export function isPharmaPortalPath(path: string): boolean {
    const prefixes = [
        '/pharmacy_web',
        '/tracking',
        '/billing',
        '/history',
        '/dashboard',
        '/Summary',
        '/prescription-view',
        '/my-prescriptions',
        '/pharmacy',
    ];
    return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}
