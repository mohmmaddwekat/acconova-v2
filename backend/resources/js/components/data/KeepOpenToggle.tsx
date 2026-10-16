import { useState } from 'react';

/**
 * "Keep this form open after saving" for add dialogs, remembered per form type
 * so repeated entry (many customers, products, ...) needs no re-opening.
 * Defaults to on; storage failures fall back to the default.
 */
export function useKeepOpenPreference(name: string): [boolean, (next: boolean) => void] {
    const key = 'acconova:keep-open:' + name;
    const [keepOpen, setKeepOpen] = useState<boolean>(() => {
        try {
            return localStorage.getItem(key) !== 'off';
        } catch {
            return true;
        }
    });

    function update(next: boolean): void {
        setKeepOpen(next);

        try {
            localStorage.setItem(key, next ? 'on' : 'off');
        } catch {
            // The choice still applies until the page reloads.
        }
    }

    return [keepOpen, update];
}

export function KeepOpenToggle({
    checked,
    onChange,
    ar,
    disabled = false,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    ar: boolean;
    disabled?: boolean;
}) {
    return (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ac-text-soft)]">
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
                className="size-4 accent-[var(--ac-accent)]"
            />
            {ar ? 'ابقَ في النافذة لإضافة المزيد بعد الحفظ' : 'Stay open to add more after saving'}
        </label>
    );
}

/** Confirmation shown inside the form after a save that kept it open. */
export function SavedNote({ name, ar }: { name: string; ar: boolean }) {
    return (
        <div
            role="status"
            className="mb-4 rounded-[14px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-700"
        >
            {ar
                ? 'تم الحفظ: ' + name + '. يمكنك إضافة التالي الآن.'
                : 'Saved: ' + name + '. You can add the next one now.'}
        </div>
    );
}
