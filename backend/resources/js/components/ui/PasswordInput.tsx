import { useLocale } from '@/lib/i18n';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type InputHTMLAttributes } from 'react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * A password field with a button that shows or hides the typed value.
 * It accepts every regular input prop, so it can replace a plain
 * `<input type="password">` without changing the surrounding markup.
 */
export function PasswordInput({
    className = '',
    ...props
}: PasswordInputProps) {
    const ar = useLocale() === 'ar';
    const [visible, setVisible] = useState(false);
    const label = visible
        ? (ar ? 'إخفاء كلمة المرور' : 'Hide password')
        : (ar ? 'إظهار كلمة المرور' : 'Show password');

    return (
        <span className="relative block w-full">
            <input
                {...props}
                type={visible ? 'text' : 'password'}
                className={className + ' !pe-11'}
            />

            <button
                type="button"
                aria-label={label}
                aria-pressed={visible}
                title={label}
                onClick={() => setVisible((current) => ! current)}
                className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-[inherit] text-[var(--ac-text-muted)] transition hover:text-[var(--ac-text)] focus-visible:text-[var(--ac-accent)] focus-visible:outline-none"
            >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
        </span>
    );
}
