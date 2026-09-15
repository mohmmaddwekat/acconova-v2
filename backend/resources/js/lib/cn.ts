import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names while removing conflicting Tailwind classes.
 *
 * @param inputs One or more class name values.
 * @returns A normalized Tailwind-compatible class string.
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}