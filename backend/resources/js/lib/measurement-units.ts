export type MeasurementDimension =
    | 'mass'
    | 'volume'
    | 'length'
    | 'count';

export type MeasurementUnitOption = {
    value: string;
    label: string;
    dimension: MeasurementDimension;
    factor: number;
};

const units: MeasurementUnitOption[] = [
    {
        value: 'g',
        label: 'g',
        dimension: 'mass',
        factor: 1,
    },
    {
        value: 'kg',
        label: 'kg',
        dimension: 'mass',
        factor: 1000,
    },
    {
        value: 't',
        label: 't',
        dimension: 'mass',
        factor: 1000000,
    },
    {
        value: 'ml',
        label: 'ml',
        dimension: 'volume',
        factor: 1,
    },
    {
        value: 'L',
        label: 'L',
        dimension: 'volume',
        factor: 1000,
    },
    {
        value: 'mm',
        label: 'mm',
        dimension: 'length',
        factor: 1,
    },
    {
        value: 'cm',
        label: 'cm',
        dimension: 'length',
        factor: 10,
    },
    {
        value: 'm',
        label: 'm',
        dimension: 'length',
        factor: 1000,
    },
    {
        value: 'piece',
        label: 'piece',
        dimension: 'count',
        factor: 1,
    },
];

const aliases: Record<string, string> = {
    g: 'g',
    gram: 'g',
    grams: 'g',
    غ: 'g',
    غم: 'g',
    غرام: 'g',
    جرام: 'g',

    kg: 'kg',
    kgs: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    كغ: 'kg',
    كغم: 'kg',
    كيلو: 'kg',
    كيلوغرام: 'kg',

    t: 't',
    ton: 't',
    tons: 't',
    tonne: 't',
    tonnes: 't',
    طن: 't',

    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    millilitre: 'ml',
    millilitres: 'ml',
    مل: 'ml',

    l: 'L',
    liter: 'L',
    liters: 'L',
    litre: 'L',
    litres: 'L',
    لتر: 'L',

    mm: 'mm',
    millimeter: 'mm',
    millimeters: 'mm',

    cm: 'cm',
    centimeter: 'cm',
    centimeters: 'cm',

    m: 'm',
    meter: 'm',
    meters: 'm',
    metre: 'm',
    metres: 'm',

    piece: 'piece',
    pieces: 'piece',
    pc: 'piece',
    pcs: 'piece',
    قطعة: 'piece',
};

/**
 * Normalize Arabic/Persian numerals and decimal separators.
 */
export function normalizeDecimalInput(
    value: string,
): string {
    const arabicDigits =
        '٠١٢٣٤٥٦٧٨٩';

    const persianDigits =
        '۰۱۲۳۴۵۶۷۸۹';

    return value
        .trim()
        .replace(
            /[٠-٩]/g,
            (digit) =>
                String(
                    arabicDigits.indexOf(
                        digit,
                    ),
                ),
        )
        .replace(
            /[۰-۹]/g,
            (digit) =>
                String(
                    persianDigits.indexOf(
                        digit,
                    ),
                ),
        )
        .replace(
            /[٬\s]/g,
            '',
        )
        .replace(
            /[٫,]/g,
            '.',
        );
}

/**
 * Normalize one known unit while leaving custom units intact.
 */
export function normalizeMeasurementUnit(
    unit: string,
): string {
    const trimmed =
        unit.trim();

    return aliases[
        trimmed.toLowerCase()
    ] ?? trimmed;
}

/**
 * Return compatible human input units for a Product stock unit.
 */
export function compatibleMeasurementUnits(
    stockUnit: string,
): MeasurementUnitOption[] {
    const normalized =
        normalizeMeasurementUnit(
            stockUnit,
        );

    const base =
        units.find(
            (unit) =>
                unit.value ===
                normalized,
        );

    if (! base) {
        return [
            {
                value:
                    stockUnit,
                label:
                    stockUnit,
                dimension:
                    'count',
                factor:
                    1,
            },
        ];
    }

    return units.filter(
        (unit) =>
            unit.dimension ===
            base.dimension,
    );
}

/**
 * Parse one strictly positive localized decimal value.
 */
export function positiveMeasurementNumber(
    value: string,
): number | null {
    const normalized =
        normalizeDecimalInput(
            value,
        );

    if (
        normalized ===
        ''
    ) {
        return null;
    }

    const number =
        Number(
            normalized,
        );

    return Number.isFinite(
        number,
    )
        && number > 0
        ? number
        : null;
}

/**
 * Normalize a positive user quantity to a stable decimal string.
 */
export function normalizeMeasurementQuantity(
    value: string,
    decimals = 8,
): string {
    const number =
        positiveMeasurementNumber(
            value,
        );

    return number ===
        null
        ? ''
        : number.toFixed(
              decimals,
          );
}

/**
 * Calculate one material usage rate from a known batch.
 *
 * Example: 150 g / 350 pieces = 0.42857143 g per piece.
 */
export function calculateBatchUsageRate(
    materialQuantity: string,
    outputQuantity: string,
): string {
    const material =
        positiveMeasurementNumber(
            materialQuantity,
        );

    const output =
        positiveMeasurementNumber(
            outputQuantity,
        );

    if (
        material ===
            null
        || output ===
            null
    ) {
        return '';
    }

    const result =
        material /
        output;

    return result > 0
        && Number.isFinite(
            result,
        )
        ? result.toFixed(
              8,
          )
        : '';
}

/**
 * Convert a quantity between compatible standard units for live UI preview.
 *
 * The backend repeats conversion using exact integer arithmetic and remains the
 * source of truth.
 */
export function convertMeasurementQuantity(
    quantity: string,
    fromUnit: string,
    toUnit: string,
    decimals = 8,
): string {
    const value =
        positiveMeasurementNumber(
            quantity,
        );

    if (
        value ===
        null
    ) {
        return '';
    }

    const from =
        normalizeMeasurementUnit(
            fromUnit,
        );

    const to =
        normalizeMeasurementUnit(
            toUnit,
        );

    if (
        from.toLowerCase() ===
        to.toLowerCase()
    ) {
        return value.toFixed(
            decimals,
        );
    }

    const fromDefinition =
        units.find(
            (unit) =>
                unit.value ===
                from,
        );

    const toDefinition =
        units.find(
            (unit) =>
                unit.value ===
                to,
        );

    if (
        ! fromDefinition
        || ! toDefinition
        || fromDefinition.dimension !==
            toDefinition.dimension
    ) {
        return '';
    }

    const converted =
        value
        * fromDefinition.factor
        / toDefinition.factor;

    return converted.toFixed(
        decimals,
    );
}