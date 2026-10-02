/*global QUnit */
sap.ui.define([
	"com/frank/pivot/engine/Formula"
], function (Formula) {
	"use strict";

	function calc(sFormula, mValues) {
		return Formula.evaluar(Formula.parse(sFormula), function (sId) {
			return mValues && sId in mValues ? mValues[sId] : null;
		});
	}

	function parseError(sFormula) {
		try {
			Formula.parse(sFormula);
		} catch (oError) {
			return oError;
		}
		return null;
	}

	QUnit.module("Formula - evaluación");

	QUnit.test("Precedencia de operadores y paréntesis", function (assert) {
		assert.strictEqual(calc("2 + 3 * 4"), 14, "* antes que +");
		assert.strictEqual(calc("(2 + 3) * 4"), 20, "paréntesis");
		assert.strictEqual(calc("10 - 4 - 3"), 3, "resta asociativa a la izquierda");
		assert.strictEqual(calc("12 / 3 / 2"), 2, "división asociativa a la izquierda");
		assert.strictEqual(calc("-2 * 3 + 10"), 4, "menos unario");
		assert.strictEqual(calc("2 * -(1 + 2)"), -6, "menos unario sobre paréntesis");
		assert.strictEqual(calc("{a} - {b} * 2", { a: 10, b: 3 }), 4, "con referencias");
	});

	QUnit.test("Coma o punto como separador decimal", function (assert) {
		assert.strictEqual(calc("0,5 * 4"), 2, "coma");
		assert.strictEqual(calc("0.25 * 4"), 1, "punto");
		assert.strictEqual(calc("MAX(1,5; 2)"), 2, "coma decimal dentro de una función");
	});

	QUnit.test("División por cero y vacíos dan null", function (assert) {
		assert.strictEqual(calc("{a} / {b}", { a: 1, b: 0 }), null, "división por cero");
		assert.strictEqual(calc("{a} / {b}", { a: 0, b: 4 }), 0, "cero en el numerador");
		assert.strictEqual(calc("{a} + 1", {}), null, "referencia vacía");
		assert.strictEqual(calc("-{a}", { a: null }), null, "menos unario de vacío");
		assert.strictEqual(calc("ABS({a})", { a: undefined }), null, "ABS de vacío");
		assert.strictEqual(calc("MAX({a}; {b})", { a: null, b: 3 }), 3, "MAX ignora vacíos");
		assert.strictEqual(calc("MIN({a}; {b})", {}), null, "MIN sin valores");
		assert.strictEqual(calc("REDONDEAR({a}; 2)", {}), null, "REDONDEAR de vacío");
	});

	QUnit.test("Funciones", function (assert) {
		assert.strictEqual(calc("ABS(-3)"), 3);
		assert.strictEqual(calc("MIN(4; 2; 8)"), 2);
		assert.strictEqual(calc("MAX(4; 2; 8)"), 8);
		assert.strictEqual(calc("REDONDEAR(2,3456; 2)"), 2.35);
		assert.strictEqual(calc("redondear(1234; -2)"), 1200, "nombres de función sin distinguir mayúsculas");
	});

	QUnit.test("SI anidado y comparaciones", function (assert) {
		var sFormula = "SI({v} >= 100; 1; SI({v} > 50; 2; 3))";
		assert.strictEqual(calc(sFormula, { v: 150 }), 1);
		assert.strictEqual(calc(sFormula, { v: 60 }), 2);
		assert.strictEqual(calc(sFormula, { v: 10 }), 3);
		assert.strictEqual(calc(sFormula, {}), null, "condición vacía -> null");
		assert.strictEqual(calc("SI({a} <> {b}; 1; 0)", { a: 1, b: 2 }), 1, "<>");
		assert.strictEqual(calc("SI({a} = {b}; 1; 0)", { a: 2, b: 2 }), 1, "=");
		assert.strictEqual(calc("SI({a} <= 0; 0; {b} / {a})", { a: 0, b: 5 }), 0, "evita la división por cero");
	});

	QUnit.module("Formula - errores");

	QUnit.test("Errores con su posición", function (assert) {
		var oError = parseError("{a} + * 2");
		assert.ok(oError instanceof Formula.FormulaError, "FormulaError");
		assert.ok(oError instanceof Error, "también es Error");
		assert.strictEqual(oError.pos, 6, "posición del operador sobrante");
		assert.strictEqual(oError.len, 1);

		oError = parseError("({a} + 2");
		assert.strictEqual(oError.pos, 0, "paréntesis sin cerrar: posición del que abre");

		oError = parseError("{a} + 2)");
		assert.strictEqual(oError.pos, 7, "paréntesis de cierre sobrante");

		oError = parseError("{a} +");
		assert.strictEqual(oError.pos, 5, "fórmula incompleta: posición al final");

		oError = parseError("{a} > 2");
		assert.ok(/SI/.test(oError.message), "comparación fuera de SI");
		assert.strictEqual(oError.pos, 4);

		oError = parseError("SUMA({a})");
		assert.strictEqual(oError.identificador, "SUMA", "función desconocida");
		assert.strictEqual(oError.len, 4);

		oError = parseError("SI({a} > 1; 2)");
		assert.ok(/3 argumentos/.test(oError.message), "número de argumentos");

		oError = parseError("MAX(1, 2)");
		assert.ok(/;/.test(oError.message), "coma como separador de argumentos");

		oError = parseError("{a");
		assert.strictEqual(oError.pos, 0, "llave sin cerrar");

		oError = parseError("{a} # 2");
		assert.strictEqual(oError.pos, 4, "carácter no permitido");

		assert.ok(parseError("") instanceof Formula.FormulaError, "fórmula vacía");
		assert.ok(parseError("{}") instanceof Formula.FormulaError, "referencia vacía");
		assert.ok(parseError("{a{b}") instanceof Formula.FormulaError, "llave dentro de una referencia");
	});

	QUnit.module("Formula - referencias");

	QUnit.test("Referencias con cualquier carácter excepto llaves", function (assert) {
		var oTree = Formula.parse("{Ventas netas (€)} / {e4c2-9f.2c/x}");
		assert.deepEqual(Formula.referencias(oTree).map(function (r) { return r.id; }),
			["Ventas netas (€)", "e4c2-9f.2c/x"]);
		assert.deepEqual(Formula.idsReferenciados("{a b} + {c-1} * {a b}"), ["a b", "c-1"], "sin repetir");
		assert.deepEqual(Formula.idsReferenciados("{e4c2} / {9f2c}"), ["e4c2", "9f2c"], "formato anterior");
	});

	QUnit.test("aTexto, aGuardada y tieneDivision", function (assert) {
		var mNames = { e1: "Utilidad", e2: "Ventas" };
		var sText = Formula.aTexto("{e1} / {e2} + {x}", function (sId) { return mNames[sId]; });
		assert.strictEqual(sText, "[Utilidad] / [Ventas] + [?]");
		assert.strictEqual(Formula.aGuardada("[Utilidad] / [ Ventas ] + [Otro]", function (sName) {
			return { Utilidad: "e1", Ventas: "e2" }[sName];
		}), "{e1} / {e2} + [Otro]");
		assert.ok(Formula.tieneDivision(Formula.parse("SI({a} > 0; {b} / {a}; 0)")));
		assert.notOk(Formula.tieneDivision(Formula.parse("{a} * {b}")));
		var oTree = Formula.parse("[Ventas] - 1");
		assert.strictEqual(Formula.referencias(oTree)[0].name, "Ventas", "referencia por nombre");
	});

	QUnit.test("Ciclos", function (assert) {
		var mGraph = { A: ["B"], B: ["C"], C: ["A"], D: ["A"], E: ["E"], F: ["G"], G: [] };
		assert.deepEqual(Formula.buscarCiclo(mGraph, "A"), ["A", "B", "C", "A"]);
		assert.strictEqual(Formula.buscarCiclo(mGraph, "D"), null, "D llega al ciclo pero no forma parte");
		assert.deepEqual(Formula.buscarCiclo(mGraph, "E"), ["E", "E"], "autorreferencia");
		assert.strictEqual(Formula.buscarCiclo(mGraph, "F"), null, "sin ciclo");
	});
});
