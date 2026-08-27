/* ============================================================================
   Hoja de Ruta (Transporte) — módulo Registro de Choferes
   Base: controletiquetas (Azure SQL compartida de Offal)
   Correr en el Query editor de Azure, conectado a la base controletiquetas.
   ============================================================================ */

-- 1) Esquema propio para Transporte (si no existe)
IF SCHEMA_ID('transporte') IS NULL
    EXEC('CREATE SCHEMA transporte');
GO

-- 2) Tabla de hojas de ruta
IF OBJECT_ID('transporte.HojasRuta') IS NULL
CREATE TABLE transporte.HojasRuta (
    Id             INT IDENTITY(1,1) CONSTRAINT PK_HojasRuta PRIMARY KEY,
    Fecha          DATE          NOT NULL,   -- 1. Fecha (hoja de ruta)
    NumeroRemito   VARCHAR(40)   NULL,       -- 2. Número de Remito
    ChoferDni      VARCHAR(20)   NOT NULL,   -- 3. Chofer (DNI del desplegable)
    ChoferNombre   VARCHAR(120)  NULL,       --    Nombre del chofer (para reportes)
    PatenteTractor VARCHAR(20)   NOT NULL,   -- 4. Patente del Tractor (se cruza con LSGPS)
    Destino        VARCHAR(160)  NULL,       -- 5. Destino
    SemiLleva      VARCHAR(40)   NULL,       -- 6. Semi Lleva
    SemiIran       VARCHAR(40)   NULL,       -- 7. Semi Iran
    Hielo          INT           NULL,       -- 8. HIELO
    Tambor         INT           NULL,       -- 9. TAMBOR
    Pallets        INT           NULL,       -- 10. PALLETS
    AguaOxigenada  INT           NULL,       -- 11. AGUA OXIGENADA
    TamborHiel     INT           NULL,       -- 12. TAMBOR DE HIEL
    CreadoEn       DATETIME2(0)  NOT NULL CONSTRAINT DF_HojasRuta_CreadoEn DEFAULT SYSDATETIME(),
    CreadoPor      VARCHAR(160)  NULL,       -- usuario Entra (Easy Auth) que la cargó
    Anulada        BIT           NOT NULL CONSTRAINT DF_HojasRuta_Anulada  DEFAULT 0
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HojasRuta_Fecha')
    CREATE INDEX IX_HojasRuta_Fecha   ON transporte.HojasRuta (Fecha);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HojasRuta_Patente')
    CREATE INDEX IX_HojasRuta_Patente ON transporte.HojasRuta (PatenteTractor);
GO

/* ----------------------------------------------------------------------------
   3) Permisos — REUSANDO el login que ya usás para controletiquetas
      (el mismo que el portal / otro módulo). NO se crea usuario nuevo.

   3.a) Ver qué usuarios/roles ya existen en la base (para elegir cuál reusás):
   ---------------------------------------------------------------------------- */
SELECT dp.name AS usuario, dp.type_desc,
       STRING_AGG(r.name, ', ') AS roles
FROM sys.database_principals dp
LEFT JOIN sys.database_role_members rm ON rm.member_principal_id = dp.principal_id
LEFT JOIN sys.database_principals r     ON r.principal_id = rm.role_principal_id
WHERE dp.type IN ('S','U','E','X') AND dp.name NOT LIKE 'db[_]%' AND dp.name <> 'guest'
GROUP BY dp.name, dp.type_desc
ORDER BY dp.name;
GO

/* ----------------------------------------------------------------------------
   3.b) SOLO si el login que reusás NO tiene db_datawriter/db_owner:
        darle permiso puntual sobre el esquema transporte.
        Reemplazá <TU_USUARIO> por el nombre que viste arriba y descomentá.
        (Si ya tiene db_datawriter u db_owner, SALTEAR este paso: ya puede escribir.)
   ---------------------------------------------------------------------------- */
-- GRANT SELECT, INSERT, UPDATE ON SCHEMA::transporte TO [<TU_USUARIO>];
-- GO

-- Comprobación
SELECT TOP 5 * FROM transporte.HojasRuta ORDER BY Id DESC;
