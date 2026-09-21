import { apiRequest } from '@/lib/http';
import { AppShell } from '@/layouts/AppShell';
import { useLocale } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    CheckCircle2,
    Landmark,
    Link2,
    Upload,
    XCircle,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
} from 'react';

type SuggestedMatch = {
    id: number;
    number: string;
    direction: string;
    movement_date: string | null;
    amount: string;
    reference: string | null;
    method: string;
};

type BankLine = {
    id: number;
    bank_account_label: string | null;
    transaction_date: string;
    description: string;
    reference: string | null;
    amount: string;
    currency: string;
    status: string;
    matched_cash_movement_id: number | null;
    suggested_match: SuggestedMatch | null;
};

type Response = {
    data: BankLine[];
    summary: {
        unmatched: number;
        matched: number;
        ignored: number;
    };
};

function parseCsvLine(
    line: string,
): string[] {
    const cells:
        string[] = [];
    let cell = '';
    let quoted = false;

    for (
        let i = 0;
        i < line.length;
        i++
    ) {
        const char =
            line[i];

        if (char === '"') {
            if (
                quoted
                && line[
                    i + 1
                ] === '"'
            ) {
                cell += '"';
                i++;
            } else {
                quoted =
                    ! quoted;
            }

            continue;
        }

        if (
            char === ','
            && ! quoted
        ) {
            cells.push(
                cell.trim(),
            );
            cell = '';
            continue;
        }

        cell +=
            char;
    }

    cells.push(
        cell.trim(),
    );

    return cells;
}

export default function BankReconciliation() {
    const ar = useLocale() === 'ar';
    const [
        response,
        setResponse,
    ] = useState<Response | null>(
        null,
    );
    const [
        status,
        setStatus,
    ] = useState('unmatched');
    const [
        loading,
        setLoading,
    ] = useState(true);
    const [
        busy,
        setBusy,
    ] = useState(false);
    const [
        error,
        setError,
    ] = useState('');
    const fileRef =
        useRef<HTMLInputElement | null>(
            null,
        );

    const text = (
        arabic: string,
        english: string,
    ): string =>
        ar
            ? arabic
            : english;

    async function load(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const next =
                await apiRequest<Response>(
                    '/api/bank-reconciliation?status='
                    + encodeURIComponent(
                        status,
                    ),
                );

            setResponse(next);
        } catch {
            setError(
                text(
                    'تعذر تحميل المطابقة البنكية.',
                    'Bank reconciliation could not be loaded.',
                ),
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [
        status,
    ]);

    async function importCsv(
        event:
            ChangeEvent<HTMLInputElement>,
    ): Promise<void> {
        const file =
            event.target.files?.[0];

        if (! file) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const source =
                await file.text();
            const rawLines =
                source
                    .split(
                        /\r?\n/,
                    )
                    .filter(
                        line =>
                            line.trim()
                            !== '',
                    );

            if (
                rawLines.length <
                2
            ) {
                throw new Error(
                    'empty',
                );
            }

            const headers =
                parseCsvLine(
                    rawLines[0],
                ).map(
                    value =>
                        value
                            .trim()
                            .toLowerCase(),
                );

            const index = (
                ...names: string[]
            ): number =>
                names
                    .map(
                        name =>
                            headers.indexOf(
                                name,
                            ),
                    )
                    .find(
                        value =>
                            value >= 0,
                    )
                ?? -1;

            const dateIndex =
                index(
                    'date',
                    'transaction_date',
                );
            const descriptionIndex =
                index(
                    'description',
                    'memo',
                    'details',
                );
            const referenceIndex =
                index(
                    'reference',
                    'ref',
                );
            const amountIndex =
                index(
                    'amount',
                );
            const currencyIndex =
                index(
                    'currency',
                );
            const accountIndex =
                index(
                    'account',
                    'bank_account',
                    'bank_account_label',
                );

            if (
                dateIndex < 0
                || descriptionIndex < 0
                || amountIndex < 0
            ) {
                throw new Error(
                    'headers',
                );
            }

            const lines =
                rawLines
                    .slice(
                        1,
                    )
                    .map(
                        raw =>
                            parseCsvLine(
                                raw,
                            ),
                    )
                    .map(
                        cells => ({
                            transaction_date:
                                cells[
                                    dateIndex
                                ],
                            description:
                                cells[
                                    descriptionIndex
                                ],
                            reference:
                                referenceIndex >=
                                0
                                    ? cells[
                                        referenceIndex
                                    ]
                                        || null
                                    : null,
                            amount:
                                cells[
                                    amountIndex
                                ]?.replace(
                                    /\s/g,
                                    '',
                                ),
                            currency:
                                (
                                    currencyIndex >=
                                    0
                                        ? cells[
                                            currencyIndex
                                        ]
                                        : 'ILS'
                                )
                                    ?.trim()
                                    .toUpperCase()
                                    || 'ILS',
                            bank_account_label:
                                accountIndex >=
                                0
                                    ? cells[
                                        accountIndex
                                    ]
                                        || null
                                    : null,
                        }),
                    )
                    .filter(
                        row =>
                            row.transaction_date
                            && row.description
                            && row.amount,
                    );

            await apiRequest(
                '/api/bank-reconciliation/import',
                {
                    method:
                        'POST',
                    body:
                        JSON.stringify(
                            {
                                lines,
                            },
                        ),
                },
            );

            await load();
        } catch {
            setError(
                text(
                    'تعذر قراءة CSV. استخدم الأعمدة: date, description, reference, amount, currency, account. المبلغ الموجب وارد والسالب صادر.',
                    'CSV could not be read. Use columns: date, description, reference, amount, currency, account. Positive amounts are incoming; negative amounts are outgoing.',
                ),
            );
        } finally {
            setBusy(false);

            if (
                fileRef.current
            ) {
                fileRef.current.value =
                    '';
            }
        }
    }

    async function match(
        lineId: number,
        movementId: number,
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/bank-reconciliation/'
                + String(
                    lineId,
                )
                + '/match',
                {
                    method:
                        'POST',
                    body:
                        JSON.stringify(
                            {
                                cash_movement_id:
                                    movementId,
                            },
                        ),
                },
            );

            await load();
        } catch {
            setError(
                text(
                    'تعذر مطابقة الحركة.',
                    'Movement could not be matched.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function manualMatch(
        line:
            BankLine,
    ): Promise<void> {
        const value =
            window.prompt(
                text(
                    'أدخل ID المقبوض/الدفعة المطابقة:',
                    'Enter the matching cash movement ID:',
                ),
            );

        if (! value) {
            return;
        }

        const id =
            Number(
                value,
            );

        if (
            ! Number.isInteger(
                id,
            )
            || id <= 0
        ) {
            return;
        }

        await match(
            line.id,
            id,
        );
    }

    async function ignore(
        id: number,
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/bank-reconciliation/'
                + String(
                    id,
                )
                + '/ignore',
                {
                    method:
                        'POST',
                },
            );

            await load();
        } catch {
            setError(
                text(
                    'تعذر تجاهل السطر.',
                    'Line could not be ignored.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShell>
            <Head
                title={
                    text(
                        'المطابقة البنكية — AccoNova',
                        'Bank Reconciliation — AccoNova',
                    )
                }
            />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <Landmark
                                size={
                                    18
                                }
                            />
                        </div>

                        <div>
                            <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                                {text(
                                    'المطابقة البنكية',
                                    'Bank reconciliation',
                                )}
                            </h1>

                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-soft)]">
                                {text(
                                    'استورد كشف البنك، وسيقترح AccoNova المقبوض أو الدفعة الأقرب حسب المبلغ والتاريخ والاتجاه.',
                                    'Import a bank statement and AccoNova suggests the closest receipt/payment by amount, date and direction.',
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <input
                            ref={
                                fileRef
                            }
                            type="file"
                            accept=".csv,text/csv"
                            onChange={
                                event =>
                                    void importCsv(
                                        event,
                                    )
                            }
                            className="hidden"
                        />

                        <button
                            type="button"
                            disabled={
                                busy
                            }
                            onClick={() =>
                                fileRef.current?.click()
                            }
                            className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[var(--ac-accent-solid)] px-4 text-xs font-semibold text-[var(--ac-accent-solid-text)]"
                        >
                            <Upload
                                size={
                                    13
                                }
                            />
                            {text(
                                'استيراد CSV',
                                'Import CSV',
                            )}
                        </button>

                        <select
                            value={
                                status
                            }
                            onChange={
                                event =>
                                    setStatus(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            className="h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs"
                        >
                            <option value="unmatched">
                                {text(
                                    'غير مطابق',
                                    'Unmatched',
                                )}
                            </option>
                            <option value="matched">
                                {text(
                                    'مطابق',
                                    'Matched',
                                )}
                            </option>
                            <option value="ignored">
                                {text(
                                    'متجاهل',
                                    'Ignored',
                                )}
                            </option>
                            <option value="all">
                                {text(
                                    'الكل',
                                    'All',
                                )}
                            </option>
                        </select>
                    </div>
                </div>

                {response && (
                    <div className="mt-5 grid gap-2 sm:grid-cols-3">
                        {[
                            [
                                text(
                                    'غير مطابق',
                                    'Unmatched',
                                ),
                                response
                                    .summary
                                    .unmatched,
                            ],
                            [
                                text(
                                    'مطابق',
                                    'Matched',
                                ),
                                response
                                    .summary
                                    .matched,
                            ],
                            [
                                text(
                                    'متجاهل',
                                    'Ignored',
                                ),
                                response
                                    .summary
                                    .ignored,
                            ],
                        ].map(
                            (
                                [
                                    label,
                                    value,
                                ],
                            ) => (
                                <div
                                    key={
                                        label
                                    }
                                    className="rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3"
                                >
                                    <p className="text-[9px] text-[var(--ac-text-muted)]">
                                        {
                                            label
                                        }
                                    </p>
                                    <strong className="mt-2 block text-xl">
                                        {
                                            value
                                        }
                                    </strong>
                                </div>
                            ),
                        )}
                    </div>
                )}

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                        {
                            error
                        }
                    </div>
                )}

                <section className="mt-5 overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]">
                    {loading ? (
                        <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {text(
                                'جارٍ التحميل...',
                                'Loading...',
                            )}
                        </div>
                    ) : ! response?.data.length ? (
                        <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {text(
                                'لا توجد أسطر في هذا العرض.',
                                'No statement lines in this view.',
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-[var(--ac-line)]">
                            {response.data.map(
                                line => (
                                    <div
                                        key={
                                            line.id
                                        }
                                        className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_180px_minmax(260px,.75fr)] lg:items-center"
                                    >
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <strong className="text-sm">
                                                    {
                                                        line.description
                                                    }
                                                </strong>
                                                <span className="rounded-full bg-[var(--ac-bg-soft)] px-2 py-0.5 text-[8px] font-semibold">
                                                    {
                                                        line.status
                                                    }
                                                </span>
                                            </div>

                                            <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                {
                                                    line.transaction_date
                                                }
                                                {' · '}
                                                {
                                                    line.reference
                                                    ?? '—'
                                                }
                                                {' · '}
                                                {
                                                    line.bank_account_label
                                                    ?? '—'
                                                }
                                            </p>
                                        </div>

                                        <strong
                                            className={
                                                Number(
                                                    line.amount,
                                                ) >=
                                                0
                                                    ? 'text-emerald-700'
                                                    : 'text-red-700'
                                            }
                                        >
                                            {Number(
                                                line.amount,
                                            ).toLocaleString()}
                                            {' '}
                                            {
                                                line.currency
                                            }
                                        </strong>

                                        <div>
                                            {line.suggested_match ? (
                                                <div className="rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
                                                    <p className="text-[9px] text-[var(--ac-text-muted)]">
                                                        {text(
                                                            'مطابقة مقترحة',
                                                            'Suggested match',
                                                        )}
                                                    </p>

                                                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                                                        <Link
                                                            href={
                                                                line.suggested_match.direction ===
                                                                'incoming'
                                                                    ? '/app/receipts/'
                                                                        + String(
                                                                            line.suggested_match.id,
                                                                        )
                                                                    : '/app/payments/'
                                                                        + String(
                                                                            line.suggested_match.id,
                                                                        )
                                                            }
                                                            className="text-[11px] font-semibold text-[var(--ac-accent)]"
                                                        >
                                                            {
                                                                line.suggested_match.number
                                                            }
                                                            {' · '}
                                                            {
                                                                line.suggested_match.movement_date
                                                            }
                                                        </Link>

                                                        <button
                                                            type="button"
                                                            disabled={
                                                                busy
                                                            }
                                                            onClick={() =>
                                                                void match(
                                                                    line.id,
                                                                    line.suggested_match!.id,
                                                                )
                                                            }
                                                            className="inline-flex h-8 items-center gap-1 rounded-[9px] bg-emerald-50 px-2.5 text-[9px] font-semibold text-emerald-700"
                                                        >
                                                            <CheckCircle2
                                                                size={
                                                                    11
                                                                }
                                                            />
                                                            {text(
                                                                'مطابقة',
                                                                'Match',
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : line.status ===
                                                'unmatched' ? (
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void manualMatch(
                                                                line,
                                                            )
                                                        }
                                                        className="inline-flex h-8 items-center gap-1 rounded-[9px] border border-[var(--ac-line)] px-2.5 text-[9px] font-semibold"
                                                    >
                                                        <Link2
                                                            size={
                                                                11
                                                            }
                                                        />
                                                        {text(
                                                            'مطابقة يدوية',
                                                            'Manual match',
                                                        )}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void ignore(
                                                                line.id,
                                                            )
                                                        }
                                                        className="inline-flex h-8 items-center gap-1 rounded-[9px] bg-slate-100 px-2.5 text-[9px] font-semibold text-slate-600"
                                                    >
                                                        <XCircle
                                                            size={
                                                                11
                                                            }
                                                        />
                                                        {text(
                                                            'تجاهل',
                                                            'Ignore',
                                                        )}
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </section>
            </main>
        </AppShell>
    );
}
