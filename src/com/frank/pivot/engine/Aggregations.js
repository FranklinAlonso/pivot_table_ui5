/*!
 * com.frank.pivot - Funciones de agregación del motor pivote.
 *
 * Módulo sin dependencias de UI5 (solo usa sap.ui.define como envoltorio AMD)
 * para poder ejecutarse también dentro de un Web Worker y en Node.js.
 */
sap.ui.define([], function () {
	"use strict";

	/** Alias usado en $apply para el número de registros agrupados (modo servidor). */
	var COUNT_ALIAS = "pv__count";

	var SUPPORTED = ["sum", "count", "countdistinct", "avg", "min", "max"];

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

	/**
	 * Crea un acumulador para un valor configurado.
	 *
	 * @param {object} oValue Especificación del valor ({field, aggregation})
	 * @param {int} iIndex Posición del valor (para los alias en modo servidor)
	 * @param {boolean} bPreAggregated Si los registros ya vienen agregados del backend
	 * @returns {{init: function():object, add: function(object, object), result: function(object):number|null}}
	 *   Acumulador. <code>add</code> muta el objeto acumulado.
	 */
	function create(oValue, iIndex, bPreAggregated) {
		var sAgg = String(oValue.aggregation || "sum").toLowerCase();
		var sField = oValue.field;
		if (SUPPORTED.indexOf(sAgg) < 0) {
			throw new Error("Agregación no soportada: " + oValue.aggregation);
		}
		return bPreAggregated ? createPreAggregated(sAgg, aliasFor(iIndex)) : createRaw(sAgg, sField);
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

	return {
		COUNT_ALIAS: COUNT_ALIAS,
		SUPPORTED: SUPPORTED,
		aliasFor: aliasFor,
		toNumber: toNumber,
		create: create
	};
});
