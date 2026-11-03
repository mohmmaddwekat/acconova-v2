import {
    ColumnFilterText,
    SortableTh,
    type TableSort,
} from '@/components/data/SortableHeader';
import { getLocale } from '@/lib/locale';
import {
    useMemo,
    useState,
} from 'react';

type Cell = string | number | null | undefined;

const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
});

function compare(left: Cell, right: Cell): number {
    const leftEmpty = left === null || left === undefined || left === '';
    const rightEmpty = right === null || right === undefined || right === '';

    if (leftEmpty || rightEmpty) {
        return Number(leftEmpty) - Number(rightEmpty);
    }

    const leftNumber = Number(left);
    const rightNumber = Number(right);

    if (
        typeof left !== 'boolean'
        && ! Number.isNaN(leftNumber)
        && ! Number.isNaN(rightNumber)
    ) {
        return leftNumber - rightNumber;
    }

    return collator.compare(String(left), String(right));
}

/**
 * Client side sorting and per column text filtering for a table whose rows are
 * all loaded in the browser. Declare an accessor per column, render the headers
 * with `view.th(...)` and map `view.rows` instead of the original rows.
 *
 * Tables fed by server pagination must sort on the server instead, because
 * this only reorders the rows already on screen.
 */
export function useTableView<T>(
    rows: T[],
    accessors: Record<string, (row: T) => Cell>,
) {
    const [sort, setSort] = useState<TableSort>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});

    const visible = useMemo(() => {
        let result = rows;

        for (const [key, value] of Object.entries(filters)) {
            const needle = value.trim().toLowerCase();
            const read = accessors[key];

            if (needle && read) {
                result = result.filter((row) =>
                    String(read(row) ?? '').toLowerCase().includes(needle),
                );
            }
        }

        if (sort && accessors[sort.key]) {
            const read = accessors[sort.key];
            const factor = sort.direction === 'asc' ? 1 : -1;

            result = [...result].sort(
                (a, b) => factor * compare(read(a), read(b)),
            );
        }

        return result;
        // The accessors are declared inline by the caller and are stable in meaning.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, sort, filters]);

    return {
        rows: visible,
        sort,
        setSort,
        filters,
        /**
         * One sortable, filterable header cell for the column `key`.
         */
        th(
            key: string,
            label: string,
            options: { className?: string; filterable?: boolean } = {},
        ) {
            const ar = getLocale() === 'ar';
            const filterable = options.filterable !== false;
            const value = filters[key] ?? '';

            return (
                <SortableTh
                    key={key}
                    ar={ar}
                    label={label}
                    sortKey={key}
                    sort={sort}
                    onSort={setSort}
                    className={options.className}
                    filterActive={value !== ''}
                    filter={
                        filterable
                            ? (
                                <ColumnFilterText
                                    ar={ar}
                                    value={value}
                                    onChange={(next) => setFilters((current) => ({
                                        ...current,
                                        [key]: next,
                                    }))}
                                />
                            )
                            : undefined
                    }
                />
            );
        },
    };
}
