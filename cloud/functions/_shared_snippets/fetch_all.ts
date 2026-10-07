// #468: PostgREST tronca le select a 1000 righe (max_rows). race_results
// è già a ~900 righe: senza paginazione i calcoli perderebbero dati in
// silenzio. factory() deve ricostruire la query a ogni pagina.
async function fetchAllRows(factory: () => any): Promise<{ data: any[] | null; error: any }> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await factory().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}
