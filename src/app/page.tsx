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

  // Correo de contacto (configurable). Si no está definido, no se muestra el botón.
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || '';

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
    fetchHospitals();
    fetchStats();
  }, []);

  // Debounce para la búsqueda (busca automáticamente al dejar de escribir).
  // Si no hay nombre (o es muy corto), mostramos el listado alfabético completo.
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const q = query.trim().length >= 2 ? query : '';
      performSearch(q, hospital);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query, hospital]);

  const performSearch = async (q: string, h: string) => {
    setLoading(true);
    setError('');
    try {
      const url = new URL('/api/search', window.location.origin);
      if (q) url.searchParams.append('q', q);
      if (h) url.searchParams.append('hospital', h);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Error en la búsqueda');
      const data = await res.json();
      
      setResults(data.data || []);
      setHasSearched(true);
    } catch (err: any) {
      setError('Hubo un problema conectando con el servidor. Intenta de nuevo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
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
            ? `${results.length} resultado(s) para "${query}".`
            : `Mostrando ${results.length} persona(s) en orden alfabético${hospital ? ` — ${hospital}` : ''}.`}
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
      
    </main>
  );
}
