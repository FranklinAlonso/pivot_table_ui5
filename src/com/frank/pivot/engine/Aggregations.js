/*!
 * com.frank.pivot - Funciones de agregación del motor pivote.
 *
 * Módulo sin dependencias de UI5 (solo usa sap.ui.define como envoltorio AMD)
 * para poder ejecutarse también dentro de un Web Worker y en Node.js.
 */
sap.ui.define(["./Formula"], function (Formula) {
	"use strict";

	/** Alias usado en $apply para el número de registros agrupados (modo servidor). */
	var COUNT_ALIAS = "pv__count";

	var SUPPORTED = ["sum", "count", "countdistinct", "avg", "min", "max", "formula"];

	function toNumber(v) {
		if (v === null || v === undefined || v === "") {
			return null;
		}
		var n = typeof v === "number" ? v : Number(v);
		return isNaN(n) ? null : n;
	}

	function distinctKey(v) {
		return v instanceof Date ? "D" + v.getTime() : typeof v + ":" + v;
	}

	function aliasFor(iIndex) {
		return "pv" + iIndex;
	}

	/** Alias en $apply del valor anterior (PivotValue#previousField) del valor i (modo servidor). */
	function previousAlias(iIndex) {
		return aliasFor(iIndex) + "_prev";
	}

	/** Alias en $apply de la suma del operando k de un valor de fórmula (modo servidor). */
	function operandAlias(iIndex, k) {
		return aliasFor(iIndex) + "_f" + k;
	}

	/** Acumulador de un valor que no puede calcularse (p. ej. fórmula con errores): siempre null. */
	var NULL_ACCUMULATOR = {
		init: function () { return null; },
		add: function () {},
		result: function () { return null; }
	};

	/**
	 * Crea un acumulador para un valor configurado.
	 *
	 * @param {object} oValue Especificación del valor ({field, aggregation}). Con aggregation "formula"
	 *   lleva además tree y operands (ver CalculatedFields.prepare); con invalid = true las celdas son null.
	 * @param {int} iIndex Posición del valor (para los alias en modo servidor)
	 * @param {boolean} bPreAggregated Si los registros ya vienen agregados del backend
	 * @param {string} [sAlias] Alias en modo servidor (por defecto aliasFor(iIndex))
	 * @returns {{init: function():object, add: function(object, object), result: function(object):number|null}}
	 *   Acumulador. <code>add</code> muta el objeto acumulado.
	 */
	function create(oValue, iIndex, bPreAggregated, sAlias) {
		var sAgg = String(oValue.aggregation || "sum").toLowerCase();
		var sField = oValue.field;
		if (SUPPORTED.indexOf(sAgg) < 0) {
			throw new Error("Agregación no soportada: " + oValue.aggregation);
		}
		if (oValue.invalid || (sAgg === "formula" && !oValue.tree)) {
			return NULL_ACCUMULATOR;
		}
		if (sAgg === "formula") {
			return createFormula(oValue.tree, oValue.operands || [], iIndex, bPreAggregated);
		}
		return bPreAggregated ? createPreAggregated(sAgg, sAlias || aliasFor(iIndex)) : createRaw(sAgg, sField);
	}

	function createRaw(sAgg, sField) {
		var bAllRecords = !sField || sField === "*";
		switch (sAgg) {
			case "sum":
				return {
					init: function () { return { v: null }; },
					add: function (a, oRec) {
						var n = toNumber(oRec[sField]);
						if (n !== null) {
							a.v = (a.v || 0) + n;
						}
					},
					result: function (a) { return a.v; }
				};
			case "count":
				return {
					init: function () { return { v: 0 }; },
					add: function (a, oRec) {
						if (bAllRecords || (oRec[sField] !== null && oRec[sField] !== undefined)) {
							a.v++;
						}
					},
					result: function (a) { return a.v; }
				};
			case "countdistinct":
				return {
					init: function () { return { s: new Set() }; },
					add: function (a, oRec) {
						var v = oRec[sField];
						if (v !== null && v !== undefined) {
							a.s.add(distinctKey(v));
						}
					},
					result: function (a) { return a.s.size; }
				};
			case "avg":
				return {
					init: function () { return { s: 0, n: 0 }; },
					add: function (a, oRec) {
						var n = toNumber(oRec[sField]);
						if (n !== null) {
							a.s += n;
							a.n++;
						}
					},
					result: function (a) { return a.n ? a.s / a.n : null; }
				};
			default: // min | max
				var bMin = sAgg === "min";
				return {
					init: function () { return { v: null }; },
					add: function (a, oRec) {
						var n = toNumber(oRec[sField]);
						if (n !== null && (a.v === null || (bMin ? n < a.v : n > a.v))) {
							a.v = n;
						}
					},
					result: function (a) { return a.v; }
				};
		}
	}

	/*
	 * En modo servidor cada registro es el resultado de groupby/aggregate al nivel
	 * más fino. Para obtener subtotales y totales se re-agrega:
	 *   sum -> suma de sumas, count -> suma de conteos, min/max -> min/max,
	 *   avg -> suma de sumas / suma de conteos.
	 * countdistinct no se puede re-agregar de forma correcta.
	 */
	function createPreAggregated(sAgg, sAlias) {
		switch (sAgg) {
			case "sum":
				return createRaw("sum", sAlias);
			case "count":
				return {
					init: function () { return { v: 0 }; },
					add: function (a, oRec) { a.v += toNumber(oRec[COUNT_ALIAS]) || 0; },
					result: function (a) { return a.v; }
				};
			case "avg":
				return {
					init: function () { return { s: 0, n: 0 }; },
					add: function (a, oRec) {
						a.s += toNumber(oRec[sAlias + "_sum"]) || 0;
						a.n += toNumber(oRec[COUNT_ALIAS]) || 0;
					},
					result: function (a) { return a.n ? a.s / a.n : null; }
				};
			case "min":
			case "max":
				return createRaw(sAgg, sAlias);
			default:
				throw new Error("La agregación '" + sAgg + "' no puede re-agregarse en modo servidor");
		}
	}

	/*
	 * Fórmula sobre agregados: un acumulador sum por operando y la fórmula se evalúa
	 * sobre las sumas en result(). Así un subtotal de Utilidad / Ventas es
	 * Sum(Utilidad) / Sum(Ventas), no la suma ni el promedio de los cocientes.
	 */
	function createFormula(oTree, aOperands, iIndex, bPreAggregated) {
		var mIndex = {};
		var aSums = aOperands.map(function (sOperand, k) {
			mIndex[sOperand] = k;
			return bPreAggregated ? createPreAggregated("sum", operandAlias(iIndex, k)) : createRaw("sum", sOperand);
		});
		var K = aSums.length;
		return {
			init: function () {
				return aSums.map(function (oSum) {
					return oSum.init();
				});
			},
			add: function (a, oRec) {
				for (var k = 0; k < K; k++) {
					aSums[k].add(a[k], oRec);
				}
			},
			result: function (a) {
				var v = Formula.evaluar(oTree, function (sId) {
					var k = mIndex[sId];
					return k === undefined ? null : aSums[k].result(a[k]);
				});
				return typeof v === "number" && isFinite(v) ? v : null;
			}
		};
	}

	return {
		COUNT_ALIAS: COUNT_ALIAS,
		SUPPORTED: SUPPORTED,
		aliasFor: aliasFor,
		operandAlias: operandAlias,
		previousAlias: previousAlias,
		toNumber: toNumber,
		create: create
	};
});
