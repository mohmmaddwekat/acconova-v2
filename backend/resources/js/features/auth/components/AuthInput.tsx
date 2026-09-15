type AuthInputProps = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    type?: string;
    autoComplete?: string;
    placeholder?: string;
    minLength?: number;
};

/**
 * Render one consistent authentication field with Laravel validation feedback.
 */
export function AuthInput({
    label,
    value,
    onChange,
    error,
    type = 'text',
    autoComplete,
    placeholder,
    minLength,
}: AuthInputProps) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--ac-text)]">
                {label}
            </span>

            <input
                type={type}
                value={value}
                autoComplete={autoComplete}
                placeholder={placeholder}
                minLength={minLength}
                onChange={(event) =>
                    onChange(event.target.value)
                }
                className="h-12 w-full rounded-[16px] border border-[var(--ac-line-strong)] bg-white px-4 text-sm text-[var(--ac-text)] outline-none transition placeholder:text-[var(--ac-text-faint)] focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                required
            />

            {error && (
                <p className="mt-2 text-xs text-[var(--ac-danger)]">
                    {error}
                </p>
            )}
        </label>
    );
}
