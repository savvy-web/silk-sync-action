/** `1 repository`, `2 repositories`: a count with its noun in agreement. */
export const plural = (n: number, one: string, many: string = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
