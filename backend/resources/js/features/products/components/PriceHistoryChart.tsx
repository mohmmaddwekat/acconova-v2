type PricePoint = {
    date: string;
    kind: 'sale_invoice' | 'purchase_invoice';
    price: string;
    count: number;
};

export function PriceHistoryChart({
    points,
    ar,
}: {
    points: PricePoint[];
    ar: boolean;
}) {
    if (! points.length) {
        return (
            <div className="rounded-[18px] border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">
                {ar ? 'لا يوجد سجل أسعار كافٍ بعد.' : 'No price history yet.'}
            </div>
        );
    }

    const values = points.map((point) => Number(point.price));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, max * 0.1, 1);
    const width = 720;
    const height = 220;
    const padX = 26;
    const padY = 24;
    const usableWidth = width - padX * 2;
    const usableHeight = height - padY * 2;

    const series = (
        kind: PricePoint['kind'],
    ) => points
        .map((point, index) => ({
            ...point,
            index,
        }))
        .filter((point) => point.kind === kind);

    function xy(
        point: PricePoint & { index: number },
    ): [number, number] {
        const x =
            padX
            + (
                points.length <= 1
                    ? usableWidth / 2
                    : point.index / (points.length - 1) * usableWidth
            );
        const y =
            padY
            + (
                1
                - (
                    Number(point.price) - min
                ) / range
            ) * usableHeight;

        return [x, y];
    }

    function path(
        items: Array<PricePoint & { index: number }>,
    ): string {
        return items
            .map((point, index) => {
                const [x, y] = xy(point);
                return (index === 0 ? 'M' : 'L') + x + ' ' + y;
            })
            .join(' ');
    }

    const sales = series('sale_invoice');
    const purchases = series('purchase_invoice');

    return (
        <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h4 className="text-xs font-bold text-[var(--ac-text)]">
                        {ar ? 'سجل تغير الأسعار' : 'Price history'}
                    </h4>
                    <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                        {ar
                            ? 'متوسط سعر البيع والشراء في الأيام التي حدثت فيها حركة.'
                            : 'Average sale and purchase price on days with activity.'}
                    </p>
                </div>

                <div className="flex gap-3 text-[9px] font-semibold">
                    <span className="text-[var(--ac-accent)]">
                        ● {ar ? 'بيع' : 'Sales'}
                    </span>
                    <span className="text-amber-600">
                        ● {ar ? 'شراء' : 'Purchases'}
                    </span>
                </div>
            </div>

            <div className="mt-3 overflow-x-auto">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-[220px] min-w-[620px] w-full"
                    role="img"
                    aria-label={ar ? 'رسم سجل الأسعار' : 'Price history chart'}
                >
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = padY + ratio * usableHeight;
                        return (
                            <line
                                key={ratio}
                                x1={padX}
                                x2={width - padX}
                                y1={y}
                                y2={y}
                                stroke="currentColor"
                                className="text-[var(--ac-line)]"
                                strokeWidth="1"
                            />
                        );
                    })}

                    {sales.length > 1 && (
                        <path
                            d={path(sales)}
                            fill="none"
                            stroke="currentColor"
                            className="text-[var(--ac-accent)]"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}

                    {purchases.length > 1 && (
                        <path
                            d={path(purchases)}
                            fill="none"
                            stroke="currentColor"
                            className="text-amber-600"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}

                    {sales.map((point) => {
                        const [x, y] = xy(point);
                        return (
                            <circle
                                key={'sale-' + point.index}
                                cx={x}
                                cy={y}
                                r="4"
                                fill="currentColor"
                                className="text-[var(--ac-accent)]"
                            >
                                <title>{point.date + ' · ' + point.price}</title>
                            </circle>
                        );
                    })}

                    {purchases.map((point) => {
                        const [x, y] = xy(point);
                        return (
                            <circle
                                key={'purchase-' + point.index}
                                cx={x}
                                cy={y}
                                r="4"
                                fill="currentColor"
                                className="text-amber-600"
                            >
                                <title>{point.date + ' · ' + point.price}</title>
                            </circle>
                        );
                    })}
                </svg>
            </div>

            <div className="mt-1 flex items-center justify-between text-[9px] text-[var(--ac-text-muted)]">
                <span>{points[0]?.date}</span>
                <span>
                    {ar ? 'النطاق' : 'Range'}: {min.toLocaleString()} – {max.toLocaleString()}
                </span>
                <span>{points[points.length - 1]?.date}</span>
            </div>
        </section>
    );
}
