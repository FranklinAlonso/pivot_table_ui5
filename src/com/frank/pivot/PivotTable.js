/*!
 * com.frank.pivot.PivotTable
 */
sap.ui.define([
	"sap/ui/core/Control",
	"sap/ui/core/Component",
	"sap/ui/core/Lib",
	"sap/ui/model/json/JSONModel",
	"sap/ui/table/Table",
	"sap/ui/table/TreeTable",
	"sap/ui/table/rowmodes/Fixed",
	"sap/ui/table/rowmodes/Auto",
	"sap/m/OverflowToolbar",
	"sap/m/Title",
	"sap/m/ToolbarSpacer",
	"sap/m/Button",
	"sap/m/MessageStrip",
	"sap/base/Log",
	"./library",
	"./PivotValue",
	"./engine/PivotEngine",
	"./engine/WorkerClient",
	"./table/ColumnBuilder",
	"./table/ColorRules",
	"./provider/ClientDataProvider",
	"./provider/ODataV4Provider",
	"./variant/VariantController",
	"./variant/LocalStorageStore",
	"./variant/UshellPersonalizationStore",
	"./variant/ODataV4Store"
], function (
	Control, Component, Lib, JSONModel, Table, TreeTable, FixedRowMode, AutoRowMode,
	OverflowToolbar, Title, ToolbarSpacer, Button, MessageStrip, Log,
	library, PivotValue, PivotEngine, WorkerClient, ColumnBuilder, ColorRules, ClientDataProvider, ODataV4Provider,
	VariantController, LocalStorageStore, UshellPersonalizationStore, ODataV4Store
) {
	"use strict";

	var DataMode = library.DataMode;
	var MODEL = ColumnBuilder.MODEL_NAME;
	var MAX_DISTINCT_VALUES = 1000;

	/** Tipo de agregación UI5 -> clave del motor */
	var ENGINE_AGGREGATION = {
		Sum: "sum",
		Count: "count",
		CountDistinct: "countdistinct",
		Average: "avg",
		Min: "min",
		Max: "max"
	};

	function bundle() {
		return Lib.getResourceBundleFor("com.frank.pivot");
	}

	/**
	 * Tabla pivote para SAPUI5 / SAP Fiori.
	 *
	 * Calcula una matriz filas x columnas a partir de registros planos (modo Client) o
	 * delegando la agregación en un servicio OData V4 con $apply (modo ODataV4), y la
	 * muestra con sap.ui.table.Table (vista plana) o sap.ui.table.TreeTable (jerárquica).
	 *
	 * <pre>
	 * &lt;pv:PivotTable records="{/Ventas}" rows="Region,Pais" columns="Anio,Trimestre"&gt;
	 *   &lt;pv:PivotValue field="Importe" aggregationType="Sum" format="Currency" unit="EUR"/&gt;
	 * &lt;/pv:PivotTable&gt;
	 * </pre>
	 *
	 * @extends sap.ui.core.Control
	 * @alias com.frank.pivot.PivotTable
	 * @public
	 */
	var PivotTable = Control.extend("com.frank.pivot.PivotTable", {
		metadata: {
			library: "com.frank.pivot",
			properties: {
				/** Registros planos (modo Client). Tras modificar el array en sitio llame a <code>refresh()</code>. */
				records: { type: "object", defaultValue: null },
				/** Dimensiones de fila (nombres de campo). */
				rows: { type: "string[]", defaultValue: [] },
				/** Dimensiones de columna (nombres de campo). */
				columns: { type: "string[]", defaultValue: [] },
				/** Filtros: <code>{campo: [valores permitidos]}</code>. */
				filters: { type: "object", defaultValue: null },
				/**
				 * Reglas de color de celdas: <code>[{field, value?, color}]</code>. Sin <code>value</code>
				 * se colorean todos los valores del campo; con <code>value</code>, solo ese (tiene prioridad).
				 * Un campo de columna colorea columnas; uno de fila, filas.
				 */
				colorRules: { type: "object", defaultValue: null },
				/**
				 * Variación de tono del color de una regla en subtotales (1 paso) y totales generales
				 * (2 pasos), entre 0 y 0.45. 0 = mismo color en todas las celdas.
				 */
				colorShadeStep: { type: "float", defaultValue: 0.15 },
				/** Origen de los datos. */
				mode: { type: "com.frank.pivot.DataMode", defaultValue: DataMode.Client },
				/** Modo ODataV4: nombre del modelo (vacío = modelo por defecto). */
				modelName: { type: "string", defaultValue: "" },
				/** Modo ODataV4: ruta absoluta del EntitySet, p. ej. "/Ventas". */
				entitySet: { type: "string", defaultValue: "" },
				/** Modo ODataV4: máximo de grupos a leer del backend. */
				maxRecords: { type: "int", defaultValue: 50000 },
				showSubtotals: { type: "boolean", defaultValue: true },
				showGrandTotals: { type: "boolean", defaultValue: true },
				/** Filas como árbol expandible (TreeTable) en lugar de lista plana con subtotales. */
				hierarchical: { type: "boolean", defaultValue: false },
				/** Nivel inicial de expansión en modo jerárquico. */
				expandLevel: { type: "int", defaultValue: 1 },
				/** Repetir las etiquetas de fila en cada línea (vista plana). */
				repeatRowLabels: { type: "boolean", defaultValue: false },
				/** Máximo de columnas de valor antes de truncar (protege el DOM). */
				maxColumns: { type: "int", defaultValue: 200 },
				/** A partir de cuántos registros se calcula en un Web Worker. 0 = nunca. */
				workerThreshold: { type: "int", defaultValue: 50000 },
				title: { type: "string", defaultValue: "" },
				showToolbar: { type: "boolean", defaultValue: true },
				enablePersonalization: { type: "boolean", defaultValue: true },
				enableExport: { type: "boolean", defaultValue: true },
				/** Filas visibles (si <code>autoRowCount</code> es false). */
				visibleRowCount: { type: "int", defaultValue: 15 },
				/** Ajustar las filas visibles a la altura disponible. Requiere <code>height</code>. */
				autoRowCount: { type: "boolean", defaultValue: false },
				width: { type: "sap.ui.core.CSSSize", defaultValue: "100%" },
				height: { type: "sap.ui.core.CSSSize", defaultValue: "auto" },
				dimensionColumnWidth: { type: "sap.ui.core.CSSSize", defaultValue: "11rem" },
				valueColumnWidth: { type: "sap.ui.core.CSSSize", defaultValue: "9rem" },
				noDataText: { type: "string", defaultValue: "" },
				/**
				 * Selector de vistas guardadas en la barra de herramientas. Requiere <code>persistencyKey</code>.
				 * Sin <code>variantEntitySet</code> las vistas son personales (Launchpad o, fuera de él, navegador).
				 */
				variantManagement: { type: "boolean", defaultValue: false },
				/** Identifica las vistas de esta tabla, única por app y tabla, p. ej. "ventas.pivotRegion". */
				persistencyKey: { type: "string", defaultValue: "" },
				/** Vistas en OData V4 (p. ej. CAP): nombre del modelo del servicio (vacío = modelo por defecto). */
				variantModelName: { type: "string", defaultValue: "" },
				/** Vistas en OData V4: ruta del EntitySet, p. ej. "/PivotViews". Activa las vistas compartidas. */
				variantEntitySet: { type: "string", defaultValue: "" }
			},
			defaultAggregation: "values",
			aggregations: {
				/** Medidas a agregar. */
				values: { type: "com.frank.pivot.PivotValue", multiple: true, singularName: "value" },
				/** Metadatos de campos (etiquetas, orden, campos del panel). */
				fields: { type: "com.frank.pivot.PivotField", multiple: true, singularName: "field" },
				_toolbar: { type: "sap.m.OverflowToolbar", multiple: false, visibility: "hidden" },
				_strip: { type: "sap.m.MessageStrip", multiple: false, visibility: "hidden" },
				_table: { type: "sap.ui.table.Table", multiple: false, visibility: "hidden" }
			},
			events: {
				/** Clic en una celda. Los filtros permiten navegar al detalle (drill-down). */
				cellPress: {
					parameters: {
						/** "data" | "subtotal" | "group" | "total" */
						rowType: { type: "string" },
						/** "data" | "subtotal" | "total" | "dimension" */
						columnType: { type: "string" },
						/** Dimensiones de fila de la celda: {campo: valor} */
						rowFilters: { type: "object" },
						/** Dimensiones de columna de la celda: {campo: valor} */
						columnFilters: { type: "object" },
						field: { type: "string" },
						aggregationType: { type: "string" },
						value: { type: "any" }
					}
				},
				/** La configuración cambió desde el panel. */
				configurationChange: { parameters: { configuration: { type: "object" } } },
				/** Modo ODataV4: datos recibidos del backend. */
				dataReceived: { parameters: { recordCount: { type: "int" }, truncated: { type: "boolean" } } },
				/** Tabla recalculada y dibujada. */
				updateFinished: {
					parameters: {
						rowCount: { type: "int" },
						columnCount: { type: "int" },
						truncated: { type: "boolean" }
					}
				},
				/** Error al leer o calcular. */
				loadError: { parameters: { message: { type: "string" } } },
				/** El usuario eligió una vista (también "Estándar"). */
				variantSelect: {
					parameters: {
						key: { type: "string" },
						name: { type: "string" },
						configuration: { type: "object" }
					}
				},
				/** Se guardó una vista. */
				variantSave: {
					parameters: {
						key: { type: "string" },
						name: { type: "string" },
						"public": { type: "boolean" },
						/** true si se sobrescribió una vista existente */
						overwrite: { type: "boolean" }
					}
				}
			}
		},

		renderer: {
			apiVersion: 2,
			render: function (oRm, oControl) {
				oRm.openStart("div", oControl);
				oRm.class("pvPivotTable");
				oRm.style("width", oControl.getWidth());
				oRm.style("height", oControl.getHeight());
				oRm.openEnd();
				if (oControl.getShowToolbar()) {
					oRm.renderControl(oControl.getAggregation("_toolbar"));
				}
				oRm.renderControl(oControl.getAggregation("_strip"));
				oRm.openStart("div");
				oRm.class("pvTableContainer");
				oRm.openEnd();
				oRm.renderControl(oControl.getAggregation("_table"));
				oRm.close("div");
				oRm.close("div");
			}
		}
	});

	// ------------------------------------------------------------------ ciclo de vida

	PivotTable.prototype.init = function () {
		this._oModel = new JSONModel({ rows: [], tree: [] });
		this._oModel.setSizeLimit(Number.MAX_SAFE_INTEGER);
		this._iRun = 0;
		this._mColumnInfo = {};
		this._oResult = null;
		this._createToolbar();
		this.setAggregation("_strip", new MessageStrip(this.getId() + "-strip", {
			visible: false,
			showIcon: true,
			showCloseButton: true
		}).addStyleClass("pvStrip"));
		this._createTable(false);
		this.attachConfigurationChange(function () {
			if (this._oVariants) {
				this._oVariants.markModified();
			}
		}, this);
		this.attachModelContextChange(function () {
			if (this.getMode() === DataMode.ODataV4) {
				this.invalidate();
			}
		}, this);
	};

	PivotTable.prototype.exit = function () {
		if (this._oVariants) {
			this._oVariants.destroy();
		}
		this._applyColorStyles([]);
		this._oModel.destroy();
		this._iRun++; // descarta resultados asíncronos pendientes
	};

	PivotTable.prototype.onBeforeRendering = function () {
		this._syncVariants();
		this._syncTableType();
		this._syncTableSettings();
		this._syncToolbar();
		this._update(false);
		// Si solo cambiaron los colores, se reconstruyen las columnas sin recalcular
		if (this._oResult && this._getColorSignature() !== this._sColorSignature) {
			this._applyResult(this._oResult, this._oLastConfig, this._aLastMessages);
		}
	};

	// ------------------------------------------------------------------ API pública

	/**
	 * Fuerza el recálculo (p. ej. tras modificar el array de registros en sitio).
	 * @returns {this} this
	 * @public
	 */
	PivotTable.prototype.refresh = function () {
		this._update(true);
		return this;
	};

	/**
	 * Último resultado del motor (ver README).
	 * @returns {object|null} Resultado
	 * @public
	 */
	PivotTable.prototype.getResult = function () {
		return this._oResult;
	};

	/**
	 * Tabla interna (sap.ui.table.Table o TreeTable), p. ej. para ajustes avanzados.
	 * @returns {sap.ui.table.Table} Tabla
	 * @public
	 */
	PivotTable.prototype.getInnerTable = function () {
		return this.getAggregation("_table");
	};

	/**
	 * Configuración actual serializable (para variantes / persistencia).
	 * @returns {object} Configuración
	 * @public
	 */
	PivotTable.prototype.getConfiguration = function () {
		return {
			rows: this.getRows().slice(),
			columns: this.getColumns().slice(),
			values: this.getValues().map(function (oValue) {
				return {
					field: oValue.getField(),
					aggregationType: oValue.getAggregationType(),
					label: oValue.getLabel(),
					format: oValue.getFormat(),
					decimals: oValue.getDecimals(),
					unit: oValue.getUnit()
				};
			}),
			filters: this.getFilters() ? JSON.parse(JSON.stringify(this.getFilters())) : null,
			colorRules: ColorRules.normalize(this.getColorRules()),
			showSubtotals: this.getShowSubtotals(),
			showGrandTotals: this.getShowGrandTotals(),
			hierarchical: this.getHierarchical(),
			expandLevel: this.getExpandLevel(),
			repeatRowLabels: this.getRepeatRowLabels(),
			colorShadeStep: this.getColorShadeStep()
		};
	};

	/**
	 * Aplica una configuración (parcial) obtenida con getConfiguration().
	 * @param {object} oConfig Configuración
	 * @returns {this} this
	 * @public
	 */
	PivotTable.prototype.setConfiguration = function (oConfig) {
		var that = this;
		if (!oConfig) {
			return this;
		}
		["rows", "columns", "filters", "colorRules", "showSubtotals", "showGrandTotals", "hierarchical",
			"expandLevel", "repeatRowLabels", "colorShadeStep"].forEach(function (sKey) {
			if (oConfig[sKey] !== undefined) {
				that.setProperty(sKey, oConfig[sKey]);
			}
		});
		if (Array.isArray(oConfig.values)) {
			this.destroyValues();
			oConfig.values.forEach(function (oValue) {
				var mSettings = {};
				["field", "aggregationType", "label", "format", "decimals", "unit"].forEach(function (sKey) {
					if (oValue[sKey] !== undefined && oValue[sKey] !== null) {
						mSettings[sKey] = oValue[sKey];
					}
				});
				that.addValue(new PivotValue(mSettings));
			});
		}
		return this;
	};

	/**
	 * Abre el panel de configuración (arrastrar campos a filas/columnas/valores).
	 * @returns {Promise<object|null>} Nueva configuración o null si se cancela
	 * @public
	 */
	PivotTable.prototype.openPersonalization = function () {
		var that = this;
		return new Promise(function (fnResolve, fnReject) {
			sap.ui.require(["com/frank/pivot/panel/FieldPanel"], function (FieldPanel) {
				FieldPanel.open(that).then(function (oConfig) {
					if (oConfig) {
						that.setConfiguration(oConfig);
						that.fireConfigurationChange({ configuration: that.getConfiguration() });
					}
					fnResolve(oConfig);
				}, fnReject);
			}, fnReject);
		});
	};

	/**
	 * Abre el diálogo de colores (campo o valor concreto -> color) para las dimensiones
	 * de columna. También accesible desde el panel de configuración.
	 * @returns {Promise<object[]|null>} Reglas aplicadas o null si se cancela
	 * @public
	 */
	PivotTable.prototype.openColorRules = function () {
		var that = this;
		return new Promise(function (fnResolve, fnReject) {
			sap.ui.require(["com/frank/pivot/panel/ColorRulesDialog"], function (ColorRulesDialog) {
				var mFields = that._getFieldMap();
				ColorRulesDialog.open({
					owner: that,
					fields: that.getColumns().map(function (sName) {
						return { name: sName, label: (mFields[sName] && mFields[sName].getLabel()) || sName };
					}),
					rules: that.getConfiguration().colorRules,
					getValues: that.getDistinctValues.bind(that)
				}).then(function (aRules) {
					if (aRules) {
						that.setColorRules(aRules);
						that.fireConfigurationChange({ configuration: that.getConfiguration() });
					}
					fnResolve(aRules);
				}, fnReject);
			}, fnReject);
		});
	};

	/**
	 * Valores distintos de un campo, ordenados (para elegir reglas de color o filtros).
	 * En modo Client se leen de los registros; en modo ODataV4, del último resultado.
	 * @param {string} sField Campo
	 * @returns {any[]} Valores (máx. 1000, sin vacíos)
	 * @public
	 */
	PivotTable.prototype.getDistinctValues = function (sField) {
		var mSeen = new Map();
		function add(vValue) {
			if (vValue !== null && vValue !== undefined && vValue !== "" && mSeen.size < MAX_DISTINCT_VALUES) {
				mSeen.set(typeof vValue + ":" + vValue, vValue);
			}
		}
		var aRecords = this.getMode() !== DataMode.ODataV4 && this.getRecords();
		if (aRecords && aRecords.length) {
			aRecords.forEach(function (oRecord) {
				add(oRecord && oRecord[sField]);
			});
		} else if (this._oResult) {
			var iCol = this._oResult.columnDimensions.map(function (d) { return d.name; }).indexOf(sField);
			var iRow = this._oResult.rowDimensions.map(function (d) { return d.name; }).indexOf(sField);
			if (iCol >= 0) {
				this._oResult.columns.forEach(function (oLeaf) {
					add(oLeaf.columnKeys[iCol]);
				});
			}
			if (iRow >= 0) {
				this._oResult.rows.forEach(function (oRow) {
					add(oRow.__rowKeys[iRow]);
				});
			}
		}
		return Array.from(mSeen.values()).sort(PivotEngine._compareValues);
	};

	/**
	 * Exporta el resultado actual a Excel con la misma disposición que la tabla
	 * (cabeceras multinivel combinadas, subtotales y, en la vista jerárquica, esquema de filas).
	 * @returns {Promise} Se resuelve cuando el fichero se ha generado
	 * @public
	 */
	PivotTable.prototype.exportToSpreadsheet = function () {
		var that = this;
		return new Promise(function (fnResolve, fnReject) {
			sap.ui.require(["com/frank/pivot/export/PivotExport"], function (PivotExport) {
				PivotExport.exportResult(that.getResult(), that._aValueSpecs || [], that.getTitle(), {
					hierarchical: that.getInnerTable().isA("sap.ui.table.TreeTable")
				}).then(fnResolve, fnReject);
			}, fnReject);
		});
	};

	// ------------------------------------------------------------------ API pública: vistas

	/**
	 * Clave de la vista "Estándar" (la configuración inicial de la tabla).
	 * @type {string}
	 * @public
	 */
	PivotTable.STANDARD_VARIANT_KEY = VariantController.STANDARD_KEY;

	/**
	 * Almacén propio de vistas (ver README, "Vistas guardadas"). Tiene prioridad sobre
	 * <code>variantEntitySet</code> y los almacenes personales.
	 * @param {object|null} oStore Objeto con supportsPublic, load, save, remove y setDefault
	 * @returns {this} this
	 * @public
	 */
	PivotTable.prototype.setVariantStore = function (oStore) {
		this._oVariantStore = oStore || null;
		this.invalidate();
		return this;
	};

	/**
	 * Almacén de vistas en uso.
	 * @returns {object|null} Almacén, o null si el modelo de vistas aún no está disponible
	 * @public
	 */
	PivotTable.prototype.getVariantStore = function () {
		return this._resolveVariantStore();
	};

	/**
	 * Vistas guardadas cargadas (sin la "Estándar").
	 * @returns {object[]} Vistas {key, name, public, author, editable, schemaVersion, configuration}
	 * @public
	 */
	PivotTable.prototype.getVariants = function () {
		return this._oVariants ? this._oVariants.getViews() : [];
	};

	/**
	 * @returns {string|null} Clave de la vista seleccionada, o null sin gestión de vistas
	 * @public
	 */
	PivotTable.prototype.getCurrentVariantKey = function () {
		return this._oVariants ? this._oVariants.getSelectedKey() : null;
	};

	/**
	 * Aplica una vista guardada o la estándar (<code>PivotTable.STANDARD_VARIANT_KEY</code>).
	 * @param {string} sKey Clave de la vista
	 * @returns {boolean} false si no existe o la gestión de vistas no está activa
	 * @public
	 */
	PivotTable.prototype.applyVariant = function (sKey) {
		return this._oVariants ? this._oVariants.select(sKey) : false;
	};

	/**
	 * Guarda la configuración actual como vista.
	 * @param {string} sName Nombre
	 * @param {object} [mOptions] Opciones
	 * @param {string} [mOptions.key] Vista existente a sobrescribir
	 * @param {boolean} [mOptions.public] Compartida (requiere un almacén que lo admita)
	 * @param {boolean} [mOptions.default] Marcar como vista por defecto del usuario
	 * @returns {Promise<object>} Vista guardada
	 * @public
	 */
	PivotTable.prototype.saveVariant = function (sName, mOptions) {
		if (!this._oVariants || !this._oActiveVariantStore) {
			return Promise.reject(new Error("La gestión de vistas no está activa (variantManagement y persistencyKey)"));
		}
		return this._oVariants.save(Object.assign({}, mOptions, { name: sName }));
	};

	// ------------------------------------------------------------------ interno: vistas

	PivotTable.prototype._getPersonalVariantStore = function () {
		if (!this._oPersonalVariantStore) {
			this._oPersonalVariantStore = UshellPersonalizationStore.isAvailable() ?
				new UshellPersonalizationStore({ component: Component.getOwnerComponentFor(this) }) :
				new LocalStorageStore();
		}
		return this._oPersonalVariantStore;
	};

	PivotTable.prototype._resolveVariantStore = function () {
		if (this._oVariantStore) {
			return this._oVariantStore;
		}
		var sEntitySet = this.getVariantEntitySet();
		if (!sEntitySet) {
			return this._getPersonalVariantStore();
		}
		var oModel = this.getModel(this.getVariantModelName() || undefined);
		if (!oModel) {
			return null;
		}
		var oStore = this._oODataVariantStore;
		if (!oStore || oStore._oModel !== oModel || oStore._sEntitySet !== sEntitySet) {
			this._oODataVariantStore = new ODataV4Store({
				model: oModel,
				entitySet: sEntitySet,
				defaultStore: this._getPersonalVariantStore()
			});
		}
		return this._oODataVariantStore;
	};

	/**
	 * Crea el selector de vistas y carga las vistas cuando cambian el almacén o la clave.
	 * Mientras se cargan no se calcula la tabla, para no leer datos con la vista estándar
	 * y repetir la lectura con la vista por defecto del usuario.
	 * @private
	 */
	PivotTable.prototype._syncVariants = function () {
		var that = this;
		var sKey = this.getPersistencyKey();
		var bEnabled = this.getVariantManagement();
		if (bEnabled && !sKey && !this._bPersistencyKeyWarned) {
			this._bPersistencyKeyWarned = true;
			Log.warning("variantManagement requiere persistencyKey", this.getId(), "com.frank.pivot");
		}
		var oStore = bEnabled && sKey ? this._resolveVariantStore() : null;
		if (this._oVariants) {
			this._oVariants.getControl().setVisible(!!oStore);
		}
		if (!oStore || (oStore === this._oActiveVariantStore && sKey === this._sActiveVariantKey)) {
			return;
		}
		if (!this._oVariants) {
			this._oVariants = new VariantController(this);
			this.getAggregation("_toolbar").insertContent(this._oVariants.getControl(), 1);
		}
		this._oActiveVariantStore = oStore;
		this._sActiveVariantKey = sKey;
		this._bVariantsPending = true;
		this.getInnerTable().setBusy(true);
		this._oVariants.activate(oStore, sKey).catch(function (oError) {
			Log.error("No se pudo aplicar la vista por defecto", oError && oError.message, "com.frank.pivot");
		}).then(function () {
			if (oStore !== that._oActiveVariantStore || that.isDestroyed()) {
				return;
			}
			that._bVariantsPending = false;
			that.getInnerTable().setBusy(false);
			that.invalidate();
		});
	};

	// ------------------------------------------------------------------ interno: UI

	PivotTable.prototype._createToolbar = function () {
		var oBundle = bundle();
		var sId = this.getId();
		this._oTitle = new Title(sId + "-title", { level: "H3" });
		this._oExpandButton = new Button(sId + "-expand", {
			icon: "sap-icon://expand-all",
			tooltip: oBundle.getText("PIVOT_EXPAND_ALL"),
			type: "Transparent",
			press: function () {
				this.getInnerTable().expandToLevel(Math.max(this.getRows().length, 1));
			}.bind(this)
		});
		this._oCollapseButton = new Button(sId + "-collapse", {
			icon: "sap-icon://collapse-all",
			tooltip: oBundle.getText("PIVOT_COLLAPSE_ALL"),
			type: "Transparent",
			press: function () {
				this.getInnerTable().collapseAll();
			}.bind(this)
		});
		this._oSettingsButton = new Button(sId + "-settings", {
			icon: "sap-icon://action-settings",
			tooltip: oBundle.getText("PIVOT_SETTINGS"),
			type: "Transparent",
			press: this.openPersonalization.bind(this)
		});
		this._oExportButton = new Button(sId + "-export", {
			icon: "sap-icon://excel-attachment",
			tooltip: oBundle.getText("PIVOT_EXPORT"),
			type: "Transparent",
			press: function () {
				this.exportToSpreadsheet().catch(function (oError) {
					Log.error("Error al exportar", oError, "com.frank.pivot");
				});
			}.bind(this)
		});
		this.setAggregation("_toolbar", new OverflowToolbar(sId + "-toolbar", {
			content: [this._oTitle, new ToolbarSpacer(), this._oExpandButton, this._oCollapseButton,
				this._oSettingsButton, this._oExportButton]
		}));
	};

	PivotTable.prototype._createTable = function (bTree) {
		var TableClass = bTree ? TreeTable : Table;
		var oTable = new TableClass(this.getId() + "-table", {
			selectionMode: "None",
			enableColumnReordering: false,
			ariaLabelledBy: [this._oTitle],
			cellClick: this._onCellClick.bind(this)
		});
		oTable.setModel(this._oModel, MODEL);
		this.setAggregation("_table", oTable, true);
		this._sRowModeKey = null;
		this._sSignature = null; // las columnas deben reconstruirse
		return oTable;
	};

	PivotTable.prototype._syncTableType = function () {
		var bTree = this.getHierarchical();
		if (this.getInnerTable().isA("sap.ui.table.TreeTable") !== bTree) {
			this.destroyAggregation("_table", true);
			this._createTable(bTree);
		}
	};

	PivotTable.prototype._syncTableSettings = function () {
		var oTable = this.getInnerTable();
		var sRowModeKey = this.getAutoRowCount() ? "auto" : "fixed:" + this.getVisibleRowCount();
		if (sRowModeKey !== this._sRowModeKey) {
			this._sRowModeKey = sRowModeKey;
			oTable.destroyRowMode();
			oTable.setRowMode(this.getAutoRowCount() ?
				new AutoRowMode({ minRowCount: 3 }) :
				new FixedRowMode({ rowCount: this.getVisibleRowCount() }));
		}
		oTable.setNoData(this.getNoDataText() || bundle().getText("PIVOT_NO_DATA"));
	};

	PivotTable.prototype._syncToolbar = function () {
		var bTree = this.getHierarchical();
		this._oTitle.setText(this.getTitle());
		this._oExpandButton.setVisible(bTree);
		this._oCollapseButton.setVisible(bTree);
		this._oSettingsButton.setVisible(this.getEnablePersonalization());
		this._oExportButton.setVisible(this.getEnableExport());
	};

	PivotTable.prototype._showMessages = function (aMessages, sType) {
		this.getAggregation("_strip")
			.setText(aMessages.join(" "))
			.setType(sType || "Warning")
			.setVisible(aMessages.length > 0);
	};

	// ------------------------------------------------------------------ interno: datos

	PivotTable.prototype._getFieldMap = function () {
		var mFields = {};
		this.getFields().forEach(function (oField) {
			mFields[oField.getName()] = oField;
		});
		return mFields;
	};

	/**
	 * Construye la configuración del motor a partir de propiedades y agregaciones.
	 * @returns {object} Configuración del motor
	 * @private
	 */
	PivotTable.prototype._getEngineConfig = function () {
		var oBundle = bundle();
		var mFields = this._getFieldMap();

		function dimension(sName) {
			var oField = mFields[sName];
			var sOrder = oField ? oField.getSortOrder() : "Ascending";
			return {
				name: sName,
				label: (oField && oField.getLabel()) || sName,
				sortOrder: sOrder === "Descending" ? "desc" : (sOrder === "None" ? "none" : "asc")
			};
		}

		var aValues = this.getValues().map(function (oValue) {
			var sField = oValue.getField();
			var sType = oValue.getAggregationType();
			var oField = mFields[sField];
			var sFieldLabel = (oField && oField.getLabel()) || sField;
			var sLabel = oValue.getLabel() || (sType === "Sum" ? sFieldLabel :
				oBundle.getText("PIVOT_VALUE_LABEL", [sFieldLabel, oBundle.getText("PIVOT_AGG_" + sType.toUpperCase())]));
			return {
				field: sField,
				aggregation: ENGINE_AGGREGATION[sType],
				aggregationType: sType,
				label: sLabel,
				format: oValue.getFormat(),
				decimals: oValue.getDecimals(),
				unit: oValue.getUnit()
			};
		});

		return {
			rows: this.getRows().map(dimension),
			columns: this.getColumns().map(dimension),
			values: aValues,
			filters: this.getFilters(),
			showSubtotals: this.getShowSubtotals(),
			showGrandTotals: this.getShowGrandTotals(),
			hierarchical: this.getHierarchical(),
			repeatRowLabels: this.getRepeatRowLabels(),
			maxColumns: this.getMaxColumns(),
			texts: {
				total: oBundle.getText("PIVOT_TOTAL", ["{0}"]),
				grandTotal: oBundle.getText("PIVOT_GRAND_TOTAL"),
				empty: oBundle.getText("PIVOT_EMPTY")
			}
		};
	};

	PivotTable.prototype._createProvider = function () {
		if (this.getMode() === DataMode.ODataV4) {
			var oModel = this.getModel(this.getModelName() || undefined);
			if (!oModel || !this.getEntitySet()) {
				return null;
			}
			return new ODataV4Provider({ model: oModel, path: this.getEntitySet(), maxRecords: this.getMaxRecords() });
		}
		return new ClientDataProvider(this.getRecords() || []);
	};

	/**
	 * Recalcula si cambió la configuración o los datos.
	 * @param {boolean} bForce Recalcular siempre
	 * @private
	 */
	PivotTable.prototype._update = function (bForce) {
		var that = this;
		if (this._bVariantsPending) {
			return; // se recalcula al terminar de cargar las vistas
		}
		var oConfig = this._getEngineConfig();
		var bClient = this.getMode() !== DataMode.ODataV4;
		var aRecords = bClient ? (this.getRecords() || []) : null;
		var sSignature = JSON.stringify(oConfig) + "|" + this.getMode() + "|" + this.getEntitySet() + "|" +
			this.getModelName() + "|" + this.getMaxRecords() + "|" + (aRecords ? aRecords.length : "");

		if (!bForce && sSignature === this._sSignature && aRecords === this._aLastRecords) {
			return;
		}

		var oProvider = this._createProvider();
		if (!oProvider) {
			this._sSignature = null; // el modelo aún no está disponible: reintentar en el próximo render
			return;
		}
		this._sSignature = sSignature;
		this._aLastRecords = aRecords;
		var iRun = ++this._iRun;
		var iThreshold = this.getWorkerThreshold();

		function useWorker(aData) {
			return iThreshold > 0 && aData.length >= iThreshold;
		}

		// Camino rápido: datos en memoria y volumen pequeño -> cálculo síncrono, sin parpadeo
		if (bClient && !useWorker(aRecords)) {
			try {
				this._applyResult(PivotEngine.compute(aRecords, oConfig), oConfig, []);
			} catch (oError) {
				this._handleError(oError);
			}
			return;
		}

		var oTable = this.getInnerTable();
		oTable.setBusy(true);
		oProvider.load(oConfig).then(function (oLoad) {
			if (iRun !== that._iRun) {
				return null;
			}
			if (!bClient) {
				that.fireDataReceived({ recordCount: oLoad.records.length, truncated: oLoad.truncated });
			}
			var oEngineConfig = Object.assign({}, oConfig, {
				preAggregated: oLoad.preAggregated,
				filters: oLoad.preAggregated ? null : oConfig.filters // el backend ya filtró
			});
			var pResult = useWorker(oLoad.records) ?
				WorkerClient.compute(oLoad.records, oEngineConfig) :
				Promise.resolve(PivotEngine.compute(oLoad.records, oEngineConfig));
			return pResult.then(function (oResult) {
				if (iRun === that._iRun) {
					var aMessages = oLoad.truncated ?
						[bundle().getText("PIVOT_TRUNCATED_RECORDS", [that.getMaxRecords()])] : [];
					that._applyResult(oResult, oConfig, aMessages);
				}
			});
		}).catch(function (oError) {
			if (iRun === that._iRun) {
				that._sSignature = null;
				that._handleError(oError);
			}
		}).finally(function () {
			if (iRun === that._iRun && !that.isDestroyed()) {
				that.getInnerTable().setBusy(false);
			}
		});
	};

	PivotTable.prototype._getColorSignature = function () {
		return JSON.stringify(ColorRules.normalize(this.getColorRules())) + "|" + this._getShadeStep();
	};

	PivotTable.prototype._getShadeStep = function () {
		return Math.min(Math.max(this.getColorShadeStep() || 0, 0), 0.45);
	};

	/**
	 * Mantiene una hoja de estilo con los colores de las reglas, acotada a este control.
	 * @param {object[]} aRules Reglas normalizadas
	 * @private
	 */
	PivotTable.prototype._applyColorStyles = function (aRules) {
		var sStyleId = this.getId() + "-colors";
		var oStyle = document.getElementById(sStyleId);
		var sCss = ColorRules.buildCss(this.getId(), aRules, this._getShadeStep());
		if (!sCss) {
			if (oStyle) {
				oStyle.remove();
			}
			return;
		}
		if (!oStyle) {
			oStyle = document.createElement("style");
			oStyle.id = sStyleId;
			document.head.appendChild(oStyle);
		}
		oStyle.textContent = sCss;
	};

	PivotTable.prototype._handleError = function (oError) {
		var sMessage = oError && oError.message || String(oError);
		Log.error("Error en la tabla pivote", sMessage, "com.frank.pivot");
		this._showMessages([bundle().getText("PIVOT_ERROR", [sMessage])], "Error");
		this.fireLoadError({ message: sMessage });
	};

	/**
	 * Vuelca el resultado del motor en la tabla interna.
	 * @param {object} oResult Resultado del motor
	 * @param {object} oConfig Configuración usada
	 * @param {string[]} aMessages Avisos adicionales
	 * @private
	 */
	PivotTable.prototype._applyResult = function (oResult, oConfig, aMessages) {
		var oTable = this.getInnerTable();
		var bTree = oTable.isA("sap.ui.table.TreeTable");

		this._oResult = oResult;
		this._aValueSpecs = oConfig.values;
		this._oLastConfig = oConfig;
		this._aLastMessages = aMessages;
		this._sColorSignature = this._getColorSignature();
		var oColors = ColorRules.createResolver(oResult, this.getColorRules());
		this._applyColorStyles(oColors ? oColors.rules : []);

		oTable.unbindRows();
		oTable.destroyColumns();
		this._oModel.setData({ rows: oResult.rows, tree: oResult.tree || [] });

		var oBuilt = ColumnBuilder.build(oResult, {
			hierarchical: bTree,
			values: oConfig.values,
			dimensionWidth: this.getDimensionColumnWidth(),
			valueWidth: this.getValueColumnWidth(),
			colors: oColors
		});
		oBuilt.columns.forEach(function (oColumn) {
			oTable.addColumn(oColumn);
		});
		this._mColumnInfo = oBuilt.columnInfo;
		oTable.setFixedColumnCount(Math.min(oBuilt.fixedColumnCount, Math.max(oBuilt.columns.length - 1, 0)));

		if (bTree) {
			oTable.bindRows({ path: MODEL + ">/tree", parameters: { arrayNames: ["nodes"] } });
			if (this.getExpandLevel() > 0) {
				oTable.expandToLevel(this.getExpandLevel());
			}
		} else {
			oTable.bindRows({ path: MODEL + ">/rows" });
		}

		var aAll = (aMessages || []).slice();
		if (oResult.truncated) {
			aAll.unshift(bundle().getText("PIVOT_TRUNCATED_COLUMNS", [oResult.columns.length, oResult.totalColumns]));
		}
		this._showMessages(aAll, "Warning");

		this.fireUpdateFinished({
			rowCount: bTree ? oResult.tree.length : oResult.rows.length,
			columnCount: oResult.columns.length,
			truncated: oResult.truncated
		});
	};

	PivotTable.prototype._onCellClick = function (oEvent) {
		var oContext = oEvent.getParameter("rowBindingContext");
		if (!oContext || !this._oResult) {
			return;
		}
		var oRow = oContext.getObject();
		var oLeaf = this._mColumnInfo[oEvent.getParameter("columnId")];
		var oValue = oLeaf ? this._aValueSpecs[oLeaf.valueIndex] : null;
		var mRowFilters = {};
		var mColumnFilters = {};

		this._oResult.rowDimensions.forEach(function (oDim, i) {
			if (i < oRow.__rowKeys.length) {
				mRowFilters[oDim.name] = oRow.__rowKeys[i];
			}
		});
		if (oLeaf) {
			this._oResult.columnDimensions.forEach(function (oDim, i) {
				if (i < oLeaf.columnKeys.length) {
					mColumnFilters[oDim.name] = oLeaf.columnKeys[i];
				}
			});
		}

		this.fireCellPress({
			rowType: oRow.__type,
			columnType: oLeaf ? oLeaf.type : "dimension",
			rowFilters: mRowFilters,
			columnFilters: mColumnFilters,
			field: oValue ? oValue.field : null,
			aggregationType: oValue ? oValue.aggregationType : null,
			value: oLeaf ? oRow[oLeaf.id] : null
		});
	};

	return PivotTable;
});
