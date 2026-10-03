/*!
 * com.frank.pivot - Genera la opción $apply de OData V4 (Data Aggregation Extension)
 * para que el backend agrupe y agregue al nivel más fino de filas x columnas.
 *
 * Módulo sin dependencias de UI5 (probado también en Node.js).
 */
sap.ui.define([
	"../engine/Aggregations",
	"../engine/CalculatedFields"
], function (Aggregations, CalculatedFields) {
	"use strict";

	function literal(vValue) {
		if (vValue === null || vValue === undefined) {
			return "null";
		}
		if (typeof vValue === "number" || typeof vValue === "boolean") {
			return String(vValue);
		}
		if (vValue instanceof Date) {
			return vValue.toISOString();
		}
		return "'" + String(vValue).replace(/'/g, "''") + "'";
	}

	function buildFilter(mFilters) {
		var aClauses = Object.keys(mFilters || {}).filter(function (sField) {
			return Array.isArray(mFilters[sField]) && mFilters[sField].length > 0;
		}).map(function (sField) {
			var aParts = mFilters[sField].map(function (vValue) {
				return sField + " eq " + literal(vValue);
			});
			return aParts.length > 1 ? "(" + aParts.join(" or ") + ")" : aParts[0];
		});
		return aClauses.join(" and ");
	}

	function dimensionName(vDim) {
		return typeof vDim === "string" ? vDim : vDim.name;
	}

	/**
	 * Campos calculados (ver CalculatedFields): los aggregate piden la suma de cada operando con
	 * el alias pv<i>_f<k>, aunque el operando no sea un valor visible. Los record no existen en el
	 * backend: sus valores no piden nada (el motor deja las celdas en null) y se omiten como
	 * dimensión o filtro.
	 *
	 * @param {object} oConfig Configuración del motor (rows, columns, values, filters,
	 *   calculatedFields, knownFields)
	 * @returns {string} Valor para $apply
	 */
	function build(oConfig) {
		var oCalc = CalculatedFields.prepare(Object.assign({}, oConfig, { preAggregated: true }));
		function isBackendField(sName) {
			return oCalc.calculatedNames.indexOf(sName) < 0;
		}

		var aDims = [];
		(oConfig.rows || []).concat(oConfig.columns || []).map(dimensionName).forEach(function (sDim) {
			if (aDims.indexOf(sDim) < 0 && isBackendField(sDim)) {
				aDims.push(sDim);
			}
		});

		var aAggregates = [];
		var bCount = false;
		oCalc.values.forEach(function (oValue, i) {
			var sAgg = oValue.aggregation;
			var sAlias = Aggregations.aliasFor(i);
			if (oValue.invalid) {
				return;
			}
			switch (sAgg) {
				case "sum":
				case "min":
				case "max":
					aAggregates.push(oValue.field + " with " + sAgg + " as " + sAlias);
					break;
				case "avg":
					aAggregates.push(oValue.field + " with sum as " + sAlias + "_sum");
					bCount = true;
					break;
				case "count":
					bCount = true;
					break;
				case "formula":
					oValue.operands.forEach(function (sOperand, k) {
						aAggregates.push(sOperand + " with sum as " + Aggregations.operandAlias(i, k));
					});
					break;
				default:
					throw new Error("La agregación '" + sAgg + "' no está soportada en modo OData V4 (no es re-agregable)");
			}
			// Valor anterior (PivotValue#previousField): misma agregación con alias pv<i>_prev
			if (oValue.previousField && !oValue.previousInvalid) {
				var sPrevAlias = Aggregations.previousAlias(i);
				if (sAgg === "avg") {
					aAggregates.push(oValue.previousField + " with sum as " + sPrevAlias + "_sum");
				} else if (sAgg !== "count") {
					aAggregates.push(oValue.previousField + " with " + sAgg + " as " + sPrevAlias);
				}
			}
		});
		if (bCount) {
			aAggregates.push("$count as " + Aggregations.COUNT_ALIAS);
		}

		var mFilters = null;
		Object.keys(oConfig.filters || {}).filter(isBackendField).forEach(function (sField) {
			mFilters = mFilters || {};
			mFilters[sField] = oConfig.filters[sField];
		});
		var sFilter = buildFilter(mFilters);
		var sApply = sFilter ? "filter(" + sFilter + ")/" : "";
		if (aDims.length) {
			sApply += "groupby((" + aDims.join(",") + ")" +
				(aAggregates.length ? ",aggregate(" + aAggregates.join(",") + ")" : "") + ")";
		} else if (aAggregates.length) {
			sApply += "aggregate(" + aAggregates.join(",") + ")";
		}
		return sApply;
	}

	return {
		build: build,
		literal: literal
	};
});
