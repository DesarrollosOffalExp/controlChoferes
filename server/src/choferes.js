// Listado OFICIAL de choferes (RRHH/Logística, agosto 2026).
// Se usa el legajo para cruzar con IntercambioDB062.dbo.DwJornadas (fichada),
// y el DNI para cruzar con el GPS (apiLGPS) cuando se sume "Hs en viaje".
export const CHOFERES = [
  { dni: '26762085', legajo: 'q62085',   nombre: 'Arrascaeta, Javier Alejandro' },
  { dni: '21728678', legajo: 'M498',     nombre: 'Ayala, Cristian' },
  { dni: '22620887', legajo: 'M570',     nombre: 'Cabral, Victor Hugo' },
  { dni: '25347259', legajo: '25347259', nombre: 'Corvalan, Jorge' },
  { dni: '23177450', legajo: 'M360',     nombre: 'Ferreira, Sergio Omar' },
  { dni: '25058795', legajo: 'M580',     nombre: 'Goncalvez Dasilva, Daniel Alberto' },
  { dni: '26545062', legajo: '26545062', nombre: 'Lezcano, Juan' },
  { dni: '16951390', legajo: '40',       nombre: 'Lozano, Gustavo Javier' },
  { dni: '26966297', legajo: 'M281',     nombre: 'Mont, Matias Leonardo' },
  { dni: '25683290', legajo: '3290',     nombre: 'Montes, Ariel Ricardo' },
  { dni: '39349817', legajo: '39349817', nombre: 'Ponce, Julian' },
  { dni: '29072794', legajo: '29072794', nombre: 'Pura, Diego Alberto' },
  { dni: '21048017', legajo: 'M203',     nombre: 'Romero, Pedro Damian' },
  { dni: '26592849', legajo: '2849',     nombre: 'Santillan, Sebastian Ezequiel' },
  { dni: '26617870', legajo: 'M303',     nombre: 'Strack, Juan Gustavo' },
  { dni: '12845329', legajo: '10141',    nombre: 'Veliz, Norberto Anibal' },
  { dni: '26146761', legajo: 'M427',     nombre: 'Villegas, Gustavo Enrique' },
  { dni: '28709917', legajo: '28709917', nombre: 'Zarate, Manuel Andres' },
];

// DNIs sueltos (compatibilidad / uso rápido).
export const CHOFERES_DNI = CHOFERES.map((c) => c.dni);
