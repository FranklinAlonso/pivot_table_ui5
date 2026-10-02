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
  "pivot_ui5": "github:FranklinAlonso/pivot_table_ui5#v1.3.0"
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

Tras el build, `dist/resources/com/frank/pivot/` debe contener `library-preload.js`, `css/PivotTable.css` y `engine/PivotWorker.js` (el worker se carga aparte, no va en el preload, y a su vez carga `engine/Formula.js`, `Aggregations.js`, `CalculatedFields.js` y `PivotEngine.js`).

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
| `variantManagement` | `boolean` | `false` | Selector de vistas guardadas (ver [Vistas guardadas](#vistas-guardadas)). Requiere `persistencyKey` |
| `persistencyKey` | `string` | `""` | Identifica las vistas de esta tabla; único por app y tabla, p. ej. `ventas.pivotRegion` |
| `variantModelName` | `string` | `""` | Vistas en OData V4: nombre del modelo del servicio de vistas (vacío = modelo por defecto) |
| `variantEntitySet` | `string` | `""` | Vistas en OData V4: EntitySet, p. ej. `/PivotViews`. Activa las vistas compartidas |

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
| `variantSelect` | `key`, `name`, `configuration`: el usuario eligió una vista (también *Estándar*) |
| `variantSave` | `key`, `name`, `public`, `overwrite`: se guardó una vista |

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
| `getConfiguration()` / `setConfiguration(o)` | Leen y aplican la configuración serializable (filas, columnas, valores, filtros, colores, totales, jerarquía, nivel de expansión, etiquetas repetidas y tono). Es lo que guarda una vista |
| `openColorRules()` | Abre directamente el diálogo de colores. Devuelve `Promise<reglas \| null>` |
| `getDistinctValues(campo)` | Valores distintos y ordenados de un campo (máximo 1000) |
| `openPersonalization()` | Abre el panel. Devuelve `Promise<config \| null>` |
| `exportToSpreadsheet()` | Exporta a `.xlsx` con la misma disposición que la tabla: cabeceras multinivel combinadas, dimensiones y cabeceras fijas, subtotales y totales en negrita y, en la vista jerárquica, una columna con sangría y filas agrupadas (esquema). Devuelve `Promise` |
| `getResult()` | Último resultado del motor (ver abajo) |
| `getInnerTable()` | `sap.ui.table.Table` o `TreeTable` interna, para ajustes avanzados |
| `saveVariant(nombre, opciones?)` | Guarda la configuración actual como vista. Opciones: `key` (sobrescribir), `public`, `default`. Devuelve `Promise<vista>` |
| `applyVariant(clave)` | Aplica una vista guardada o la estándar (`PivotTable.STANDARD_VARIANT_KEY`). Devuelve `false` si no existe |
| `getVariants()` / `getCurrentVariantKey()` | Vistas cargadas y clave de la seleccionada |
| `setVariantStore(almacén)` / `getVariantStore()` | Almacén de vistas propio y almacén en uso (ver [Almacén propio](#almacén-propio)) |

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

Las reglas forman parte de `getConfiguration()`, así que se guardan con las [vistas](#vistas-guardadas). Cambiar solo los colores reconstruye las columnas sin recalcular los datos. La exportación a Excel no incluye los colores.

## Vistas guardadas

Con `variantManagement="true"` aparece, junto al título de la barra, el selector de vistas estándar de Fiori (`sap.m.VariantManagement`). Desde él el usuario puede:

- **Guardar** los cambios de la vista actual. Si hay cambios sin guardar, el nombre de la vista muestra un asterisco (*).
- **Guardar como** una vista nueva, opcionalmente como vista por defecto y, si el almacén lo admite, como **pública** (compartida).
- **Gestionar** sus vistas: renombrar, borrar y elegir la vista por defecto.

La vista **Estándar** es la configuración inicial de la tabla (la del XML o el código) y no se puede borrar. Una vista guarda lo mismo que `getConfiguration()`: filas, columnas, valores, filtros, colores, subtotales, totales, vista jerárquica, nivel de expansión, etiquetas repetidas y tono de los colores. No guarda los datos.

```xml
<pv:PivotTable records="{/Ventas}" rows="Region" columns="Anio"
    variantManagement="true" persistencyKey="ventas.pivotRegion"
    variantSelect=".onVariantSelect">
```

`persistencyKey` es obligatorio: identifica las vistas de esa tabla y debe ser único por app y tabla. Si cambia, los usuarios dejan de ver las vistas guardadas con la clave anterior.

Al cargar la tabla se aplica la vista por defecto del usuario **antes** del primer cálculo, de modo que en modo OData V4 no se leen los datos dos veces.

### Dónde se guardan

| Configuración | Almacén | Vistas |
|---|---|---|
| Sin `variantEntitySet`, dentro del Launchpad (SAP Build Work Zone) | `UshellPersonalizationStore`: servicio de personalización del Launchpad | Personales, por usuario y disponibles en cualquier dispositivo. No requiere desarrollo en el servidor |
| Sin `variantEntitySet`, fuera del Launchpad (`npm start`, `ui5 serve`) | `LocalStorageStore`: almacenamiento del navegador | Personales, solo en ese navegador. Para desarrollo y pruebas |
| Con `variantEntitySet` | `ODataV4Store`: servicio OData V4 propio (p. ej. CAP) | Personales y **públicas**. La vista por defecto de cada usuario se sigue guardando en el almacén personal |
| `setVariantStore(oStore)` | Almacén propio | Las que implemente (ver [Almacén propio](#almacén-propio)) |

Una vista compartida la crea otro usuario, así que antes de aplicarla se valida: se descartan claves desconocidas, tipos incorrectos y colores inseguros. Si la vista usa campos que ya no existen en los datos, se omiten esos campos y se avisa al usuario.

### Vistas compartidas con CAP

La librería no incluye código de servidor. Esta es la estructura que espera `ODataV4Store`; créala en tu proyecto CAP y adapta los permisos a tus roles.

**`db/pivot-views.cds`**

```cds
namespace app.pivot;
using { cuid, managed } from '@sap/cds/common';

entity PivotViews : cuid, managed {          // ID, createdBy, createdAt, modifiedBy, modifiedAt
  persistencyKey : String(120) not null;     // persistencyKey de la tabla
  name           : String(120) not null;
  isPublic       : Boolean default false;    // false = personal, true = compartida
  schemaVersion  : Integer default 1;        // versión del formato de configuration
  configuration  : LargeString not null;     // JSON de getConfiguration()
}
```

**`srv/pivot-view-service.cds`**

```cds
using { app.pivot as db } from '../db/pivot-views';

service PivotViewService @(path: '/pivot-views', requires: 'authenticated-user') {
  @restrict: [
    { grant: 'READ',               where: 'isPublic = true or createdBy = $user' },
    { grant: 'CREATE' },
    { grant: ['UPDATE', 'DELETE'], where: 'createdBy = $user' }
    // p. ej. un rol que administra las vistas de todos: { grant: '*', to: 'PivotViewAdmin' }
  ]
  entity PivotViews as projection on db.PivotViews {
    *,
    virtual null as isOwner : Boolean       // opcional: oculta Guardar/Renombrar/Borrar en vistas ajenas
  };
}
```

**`srv/pivot-view-service.js`**

```js
const cds = require('@sap/cds');

const MAX_CONFIGURATION = 100000; // caracteres

module.exports = cds.service.impl(function () {
  const { PivotViews } = this.entities;

  this.after('READ', PivotViews, (result, req) => {
    for (const row of [].concat(result || [])) {
      row.isOwner = row.createdBy === req.user.id;
    }
  });

  this.before(['CREATE', 'UPDATE'], PivotViews, (req) => {
    const { configuration } = req.data;
    if (configuration === undefined) return;
    if (configuration.length > MAX_CONFIGURATION) return req.reject(400, 'La vista es demasiado grande');
    try {
      JSON.parse(configuration);
    } catch (e) {
      return req.reject(400, 'La configuración de la vista no es JSON válido');
    }
    // Opcional: solo un rol puede publicar vistas
    // if (req.data.isPublic && !req.user.is('PivotViewPublisher')) return req.reject(403, 'No puede publicar vistas');
  });
});
```

Si usas roles, decláralos en el `xs-security.json` del proyecto CAP y asígnalos con colecciones de roles en el subaccount de BTP.

**En la app Fiori**

`webapp/manifest.json`: una fuente de datos y un modelo propios para las vistas. Usa `autoExpandSelect: false`, porque el almacén lee las entidades sin controles enlazados.

```json
"sap.app": {
  "dataSources": {
    "pivotViews": { "uri": "pivot-views/", "type": "OData", "settings": { "odataVersion": "4.0" } }
  }
},
"sap.ui5": {
  "models": {
    "pivotViews": { "dataSource": "pivotViews", "settings": { "autoExpandSelect": false } }
  }
}
```

`xs-app.json`: la ruta hacia el destination del servicio CAP. El destination de BTP necesita `HTML5.ForwardAuthToken = true`, para que CAP reciba el usuario.

```json
{ "source": "^/pivot-views/(.*)$", "target": "/pivot-views/$1", "destination": "<destination-cap>", "authenticationType": "xsuaa" }
```

La vista XML:

```xml
<pv:PivotTable variantManagement="true" persistencyKey="ventas.pivotRegion"
    variantModelName="pivotViews" variantEntitySet="/PivotViews" ... />
```

Peticiones que hace `ODataV4Store`:

| Acción | Petición |
|---|---|
| Cargar | `GET /PivotViews?$filter=persistencyKey eq 'ventas.pivotRegion'&$orderby=name` |
| Guardar como | `POST /PivotViews` con `{ persistencyKey, name, isPublic, schemaVersion, configuration }` (`configuration` es texto JSON) |
| Guardar / renombrar | `PATCH /PivotViews(<ID>)` con `name`, `isPublic`, `schemaVersion` y `configuration` |
| Borrar | `DELETE /PivotViews(<ID>)` |

Las peticiones se envían en `$batch` con un grupo propio (`pivotViews`). Si el servicio rechaza una operación (por ejemplo, un 403 por permisos), el cambio se descarta y el usuario ve un mensaje de error.

### Almacén propio

Para otra estructura, otros nombres de campo u otro backend, pasa a la tabla un objeto con esta interfaz. Todos los métodos devuelven promesas:

```js
oPivot.setVariantStore({
	supportsPublic: true, // muestra la casilla "Pública"
	load: function (sPersistencyKey) {
		// -> { variants: [vista, ...], defaultKey: "clave" | null }
	},
	save: function (sPersistencyKey, oView) {
		// oView.key vacío = vista nueva. Devuelve la vista guardada, con su key
	},
	remove: function (sPersistencyKey, sKey) {},
	setDefault: function (sPersistencyKey, sKey) {} // sKey null = Estándar
});
```

Una vista es:

```js
{
	key: "42",
	name: "Ventas por región 2025",
	public: false,
	author: "ana@empresa.com",   // se muestra en "Gestionar"
	editable: true,              // false: el usuario no puede sobrescribir, renombrar ni borrar
	schemaVersion: 1,
	configuration: { rows: [...], columns: [...], values: [...], ... } // getConfiguration()
}
```

## PivotValue

| Propiedad | Tipo | Defecto | Descripción |
|---|---|---|---|
| `field` | `string` | | Campo a agregar. Con `Count` se admite `*` (cuenta todos los registros) |
| `aggregationType` | `AggregationType` | `Sum` | `Sum`, `Count`, `CountDistinct`, `Average`, `Min`, `Max`, `Formula` (campos calculados `Aggregate`, ver [Campos calculados](#campos-calculados)) |
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
| `formula` | `string` | | Fórmula de un campo calculado, p. ej. `"{Utilidad} / {Ventas}"`. Vacío = campo normal |
| `calculationLevel` | `CalculationLevel` | `Aggregate` | `Aggregate` (fórmula sobre las sumas de cada celda) o `Record` (fórmula en cada registro antes de agrupar) |

## Campos calculados

Un `PivotField` con `formula` es un campo calculado. Las referencias `{campo}` son nombres de otros campos (de los registros o calculados); el nombre admite cualquier carácter excepto `{` y `}`.

```js
new PivotTable({
	records: aVentas,
	rows: ["Region", "Producto"],
	fields: [
		new PivotField({ name: "Utilidad", label: "Utilidad", formula: "{Ventas} - {Costo}", calculationLevel: "Record" }),
		new PivotField({ name: "Margen", label: "Margen %", formula: "{Utilidad} / {Ventas}" }),   // Aggregate
		new PivotField({ name: "PrecioMedio", label: "Precio medio", formula: "{Ventas} / {Unidades}" })
	],
	values: [
		new PivotValue({ field: "Utilidad" }),
		new PivotValue({ field: "Margen", aggregationType: "Formula", format: "Percent", decimals: 1 }),
		new PivotValue({ field: "PrecioMedio", aggregationType: "Formula", decimals: 2 })
	]
});
```

| Región | Producto | Ventas | Costo | Unidades | Utilidad | Margen % | Precio medio |
|---|---|---|---|---|---|---|---|
| Norte | Laptop | 10000 | 8500 | 10 | 1500 | 15,0 % | 1000,00 |
| Norte | Teclado | 1000 | 500 | 50 | 500 | 50,0 % | 20,00 |
| **Total Norte** | | | | | **2000** | **18,2 %** | **183,33** |

El margen del total es `Sum(Utilidad) / Sum(Ventas)` = 2000 / 11000, no el promedio de los márgenes (32,5 %).

**Niveles de cálculo** (`calculationLevel`):

- **`Aggregate`** (por defecto): en cada celda, subtotal y total se suman los operandos y después se aplica la fórmula. Un `PivotValue` sobre este campo usa siempre `aggregationType: "Formula"`; si indica otra agregación se normaliza y se registra un `Log.warning`.
- **`Record`**: la fórmula se aplica a cada registro antes de agrupar (sobre copias: los datos originales no se modifican). Después el campo se comporta como un campo numérico más: admite cualquier agregación y puede usarse como dimensión o filtro.

**Fórmulas anidadas**: un `Aggregate` puede usar otro `Aggregate` (se sustituye su fórmula) o un `Record` (el operando es la suma del campo derivado). Un `Record` no puede usar un `Aggregate`.

**Sintaxis**: `+ - * /`, paréntesis, `SI(condición; si_verdadero; si_falso)`, `MIN`, `MAX`, `ABS`, `REDONDEAR(valor; decimales)`; `;` separa argumentos; `,` o `.` como decimal; las comparaciones (`> < >= <= = <>`) solo dentro de `SI`. Un operando vacío o una división por cero dan una celda vacía. El parser está en `engine/Formula.js` (sin dependencias de UI5; también se carga con `require()` en Node).

**Errores de configuración** (fórmula inválida, ciclo, referencia a un campo inexistente, `Record` que usa un `Aggregate`): se registra un `Log.error` con el nombre del campo, las celdas de ese valor quedan vacías y el resto de la tabla se calcula con normalidad. Los campos que dependen de uno con errores también quedan vacíos. Los mismos mensajes están en `getResult().issues`.

**En XML** las llaves se interpretan como *binding*: enlace la fórmula a un modelo (`formula="{modelo>formula}"`) o escápelas (`formula="\{Ventas\} - \{Costo\}"`). En JavaScript, una fórmula pasada como texto al constructor se toma literalmente; para enlazarla use la forma objeto (`formula: { path: "modelo>formula" }`).

**Web Worker**: las fórmulas viajan como texto y se parsean dentro del worker; el resultado es idéntico al del hilo principal.

### Limitaciones en modo `ODataV4`

- Los operandos de los campos `Aggregate` se piden en `$apply` como `sum` con alias propios (`pv<i>_f<k>`), aunque no sean valores visibles. Por eso los operandos deben ser propiedades numéricas que el backend pueda sumar.
- Los campos `Record` no se admiten: se registra un `Log.warning` y sus celdas quedan vacías, igual que las de un `Aggregate` que use un `Record`. Como dimensión o filtro se omiten del `$apply` (el backend no los conoce).
- Las referencias se validan con los metadatos del EntitySet. Si no se pueden leer, una referencia a una propiedad inexistente hará que el backend rechace el `$apply`.


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
  recordCount, usedRecordCount, totalColumns, truncated,
  issues: [{ type: "error" | "warning", field, label, message }]  // solo si hay campos calculados
}
```

`engine/PivotEngine.js` no depende de UI5, así que puede usarse por separado, por ejemplo en un servicio Node:

```js
PivotEngine.compute(aRecords, {
	rows: ["Region"], columns: [{ name: "Anio", sortOrder: "desc" }],
	values: [{ field: "Importe", aggregation: "sum" }, { field: "Margen", aggregation: "formula" }],
	calculatedFields: { Margen: { formula: "{Utilidad} / {Importe}", level: "aggregate" } }, // "aggregate" | "record"
	showSubtotals: true, showGrandTotals: true, hierarchical: false, maxColumns: 500
});
```

## Desarrollo

```bash
npm test            # pruebas del motor en Node (sin navegador) y comparación Web Worker / hilo principal
npm start           # ui5 serve + suite QUnit en el navegador
npm run build       # dist/ con library-preload.js, minificado y manifest.json
npm pack --dry-run  # lista los archivos que se publican en el paquete
```
