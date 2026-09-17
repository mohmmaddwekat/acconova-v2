import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import {
    useLocale,
} from '@/lib/i18n';
import {
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';

type AttendanceRow = {
    id: number;
    occurred_on: string;
    status:
        | 'present'
        | 'absent';
    quantity: string;
    overtime_hours: string;
    overtime_rate: string;
    notes: string | null;
};

type Rule = {
    id: number;
    label: string;
    kind:
        | 'allowance'
        | 'bonus'
        | 'deduction';
    amount: string;
    starts_on: string;
    ends_on: string | null;
};

type Data = {
    attendance: {
        data: AttendanceRow[];
        last_page: number;
    };
    adjustments: Rule[];
};

type Correction =
    | {
          type:
              'attendance';
          action:
              'edit'
              | 'delete';
          row: AttendanceRow;
      }
    | {
          type:
              'adjustment';
          action:
              'edit'
              | 'delete';
          row: Rule;
      };

type Props = {
    mode:
        | 'attendance'
        | 'adjustments';
    id: number;
    basis: string;
    unit: string | null;
    currency: string;
    canPay: boolean;
    onChanged: () => void;
};

const field =
    'mt-2 w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)]';

const button =
    'inline-flex items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-white px-3.5 py-2.5 text-xs font-semibold transition hover:bg-[var(--ac-accent-soft)] disabled:opacity-50';

const primaryButton =
    'inline-flex items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-text)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';

/**
 * Format a local date without UTC conversion.
 */
function dateInput(
    date: Date,
): string {
    return `${date.getFullYear()}-${String(
        date.getMonth() + 1,
    ).padStart(2, '0')}-${String(
        date.getDate(),
    ).padStart(2, '0')}`;
}

/**
 * Return today's local date.
 */
function today(): string {
    return dateInput(
        new Date(),
    );
}

/**
 * Render either Attendance or recurring Compensation rules for one employee.
 */
export function StaffWorkforcePanel({
    mode,
    id,
    basis,
    unit,
    currency,
    canPay,
    onChanged,
}: Props) {
    const ar =
        useLocale() ===
        'ar';

    const [
        data,
        setData,
    ] =
        useState<Data | null>(
            null,
        );

    const [
        page,
        setPage,
    ] =
        useState(
            1,
        );

    const [
        revision,
        setRevision,
    ] =
        useState(
            0,
        );

    const [
        status,
        setStatus,
    ] =
        useState<
            | 'present'
            | 'absent'
        >(
            'present',
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        error,
        setError,
    ] =
        useState(
            '',
        );

    const [
        saved,
        setSaved,
    ] =
        useState(
            false,
        );

    const [
        correction,
        setCorrection,
    ] =
        useState<Correction | null>(
            null,
        );

    const copy =
        ar
            ? {
                  attendance:
                      'الحضور والإضافي',
                  attendanceHelp:
                      'سجل يوم العمل أو الغياب. إذا أخطأت يمكنك تعديل السجل أو حذفه مع كتابة سبب التصحيح.',
                  present:
                      'حاضر',
                  absent:
                      'غائب',
                  date:
                      'التاريخ',
                  quantity:
                      basis ===
                      'piece'
                          ? 'عدد الوحدات المنجزة'
                          : basis ===
                              'hour'
                            ? 'ساعات العمل'
                            : 'الكمية',
                  overtime:
                      'ساعات إضافية',
                  overtimeRate:
                      'أجر ساعة الإضافي',
                  note:
                      'ملاحظة',
                  saveAttendance:
                      'تسجيل الحضور',
                  recurring:
                      'البدلات والخصومات المستمرة',
                  recurringHelp:
                      'أنشئ بندًا يتكرر شهريًا. يمكن تصحيح البند أو حذفه قبل أن يصبح تاريخيًا بشكل يسبب تضاربًا.',
                  name:
                      'اسم البند',
                  kind:
                      'النوع',
                  allowance:
                      'بدل',
                  bonus:
                      'حافز / مكافأة',
                  deduction:
                      'خصم',
                  amount:
                      'المبلغ الشهري',
                  start:
                      'يبدأ من',
                  end:
                      'ينتهي في',
                  add:
                      'إضافة بند',
                  through:
                      'اعتماد البنود حتى شهر',
                  accrue:
                      'اعتماد المستحقات',
                  ongoing:
                      'مستمر',
                  edit:
                      'تعديل',
                  remove:
                      'حذف',
                  reason:
                      'سبب التصحيح',
                  saveCorrection:
                      'حفظ التصحيح',
                  cancel:
                      'إلغاء',
                  empty:
                      'لا توجد سجلات بعد.',
              }
            : {
                  attendance:
                      'Attendance & overtime',
                  attendanceHelp:
                      'Record a workday or absence. Mistakes can be corrected or deleted with an audit reason.',
                  present:
                      'Present',
                  absent:
                      'Absent',
                  date:
                      'Date',
                  quantity:
                      basis ===
                      'piece'
                          ? 'Completed units'
                          : basis ===
                              'hour'
                            ? 'Work hours'
                            : 'Quantity',
                  overtime:
                      'Overtime hours',
                  overtimeRate:
                      'Overtime hourly rate',
                  note:
                      'Note',
                  saveAttendance:
                      'Record attendance',
                  recurring:
                      'Recurring benefits & deductions',
                  recurringHelp:
                      'Create monthly recurring items. Rules can be corrected or removed while preserving audit history.',
                  name:
                      'Item name',
                  kind:
                      'Type',
                  allowance:
                      'Allowance',
                  bonus:
                      'Bonus',
                  deduction:
                      'Deduction',
                  amount:
                      'Monthly amount',
                  start:
                      'Starts on',
                  end:
                      'Ends on',
                  add:
                      'Add item',
                  through:
                      'Approve through month',
                  accrue:
                      'Approve recurring items',
                  ongoing:
                      'Ongoing',
                  edit:
                      'Edit',
                  remove:
                      'Delete',
                  reason:
                      'Correction reason',
                  saveCorrection:
                      'Save correction',
                  cancel:
                      'Cancel',
                  empty:
                      'No records yet.',
              };

    /**
     * Load attendance and recurring adjustment data.
     */
    useEffect(
        () => {
            const controller =
                new AbortController();

            apiRequest<Data>(
                `/api/staff/${id}/workforce?page=${page}`,
                {
                    signal:
                        controller.signal,
                },
            )
                .then(
                    setData,
                )
                .catch(
                    (
                        failure:
                            unknown,
                    ) => {
                        if (
                            ! controller
                                .signal
                                .aborted
                        ) {
                            setError(
                                failure instanceof
                                    Error
                                    ? failure.message
                                    : 'Failed',
                            );
                        }
                    },
                );

            return () =>
                controller.abort();
        },
        [
            id,
            page,
            revision,
        ],
    );

    /**
     * Send one employee workforce mutation.
     */
    async function send(
        path: string,
        values:
            Record<
                string,
                unknown
            >,
        method =
            'POST',
    ): Promise<boolean> {
        if (
            busy
        ) {
            return false;
        }

        setBusy(
            true,
        );

        setError(
            '',
        );

        setSaved(
            false,
        );

        try {
            await apiRequest(
                `/api/staff/${id}/${path}`,
                {
                    method,

                    body:
                        JSON.stringify(
                            values,
                        ),
                },
            );

            setRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            setSaved(
                true,
            );

            onChanged();

            return true;
        } catch (
            failure
        ) {
            setError(
                failure instanceof
                    ApiError
                    ? [
                          failure.message,
                          ...Object.values(
                              failure.errors,
                          ).flat(),
                      ].join(
                          ' ',
                      )
                    : failure instanceof
                        Error
                      ? failure.message
                      : 'Failed',
            );

            return false;
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Record one attendance row.
     */
    async function submitAttendance(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        const form =
            event.currentTarget;

        const values =
            Object.fromEntries(
                new FormData(
                    form,
                ),
            );

        const success =
            await send(
                'attendance',
                {
                    ...values,

                    status,

                    quantity:
                        values.quantity
                        || null,

                    overtime_hours:
                        values.overtime_hours
                        || '0',

                    overtime_rate:
                        values.overtime_rate
                        || '0',
                },
            );

        if (
            success
        ) {
            form.reset();

            setStatus(
                'present',
            );
        }
    }

    /**
     * Create one recurring employee adjustment.
     */
    async function submitAdjustment(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        const form =
            event.currentTarget;

        const values =
            Object.fromEntries(
                new FormData(
                    form,
                ),
            );

        const success =
            await send(
                'adjustments',
                {
                    ...values,

                    ends_on:
                        values.ends_on
                        || null,
                },
            );

        if (
            success
        ) {
            form.reset();
        }
    }

    /**
     * Correct or delete an attendance/adjustment record with an audit reason.
     */
    async function submitCorrection(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            ! correction
        ) {
            return;
        }

        const values =
            Object.fromEntries(
                new FormData(
                    event.currentTarget,
                ),
            );

        let path =
            '';

        let payload:
            Record<
                string,
                unknown
            > = {
            reason:
                values.reason,
        };

        if (
            correction.type ===
            'attendance'
        ) {
            path =
                `attendance/${correction.row.id}`;

            if (
                correction.action ===
                'edit'
            ) {
                payload = {
                    ...payload,

                    occurred_on:
                        values.occurred_on,

                    status:
                        values.status,

                    quantity:
                        values.quantity
                        || null,

                    overtime_hours:
                        values.overtime_hours
                        || '0',

                    overtime_rate:
                        values.overtime_rate
                        || '0',

                    notes:
                        values.notes
                        || null,
                };
            }
        } else {
            path =
                `adjustments/${correction.row.id}/correct`;

            if (
                correction.action ===
                'edit'
            ) {
                payload = {
                    ...payload,

                    label:
                        values.label,

                    amount:
                        values.amount,

                    starts_on:
                        values.starts_on,

                    ends_on:
                        values.ends_on
                        || null,
                };
            }
        }

        const success =
            await send(
                path,
                payload,
                correction.action ===
                'delete'
                    ? 'DELETE'
                    : 'PATCH',
            );

        if (
            success
        ) {
            setCorrection(
                null,
            );
        }
    }

    const previousMonth =
        new Date();

    previousMonth.setDate(
        1,
    );

    previousMonth.setMonth(
        previousMonth.getMonth()
        - 1,
    );

    const through =
        dateInput(
            previousMonth,
        ).slice(
            0,
            7,
        );

    if (
        mode ===
        'attendance'
    ) {
        return (
            <div className="space-y-5">
                {error && (
                    <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                        {
                            error
                        }
                    </p>
                )}

                {saved && (
                    <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                        {ar
                            ? 'تم الحفظ.'
                            : 'Saved.'}
                    </p>
                )}

                <section className="rounded-[22px] border border-[var(--ac-line)] bg-white p-5">
                    <h3 className="font-semibold">
                        {
                            copy.attendance
                        }
                    </h3>

                    <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">
                        {
                            copy.attendanceHelp
                        }
                    </p>

                    {canPay && (
                        <form
                            onSubmit={(
                                event,
                            ) =>
                                void submitAttendance(
                                    event,
                                )
                            }
                            className="mt-5"
                        >
                            <fieldset
                                disabled={
                                    busy
                                }
                                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                            >
                                <label className="text-xs font-semibold">
                                    {
                                        copy.date
                                    }

                                    <input
                                        required
                                        type="date"
                                        name="occurred_on"
                                        max={today()}
                                        defaultValue={today()}
                                        className={
                                            field
                                        }
                                    />
                                </label>

                                <label className="text-xs font-semibold">
                                    {
                                        copy.attendance
                                    }

                                    <select
                                        value={
                                            status
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            setStatus(
                                                event
                                                    .target
                                                    .value as
                                                    | 'present'
                                                    | 'absent',
                                            )
                                        }
                                        className={
                                            field
                                        }
                                    >
                                        <option value="present">
                                            {
                                                copy.present
                                            }
                                        </option>

                                        <option value="absent">
                                            {
                                                copy.absent
                                            }
                                        </option>
                                    </select>
                                </label>

                                {status ===
                                    'present'
                                    && [
                                        'hour',
                                        'piece',
                                    ].includes(
                                        basis,
                                    ) && (
                                    <label className="text-xs font-semibold">
                                        {
                                            copy.quantity
                                        }
                                        {basis ===
                                            'piece'
                                            && unit
                                            ? ` (${unit})`
                                            : ''}

                                        <input
                                            required
                                            type="number"
                                            min="0.0001"
                                            max={basis ===
                                            'hour'
                                                ? 24
                                                : 9999}
                                            step="0.0001"
                                            name="quantity"
                                            className={
                                                field
                                            }
                                        />
                                    </label>
                                )}

                                {status ===
                                    'present' && (
                                    <>
                                        <label className="text-xs font-semibold">
                                            {
                                                copy.overtime
                                            }

                                            <input
                                                type="number"
                                                min="0"
                                                max="24"
                                                step="0.0001"
                                                name="overtime_hours"
                                                defaultValue="0"
                                                className={
                                                    field
                                                }
                                            />
                                        </label>

                                        <label className="text-xs font-semibold">
                                            {
                                                copy.overtimeRate
                                            }
                                            {' '}
                                            (
                                            {
                                                currency
                                            }
                                            )

                                            <input
                                                type="number"
                                                min="0"
                                                max="999999"
                                                step="0.0001"
                                                name="overtime_rate"
                                                defaultValue="0"
                                                className={
                                                    field
                                                }
                                            />
                                        </label>
                                    </>
                                )}

                                <label className="text-xs font-semibold sm:col-span-2">
                                    {
                                        copy.note
                                    }

                                    <input
                                        name="notes"
                                        maxLength={
                                            2000
                                        }
                                        className={
                                            field
                                        }
                                    />
                                </label>

                                <div className="flex items-end">
                                    <button
                                        className={`${primaryButton} w-full`}
                                    >
                                        {
                                            copy.saveAttendance
                                        }
                                    </button>
                                </div>
                            </fieldset>
                        </form>
                    )}
                </section>

                <section className="overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-white">
                    <div className="divide-y divide-[var(--ac-line)]">
                        {data?.attendance.data.map(
                            (
                                row,
                            ) => (
                                <article
                                    key={
                                        row.id
                                    }
                                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <strong className="text-sm">
                                                {
                                                    row.occurred_on
                                                }
                                            </strong>

                                            <span
                                                className={[
                                                    'rounded-full px-2 py-1 text-[9px] font-semibold',
                                                    row.status ===
                                                    'present'
                                                        ? 'bg-emerald-50 text-emerald-700'
                                                        : 'bg-red-50 text-red-700',
                                                ].join(
                                                    ' ',
                                                )}
                                            >
                                                {row.status ===
                                                'present'
                                                    ? copy.present
                                                    : copy.absent}
                                            </span>
                                        </div>

                                        <p className="mt-2 text-xs text-[var(--ac-text-muted)]">
                                            {copy.quantity}
                                            {': '}
                                            {
                                                row.quantity
                                            }
                                            {' · '}
                                            {copy.overtime}
                                            {': '}
                                            {
                                                row.overtime_hours
                                            }
                                        </p>

                                        {row.notes && (
                                            <p className="mt-1 text-xs text-[var(--ac-text-soft)]">
                                                {
                                                    row.notes
                                                }
                                            </p>
                                        )}
                                    </div>

                                    {canPay && (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className={
                                                    button
                                                }
                                                onClick={() =>
                                                    setCorrection(
                                                        {
                                                            type:
                                                                'attendance',

                                                            action:
                                                                'edit',

                                                            row,
                                                        },
                                                    )
                                                }
                                            >
                                                <Pencil
                                                    size={
                                                        13
                                                    }
                                                />

                                                {
                                                    copy.edit
                                                }
                                            </button>

                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 rounded-[13px] border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                                                onClick={() =>
                                                    setCorrection(
                                                        {
                                                            type:
                                                                'attendance',

                                                            action:
                                                                'delete',

                                                            row,
                                                        },
                                                    )
                                                }
                                            >
                                                <Trash2
                                                    size={
                                                        13
                                                    }
                                                />

                                                {
                                                    copy.remove
                                                }
                                            </button>
                                        </div>
                                    )}
                                </article>
                            ),
                        )}

                        {! data?.attendance.data.length && (
                            <p className="p-8 text-center text-xs text-[var(--ac-text-muted)]">
                                {
                                    copy.empty
                                }
                            </p>
                        )}
                    </div>

                    {data
                        && data.attendance.last_page >
                            1 && (
                            <div className="flex justify-between border-t border-[var(--ac-line)] p-4">
                                <button
                                    type="button"
                                    className={
                                        button
                                    }
                                    disabled={
                                        page ===
                                        1
                                    }
                                    onClick={() =>
                                        setPage(
                                            (
                                                current,
                                            ) =>
                                                current
                                                - 1,
                                        )
                                    }
                                >
                                    {ar
                                        ? 'السابق'
                                        : 'Previous'}
                                </button>

                                <button
                                    type="button"
                                    className={
                                        button
                                    }
                                    disabled={
                                        page ===
                                        data
                                            .attendance
                                            .last_page
                                    }
                                    onClick={() =>
                                        setPage(
                                            (
                                                current,
                                            ) =>
                                                current
                                                + 1,
                                        )
                                    }
                                >
                                    {ar
                                        ? 'التالي'
                                        : 'Next'}
                                </button>
                            </div>
                        )}
                </section>

                <CorrectionDialog
                    correction={
                        correction
                    }
                    copy={
                        copy
                    }
                    currency={
                        currency
                    }
                    busy={
                        busy
                    }
                    onClose={() =>
                        setCorrection(
                            null,
                        )
                    }
                    onSubmit={
                        submitCorrection
                    }
                />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {error && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    {
                        error
                    }
                </p>
            )}

            {saved && (
                <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                    {ar
                        ? 'تم الحفظ.'
                        : 'Saved.'}
                </p>
            )}

            <section className="rounded-[22px] border border-[var(--ac-line)] bg-white p-5">
                <h3 className="font-semibold">
                    {
                        copy.recurring
                    }
                </h3>

                <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">
                    {
                        copy.recurringHelp
                    }
                </p>

                {canPay && (
                    <form
                        onSubmit={(
                            event,
                        ) =>
                            void submitAdjustment(
                                event,
                            )
                        }
                        className="mt-5"
                    >
                        <fieldset
                            disabled={
                                busy
                            }
                            className="grid gap-4 sm:grid-cols-2"
                        >
                            <label className="text-xs font-semibold">
                                {
                                    copy.name
                                }

                                <input
                                    required
                                    maxLength={
                                        255
                                    }
                                    name="label"
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    copy.kind
                                }

                                <select
                                    name="kind"
                                    className={
                                        field
                                    }
                                >
                                    <option value="allowance">
                                        {
                                            copy.allowance
                                        }
                                    </option>

                                    <option value="bonus">
                                        {
                                            copy.bonus
                                        }
                                    </option>

                                    <option value="deduction">
                                        {
                                            copy.deduction
                                        }
                                    </option>
                                </select>
                            </label>

                            <label className="text-xs font-semibold">
                                {copy.amount}
                                {' '}
                                (
                                {
                                    currency
                                }
                                )

                                <input
                                    required
                                    type="number"
                                    min="0.0001"
                                    max="999999999"
                                    step="0.0001"
                                    name="amount"
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    copy.start
                                }

                                <input
                                    required
                                    type="date"
                                    defaultValue={today()}
                                    name="starts_on"
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    copy.end
                                }

                                <input
                                    type="date"
                                    name="ends_on"
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <div className="flex items-end">
                                <button
                                    className={`${primaryButton} w-full`}
                                >
                                    <Plus
                                        size={
                                            14
                                        }
                                    />

                                    {
                                        copy.add
                                    }
                                </button>
                            </div>
                        </fieldset>
                    </form>
                )}
            </section>

            <section className="rounded-[22px] border border-[var(--ac-line)] bg-white p-5">
                <div className="space-y-2">
                    {data?.adjustments.map(
                        (
                            rule,
                        ) => (
                            <div
                                key={
                                    rule.id
                                }
                                className="rounded-[16px] bg-[var(--ac-surface-soft)] p-4"
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <strong className="text-sm">
                                            {
                                                rule.label
                                            }
                                        </strong>

                                        <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                            {
                                                copy[
                                                    rule.kind
                                                ]
                                            }
                                            {' · '}
                                            {rule.amount}
                                            {' '}
                                            {
                                                currency
                                            }
                                        </p>

                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                            {
                                                rule.starts_on
                                            }
                                            {' — '}
                                            {rule.ends_on
                                                ?? copy.ongoing}
                                        </p>
                                    </div>

                                    {canPay && (
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className={
                                                    button
                                                }
                                                onClick={() =>
                                                    setCorrection(
                                                        {
                                                            type:
                                                                'adjustment',

                                                            action:
                                                                'edit',

                                                            row:
                                                                rule,
                                                        },
                                                    )
                                                }
                                            >
                                                <Pencil
                                                    size={
                                                        13
                                                    }
                                                />

                                                {
                                                    copy.edit
                                                }
                                            </button>

                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 rounded-[13px] border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                                                onClick={() =>
                                                    setCorrection(
                                                        {
                                                            type:
                                                                'adjustment',

                                                            action:
                                                                'delete',

                                                            row:
                                                                rule,
                                                        },
                                                    )
                                                }
                                            >
                                                <Trash2
                                                    size={
                                                        13
                                                    }
                                                />

                                                {
                                                    copy.remove
                                                }
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ),
                    )}

                    {! data?.adjustments.length && (
                        <p className="rounded-xl border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">
                            {
                                copy.empty
                            }
                        </p>
                    )}
                </div>

                {canPay && (
                    <form
                        className="mt-5 flex flex-col gap-3 border-t border-[var(--ac-line)] pt-5 sm:flex-row sm:items-end"
                        onSubmit={(
                            event,
                        ) => {
                            event.preventDefault();

                            void send(
                                'adjustments/accrue',
                                Object.fromEntries(
                                    new FormData(
                                        event.currentTarget,
                                    ),
                                ),
                            );
                        }}
                    >
                        <label className="flex-1 text-xs font-semibold">
                            {
                                copy.through
                            }

                            <input
                                required
                                type="month"
                                name="through"
                                defaultValue={
                                    through
                                }
                                max={
                                    through
                                }
                                className={
                                    field
                                }
                            />
                        </label>

                        <button
                            disabled={
                                busy
                            }
                            className={
                                primaryButton
                            }
                        >
                            {
                                copy.accrue
                            }
                        </button>
                    </form>
                )}
            </section>

            <CorrectionDialog
                correction={
                    correction
                }
                copy={
                    copy
                }
                currency={
                    currency
                }
                busy={
                    busy
                }
                onClose={() =>
                    setCorrection(
                        null,
                    )
                }
                onSubmit={
                    submitCorrection
                }
            />
        </div>
    );
}

/**
 * Render an audited correction form for attendance or recurring adjustments.
 */
function CorrectionDialog({
    correction,
    copy,
    currency,
    busy,
    onClose,
    onSubmit,
}: {
    correction: Correction | null;
    copy: Record<
        string,
        string
    >;
    currency: string;
    busy: boolean;
    onClose: () => void;
    onSubmit: (
        event:
            FormEvent<HTMLFormElement>,
    ) => Promise<void>;
}) {
    if (
        ! correction
    ) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
            <form
                onSubmit={(
                    event,
                ) =>
                    void onSubmit(
                        event,
                    )
                }
                className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl"
            >
                <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold">
                        {correction.action ===
                        'edit'
                            ? copy.edit
                            : copy.remove}
                    </h3>

                    <button
                        type="button"
                        onClick={
                            onClose
                        }
                    >
                        <X
                            size={
                                17
                            }
                        />
                    </button>
                </div>

                {correction.action ===
                    'edit'
                    && correction.type ===
                        'attendance' && (
                    <div className="mt-4 space-y-3">
                        <label className="block text-xs font-semibold">
                            {
                                copy.date
                            }

                            <input
                                required
                                type="date"
                                max={today()}
                                name="occurred_on"
                                defaultValue={
                                    correction
                                        .row
                                        .occurred_on
                                }
                                className={
                                    field
                                }
                            />
                        </label>

                        <label className="block text-xs font-semibold">
                            {
                                copy.attendance
                            }

                            <select
                                name="status"
                                defaultValue={
                                    correction
                                        .row
                                        .status
                                }
                                className={
                                    field
                                }
                            >
                                <option value="present">
                                    {
                                        copy.present
                                    }
                                </option>

                                <option value="absent">
                                    {
                                        copy.absent
                                    }
                                </option>
                            </select>
                        </label>

                        <label className="block text-xs font-semibold">
                            {
                                copy.quantity
                            }

                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                name="quantity"
                                defaultValue={
                                    correction
                                        .row
                                        .quantity
                                }
                                className={
                                    field
                                }
                            />
                        </label>

                        <label className="block text-xs font-semibold">
                            {
                                copy.overtime
                            }

                            <input
                                type="number"
                                min="0"
                                max="24"
                                step="0.0001"
                                name="overtime_hours"
                                defaultValue={
                                    correction
                                        .row
                                        .overtime_hours
                                }
                                className={
                                    field
                                }
                            />
                        </label>

                        <label className="block text-xs font-semibold">
                            {
                                copy.overtimeRate
                            }
                            {' '}
                            (
                            {
                                currency
                            }
                            )

                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                name="overtime_rate"
                                defaultValue={
                                    correction
                                        .row
                                        .overtime_rate
                                }
                                className={
                                    field
                                }
                            />
                        </label>

                        <label className="block text-xs font-semibold">
                            {
                                copy.note
                            }

                            <textarea
                                name="notes"
                                rows={
                                    2
                                }
                                defaultValue={
                                    correction
                                        .row
                                        .notes
                                    ?? ''
                                }
                                className={`${field} resize-none`}
                            />
                        </label>
                    </div>
                )}

                {correction.action ===
                    'edit'
                    && correction.type ===
                        'adjustment' && (
                    <div className="mt-4 space-y-3">
                        <label className="block text-xs font-semibold">
                            {
                                copy.name
                            }

                            <input
                                required
                                name="label"
                                defaultValue={
                                    correction
                                        .row
                                        .label
                                }
                                className={
                                    field
                                }
                            />
                        </label>

                        <label className="block text-xs font-semibold">
                            {
                                copy.amount
                            }

                            <input
                                required
                                type="number"
                                min="0.0001"
                                step="0.0001"
                                name="amount"
                                defaultValue={
                                    correction
                                        .row
                                        .amount
                                }
                                className={
                                    field
                                }
                            />
                        </label>

                        <label className="block text-xs font-semibold">
                            {
                                copy.start
                            }

                            <input
                                required
                                type="date"
                                name="starts_on"
                                defaultValue={
                                    correction
                                        .row
                                        .starts_on
                                }
                                className={
                                    field
                                }
                            />
                        </label>

                        <label className="block text-xs font-semibold">
                            {
                                copy.end
                            }

                            <input
                                type="date"
                                name="ends_on"
                                defaultValue={
                                    correction
                                        .row
                                        .ends_on
                                    ?? ''
                                }
                                className={
                                    field
                                }
                            />
                        </label>
                    </div>
                )}

                <label className="mt-4 block text-xs font-semibold">
                    {
                        copy.reason
                    }

                    <textarea
                        required
                        minLength={
                            3
                        }
                        maxLength={
                            1000
                        }
                        name="reason"
                        rows={
                            3
                        }
                        className={`${field} resize-none`}
                    />
                </label>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        className={
                            button
                        }
                        onClick={
                            onClose
                        }
                    >
                        {
                            copy.cancel
                        }
                    </button>

                    <button
                        disabled={
                            busy
                        }
                        className={
                            correction.action ===
                            'delete'
                                ? 'rounded-[13px] bg-red-700 px-4 py-2.5 text-sm font-semibold text-white'
                                : primaryButton
                        }
                    >
                        {correction.action ===
                        'delete'
                            ? copy.remove
                            : copy.saveCorrection}
                    </button>
                </div>
            </form>
        </div>
    );
}