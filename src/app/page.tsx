'use client';

import { useState, useEffect } from 'react';

type Persona = {
  id: string;
  nombre: string;
  cedula: string | null;
  edad: string | null;
  procedencia: string | null;
  hospital: string | null;
  nota: string | null;
  estado: string;
  created_at: string;
};

export default function Home() {
  const [query, setQuery] = useState('');
  const [hospital, setHospital] = useState('');
  const [hospitalsList, setHospitalsList] = useState<string[]>([]);
  const [results, setResults] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<{ total: number; lastUpdate: string | null } | null>(null);

  // Paginación (20 por página).
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  // Correo de contacto (editable desde el panel admin). Si está vacío, no se muestra el botón.
  const [contactEmail, setContactEmail] = useState('');

  useEffect(() => {
    // Cargar hospitales dinámicamente
    const fetchHospitals = async () => {
      try {
        const res = await fetch('/api/hospitals');
        const data = await res.json();
        if (data.data) {
          setHospitalsList(data.data);
        }
      } catch (err) {
        console.error('Error cargando hospitales', err);
      }
    };
    // Cargar estadísticas (cuántos registros hay y última actualización)
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        setStats({ total: data.total ?? 0, lastUpdate: data.lastUpdate ?? null });
      } catch (err) {
        console.error('Error cargando estadísticas', err);
      }
    };
    // Registrar la visita una sola vez por navegador (cuenta personas, no recargas).
    const logVisit = () => {
      try {
        if (localStorage.getItem('vh_visited')) return;
        let vid = localStorage.getItem('vh_visitor');
        if (!vid) {
          vid = (crypto as any)?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
          localStorage.setItem('vh_visitor', vid);
        }
        fetch('/api/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitor_id: vid }),
        })
          .then(() => localStorage.setItem('vh_visited', '1'))
          .catch(() => {});
      } catch {
        // localStorage no disponible: ignoramos.
      }
    };

    // Cargar el correo de contacto configurado.
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config');
        const data = await res.json();
        setContactEmail(data.contactEmail || '');
      } catch (err) {
        console.error('Error cargando configuración', err);
      }
    };

    fetchHospitals();
    fetchStats();
    fetchConfig();
    logVisit();
  }, []);

  // Al cambiar la búsqueda o el hospital, volvemos a la página 1.
  useEffect(() => {
    setPage(1);
  }, [query, hospital]);

  // Debounce para la búsqueda (busca automáticamente al dejar de escribir).
  // Si no hay nombre (o es muy corto), mostramos el listado alfabético completo.
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const q = query.trim().length >= 2 ? query : '';
      performSearch(q, hospital, page);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [query, hospital, page]);

  const performSearch = async (q: string, h: string, p: number) => {
    setLoading(true);
    setError('');
    try {
      const url = new URL('/api/search', window.location.origin);
      if (q) url.searchParams.append('q', q);
      if (h) url.searchParams.append('hospital', h);
      url.searchParams.append('page', String(p));
      url.searchParams.append('pageSize', String(PAGE_SIZE));

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Error en la búsqueda');
      const data = await res.json();

      setResults(data.data || []);
      setTotalPages(data.totalPages || 1);
      setTotalResults(data.total || 0);
      setHasSearched(true);
    } catch (err: any) {
      setError('Hubo un problema conectando con el servidor. Intenta de nuevo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Calcula qué números de página mostrar (ventana alrededor de la actual).
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [1];
    const start = Math.max(2, page - 2);
    const end = Math.min(totalPages - 1, page + 2);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getBadgeClass = (estado: string) => {
    const est = estado?.toLowerCase() || '';
    if (est.includes('alta') || est.includes('estable')) return 'badge success';
    if (est.includes('observación') || est.includes('trasladado')) return 'badge warning';
    if (est.includes('grave') || est.includes('fallecido')) return 'badge danger';
    return 'badge'; // default primary
  };

  return (
    <main className="container">
      <header className="header">
        <h1>Búsqueda de Rescatados</h1>
        {stats ? (
          <p>
            {stats.total.toLocaleString('es')} persona(s) registrada(s)
            {stats.lastUpdate && (
              <> · Última actualización: {new Date(stats.lastUpdate).toLocaleString('es')}</>
            )}
          </p>
        ) : (
          <p>Encuentra información sobre personas registradas en hospitales o refugios.</p>
        )}
        {contactEmail && (
          <a
            href={`mailto:${contactEmail}?subject=${encodeURIComponent('Quiero subir datos de un sitio (rescatados)')}`}
            className="badge primary"
            style={{
              display: 'inline-flex',
              marginTop: '1rem',
              padding: '0.6rem 1.25rem',
              textDecoration: 'none',
              background: 'var(--primary)',
              cursor: 'pointer',
            }}
          >
            Contacto / Subir datos de un sitio
          </a>
        )}
      </header>

      <section className="search-container">
        <div className="input-group">
          <label htmlFor="search-input">Buscar por Nombre o Cédula</label>
          <input
            id="search-input"
            type="text"
            className="input-field"
            placeholder="Ej: Juan Perez o 12345678"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="input-group">
          <label htmlFor="hospital-select">Filtrar por Hospital (Opcional)</label>
          <select 
            id="hospital-select" 
            className="input-field"
            value={hospital}
            onChange={(e) => setHospital(e.target.value)}
          >
            <option value="">Todos los hospitales / centros</option>
            {hospitalsList.map((h, idx) => (
              <option key={idx} value={h}>{h}</option>
            ))}
          </select>
        </div>
      </section>

      {error && (
        <div className="state-message">
          <p style={{ color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && !error && (
        <div className="state-message">
          {query.trim().length >= 2 ? (
            <>
              <p>No se encontraron resultados para "{query}".</p>
              <p className="text-muted mt-4">Intenta buscar solo por el primer nombre o primer apellido si la búsqueda exacta no funciona.</p>
            </>
          ) : (
            <p>Aún no hay personas registradas{hospital ? ` en "${hospital}"` : ''}.</p>
          )}
        </div>
      )}

      {loading && (
        <div className="state-message">
          <div className="loader"></div>
          <p className="mt-4 text-muted">Buscando registros...</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <p className="text-muted" style={{ marginBottom: '1rem' }}>
          {query.trim().length >= 2
            ? `${totalResults} resultado(s) para "${query}".`
            : `${totalResults} persona(s) registrada(s)${hospital ? ` — ${hospital}` : ''} (orden alfabético).`}
          {totalPages > 1 && ` — Página ${page} de ${totalPages}.`}
        </p>
      )}

      {!loading && results.length > 0 && (
        <section className="results-grid">
          {results.map((persona) => (
            <article key={persona.id} className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{persona.nombre}</h2>
                  {persona.cedula && <p className="card-cedula">C.I: {persona.cedula}</p>}
                </div>
                <span className={getBadgeClass(persona.estado)}>{persona.estado || 'Registrado'}</span>
              </div>
              
              <div className="card-body">
                {persona.cedula && (
                  <div className="info-item">
                    <span className="info-label">Cédula</span>
                    <span className="info-value">
                      {persona.cedula.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                    </span>
                  </div>
                )}
                {persona.edad && (
                  <div className="info-item">
                    <span className="info-label">Edad</span>
                    <span className="info-value">{persona.edad}</span>
                  </div>
                )}
                {persona.procedencia && (
                  <div className="info-item">
                    <span className="info-label">Procedencia</span>
                    <span className="info-value">{persona.procedencia}</span>
                  </div>
                )}
                {persona.hospital && (
                  <div className="info-item">
                    <span className="info-label">Ubicación / Hospital</span>
                    <span className="info-value">{persona.hospital}</span>
                  </div>
                )}
                <div className="info-item">
                  <span className="info-label">Fecha de Registro</span>
                  <span className="info-value">{new Date(persona.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {persona.nota && (
                <div className="note-box">
                  <strong>Nota:</strong> {persona.nota}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {!loading && results.length > 0 && totalPages > 1 && (
        <nav
          aria-label="Paginación"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '2rem',
          }}
        >
          <button
            className="badge"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            style={{ border: 'none', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1, background: '#444' }}
          >
            ‹ Anterior
          </button>

          {getPageNumbers().map((p, idx) =>
            p === '...' ? (
              <span key={`dots-${idx}`} className="text-muted" style={{ padding: '0 0.25rem' }}>
                …
              </span>
            ) : (
              <button
                key={p}
                className={`badge ${p === page ? 'primary' : ''}`}
                onClick={() => goToPage(p)}
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  minWidth: '2.5rem',
                  justifyContent: 'center',
                  background: p === page ? 'var(--primary)' : '#444',
                  fontWeight: p === page ? 700 : 400,
                }}
              >
                {p}
              </button>
            )
          )}

          <button
            className="badge"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            style={{ border: 'none', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1, background: '#444' }}
          >
            Siguiente ›
          </button>
        </nav>
      )}

    </main>
  );
}
