'use client';

import { useState } from 'react';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [hospital, setHospital] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlStatus, setSqlStatus] = useState('');

  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        alert('Contraseña incorrecta');
      }
    } catch (err) {
      alert('Error al autenticar');
    }
    setLoading(false);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !hospital) return;
    
    setLoading(true);
    setUploadStatus('Subiendo y procesando...');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('hospital', hospital);

    try {
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${password}`
        },
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        setUploadStatus(`Éxito: ${data.message}`);
        setFile(null);
        setHospital('');
      } else {
        setUploadStatus(`Error: ${data.message}`);
      }
    } catch (err) {
      setUploadStatus('Error al subir el archivo');
    }
    setLoading(false);
  };

  const handleSqlExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sqlQuery) return;
    
    if (!confirm('¿Estás seguro de ejecutar esta consulta SQL directamente en producción?')) {
      return;
    }

    setLoading(true);
    setSqlStatus('Ejecutando...');

    try {
      const res = await fetch('/api/admin/sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({ query: sqlQuery })
      });
      const data = await res.json();
      
      if (data.success) {
        setSqlStatus(`Éxito: ${data.message}. Filas afectadas: ${data.rowCount}`);
        setSqlQuery('');
      } else {
        setSqlStatus(`Error: ${data.message}`);
      }
    } catch (err) {
      setSqlStatus('Error al ejecutar SQL');
    }
    setLoading(false);
  };

  if (!isAuthenticated) {
    return (
      <main className="container" style={{ maxWidth: '400px', marginTop: '10vh' }}>
        <div className="card">
          <h1 className="card-title text-center" style={{ marginBottom: '1.5rem' }}>Acceso Admin</h1>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              type="password" 
              className="input-field" 
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="badge success" style={{ padding: '0.75rem', justifyContent: 'center', fontSize: '1rem', border: 'none', cursor: 'pointer' }} disabled={loading}>
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header" style={{ marginBottom: '2rem' }}>
        <h1>Panel de Administración</h1>
        <p>Sube datos masivos de manera rápida y segura.</p>
      </header>

      <div className="results-grid" style={{ gridTemplateColumns: '1fr', gap: '2rem' }}>
        {/* Sección Subida de Excel */}
        <section className="card">
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>1. Subir Archivo Excel</h2>
          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label>Nombre del Hospital / Centro</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Ej. Hospital Metropolitano"
                value={hospital}
                onChange={(e) => setHospital(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Archivo Excel (.xlsx, .xls)</label>
              <input 
                type="file" 
                className="input-field" 
                accept=".xlsx, .xls, .csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
            </div>
            <button type="submit" className="badge primary" style={{ padding: '0.75rem', justifyContent: 'center', fontSize: '1rem', border: 'none', cursor: 'pointer', background: 'var(--primary)' }} disabled={loading}>
              {loading ? 'Subiendo...' : 'Subir y Procesar Excel'}
            </button>
            {uploadStatus && (
              <div className={`note-box ${uploadStatus.includes('Error') ? 'danger' : 'success'}`} style={{ backgroundColor: uploadStatus.includes('Error') ? 'var(--danger-bg)' : 'var(--success-bg)', borderColor: uploadStatus.includes('Error') ? 'var(--danger)' : 'var(--success)' }}>
                {uploadStatus}
              </div>
            )}
          </form>
        </section>

        {/* Sección Raw SQL */}
        <section className="card">
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>2. Ejecutar SQL (Inserción Directa)</h2>
          <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
            Útil como respaldo si el Excel falla y usaste una IA para generar los INSERTs. 
            <strong> Requiere que DATABASE_URL esté configurado.</strong>
          </p>
          <form onSubmit={handleSqlExecute} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label>Consulta SQL</label>
              <textarea 
                className="input-field" 
                rows={6}
                placeholder="INSERT INTO personas_rescatadas (nombre, hospital) VALUES ('Juan Perez', 'Clinica 1');"
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                required
                style={{ resize: 'vertical' }}
              />
            </div>
            <button type="submit" className="badge danger" style={{ padding: '0.75rem', justifyContent: 'center', fontSize: '1rem', border: 'none', cursor: 'pointer', background: 'var(--danger)' }} disabled={loading}>
              {loading ? 'Ejecutando...' : 'Ejecutar SQL en Producción'}
            </button>
            {sqlStatus && (
              <div className={`note-box ${sqlStatus.includes('Error') ? 'danger' : 'success'}`} style={{ backgroundColor: sqlStatus.includes('Error') ? 'var(--danger-bg)' : 'var(--success-bg)', borderColor: sqlStatus.includes('Error') ? 'var(--danger)' : 'var(--success)' }}>
                {sqlStatus}
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
