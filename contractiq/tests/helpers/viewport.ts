/** Makes window.matchMedia answer (min-width|max-width: Npx) and reduced-motion queries for a given viewport. */
export function mockViewport(width: number, opts: { reducedMotion?: boolean } = {}): void {
  window.matchMedia = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    let matches = true;
    if (min) matches &&= width >= Number(min[1]);
    if (max) matches &&= width <= Number(max[1]);
    if (/prefers-reduced-motion:\s*reduce/.test(query)) matches = !!opts.reducedMotion;
    return {
      matches, media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
}
