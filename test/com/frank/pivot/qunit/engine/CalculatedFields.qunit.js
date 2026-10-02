/*global QUnit */
sap.ui.define([
	"com/frank/pivot/engine/PivotEngine",
	"com/frank/pivot/engine/CalculatedFields",
	"com/frank/pivot/provider/ApplyBuilder"
], function (PivotEngine, CalculatedFields, ApplyBuilder) {
	"use strict";

	var DATA = [
		{ Region: "Norte", Producto: "Laptop", Anio: 2024, Ventas: 10000, Costo: 8500, Unidades: 10 },
		{ Region: "Norte", Producto: "Teclado", Anio: 2025, Ventas: 1000, Costo: 500, Unidades: 50 },
		{ Region: "Sur", Producto: "Laptop", Anio: 2024, Ventas: 4000, Costo: 3000, Unidades: 4 },
		{ Region: "Sur", Producto: "Monitor", Anio: 2025, Ventas: 0, Costo: 100, Unidades: 0 }
	];

	var CALCULATED = {
		Utilidad: { formula: "{Ventas} - {Costo}", level: "record", label: "Utilidad" },
		Margen: { formula: "{Utilidad} / {Ventas}", level: "aggregate", label: "Margen %" },
		PrecioMedio: { formula: "{Ventas} / {Unidades}", level: "aggregate", label: "Precio medio" }
	};

	var VALUES = [
		{ field: "Utilidad", aggregation: "sum" },
		{ field: "Margen", aggregation: "formula" },
		{ field: "PrecioMedio", aggregation: "formula" }
	];

	function config(mExtra) {
		return Object.assign({
			rows: ["Region", "Producto"],
			columns: [],
			values: VALUES,
			calculatedFields: CALCULATED
		}, mExtra);
	}

	function row(oResult, aKeys, sType) {
		return oResult.rows.filter(function (r) {
			return r.__type === (sType || "data") && JSON.stringify(r.__rowKeys) === JSON.stringify(aKeys);
		})[0];
	}

	function close(assert, nActual, nExpected, sMessage) {
		assert.ok(typeof nActual === "number" && Math.abs(nActual - nExpected) < 1e-9,
			(sMessage || "") + ": " + nActual + " ≈ " + nExpected);
	}

	function errorsFor(oResult, sField) {
		return (oResult.issues || []).filter(function (o) {
			return o.type === "error" && o.field === sField;
		});
	}

	function copy(aRecords) {
		return JSON.parse(JSON.stringify(aRecords));
	}

	QUnit.module("Campos calculados - motor");

	QUnit.test("Subtotal de Norte: Margen = Sum(Utilidad) / Sum(Ventas)", function (assert) {
		var oResult = PivotEngine.compute(DATA, config());
		var oNorte = row(oResult, ["Norte"], "subtotal");
		assert.strictEqual(oNorte.v0, 2000, "Utilidad = 2000");
		close(assert, oNorte.v1, 2000 / 11000, "Margen = 0,1818… (no 0,325)");
		close(assert, oNorte.v2, 11000 / 60, "Precio medio = 183,33");

		var oLaptop = row(oResult, ["Norte", "Laptop"]);
		assert.strictEqual(oLaptop.v0, 1500, "Utilidad de la fila");
		close(assert, oLaptop.v1, 0.15, "Margen de la fila");
		close(assert, oLaptop.v2, 1000, "Precio medio de la fila");

		var oTotal = oResult.rows.filter(function (r) { return r.__type === "total"; })[0];
		assert.strictEqual(oTotal.v0, 2900, "Utilidad total");
		close(assert, oTotal.v1, 2900 / 15000, "Margen total");
		close(assert, oTotal.v2, 15000 / 64, "Precio medio total");

		var oMonitor = row(oResult, ["Sur", "Monitor"]);
		assert.strictEqual(oMonitor.v1, null, "división por cero -> null");
		assert.strictEqual(oMonitor.v0, -100, "Utilidad negativa");
		assert.deepEqual(oResult.issues, [], "sin avisos");
		assert.deepEqual(oResult.values.map(function (v) { return v.aggregation; }), ["sum", "formula", "formula"]);
	});

	QUnit.test("Subtotales con dimensión en columnas", function (assert) {
		var oResult = PivotEngine.compute(DATA, config({ rows: ["Region"], columns: ["Anio"] }));
		function col(sType, aKeys, iValue) {
			return oResult.columns.filter(function (c) {
				return c.type === sType && c.valueIndex === iValue &&
					(!aKeys || JSON.stringify(c.columnKeys) === JSON.stringify(aKeys));
			})[0].id;
		}
		var oNorte = row(oResult, ["Norte"]);
		var oTotal = oResult.rows.filter(function (r) { return r.__type === "total"; })[0];
		close(assert, oNorte[col("data", [2024], 1)], 0.15, "Norte 2024");
		close(assert, oNorte[col("data", [2025], 1)], 0.5, "Norte 2025");
		close(assert, oNorte[col("total", null, 1)], 2000 / 11000, "Norte, total de columnas");
		close(assert, oTotal[col("data", [2024], 1)], 2500 / 14000, "2024, total de filas");
		close(assert, oTotal[col("total", null, 1)], 2900 / 15000, "total general");
		close(assert, oTotal[col("data", [2025], 2)], 1000 / 50, "Precio medio 2025");
	});

	QUnit.test("Vista jerárquica: los grupos usan la fórmula sobre las sumas", function (assert) {
		var oResult = PivotEngine.compute(DATA, config({ hierarchical: true }));
		var oNorte = oResult.tree[0].label === "Norte" ? oResult.tree[0] : oResult.tree[1];
		close(assert, oNorte.v1, 2000 / 11000, "grupo Norte");
		close(assert, oNorte.nodes[0].v1, 0.15, "hoja Laptop");
	});

	QUnit.test("Los registros del proveedor no se modifican", function (assert) {
		var aData = copy(DATA);
		var oFrozen = Object.freeze(Object.assign({}, aData[0]));
		aData[0] = oFrozen;
		PivotEngine.compute(aData, config());
		assert.notOk("Utilidad" in aData[1], "sin campos añadidos");
		assert.deepEqual(aData, copy(DATA), "datos intactos");
	});

	QUnit.test("Campo record como dimensión, en filtros y con otras agregaciones", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Utilidad"],
			values: [{ field: "Utilidad", aggregation: "max" }, { field: "Utilidad", aggregation: "avg" }],
			filters: { Utilidad: [500, 1500] },
			calculatedFields: CALCULATED
		});
		assert.deepEqual(oResult.rows.filter(function (r) { return r.__type === "data"; })
			.map(function (r) { return r.d0; }), ["500", "1500"], "agrupa por el campo derivado");
		var oTotal = oResult.rows.filter(function (r) { return r.__type === "total"; })[0];
		assert.strictEqual(oTotal.v0, 1500, "max");
		assert.strictEqual(oTotal.v1, 1000, "avg");
	});

	QUnit.test("Aggregate anidado y aggregate que usa un record", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region"],
			values: [{ field: "MargenPct", aggregation: "formula" }, { field: "Doble", aggregation: "formula" }],
			calculatedFields: Object.assign({
				MargenPct: { formula: "REDONDEAR({Margen} * 100; 1)", level: "aggregate" },
				Base: { formula: "{Ventas} + {Costo}", level: "aggregate" },
				Doble: { formula: "{Base} * 2 - {Utilidad}", level: "aggregate" }
			}, CALCULATED)
		});
		var oNorte = row(oResult, ["Norte"]);
		assert.strictEqual(oNorte.v0, 18.2, "fórmula sustituida: REDONDEAR(Sum(Utilidad)/Sum(Ventas)*100; 1)");
		assert.strictEqual(oNorte.v1, (11000 + 9000) * 2 - 2000, "aggregate -> aggregate -> base y record");
		assert.deepEqual(oResult.issues, []);
	});

	QUnit.test("Agregación normalizada: aggregate siempre usa Formula", function (assert) {
		var oResult = PivotEngine.compute(DATA, config({
			rows: ["Region"],
			values: [{ field: "Margen", aggregation: "sum" }, { field: "Ventas", aggregation: "formula" },
				{ field: "Utilidad", aggregation: "formula" }]
		}));
		var oNorte = row(oResult, ["Norte"]);
		close(assert, oNorte.v0, 2000 / 11000, "sum sobre un aggregate se calcula como fórmula");
		assert.strictEqual(oNorte.v1, 11000, "formula sobre un campo normal -> sum");
		assert.strictEqual(oNorte.v2, 2000, "formula sobre un record -> sum");
		assert.deepEqual(oResult.values.map(function (v) { return v.aggregation; }), ["formula", "sum", "sum"]);
		assert.strictEqual(oResult.issues.filter(function (o) { return o.type === "warning"; }).length, 3, "un aviso por valor");
	});

	QUnit.module("Campos calculados - errores de configuración");

	QUnit.test("Fórmula inválida: celdas null, el resto de la tabla funciona", function (assert) {
		var oResult = PivotEngine.compute(DATA, config({
			rows: ["Region"],
			values: [{ field: "Ventas" }, { field: "Malo", aggregation: "formula" }, { field: "Margen", aggregation: "formula" }],
			calculatedFields: Object.assign({ Malo: { formula: "{Ventas} / ", label: "Malo" } }, CALCULATED)
		}));
		var oNorte = row(oResult, ["Norte"]);
		assert.strictEqual(oNorte.v0, 11000, "valor normal");
		assert.strictEqual(oNorte.v1, null, "fórmula inválida -> null");
		close(assert, oNorte.v2, 2000 / 11000, "otros calculados siguen funcionando");
		var aErrors = errorsFor(oResult, "Malo");
		assert.strictEqual(aErrors.length, 1, "un error");
		assert.ok(/Fórmula inválida/.test(aErrors[0].message) && /posición 12/.test(aErrors[0].message), aErrors[0].message);
		assert.strictEqual(aErrors[0].label, "Malo", "con el nombre del campo");
	});

	QUnit.test("Ciclo: los campos del ciclo y los que dependen de él quedan en null", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region"],
			values: [{ field: "A", aggregation: "formula" }, { field: "C", aggregation: "formula" }, { field: "Ventas" }],
			calculatedFields: {
				A: { formula: "{B} + 1" },
				B: { formula: "{A} * 2" },
				C: { formula: "{A} + {Ventas}" },
				R: { formula: "{R} + 1", level: "record" }
			}
		});
		var oNorte = row(oResult, ["Norte"]);
		assert.strictEqual(oNorte.v0, null);
		assert.strictEqual(oNorte.v1, null);
		assert.strictEqual(oNorte.v2, 11000, "la tabla sigue funcionando");
		assert.ok(/circular: A → B → A/.test(errorsFor(oResult, "A")[0].message));
		assert.ok(/circular/.test(errorsFor(oResult, "B")[0].message));
		assert.ok(/Depende de «A»/.test(errorsFor(oResult, "C")[0].message));
		assert.ok(/circular: R → R/.test(errorsFor(oResult, "R")[0].message), "autorreferencia");
	});

	QUnit.test("Referencia inexistente y record que usa un aggregate", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region"],
			values: [{ field: "X", aggregation: "formula" }, { field: "R", aggregation: "sum" }, { field: "Ventas" }],
			calculatedFields: Object.assign({
				X: { formula: "{Ventas} / {NoExiste}" },
				R: { formula: "{Margen} * 2", level: "Record" },
				N: { formula: "[Ventas] * 2" }
			}, CALCULATED)
		});
		var oNorte = row(oResult, ["Norte"]);
		assert.deepEqual([oNorte.v0, oNorte.v1, oNorte.v2], [null, null, 11000]);
		assert.ok(/inexistente: \{NoExiste\}/.test(errorsFor(oResult, "X")[0].message));
		assert.ok(/no puede usar un campo calculado agregado \(Margen %\)/.test(errorsFor(oResult, "R")[0].message));
		assert.ok(/\[Ventas\] no admitida/.test(errorsFor(oResult, "N")[0].message), "referencias por nombre");

		oResult = PivotEngine.compute(DATA, {
			rows: ["Region"],
			values: [{ field: "X", aggregation: "formula" }],
			calculatedFields: { X: { formula: "{Ventas} / {NoExiste}" } },
			knownFields: ["Region", "Ventas", "NoExiste"]
		});
		assert.deepEqual(oResult.issues, [], "knownFields tiene prioridad sobre los registros");
	});

	QUnit.test("Sin campos calculados el resultado es el de v1.2.0", function (assert) {
		var oConfig = { rows: ["Region", "Producto"], columns: ["Anio"], values: [{ field: "Ventas" }, { field: "Costo", aggregation: "avg" }] };
		var oResult = PivotEngine.compute(DATA, oConfig);
		assert.notOk("issues" in oResult, "sin propiedades nuevas en el resultado");
		assert.deepEqual(PivotEngine.compute(DATA, Object.assign({ calculatedFields: {} }, oConfig)), oResult,
			"calculatedFields vacío no cambia nada");
		assert.deepEqual(Object.keys(oResult), ["rowDimensions", "columnDimensions", "values", "headerLevels", "columns",
			"rows", "tree", "recordCount", "usedRecordCount", "totalColumns", "truncated"]);
	});

	QUnit.module("Campos calculados - modo servidor");

	QUnit.test("$apply pide los operandos con alias propios y omite los record", function (assert) {
		var oConfig = config({ rows: ["Region"], values: [{ field: "Ventas" }, { field: "Margen", aggregation: "formula" },
			{ field: "PrecioMedio", aggregation: "formula" }, { field: "Utilidad", aggregation: "sum" }],
			filters: { Region: ["Norte"], Utilidad: [1] } });
		assert.strictEqual(ApplyBuilder.build(oConfig),
			"filter(Region eq 'Norte')/groupby((Region),aggregate(Ventas with sum as pv0," +
			"Ventas with sum as pv2_f0,Unidades with sum as pv2_f1))",
			"Margen (usa un record) no pide nada; PrecioMedio pide Ventas y Unidades; el filtro del record se omite");
	});

	QUnit.test("Re-agregación de registros pre-agregados", function (assert) {
		// Lo que devolvería el backend para groupby((Region,Producto)) con los alias de ApplyBuilder
		var aRecords = [
			{ Region: "Norte", Producto: "Laptop", pv0: 10000, pv2_f0: 10000, pv2_f1: 10 },
			{ Region: "Norte", Producto: "Teclado", pv0: 1000, pv2_f0: 1000, pv2_f1: 50 }
		];
		var oResult = PivotEngine.compute(aRecords, config({
			preAggregated: true,
			values: [{ field: "Ventas" }, { field: "Margen", aggregation: "formula" },
				{ field: "PrecioMedio", aggregation: "formula" }, { field: "Utilidad", aggregation: "sum" }]
		}));
		var oNorte = row(oResult, ["Norte"], "subtotal");
		assert.strictEqual(oNorte.v0, 11000);
		assert.strictEqual(oNorte.v1, null, "aggregate con un operando record: null");
		close(assert, oNorte.v2, 11000 / 60, "Precio medio = 183,33");
		assert.strictEqual(oNorte.v3, null, "record: null");
		var aWarnings = oResult.issues.filter(function (o) { return o.type === "warning"; });
		assert.strictEqual(aWarnings.length, 1, "un aviso por campo record");
		assert.strictEqual(aWarnings[0].field, "Utilidad");
	});

	QUnit.test("prepare: orden topológico de los record", function (assert) {
		var oPrepared = CalculatedFields.prepare({
			values: [{ field: "C", aggregation: "sum" }],
			calculatedFields: {
				C: { formula: "{B} * 2", level: "record" },
				A: { formula: "{x} + 1", level: "record" },
				B: { formula: "{A} + {x}", level: "record" },
				Z: { formula: "{x}", level: "record" }
			}
		}, [{ x: 1 }]);
		assert.deepEqual(oPrepared.recordFields.map(function (f) { return f.name; }), ["A", "B", "C"],
			"solo los necesarios, dependencias primero");
		var oRec = { x: 1 };
		assert.deepEqual(CalculatedFields.createDeriver(oPrepared.recordFields)(oRec), { x: 1, A: 2, B: 3, C: 6 });
		assert.deepEqual(oRec, { x: 1 }, "el original no cambia");
	});
});
