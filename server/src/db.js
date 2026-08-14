import sql from 'mssql';
import 'dotenv/config';

// Conexión al server de GPS (192.168.1.5). Solo lectura.
const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME || 'IntercambioDB062',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    enableArithAbort: true,
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

let poolPromise;
export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect();
    poolPromise.catch((e) => {
      console.error('Error conectando a SQL:', e.message);
      poolPromise = undefined; // permite reintentar en la próxima request
    });
  }
  return poolPromise;
}

export { sql };
