import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Búsqueda de Personas Rescatadas',
  description: 'Plataforma oficial para la búsqueda y localización de personas rescatadas y registradas en centros de salud y refugios.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
