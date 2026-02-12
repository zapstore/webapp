declare module 'bun:sqlite' {
	export interface Statement<T = unknown> {
		all(...params: unknown[]): T[];
		get(...params: unknown[]): T | null;
	}

	export interface DatabaseOptions {
		readonly?: boolean;
		create?: boolean;
		strict?: boolean;
	}

	export class Database {
		constructor(filename?: string, options?: DatabaseOptions);
		query<T = unknown>(sql: string): Statement<T>;
		close(): void;
	}
}
