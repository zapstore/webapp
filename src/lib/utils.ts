/**
 * Utility functions
 */

/**
 * Combines class names, filtering out falsy values
 * Simple implementation of clsx/classnames functionality
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
	return classes.filter(Boolean).join(' ');
}
