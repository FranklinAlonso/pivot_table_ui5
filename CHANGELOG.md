# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [versionado semántico](https://semver.org/lang/es/).

## [1.3.0] - 2026-10-02

### Añadido

- Campos calculados: propiedades `formula` y `calculationLevel` (`Aggregate` | `Record`) de `PivotField`, agregación `Formula` y enum `CalculationLevel`. En los `Aggregate` se suman los operandos en cada celda, subtotal y total y después se aplica la fórmula (Margen = Sum(Utilidad) / Sum(Ventas)); los `Record` se calculan por registro, sobre copias, antes de agrupar.
- `engine/Formula.js`: parser y evaluador de fórmulas sin dependencias (UMD), compatible con las copias de EPM_ADMIN y CAP. Las referencias `{...}` admiten cualquier carácter excepto llaves.
- Validación de fórmulas (sintaxis, ciclos, referencias inexistentes, `Record` que usa un `Aggregate`): `Log.error` con el nombre del campo y celdas vacías, sin romper la tabla. Los avisos también se devuelven en `getResult().issues`.
- Modo `ODataV4`: los operandos de los `Aggregate` se piden en `$apply` como `sum` con alias propios; las referencias se validan con los metadatos. Los campos `Record` no se admiten en este modo (`Log.warning`, celdas vacías).
- Panel de campos: icono de campo calculado y agregación bloqueada en «Fórmula» para los `Aggregate`.
- Las vistas guardadas conservan `aggregationType: "Formula"`.
- `PivotField#formula` pasada como texto al constructor se toma literalmente (UI5 la interpretaría como *binding*); en XML las llaves se escapan (`\{Ventas\}`) o la fórmula se enlaza a un modelo.
- `npm test` compara el resultado del Web Worker con el del hilo principal.

## [1.2.0] - 2026-10-01

### Cambiado

- La exportación a Excel reproduce la disposición de la tabla: cabeceras multinivel con celdas combinadas (incluidos subtotales y total general), nombres de las dimensiones de columna, paneles fijos, etiquetas de fila compactas como en pantalla, subtotales/totales en negrita y formatos numéricos equivalentes. En la vista jerárquica se exporta una sola columna con sangría y esquema de filas.
- La exportación ya no usa `sap.ui.export` (que solo admite una fila de cabecera): el `.xlsx` se genera con `sap/ui/thirdparty/jszip`. Se elimina la dependencia de `sap.ui.export`.

### Corregido

- Nombre de hoja y de fichero con caracteres no válidos en Excel o en el sistema de archivos.

## [1.1.0] - 2026-10-01

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
