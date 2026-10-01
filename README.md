# pivot_ui5

Librería SAPUI5 con el control `com.frank.pivot.PivotTable`. Se distribuye como paquete npm y cada app Fiori la incluye en su propio build.

| Nombre | Valor | Dónde se usa |
|---|---|---|
| Paquete npm | `pivot_ui5` | `package.json` de las apps |
| Namespace UI5 | `com.frank.pivot` | Código, `manifest.json`, vistas XML, `includeDependencies` |

## Uso en una app Fiori

### 1. Instalar

En el `package.json` de la app (en `dependencies`, no en `devDependencies`), fijando siempre una versión:

```json
"dependencies": {
  "pivot_ui5": "git+https://<servidor-git>/<organizacion>/pivot_table_ui5.git#v1.0.0"
}
```

### 2. Declarar en `webapp/manifest.json`

```json
"sap.ui5": {
  "dependencies": {
    "libs": { "com.frank.pivot": {} }
  },
  "resourceRoots": {
    "com.frank.pivot": "./resources/com/frank/pivot/"
  }
}
```

`resourceRoots` es obligatorio: sin él, en SAP Build Work Zone la librería se busca en el CDN de SAPUI5 y se obtiene un 404.

### 3. Servirla en local (`ui5.yaml` / `ui5-local.yaml`)

`fiori-tools-proxy` reenvía todo `/resources` al CDN, así que la librería debe servirse antes:

```yaml
- name: fiori-tools-servestatic
  beforeMiddleware: fiori-tools-proxy
  configuration:
    paths:
      - path: /resources/com/frank/pivot
        src: node_modules/pivot_ui5/src/com/frank/pivot
```

### 4. Incluirla en el build (`ui5-deploy.yaml`)

`ui5 build` no copia las dependencias a `dist` por defecto:

```yaml
builder:
  customTasks:
    - name: ui5-task-zipper
      afterTask: generateCachebusterInfo
      configuration:
        archiveName: <nombre-app>
        includeDependencies:
          - com.frank.pivot   # nombre UI5 (metadata.name de ui5.yaml), no el nombre npm
```

Tras el build, `dist/resources/com/frank/pivot/` debe contener `library-preload.js`, `css/PivotTable.css` y `engine/PivotWorker.js` (el worker se carga aparte, no va en el preload).

## Versionado

[Versionado semántico](https://semver.org/lang/es/): *patch* para correcciones, *minor* para funcionalidad compatible, *major* para cambios incompatibles. Cada versión se anota en [CHANGELOG.md](CHANGELOG.md) y se publica con un tag:

```bash
npm test
npm version minor          # actualiza package.json, crea commit y tag vX.Y.Z
git push --follow-tags
```

Las apps actualizan cambiando el tag en su `package.json` y redesplegando.

## Referencia de la API

```js
sap.ui.define(["com/frank/pivot/PivotTable", "com/frank/pivot/PivotValue"], function (PivotTable, PivotValue) {
	var oPivot = new PivotTable({
		records: aVentas,
		rows: ["Region", "Pais"],
		columns: ["Anio"],
		values: [new PivotValue({ field: "Importe", aggregationType: "Sum", format: "Currency", unit: "EUR" })]
	});
});
```

## PivotTable

### Propiedades

| Propiedad | Tipo | Defecto | Descripción |
|---|---|---|---|
| `records` | `object[]` | `null` | Registros planos (modo `Client`). Se puede enlazar: `records="{/Ventas}"` |
| `rows` | `string[]` | `[]` | Dimensiones de fila. En XML: `rows="Region,Pais"` |
| `columns` | `string[]` | `[]` | Dimensiones de columna |
| `filters` | `object` | `null` | `{campo: [valores permitidos]}`. En modo OData V4 se envían en `$apply` |
| `colorRules` | `object[]` | `null` | Reglas de color de celdas `[{field, value?, color}]` (ver [Colores de celdas](#colores-de-celdas)) |
| `colorShadeStep` | `float` | `0.15` | Variación de tono del color de una regla en subtotales (×1) y totales generales (×2), entre 0 y 0,45. `0` = mismo color |
| `mode` | `DataMode` | `Client` | `Client` (en memoria) u `ODataV4` (agregación en el backend) |
| `modelName` | `string` | `""` | Modo OData V4: nombre del modelo (vacío = modelo por defecto) |
| `entitySet` | `string` | `""` | Modo OData V4: ruta absoluta, p. ej. `/Ventas` |
| `maxRecords` | `int` | `50000` | Modo OData V4: máximo de grupos que se leen |
| `showSubtotals` | `boolean` | `true` | Subtotales de filas y columnas |
| `showGrandTotals` | `boolean` | `true` | Fila y columna de total general |
| `hierarchical` | `boolean` | `false` | Filas como árbol (`TreeTable`) en lugar de lista plana |
| `expandLevel` | `int` | `1` | Nivel inicial de expansión del árbol |
| `repeatRowLabels` | `boolean` | `false` | Repetir las etiquetas de fila en cada línea |
| `maxColumns` | `int` | `200` | Máximo de columnas de valor; si se supera se trunca y se muestra un aviso |
| `workerThreshold` | `int` | `50000` | A partir de este número de registros el cálculo se hace en un Web Worker (`0` = nunca) |
| `title` | `string` | `""` | Título de la barra de herramientas |
| `showToolbar` / `enablePersonalization` / `enableExport` | `boolean` | `true` | Barra, botón de configuración y botón de Excel |
| `visibleRowCount` | `int` | `15` | Filas visibles |
| `autoRowCount` | `boolean` | `false` | Ajustar las filas a la altura disponible (requiere fijar `height`) |
| `width` / `height` | `CSSSize` | `100%` / `auto` | Tamaño |
| `dimensionColumnWidth` / `valueColumnWidth` | `CSSSize` | `11rem` / `9rem` | Anchos de columna |
| `noDataText` | `string` | `""` | Texto cuando no hay datos |

### Agregaciones

| Agregación | Tipo | Descripción |
|---|---|---|
| `values` (por defecto) | `PivotValue[]` | Medidas |
| `fields` | `PivotField[]` | Etiquetas y orden de los campos; también definen la lista de campos del panel |

### Eventos

| Evento | Parámetros |
|---|---|
| `cellPress` | `rowType` (`data`/`subtotal`/`group`/`total`), `columnType` (`data`/`subtotal`/`total`/`dimension`), `rowFilters`, `columnFilters`, `field`, `aggregationType`, `value` |
| `configurationChange` | `configuration`: la configuración aplicada desde el panel |
| `dataReceived` | `recordCount`, `truncated` (modo OData V4) |
| `updateFinished` | `rowCount`, `columnCount`, `truncated` |
| `loadError` | `message` |

Con `rowFilters` y `columnFilters` se puede navegar al detalle de la celda (drill-down):

```js
onCellPress: function (oEvent) {
	var mFilters = Object.assign({}, oEvent.getParameter("rowFilters"), oEvent.getParameter("columnFilters"));
	// p. ej. navegar a un List Report con esos filtros
}
```

### Métodos

| Método | Descripción |
|---|---|
| `refresh()` | Fuerza el recálculo (necesario si se modifica en sitio el array de `records`) |
| `getConfiguration()` / `setConfiguration(o)` | Leen y aplican la configuración serializable (filas, columnas, valores, filtros, colores, totales, jerarquía), útil para variantes |
| `openColorRules()` | Abre directamente el diálogo de colores. Devuelve `Promise<reglas \| null>` |
| `getDistinctValues(campo)` | Valores distintos y ordenados de un campo (máximo 1000) |
| `openPersonalization()` | Abre el panel. Devuelve `Promise<config \| null>` |
| `exportToSpreadsheet()` | Exporta a `.xlsx`. Devuelve `Promise` |
| `getResult()` | Último resultado del motor (ver abajo) |
| `getInnerTable()` | `sap.ui.table.Table` o `TreeTable` interna, para ajustes avanzados |

## Colores de celdas

En el panel de configuración (⚙), junto al título **Columnas**, el botón de paleta abre el diálogo *Colores de celdas*. Cada regla indica:

1. el **campo**, elegido entre las dimensiones de columna;
2. el **valor**: *(Todos los valores)* o uno concreto, tomado de los datos;
3. el **color**: de la paleta, o cualquiera con *Más colores…*.

Por código se hace igual:

```js
oPivot.setColorRules([
	{ field: "Anio", color: "#BBDEFB" },                 // todas las columnas de Año
	{ field: "Trimestre", value: "T1", color: "#FFCDD2" }, // solo T1 (tiene prioridad)
	{ field: "Region", value: "EMEA", color: "#C8E6C9" }   // campo de fila: pinta esas filas
]);
```

| Regla | Comportamiento |
|---|---|
| Campo de **columna** | Se colorean las celdas de esas columnas (incluidos sus subtotales) y su cabecera |
| Campo de **fila** | Se colorean esas filas (incluidos sus subtotales) y su etiqueta |
| Prioridad | Valor concreto > campo completo > orden de definición. En un cruce, el color de la columna prevalece sobre el de la fila |
| Totales generales | No se colorean por reglas de columna |
| Tonalidad | Las celdas de subtotal (filas y columnas de subtotal) usan una variante del color; las de total general, una más marcada. Los colores claros se oscurecen y los muy oscuros se aclaran. En la vista jerárquica solo los grupos del primer nivel llevan el tono de subtotal. La intensidad se ajusta con `colorShadeStep` |
| Texto | Se elige blanco u oscuro según el contraste con el fondo |
| Colores admitidos | `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` y nombres CSS. Cualquier otro valor se descarta |

Las reglas forman parte de `getConfiguration()`, así que se guardan con las variantes. Cambiar solo los colores reconstruye las columnas sin recalcular los datos. La exportación a Excel no incluye los colores.

## PivotValue

| Propiedad | Tipo | Defecto | Descripción |
|---|---|---|---|
| `field` | `string` | | Campo a agregar. Con `Count` se admite `*` (cuenta todos los registros) |
| `aggregationType` | `AggregationType` | `Sum` | `Sum`, `Count`, `CountDistinct`, `Average`, `Min`, `Max` |
| `label` | `string` | | Cabecera. Por defecto: etiqueta del campo, más la agregación si no es `Sum` |
| `format` | `ValueFormat` | `Number` | `Number`, `Integer`, `Currency`, `Percent` (el valor debe ser una fracción: 0,2 = 20 %) |
| `decimals` | `int` | `-1` | Número de decimales. `-1` = automático |
| `unit` | `string` | | Código de moneda cuando `format="Currency"` |

## PivotField

| Propiedad | Tipo | Defecto | Descripción |
|---|---|---|---|
| `name` | `string` | | Nombre técnico |
| `label` | `string` | | Etiqueta visible |
| `sortOrder` | `sap.ui.core.SortOrder` | `Ascending` | `Ascending`, `Descending` o `None` (orden de aparición) |
| `measure` | `boolean` | `false` | Si el campo es numérico: en el panel se agrega por defecto con `Sum` en lugar de `Count` |

## Resultado del motor (`getResult()`)

```js
{
  rowDimensions:    [{ name, label }],
  columnDimensions: [{ name, label }],
  values:           [{ field, aggregation, label }],
  headerLevels: 2,                       // niveles de cabecera
  columns: [{                            // una por cada combinación de columna × valor
    id: "v0", type: "data" | "subtotal" | "total",
    valueIndex: 0, columnKeys: [2024, "T1"],
    labels: ["2024", "T1"], spans: [5, 1]
  }],
  rows: [{ __type, __level, __rowKeys: ["EMEA", "España"], d0: "EMEA", d1: "España", v0: 1234.5 }],
  tree: [{ label, __type, __level, __rowKeys, v0, nodes: [...] }] | null,
  recordCount, usedRecordCount, totalColumns, truncated
}
```

`engine/PivotEngine.js` no depende de UI5, así que puede usarse por separado, por ejemplo en un servicio Node:

```js
PivotEngine.compute(aRecords, {
	rows: ["Region"], columns: [{ name: "Anio", sortOrder: "desc" }],
	values: [{ field: "Importe", aggregation: "sum" }],
	showSubtotals: true, showGrandTotals: true, hierarchical: false, maxColumns: 500
});
```

## Desarrollo

```bash
npm test            # pruebas del motor en Node (sin navegador)
npm start           # ui5 serve + suite QUnit en el navegador
npm run build       # dist/ con library-preload.js, minificado y manifest.json
npm pack --dry-run  # lista los archivos que se publican en el paquete
```
