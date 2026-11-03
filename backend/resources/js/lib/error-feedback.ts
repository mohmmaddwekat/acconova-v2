import {
    t,
    type TranslationKey,
} from './i18n';
import { getLocale } from './locale';

const statusKeys:
    Record<number, TranslationKey> = {
        401: 'errors.session',
        419: 'errors.session',
        403: 'errors.forbidden',
        404: 'errors.notFound',
        409: 'errors.conflict',
        413: 'errors.file',
        422: 'errors.validation',
        429: 'errors.throttled',
        500: 'errors.server',
        501: 'errors.server',
        502: 'errors.server',
        503: 'errors.server',
        504: 'errors.server',
    };

const trustedServerValidationCodes =
    new Set([
        'password_reuse',
        'permanent_delete_requires_archive',
        'permanent_delete_blocked',
        'approval_required',
    ]);

const safeBusinessMessages: Record<
    string,
    { ar: string; en: string }
> = {
    BILLING_UNAVAILABLE: {
        ar: 'تعذر بدء الدفع حاليًا. تحقق من إعداد الاشتراك ثم حاول مرة أخرى.',
        en: 'Checkout could not be started right now. Check the subscription setup and try again.',
    },
    BILLING_PORTAL_UNAVAILABLE: {
        ar: 'تعذر فتح إدارة الاشتراك حاليًا. حاول مرة أخرى بعد قليل.',
        en: 'Subscription management could not be opened right now. Please try again shortly.',
    },
    SUBSCRIPTION_ALREADY_EXISTS: {
        ar: 'لديك اشتراك موجود بالفعل. استخدم إدارة الاشتراك بدل إنشاء اشتراك جديد.',
        en: 'This workspace already has a subscription. Manage it instead of starting another one.',
    },
    AI_UNAVAILABLE: {
        ar: 'خدمة AccoNova AI غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.',
        en: 'AccoNova AI is temporarily unavailable. Please try again shortly.',
    },
    AI_CREDITS_REQUIRED: {
        ar: 'انتهى رصيد AccoNova AI المتاح لهذه المساحة. أضف رصيد AI للمتابعة.',
        en: 'This workspace has used its available AccoNova AI credits. Add AI credits to continue.',
    },
    AI_IMAGE_UNAVAILABLE: {
        ar: 'تعذر تحليل الصورة حاليًا. جرّب صورة أوضح/أصغر أو حاول مرة أخرى بعد قليل.',
        en: 'The image could not be analyzed right now. Try a clearer or smaller image, or retry shortly.',
    },
};

const fieldLabels: Record<
    string,
    { ar: string; en: string }
> = {
    party_id: { ar: 'الطرف', en: 'Party' },
    contact_id: { ar: 'الطرف', en: 'Party' },
    customer_id: { ar: 'العميل', en: 'Customer' },
    supplier_id: { ar: 'المورد', en: 'Supplier' },
    warehouse_id: { ar: 'المستودع', en: 'Warehouse' },
    department_id: { ar: 'القسم', en: 'Department' },
    issue_date: { ar: 'تاريخ الإصدار', en: 'Issue date' },
    due_date: { ar: 'تاريخ الاستحقاق', en: 'Due date' },
    currency: { ar: 'العملة', en: 'Currency' },
    exchange_rate: { ar: 'سعر الصرف', en: 'Exchange rate' },
    shipping_total: { ar: 'الشحن', en: 'Shipping' },
    payment_terms: { ar: 'شروط الدفع', en: 'Payment terms' },
    branch_label: { ar: 'الفرع / الموقع', en: 'Branch / location' },
    activity_type: { ar: 'نوع النشاط', en: 'Activity type' },
    market_type: { ar: 'السوق', en: 'Market' },
    notes: { ar: 'الملاحظات', en: 'Notes' },
    internal_notes: { ar: 'الملاحظات الداخلية', en: 'Internal notes' },
    amount: { ar: 'المبلغ', en: 'Amount' },
    lines: { ar: 'بنود الفاتورة', en: 'Invoice items' },
    'lines.*.product_id': { ar: 'الصنف', en: 'Item' },
    'lines.*.warehouse_id': { ar: 'المستودع', en: 'Warehouse' },
    'lines.*.tax_rule_id': { ar: 'قاعدة الضريبة', en: 'Tax rule' },
    'lines.*.description': { ar: 'الوصف', en: 'Description' },
    'lines.*.unit': { ar: 'الوحدة', en: 'Unit' },
    'lines.*.quantity': { ar: 'الكمية', en: 'Quantity' },
    'lines.*.unit_price': { ar: 'سعر الوحدة', en: 'Unit price' },
    'lines.*.discount_percent': { ar: 'نسبة الخصم', en: 'Discount %' },
    'lines.*.discount_value': { ar: 'قيمة الخصم', en: 'Discount value' },
    'lines.*.tax_rate': { ar: 'نسبة الضريبة', en: 'Tax rate' },
};

/**
 * Resolve a human label for a validation field, including numbered line items.
 */
function fieldLabel(
    field: string,
): string | null {
    const locale = getLocale();
    const line = /^lines\.(\d+)(?:\.(.+))?$/.exec(field);

    if (line) {
        const row = `${locale === 'ar' ? 'بند' : 'Item'} ${Number(line[1]) + 1}`;
        const inner = line[2]
            ? fieldLabels[`lines.*.${line[2]}`]?.[locale]
            : null;

        return inner ? `${row} — ${inner}` : row;
    }

    return fieldLabels[field]?.[locale] ?? null;
}

/**
 * Translate the first recognised Laravel rule into an actionable sentence.
 *
 * Only rule names and numeric/field-name parameters are used, never server text.
 */
function specificRuleMessage(
    rules: string[],
    params: Record<string, string[]>,
): string | null {
    for (const rule of rules) {
        const [first, second] = params[rule] ?? [];

        switch (rule) {
            case 'date':
            case 'dateformat':
                return t('errors.rule.date');
            case 'numeric':
                return t('errors.rule.numeric');
            case 'integer':
                return t('errors.rule.integer');
            case 'in':
            case 'enum':
                return t('errors.rule.in');
            case 'exists':
                return t('errors.rule.exists');
            case 'regex':
                return t('errors.rule.format');
            case 'min':
                if (first) {
                    return t('errors.rule.min', { limit: first });
                }
                break;
            case 'max':
                if (first) {
                    return t('errors.rule.max', { limit: first });
                }
                break;
            case 'gt':
                if (first) {
                    return t('errors.rule.gt', { limit: first });
                }
                break;
            case 'between':
                if (first && second) {
                    return t('errors.rule.between', { min: first, max: second });
                }
                break;
            case 'after':
            case 'afterorequal': {
                const other = first ? fieldLabel(first) : null;

                if (other) {
                    return t('errors.rule.after', { field: other });
                }
                break;
            }
        }
    }

    return null;
}

/**
 * Normalize transport failures into translated, user-safe feedback.
 *
 * Raw server text is rejected unless it is paired with an explicitly trusted
 * stable business-validation code generated by AccoNova itself.
 */
export function normalizeApiError(
    error: unknown,
): {
    generalMessage: string;

    fieldErrors:
        Record<string, string[]>;
} {
    const input =
        error &&
        typeof error ===
            'object'
            ? (
                  error as Record<
                      string,
                      unknown
                  >
              )
            : {};

    const status =
        typeof input.status ===
        'number'
            ? input.status
            : 0;

    const fieldErrors:
        Record<string, string[]> =
            {};

    const errors =
        input.errors &&
        typeof input.errors ===
            'object'
            ? (
                  input.errors as Record<
                      string,
                      unknown
                  >
              )
            : {};

    const codes =
        input.error_codes &&
        typeof input.error_codes ===
            'object'
            ? (
                  input.error_codes as Record<
                      string,
                      string[]
                  >
              )
            : {};

    const safeErrors =
        input.safe_errors &&
        typeof input.safe_errors ===
            'object'
            ? (
                  input.safe_errors as Record<
                      string,
                      unknown
                  >
              )
            : {};

    const paramsByField =
        input.error_params &&
        typeof input.error_params ===
            'object'
            ? (
                  input.error_params as Record<
                      string,
                      Record<
                          string,
                          string[]
                      >
                  >
              )
            : {};

    if (
        status ===
        422
    ) {
        for (
            const field of Object.keys(
                errors,
            )
        ) {
            const rules =
                Array.isArray(
                    codes[
                        field
                    ],
                )
                    ? codes[
                          field
                      ]
                    : [];

            const rawMessages =
                Array.isArray(
                    errors[
                        field
                    ],
                )
                    ? errors[
                          field
                      ].filter(
                          (
                              message,
                          ): message is string =>
                              typeof message ===
                              'string',
                      )
                    : [];

            const trustedBusinessValidation =
                safeErrors[field] === true ||
                rules.some(
                    (
                        code,
                    ) =>
                        trustedServerValidationCodes.has(
                            code,
                        ),
                );

            if (
                trustedBusinessValidation &&
                rawMessages[0]
            ) {
                fieldErrors[
                    field
                ] = [
                    rawMessages[
                        0
                    ],
                ];

                continue;
            }

            const knownKey:
                TranslationKey | null =
                rules.includes(
                    'unique',
                )
                    ? field ===
                      'sku'
                        ? 'errors.sku'
                        : field ===
                            'email'
                          ? 'errors.emailUsed'
                          : 'errors.unique'
                    : rules.includes(
                            'required',
                        )
                      ? 'errors.required'
                      : rules.includes(
                              'email',
                          )
                        ? 'errors.email'
                        : field ===
                            'file'
                          ? 'errors.file'
                          : null;

            const message =
                knownKey
                    ? t(
                          knownKey,
                      )
                    : (
                          specificRuleMessage(
                              rules,
                              paramsByField[
                                  field
                              ] ?? {},
                          )
                          ?? t(
                              'errors.invalidField',
                          )
                      );

            const label =
                fieldLabel(
                    field,
                );

            fieldErrors[
                field
            ] = [
                label
                    ? `${label}: ${message}`
                    : message,
            ];
        }
    }

    const errorId =
        typeof input.error_id ===
        'string'
            ? input.error_id
            : '';

    const code =
        typeof input.code === 'string'
            ? input.code
            : '';

    const safeBusinessMessage =
        safeBusinessMessages[code];

    const baseMessage = safeBusinessMessage
        ? safeBusinessMessage[getLocale()]
        : t(
              statusKeys[
                  status
              ] ??
                  (
                      status ===
                      0
                          ? 'errors.network'
                          : 'errors.unexpected'
                  ),
          );

    return {
        generalMessage:
            errorId
                ? baseMessage
                    + ' #'
                    + errorId
                : baseMessage,

        fieldErrors,
    };
}
