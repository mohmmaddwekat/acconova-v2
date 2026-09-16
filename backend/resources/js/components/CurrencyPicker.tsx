import { useLocale } from '@/lib/i18n';
import { Check, Search } from 'lucide-react';
import { useState } from 'react';

const codes = ['ILS','USD','JOD','EUR','SAR','AED','EGP','GBP','KWD','QAR','BHD','OMR','TRY','CAD','AUD','CHF','CNY','JPY','INR','IQD','LBP','MAD','TND','DZD','LYD','YER','SDG','PKR','MYR','IDR','SEK','NOK','DKK','ZAR','BRL'];
export function CurrencyPicker({ initial }: { initial:string }) {
    const locale=useLocale(); const [value,setValue]=useState(initial); const [search,setSearch]=useState('');
    const names=new Intl.DisplayNames([locale],{type:'currency'});
    const query=search.trim().toUpperCase();
    const options=[...new Set([value,...codes,...(/^[A-Z]{3}$/.test(query)?[query]:[])])].filter(code=>code.includes(query)||(names.of(code)??code).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    return <div className="mt-3 space-y-3"><input type="hidden" name="currency" value={value}/><div className="flex items-center gap-3 rounded-2xl bg-[var(--ac-accent-soft)] p-4"><span className="rounded-xl bg-white px-3 py-2 font-bold" dir="ltr">{value}</span><span className="text-sm font-medium">{names.of(value)??value}</span><Check size={18} className="ms-auto"/></div><label className="flex items-center gap-2 rounded-xl border border-[var(--ac-line)] px-3"><Search size={16} className="text-[var(--ac-text-muted)]"/><input aria-label={locale==='ar'?'ابحث عن عملة أو اكتب رمزها':'Search currency or enter its code'} value={search} onChange={event=>setSearch(event.target.value)} placeholder={locale==='ar'?'ابحث بالاسم أو الرمز…':'Search by name or code…'} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"/></label><div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-3">{options.map(code=><button key={code} type="button" aria-pressed={code===value} onClick={()=>setValue(code)} className={`rounded-xl border p-3 text-start transition ${code===value?'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]':'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]'}`}><span className="flex items-center justify-between gap-2 text-sm font-semibold"><bdi>{code}</bdi>{code===value&&<Check size={14}/>}</span><span className="mt-1 block truncate text-xs text-[var(--ac-text-muted)]">{names.of(code)??code}</span></button>)}</div></div>;
}
