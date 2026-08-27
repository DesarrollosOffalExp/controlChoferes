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
   3) Usuario de la app con permisos SOLO sobre el esquema transporte.
   En Azure SQL usamos un "contained user" con contraseña (no login de servidor).
   Reemplazá la contraseña por una fuerte y ponela igual en la App Setting
   HOJARUTA_PASSWORD del App Service.
   ---------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'app_hojaruta')
    CREATE USER app_hojaruta WITH PASSWORD = 'CAMBIAR-por-una-contraseña-fuerte-1';
GO

GRANT SELECT, INSERT, UPDATE ON SCHEMA::transporte TO app_hojaruta;
GO

-- Comprobación
SELECT TOP 5 * FROM transporte.HojasRuta ORDER BY Id DESC;
