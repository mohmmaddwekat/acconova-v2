export type PartyType =
    | 'person'
    | 'company'
    | 'other';

export type PartyRole =
    | 'customer'
    | 'supplier'
    | 'contact';

export type Party = {
    id: number;

    type: PartyType;

    name: string | null;

    company_name:
        | string
        | null;

    email:
        | string
        | null;

    phone:
        | string
        | null;

    tax_number:
        | string
        | null;

    address_line_1:
        | string
        | null;

    address_line_2:
        | string
        | null;

    city:
        | string
        | null;

    state:
        | string
        | null;

    postal_code:
        | string
        | null;

    country_code:
        | string
        | null;

    notes:
        | string
        | null;

    roles: PartyRole[];

    deleted_at:
        | string
        | null;

    created_at: string;

    updated_at: string;
};

export type PartyIndexMeta = {
    current_page: number;

    last_page: number;

    per_page: number;

    total: number;
};

export type PartyIndexResponse = {
    data: Party[];

    meta: PartyIndexMeta;
};
