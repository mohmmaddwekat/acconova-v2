import { t } from './i18n';

export const deviceKey = (user: number, organization: number) => `acconova.notifications.${user}.${organization}`;
export const deviceSupported = () => typeof Notification !== 'undefined' && window.isSecureContext;
export function deviceEnabled(key: string): boolean {
    try { return deviceSupported() && Notification.permission === 'granted' && localStorage.getItem(key) === 'on'; } catch { return false; }
}
export function showDeviceNotification(count: number): void {
    const notification = new Notification(t('notifications.title'), { body: t('notifications.count', { count }), tag: 'acconova-workspace' });
    notification.onclick = () => { window.focus(); window.location.assign('/app/notifications'); notification.close(); };
}
export function deliverDeviceNotification(key: string, count: number, latest: number): void {
    if (!deviceEnabled(key) || !count || !latest) { return; }
    try {
        if (Number(localStorage.getItem(`${key}.seen`) ?? 0) >= latest) { return; }
        showDeviceNotification(count);
        localStorage.setItem(`${key}.seen`, String(latest));
    } catch { /* Unsupported device delivery must not interrupt in-app notifications. */ }
}
