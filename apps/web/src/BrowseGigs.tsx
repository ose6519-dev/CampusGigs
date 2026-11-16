import { useEffect, useState, type FormEvent } from 'react';
import { gigImageUrl, publicRequest, type PublicGig, type PublicGigPage } from './api';

export const gigCategories = [
  'Design & Creative', 'Tech & Digital', 'Media & Editing', 'Personal Services',
  'Tutoring & Skills', 'Typing & Proofreading', 'Events & Lifestyle', 'Business Support',
];

export const naira = (kobo: number) => `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(kobo / 100)}`;

function serviceIcon(category: string) {
  return ({ 'Design & Creative': '✦', 'Tech & Digital': '⌘', 'Media & Editing': '◈',
    'Personal Services': '☼', 'Tutoring & Skills': '✦', 'Typing & Proofreading': '▧',
    'Events & Lifestyle': '◎', 'Business Support': '↗' } as Record<string, string>)[category] || '✦';
}

export function GigCard({ gig, onOpen }: { gig: PublicGig; onOpen: (id: string) => void }) {
  return <button className="discovery-card" onClick={() => onOpen(gig.id)} type="button" aria-label={`View ${gig.title}`}>
    <div className="discovery-cover">
      {gig.cover_image_id ? <img src={gigImageUrl(gig.id, gig.cover_image_id)} alt="" loading="lazy" /> : <div className="discovery-placeholder"><span>{serviceIcon(gig.category)}</span><small>CAMPUSGIGS</small></div>}
      <span className="discovery-category">{gig.category}</span>
    </div>
    <div className="discovery-info">
      <span className="discovery-provider">{gig.provider_name || 'CampusGigs provider'} <span className="verified-mini" title="Admin-verified provider" aria-label="Verified provider">✓</span></span>
      <strong className="discovery-title">{gig.title}</strong>
      <div className="discovery-secondary"><span>◷ {gig.delivery_days} {gig.delivery_days === 1 ? 'day' : 'days'}</span><span>◎ {gig.location_type === 'online' ? 'Online' : gig.location_name || 'Local'}</span></div>
      <div className="discovery-bottom"><span><small>FROM</small><strong>{naira(gig.price_kobo)}</strong></span><span className="discovery-arrow" aria-hidden="true">↗</span></div>
    </div>
  </button>;
}

export function FeaturedGigs({ onOpen, onBrowse }: { onOpen: (id: string) => void; onBrowse: () => void }) {
  const [gigs, setGigs] = useState<PublicGig[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void publicRequest<PublicGigPage>('/v1/public/gigs?limit=4', controller.signal)
      .then((data) => setGigs(data.gigs))
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <section className="section-wrap home-featured"><div className="section-heading"><div><span className="eyebrow">FRESH FROM THE COMMUNITY</span><h2>Discover real <i>talent.</i></h2></div><button className="text-link" onClick={onBrowse}>Browse all gigs ↗</button></div>
    {gigs.length ? <div className="discovery-grid">{gigs.map((gig) => <GigCard gig={gig} key={gig.id} onOpen={onOpen} />)}</div> : <div className="home-featured-empty"><span>✦</span><div><strong>{loading ? 'Finding great skills…' : 'New gigs are on their way.'}</strong><p>Explore skill categories while our verified providers prepare their services.</p></div><button className="button button-dark" onClick={onBrowse}>Explore gigs ↗</button></div>}
  </section>;
}

type Filters = { q: string; category: string; location: string; locationType: string; sort: string; minPrice: string; maxPrice: string };
const startingFilters = (category: string): Filters => ({ q: '', category, location: '', locationType: '', sort: 'newest', minPrice: '', maxPrice: '' });
function filtersFromUrl(category: string): Filters {
  const params = new URLSearchParams(window.location.search);
  const current = startingFilters(category);
  for (const key of Object.keys(current) as (keyof Filters)[]) {
    const value = params.get(key);
    if (value !== null && value.length <= 100) current[key] = value;
  }
  if (!gigCategories.includes(current.category)) current.category = '';
  if (!['online', 'in_person', 'both', ''].includes(current.locationType)) current.locationType = '';
  if (!['newest', 'price_low', 'price_high', 'fastest'].includes(current.sort)) current.sort = 'newest';
  return current;
}

export function BrowseGigs({ initialCategory, onOpen }: { initialCategory: string; onOpen: (id: string) => void }) {
  const [filters, setFilters] = useState<Filters>(() => filtersFromUrl(initialCategory));
  const [query, setQuery] = useState(filters.q);
  const [locationText, setLocationText] = useState(filters.location);
  const [gigs, setGigs] = useState<PublicGig[]>([]);
  const [offset, setOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  // Search-as-you-type with a short debounce to avoid flooding the public API.
  useEffect(() => { const timer = window.setTimeout(() => setFilters((old) => old.q === query ? old : { ...old, q: query }), 350); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((old) => old.location === locationText ? old : { ...old, location: locationText }), 350); return () => clearTimeout(timer); }, [locationText]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value && !(key === 'sort' && value === 'newest')) params.set(key, value); });
    window.history.replaceState(null, '', `/gigs${params.size ? `?${params}` : ''}`);
    params.set('limit', '12');
    setLoading(true); setError(''); setOffset(null);
    void publicRequest<PublicGigPage>(`/v1/public/gigs?${params}`, controller.signal)
      .then((page) => { setGigs(page.gigs); setOffset(page.nextOffset); })
      .catch((err: unknown) => { if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : 'Unable to load gigs'); setGigs([]); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, version]);

  const setFilter = (name: keyof Filters, value: string) => setFilters((old) => ({ ...old, [name]: value }));

  async function loadMore() {
    if (offset === null || moreLoading) return;
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value && !(key === 'sort' && value === 'newest')) params.set(key, value); });
    params.set('limit', '12'); params.set('offset', String(offset));
    setMoreLoading(true);
    try {
      const result = await publicRequest<PublicGigPage>(`/v1/public/gigs?${params}`);
      setGigs((old) => [...old, ...result.gigs.filter((gig) => !old.some((item) => item.id === gig.id))]);
      setOffset(result.nextOffset);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load more gigs'); }
    finally { setMoreLoading(false); }
  }

  function clear() { setQuery(''); setLocationText(''); setFilters(startingFilters('')); }
  function submit(event: FormEvent) { event.preventDefault(); setFilters((old) => ({ ...old, q: query, location: locationText })); }

  return <section className="section-wrap discover-page page-section">
    <div className="discover-heading"><div><span className="eyebrow">THE CAMPUSGIGS MARKETPLACE</span><h1 className="page-title">Find your <em>people.</em></h1><p>Real skills. Verified providers. Find a service that fits.</p></div><div className="discover-mark" aria-hidden="true">✦</div></div>
    <form className="discover-search" onSubmit={submit} role="search">
      <label className="discovery-search-main"><span aria-hidden="true">⌕</span><input type="search" value={query} maxLength={80} onChange={(event) => setQuery(event.target.value)} placeholder="What service do you need?" aria-label="Search gigs" /></label>
      <label className="discovery-location"><span aria-hidden="true">◎</span><input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Campus or city" maxLength={100} aria-label="Search campus or city" /></label>
      <button type="submit" className="button button-dark">Search <span>↗</span></button>
    </form>
    <div className="discover-chips" aria-label="Filter gigs by skill category"><button className={!filters.category ? 'chosen' : ''} onClick={() => setFilter('category', '')}>All skills</button>{gigCategories.map((name) => <button className={filters.category === name ? 'chosen' : ''} key={name} onClick={() => setFilter('category', name)}>{name}</button>)}</div>
    <div className="discover-tools"><div className="discover-tools-heading"><strong>Explore gigs</strong><span>{loading ? 'Searching…' : `${gigs.length} ${gigs.length === 1 ? 'service' : 'services'} shown`}</span></div><div className="discover-selects">
      <label>Work type<select value={filters.locationType} onChange={(event) => setFilter('locationType', event.target.value)}><option value="">Any location</option><option value="online">Online</option><option value="in_person">In person</option><option value="both">Both options</option></select></label>
      <label>Sort<select value={filters.sort} onChange={(event) => setFilter('sort', event.target.value)}><option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option><option value="fastest">Fastest delivery</option></select></label>
      <label>Min ₦<input aria-label="Minimum price in naira" type="number" min="0" max="10000000" placeholder="0" value={filters.minPrice} onChange={(event) => setFilter('minPrice', event.target.value)} /></label>
      <label>Max ₦<input aria-label="Maximum price in naira" type="number" min="0" max="10000000" placeholder="Any" value={filters.maxPrice} onChange={(event) => setFilter('maxPrice', event.target.value)} /></label>
      <button className="discover-reset" onClick={clear}>Clear filters</button></div></div>
    {error && <div className="discover-error" role="alert">{error}<button onClick={() => setVersion((n) => n + 1)}>Retry</button></div>}
    {loading ? <div className="discovery-grid" aria-label="Loading services">{Array.from({ length: 6 }, (_, i) => <div className="discovery-skeleton" key={i}><span /><span /><span /></div>)}</div> : gigs.length ? <><div className="discovery-grid">{gigs.map((gig) => <GigCard key={gig.id} gig={gig} onOpen={onOpen} />)}</div>{offset !== null && <div className="more-row"><button className="button button-ghost" onClick={() => void loadMore()} disabled={moreLoading}>{moreLoading ? 'Loading…' : 'Load more services'} <span>↓</span></button></div>}</> : !error && <div className="discover-empty"><div className="discover-empty-icon">✦</div><h2>No gigs found yet.</h2><p>{filters.category || filters.q || filters.location || filters.locationType || filters.minPrice || filters.maxPrice ? 'Try clearing your filters or exploring another skill.' : 'Verified providers are getting ready. Check back as services are published.'}</p><button className="button button-dark" onClick={clear}>View all skills <span>↗</span></button></div>}
    <div className="discovery-footnote">Service browsing is open. Booking and payments will be added in the next phase.</div>
  </section>;
}
