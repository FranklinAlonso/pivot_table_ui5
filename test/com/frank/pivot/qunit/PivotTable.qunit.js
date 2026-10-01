/*global QUnit */
sap.ui.define([
	"com/frank/pivot/PivotTable",
	"com/frank/pivot/PivotValue",
	"com/frank/pivot/PivotField",
	"com/frank/pivot/export/PivotExport",
	"com/frank/pivot/variant/LocalStorageStore",
	"sap/ui/model/json/JSONModel",
	"sap/ui/test/utils/nextUIUpdate"
], function (PivotTable, PivotValue, PivotField, PivotExport, LocalStorageStore, JSONModel, nextUIUpdate) {
	"use strict";

	var DATA = [
		{ Region: "EMEA", Pais: "España", Anio: 2024, Importe: 100 },
		{ Region: "EMEA", Pais: "Francia", Anio: 2025, Importe: 20 },
		{ Region: "América", Pais: "México", Anio: 2025, Importe: 75 }
	];

	function create(mSettings) {
		return new PivotTable(Object.assign({
			records: DATA,
			rows: ["Region", "Pais"],
			columns: ["Anio"],
			values: [new PivotValue({ field: "Importe" })],
			fields: [new PivotField({ name: "Region", label: "Región" })]
		}, mSettings));
	}

	async function render(oPivot) {
		oPivot.placeAt("qunit-fixture");
		await nextUIUpdate();
		return oPivot;
	}

	QUnit.module("PivotTable - renderizado", {
		afterEach: function () {
			this.oPivot && this.oPivot.destroy();
		}
	});

	QUnit.test("Genera columnas y filas", async function (assert) {
		this.oPivot = await render(create());
		var oTable = this.oPivot.getInnerTable();
		assert.ok(oTable.isA("sap.ui.table.Table") && !oTable.isA("sap.ui.table.TreeTable"), "tabla plana");
		assert.strictEqual(oTable.getColumns().length, 2 + 3, "2 dimensiones + 2024, 2025 y total");
		assert.strictEqual(oTable.getFixedColumnCount(), 2, "dimensiones fijas");
		assert.strictEqual(oTable.getBinding("rows").getLength(), 6, "3 filas + 2 subtotales + total");
		assert.strictEqual(oTable.getColumns()[0].getLabel().getText(), "Región", "etiqueta de PivotField");
		assert.ok(this.oPivot.getDomRef().classList.contains("pvPivotTable"));
	});

	QUnit.test("Cabeceras multinivel con varios valores", async function (assert) {
		this.oPivot = await render(create({
			values: [new PivotValue({ field: "Importe" }), new PivotValue({ field: "Importe", aggregationType: "Count" })]
		}));
		var aColumns = this.oPivot.getInnerTable().getColumns();
		assert.strictEqual(aColumns[2].getMultiLabels().length, 2, "Año + valor");
		assert.deepEqual(aColumns[2].getHeaderSpan(), [2, 1], "2024 abarca sus dos valores");
		assert.strictEqual(aColumns[3].getMultiLabels()[1].getText(), "Importe (Recuento)", "etiqueta por defecto");
	});

	QUnit.test("Cambio a vista jerárquica usa TreeTable", async function (assert) {
		this.oPivot = await render(create());
		this.oPivot.setHierarchical(true);
		await nextUIUpdate();
		var oTable = this.oPivot.getInnerTable();
		assert.ok(oTable.isA("sap.ui.table.TreeTable"));
		assert.strictEqual(oTable.getColumns().length, 1 + 3, "una columna de jerarquía");
		assert.strictEqual(oTable.getBinding("rows").getLength(), 6, "2 regiones expandidas con 3 países + total general");
	});

	QUnit.test("Recalcula al cambiar la configuración y los datos", async function (assert) {
		this.oPivot = await render(create());
		this.oPivot.setColumns([]);
		await nextUIUpdate();
		assert.strictEqual(this.oPivot.getInnerTable().getColumns().length, 2 + 1);

		this.oPivot.setRecords(DATA.slice(0, 1));
		await nextUIUpdate();
		assert.strictEqual(this.oPivot.getResult().usedRecordCount, 1);
	});

	QUnit.test("Enlace a JSONModel", async function (assert) {
		this.oPivot = create({ records: "{/Ventas}" });
		this.oPivot.setModel(new JSONModel({ Ventas: DATA }));
		await render(this.oPivot);
		assert.strictEqual(this.oPivot.getResult().usedRecordCount, 3);
	});

	QUnit.test("Truncado de columnas muestra aviso", async function (assert) {
		this.oPivot = await render(create({ columns: ["Pais"], maxColumns: 2 }));
		var oStrip = this.oPivot.getAggregation("_strip");
		assert.ok(oStrip.getVisible());
		assert.strictEqual(oStrip.getType(), "Warning");
	});

	QUnit.test("Evento cellPress con filtros de drill-down", async function (assert) {
		this.oPivot = await render(create());
		var oTable = this.oPivot.getInnerTable();
		var oParams;
		this.oPivot.attachCellPress(function (oEvent) {
			oParams = oEvent.getParameters();
		});
		var oColumn = oTable.getColumns()[2]; // 2024
		oTable.fireCellClick({
			rowBindingContext: oTable.getContextByIndex(1), // índice 1 = subtotal América
			columnId: oColumn.getId()
		});
		assert.strictEqual(oParams.rowType, "subtotal");
		assert.deepEqual(oParams.rowFilters, { Region: "América" });
		assert.deepEqual(oParams.columnFilters, { Anio: 2024 });
		assert.strictEqual(oParams.field, "Importe");
		assert.strictEqual(oParams.value, null);
	});

	QUnit.module("PivotTable - colores", {
		afterEach: function () {
			this.oPivot && this.oPivot.destroy();
		}
	});

	function colorOf(oControl) {
		var oData = oControl.getCustomData().filter(function (d) {
			return d.getKey() === "pivot-color";
		})[0];
		return oData ? oData.getValue() : undefined;
	}

	QUnit.test("Reglas de columna y de fila pintan celdas y cabeceras", async function (assert) {
		this.oPivot = await render(create({
			colorRules: [
				{ field: "Anio", color: "#BBDEFB" },
				{ field: "Anio", value: 2025, color: "#FFCDD2" },
				{ field: "Region", value: "EMEA", color: "#C8E6C9" }
			]
		}));
		var oTable = this.oPivot.getInnerTable();
		var aColumns = oTable.getColumns(); // Región, País, 2024, 2025, Total
		var oStyle = document.getElementById(this.oPivot.getId() + "-colors");
		assert.ok(oStyle, "hoja de estilo creada");
		assert.ok(oStyle.textContent.indexOf("#FFCDD2") > 0);

		assert.strictEqual(colorOf(aColumns[2].getLabel()), "c0", "cabecera 2024: regla del campo");
		assert.strictEqual(colorOf(aColumns[3].getLabel()), "c1", "cabecera 2025: regla del valor");
		assert.strictEqual(colorOf(aColumns[4].getLabel()), undefined, "total general sin color");

		var oFirstRow = oTable.getRows()[0]; // América / México
		var oEmeaRow = oTable.getRows()[2]; // EMEA / España
		assert.strictEqual(colorOf(oFirstRow.getCells()[2]), "c0", "celda de columna coloreada");
		assert.strictEqual(colorOf(oFirstRow.getCells()[4]), "none", "total general: fila sin regla");
		assert.strictEqual(colorOf(oEmeaRow.getCells()[4]), "c2-2", "total general en fila EMEA: color de fila, tono de total");
		assert.strictEqual(colorOf(oEmeaRow.getCells()[0]), "c2", "etiqueta de fila EMEA");
		assert.strictEqual(colorOf(oEmeaRow.getCells()[3]), "c1", "la columna prevalece sobre la fila");

		var oSubtotalRow = oTable.getRows()[1]; // Total América
		var oTotalRow = oTable.getRows()[5]; // Total general
		assert.strictEqual(colorOf(oSubtotalRow.getCells()[2]), "c0-1", "subtotal de fila: tono de subtotal");
		assert.strictEqual(colorOf(oTotalRow.getCells()[2]), "c0-2", "total general: tono de total");

		await nextUIUpdate();
		function background(oControl) {
			return getComputedStyle(oControl.getDomRef().closest("td")).backgroundColor;
		}
		assert.strictEqual(background(oFirstRow.getCells()[2]), "rgb(187, 222, 251)", "fondo aplicado en el DOM");
		assert.strictEqual(background(oSubtotalRow.getCells()[2]), "rgb(159, 189, 213)", "subtotal más oscuro");
		assert.strictEqual(background(oTotalRow.getCells()[2]), "rgb(131, 155, 176)", "total aún más oscuro");
	});

	QUnit.test("Columnas de subtotal y tono configurable", async function (assert) {
		this.oPivot = await render(create({
			columns: ["Anio", "Region"],
			rows: ["Pais"],
			colorRules: [{ field: "Anio", value: 2025, color: "#BBDEFB" }]
		}));
		var aColumns = this.oPivot.getInnerTable().getColumns(); // País | 2024: EMEA, Total | 2025: América, EMEA, Total | Total
		assert.strictEqual(colorOf(aColumns[3].getMultiLabels()[1]), "c0", "cabecera de detalle");
		assert.strictEqual(colorOf(aColumns[5].getMultiLabels()[1]), "c0-1", "cabecera «Total 2025»: tono de subtotal");
		assert.strictEqual(colorOf(this.oPivot.getInnerTable().getRows()[0].getCells()[5]), "c0-1", "celda de columna de subtotal");

		this.oPivot.setColorShadeStep(0);
		await nextUIUpdate();
		var sCss = document.getElementById(this.oPivot.getId() + "-colors").textContent;
		assert.ok(sCss.indexOf("[data-pivot-color=\"c0-1\"]) { background-color: #BBDEFB") > 0, "sin variación de tono");
	});

	QUnit.test("Cambiar solo los colores no recalcula el pivote", async function (assert) {
		this.oPivot = await render(create());
		var oResult = this.oPivot.getResult();
		assert.notOk(document.getElementById(this.oPivot.getId() + "-colors"), "sin reglas no hay estilos");
		this.oPivot.setColorRules([{ field: "Anio", value: 2024, color: "#FFF3B0" }]);
		await nextUIUpdate();
		assert.strictEqual(this.oPivot.getResult(), oResult, "mismo resultado");
		assert.strictEqual(colorOf(this.oPivot.getInnerTable().getColumns()[2].getLabel()), "c0", "columnas reconstruidas");
		this.oPivot.destroy();
		assert.notOk(document.getElementById(this.oPivot.getId() + "-colors"), "estilos eliminados al destruir");
	});

	QUnit.test("Valores distintos de un campo", function (assert) {
		var oPivot = create();
		assert.deepEqual(oPivot.getDistinctValues("Anio"), [2024, 2025]);
		assert.deepEqual(oPivot.getDistinctValues("Region"), ["América", "EMEA"]);
		oPivot.destroy();
	});

	QUnit.module("PivotTable - configuración");

	QUnit.test("getConfiguration / setConfiguration", function (assert) {
		var oPivot = create();
		var oConfig = oPivot.getConfiguration();
		assert.deepEqual(oConfig.rows, ["Region", "Pais"]);
		assert.strictEqual(oConfig.values[0].aggregationType, "Sum");

		oPivot.setConfiguration({ rows: ["Pais"], values: [{ field: "Importe", aggregationType: "Max" }], hierarchical: true });
		assert.deepEqual(oPivot.getRows(), ["Pais"]);
		assert.deepEqual(oPivot.getColumns(), ["Anio"], "lo no indicado se mantiene");
		assert.strictEqual(oPivot.getValues()[0].getAggregationType(), "Max");
		assert.ok(oPivot.getHierarchical());

		oPivot.setConfiguration({ expandLevel: 3, repeatRowLabels: true, colorShadeStep: 0.3 });
		oConfig = oPivot.getConfiguration();
		assert.deepEqual([oConfig.expandLevel, oConfig.repeatRowLabels, oConfig.colorShadeStep], [3, true, 0.3],
			"también se guardan nivel de expansión, etiquetas repetidas y tono");

		oPivot.setConfiguration({ colorRules: [{ field: "Anio", value: 2024, color: "#FFF3B0" }, { field: "", color: "#fff" }] });
		assert.deepEqual(oPivot.getConfiguration().colorRules, [{ field: "Anio", value: 2024, color: "#FFF3B0" }],
			"las reglas se guardan normalizadas");
		oPivot.destroy();
	});

	QUnit.module("PivotExport");

	QUnit.test("Columnas y filas de la hoja", async function (assert) {
		var oPivot = await render(create());
		var oResult = oPivot.getResult();
		var aColumns = PivotExport.createColumns(oResult, oPivot._aValueSpecs);
		var aRows = PivotExport.createRows(oResult);
		assert.strictEqual(aColumns.length, 5);
		assert.strictEqual(aColumns[0].label, "Región");
		assert.strictEqual(aColumns[2].label, "2024");
		assert.strictEqual(aRows[3].d0, "EMEA", "etiqueta rellenada hacia abajo para Francia");
		oPivot.destroy();
	});

	/** assert.rejects no existe en QUnit 2.3 */
	async function expectRejection(assert, pPromise, rMessage) {
		try {
			await pPromise;
			assert.ok(false, "se esperaba un rechazo");
		} catch (oError) {
			assert.ok(rMessage.test(oError && oError.message), "rechazada: " + (oError && oError.message));
		}
	}

	QUnit.module("PivotTable - vistas", {
		beforeEach: function () {
			var mData = {};
			this.oStore = new LocalStorageStore({
				storage: {
					getItem: function (sKey) {
						return mData[sKey] || null;
					},
					setItem: function (sKey, sValue) {
						mData[sKey] = sValue;
					}
				}
			});
		},
		afterEach: function () {
			this.oPivot && this.oPivot.destroy();
		}
	});

	/** Espera a que terminen las promesas del almacén y el renderizado. */
	async function settle() {
		for (var i = 0; i < 3; i++) {
			await new Promise(function (fnResolve) {
				setTimeout(fnResolve, 0);
			});
		}
		await nextUIUpdate();
	}

	async function renderWithViews(oStore, mSettings) {
		var oPivot = create(Object.assign({ variantManagement: true, persistencyKey: "ventas" }, mSettings));
		oPivot.setVariantStore(oStore);
		await render(oPivot);
		await settle();
		return oPivot;
	}

	function variantManagement(oPivot) {
		return oPivot.getAggregation("_toolbar").getContent()[1];
	}

	QUnit.test("Sin persistencyKey no hay selector de vistas", async function (assert) {
		this.oPivot = await render(create({ variantManagement: true }));
		assert.strictEqual(this.oPivot.getCurrentVariantKey(), null);
		assert.notOk(this.oPivot.getDomRef().querySelector(".sapMVarMng"), "no se muestra");
		await expectRejection(assert, this.oPivot.saveVariant("X"), /no está activa/);
	});

	QUnit.test("Guardar, cambiar y volver a una vista", async function (assert) {
		var oPivot = this.oPivot = await renderWithViews(this.oStore);
		var oVM = variantManagement(oPivot);
		assert.ok(oVM.isA("sap.m.VariantManagement"), "selector junto al título");
		assert.ok(oVM.getDomRef(), "se muestra");
		assert.strictEqual(oPivot.getCurrentVariantKey(), PivotTable.STANDARD_VARIANT_KEY);
		assert.strictEqual(oVM.getItems()[0].getTitle(), "Estándar");
		assert.strictEqual(oVM.getSupportPublic(), false, "almacén personal: sin vistas públicas");

		var aSaved = [];
		oPivot.attachVariantSave(function (oEvent) {
			aSaved.push(oEvent.getParameters());
		});
		oPivot.setConfiguration({ rows: ["Pais"], showSubtotals: false });
		var oView = await oPivot.saveVariant("Por país", { "default": true });
		assert.strictEqual(oPivot.getCurrentVariantKey(), oView.key, "la vista nueva queda seleccionada");
		assert.strictEqual(oVM.getDefaultKey(), oView.key);
		assert.deepEqual(oPivot.getVariants().map(function (o) { return o.name; }), ["Por país"]);
		assert.strictEqual(aSaved[0].name, "Por país");
		assert.strictEqual(aSaved[0].overwrite, false);
		assert.strictEqual((await this.oStore.load("ventas")).defaultKey, oView.key, "por defecto guardada en el almacén");

		var aSelected = [];
		oPivot.attachVariantSelect(function (oEvent) {
			aSelected.push(oEvent.getParameter("key"));
		});
		assert.ok(oPivot.applyVariant(PivotTable.STANDARD_VARIANT_KEY));
		assert.deepEqual(oPivot.getRows(), ["Region", "Pais"], "la estándar es la configuración inicial");
		assert.strictEqual(oPivot.getShowSubtotals(), true);
		assert.ok(oPivot.applyVariant(oView.key));
		assert.deepEqual(oPivot.getRows(), ["Pais"]);
		assert.strictEqual(oPivot.getShowSubtotals(), false);
		assert.deepEqual(aSelected, [PivotTable.STANDARD_VARIANT_KEY, oView.key]);
		assert.notOk(oPivot.applyVariant("no-existe"));

		oPivot.setConfiguration({ columns: [] });
		await oPivot.saveVariant("Por país", { key: oView.key });
		assert.deepEqual((await this.oStore.load("ventas")).variants[0].configuration.columns, [], "sobrescrita");
		assert.strictEqual(aSaved[1].overwrite, true);
	});

	QUnit.test("Aplica la vista por defecto antes del primer cálculo", async function (assert) {
		var oView = await this.oStore.save("ventas", { name: "Por país", configuration: { rows: ["Pais"], columns: [] } });
		await this.oStore.setDefault("ventas", oView.key);
		var iUpdates = 0;
		var oPivot = this.oPivot = create({ variantManagement: true, persistencyKey: "ventas" });
		oPivot.setVariantStore(this.oStore);
		oPivot.attachUpdateFinished(function () {
			iUpdates++;
		});
		await render(oPivot);
		await settle();
		assert.strictEqual(oPivot.getCurrentVariantKey(), oView.key);
		assert.deepEqual(oPivot.getRows(), ["Pais"]);
		assert.deepEqual(oPivot.getColumns(), []);
		assert.deepEqual(oPivot.getValues().map(function (o) { return o.getField(); }), ["Importe"],
			"lo que la vista no guarda se toma de la estándar");
		assert.strictEqual(iUpdates, 1, "un solo cálculo, ya con la vista por defecto");
		assert.strictEqual(oPivot.getInnerTable().getBinding("rows").getLength(), 4, "3 países + total");
	});

	QUnit.test("Cambios desde el panel marcan la vista como modificada", async function (assert) {
		var oPivot = this.oPivot = await renderWithViews(this.oStore);
		var oVM = variantManagement(oPivot);
		assert.notOk(oVM.getModified());
		oPivot.fireConfigurationChange({ configuration: oPivot.getConfiguration() });
		assert.ok(oVM.getModified());
		oPivot.applyVariant(PivotTable.STANDARD_VARIANT_KEY);
		assert.notOk(oVM.getModified(), "al aplicar una vista se limpia");
	});

	QUnit.test("Gestionar: renombrar, borrar y cambiar la vista por defecto", async function (assert) {
		var oPivot = this.oPivot = await renderWithViews(this.oStore);
		var oVM = variantManagement(oPivot);
		oPivot.setConfiguration({ rows: ["Pais"] });
		var oA = await oPivot.saveVariant("A");
		var oB = await oPivot.saveVariant("B");

		oVM.fireManage({ renamed: [{ key: oA.key, name: "A2" }], deleted: [oB.key], def: oA.key });
		await settle();
		var oData = await this.oStore.load("ventas");
		assert.deepEqual(oData.variants.map(function (o) { return o.name; }), ["A2"]);
		assert.strictEqual(oData.defaultKey, oA.key);
		assert.notOk(oVM.getItemByKey(oB.key), "el elemento borrado se quita del selector");
		assert.strictEqual(oPivot.getCurrentVariantKey(), PivotTable.STANDARD_VARIANT_KEY, "se borró la vista activa");
		assert.deepEqual(oPivot.getRows(), ["Region", "Pais"]);

		oVM.fireManage({ def: PivotTable.STANDARD_VARIANT_KEY });
		await settle();
		assert.strictEqual((await this.oStore.load("ventas")).defaultKey, null);
	});

	QUnit.test("Una vista con campos que ya no existen se aplica sin ellos", async function (assert) {
		var oView = await this.oStore.save("ventas", {
			name: "Antigua",
			configuration: { rows: ["Region", "Ciudad"], filters: { Ciudad: ["Lyon"] }, colorRules: [{ field: "Anio", color: "red;}" }] }
		});
		var oPivot = this.oPivot = await renderWithViews(this.oStore);
		assert.ok(oPivot.applyVariant(oView.key));
		assert.deepEqual(oPivot.getRows(), ["Region"]);
		assert.deepEqual(oPivot.getFilters(), {});
		assert.deepEqual(oPivot.getConfiguration().colorRules, [], "colores inseguros descartados");
	});
});
