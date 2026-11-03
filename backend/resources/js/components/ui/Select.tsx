import '@awesome.me/webawesome/dist/styles/themes/default.css';
import '@awesome.me/webawesome/dist/components/option/option.js';
import '@awesome.me/webawesome/dist/components/select/select.js';
import {
    Children,
    Fragment,
    createElement,
    isValidElement,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type ReactNode,
    type SelectHTMLAttributes,
} from 'react';

type OptionData = {
    value: string;
    label: string;
    disabled: boolean;
};

type SelectProps = Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'multiple' | 'size'
> & {
    /** Force the search box on or off. By default it appears for lists of 7 options or more. */
    searchable?: boolean;
};

type WebAwesomeSelect = HTMLElement & {
    value: string | string[];
    show: () => Promise<void> | void;
};

/** Web Awesome treats an empty value as "nothing selected", so "All"-style options get a token. */
const EMPTY = '__empty__';
const SEARCH_THRESHOLD = 7;

const toInternal = (value: string): string => (value === '' ? EMPTY : value);
const fromInternal = (value: string): string => (value === EMPTY ? '' : value);

function nodeText(node: ReactNode): string {
    if (node === null || node === undefined || typeof node === 'boolean') {
        return '';
    }

    if (typeof node === 'string' || typeof node === 'number') {
        return String(node);
    }

    if (Array.isArray(node)) {
        return node.map(nodeText).join('');
    }

    if (isValidElement<{ children?: ReactNode }>(node)) {
        return nodeText(node.props.children);
    }

    return '';
}

function collectOptions(children: ReactNode, out: OptionData[]): void {
    Children.forEach(children, (child) => {
        if (! isValidElement<{
            value?: string | number;
            disabled?: boolean;
            children?: ReactNode;
        }>(child)) {
            return;
        }

        if (child.type === 'option') {
            const label = nodeText(child.props.children);

            out.push({
                value: child.props.value === undefined
                    ? label
                    : String(child.props.value),
                label,
                disabled: Boolean(child.props.disabled),
            });

            return;
        }

        if (child.props.children) {
            collectOptions(child.props.children, out);
        }
    });
}

function heightFromClass(className?: string): string | undefined {
    const match = className?.match(/(?:^|\s)(?:min-)?h-(\d+(?:\.\d+)?)(?:\s|$)/);

    return match ? `${Number(match[1]) * 0.25}rem` : undefined;
}

/*
 * The old native selects carried their own border, background and padding
 * classes. The Web Awesome control draws all of that itself, so only the
 * classes that place the control (width, margin, flex, visibility) are kept.
 */
const LAYOUT_CLASS = /^(?:-?m[trblxyse]?-|w-|min-w-|max-w-|flex$|flex-|grow|shrink|basis-|col-|row-|self-|justify-self-|order-|hidden$|block$|inline-block$|sr-only$)/;

function layoutClasses(className?: string): string | undefined {
    if (! className) {
        return undefined;
    }

    return className
        .split(/\s+/)
        .filter((token) => LAYOUT_CLASS.test(token.replace(/^(?:[a-z0-9-]+:)+/, '').replace(/^!/, '')))
        .join(' ') || undefined;
}

function fontSizeFromClass(className?: string): string | undefined {
    if (/(?:^|\s)text-xs(?:\s|$)/.test(className ?? '')) {
        return '0.75rem';
    }

    if (/(?:^|\s)text-sm(?:\s|$)/.test(className ?? '')) {
        return '0.875rem';
    }

    return undefined;
}

/**
 * Drop-in replacement for the native `<select>` built on the Web Awesome select
 * component. It takes the same `<option>` children and calls `onChange` with an
 * event whose `target.value` is the chosen value, so existing handlers keep
 * working. Long lists get a search box inside the dropdown.
 */
export function Select({
    value,
    defaultValue,
    onChange,
    className,
    disabled,
    children,
    searchable,
    name,
    required,
    id,
    title,
    style,
    ...rest
}: SelectProps) {
    const options = useMemo(() => {
        const out: OptionData[] = [];

        collectOptions(children, out);

        return out;
    }, [children]);

    const elementRef = useRef<WebAwesomeSelect | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const changeRef = useRef(onChange);
    const [inner, setInner] = useState(String(defaultValue ?? ''));
    const [query, setQuery] = useState('');
    const current = value !== undefined && value !== null
        ? String(value)
        : inner;
    const showSearch = searchable ?? options.length >= SEARCH_THRESHOLD;

    changeRef.current = onChange;

    const needle = query.trim().toLowerCase();
    const visible = needle
        ? options.filter((option) =>
            option.label.toLowerCase().includes(needle),
        )
        : options;
    const rendered = visible.some((option) => option.value === current)
        || ! options.some((option) => option.value === current)
        ? visible
        : [...visible, options.find((option) => option.value === current) as OptionData];

    useEffect(() => {
        const element = elementRef.current;

        if (! element) {
            return;
        }

        let cancelled = false;

        void customElements.whenDefined('wa-select').then(() => {
            if (! cancelled) {
                element.value = toInternal(current);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [current, options]);

    useEffect(() => {
        const element = elementRef.current;

        if (! element) {
            return;
        }

        const handleChange = (): void => {
            const next = fromInternal(String(element.value ?? ''));

            setInner(next);
            changeRef.current?.({
                target: { value: next, name: name ?? '', id: id ?? '' },
                currentTarget: { value: next, name: name ?? '', id: id ?? '' },
            } as unknown as ChangeEvent<HTMLSelectElement>);
        };
        const handleShow = (): void => {
            window.setTimeout(() => searchRef.current?.focus(), 30);
        };
        const handleHide = (): void => setQuery('');

        element.addEventListener('change', handleChange);
        element.addEventListener('wa-after-show', handleShow);
        element.addEventListener('wa-hide', handleHide);

        return () => {
            element.removeEventListener('change', handleChange);
            element.removeEventListener('wa-after-show', handleShow);
            element.removeEventListener('wa-hide', handleHide);
        };
    }, [name, id]);

    const height = heightFromClass(className);
    const direction = typeof document !== 'undefined'
        ? document.documentElement.dir || undefined
        : undefined;

    const select = createElement(
        'wa-select',
        {
            ref: elementRef,
            class: layoutClasses(className),
            id,
            title,
            dir: direction,
            disabled: disabled || undefined,
            required: required || undefined,
            'aria-label': rest['aria-label'],
            style: {
                ...(height ? { '--wa-form-control-height': height } : {}),
                ...(fontSizeFromClass(className) ? { fontSize: fontSizeFromClass(className) } : {}),
                ...style,
            },
        },
        showSearch
            ? createElement(
                'div',
                {
                    key: '__search',
                    className: 'ac-select-search',
                    onKeyDown: (event: React.KeyboardEvent) => {
                        event.stopPropagation();

                        if (event.key === 'Escape') {
                            void (elementRef.current as unknown as { hide?: () => void } | null)?.hide?.();
                        }

                        if (event.key === 'Enter') {
                            event.preventDefault();

                            const first = visible.find((option) => ! option.disabled);

                            if (first && elementRef.current) {
                                elementRef.current.value = toInternal(first.value);
                                elementRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                                void (elementRef.current as unknown as { hide?: () => void }).hide?.();
                            }
                        }
                    },
                    onClick: (event: React.MouseEvent) => event.stopPropagation(),
                },
                createElement('input', {
                    ref: searchRef,
                    type: 'search',
                    value: query,
                    placeholder: document.documentElement.lang === 'ar' ? 'بحث…' : 'Search…',
                    autoComplete: 'off',
                    onChange: (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
                }),
            )
            : null,
        ...rendered.map((option) =>
            createElement(
                'wa-option',
                {
                    key: option.value,
                    value: toInternal(option.value),
                    disabled: option.disabled || undefined,
                    style: visible.includes(option) ? undefined : { display: 'none' },
                },
                option.label,
            ),
        ),
        showSearch && visible.length === 0
            ? createElement('div', { key: '__none', className: 'ac-select-empty' },
                document.documentElement.lang === 'ar' ? 'لا توجد نتائج' : 'No results')
            : null,
    );

    if (! name) {
        return select;
    }

    return createElement(
        Fragment,
        null,
        createElement('input', { type: 'hidden', name, value: current, disabled }),
        select,
    );
}
