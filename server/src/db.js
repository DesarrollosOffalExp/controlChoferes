import sql from 'mssql';
import 'dotenv/config';

// Dos orígenes: INWEB (192.168.1.9, fichadas) y GPS/LSGPS (192.168.1.5, viajes/geocercas).
// Ambos SOLO lectura.
function makeConfig(prefix, defaultDb) {
  return {
    server: process.env[`${prefix}_SERVER`],
    database: process.env[`${prefix}_NAME`] || defaultDb,
    user: process.env[`${prefix}_USER`],
    password: process.env[`${prefix}_PASSWORD`],
    options: {
      encrypt: process.env[`${prefix}_ENCRYPT`] === 'true',
      trustServerCertificate: process.env[`${prefix}_TRUST_CERT`] !== 'false',
      enableArithAbort: true,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };
}

const pools = {};
function getPool(prefix, defaultDb) {
  if (!pools[prefix]) {
    pools[prefix] = new sql.ConnectionPool(makeConfig(prefix, defaultDb)).connect();
    pools[prefix].catch((e) => {
      console.error(`Error conectando a SQL (${prefix}):`, e.message);
      delete pools[prefix]; // permite reintentar
    });
  }
  return pools[prefix];
}

export const getInweb = () => getPool('INWEB', 'FichadasHik');
export const getGps = () => getPool('GPS', 'IntercambioDB062');
export { sql };
