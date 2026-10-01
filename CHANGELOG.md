# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Vistas guardadas: propiedades `variantManagement`, `persistencyKey`, `variantModelName` y `variantEntitySet`; selector `sap.m.VariantManagement` en la barra de herramientas con vista *Estándar*, vista por defecto y aviso de cambios sin guardar.
- Almacenes de vistas: personal en el Launchpad (`UshellPersonalizationStore`), en el navegador (`LocalStorageStore`), personales y compartidas en OData V4/CAP (`ODataV4Store`) y almacenes propios con `setVariantStore()`.
- Métodos `saveVariant`, `applyVariant`, `getVariants`, `getCurrentVariantKey`, `getVariantStore` y eventos `variantSelect` y `variantSave`.
- `getConfiguration()` incluye `expandLevel`, `repeatRowLabels` y `colorShadeStep`.
- README: estructura CAP sugerida para las vistas compartidas.

## [1.0.0] - 2026-09-30

### Añadido

- Control `PivotTable` con modos `Client` (en memoria) y `ODataV4` (agregación con `$apply`).
- `PivotValue` y `PivotField` para medidas y dimensiones.
- Panel de personalización, subtotales, totales generales y vista jerárquica.
- Reglas de color de celdas (`colorRules`, `colorShadeStep`) y diálogo *Colores de celdas*.
- Exportación a Excel y cálculo en Web Worker para volúmenes grandes.
