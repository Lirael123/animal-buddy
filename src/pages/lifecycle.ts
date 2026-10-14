let version = 0;
export function pageVersion(): number { return version; }
export function leavePage(): void { version++; }
export function isCurrentPage(value: number): boolean { return value === version; }
