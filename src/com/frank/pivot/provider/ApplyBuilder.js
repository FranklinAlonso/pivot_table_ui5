/*!
 * com.frank.pivot - Genera la opción $apply de OData V4 (Data Aggregation Extension)
 * para que el backend agrupe y agregue al nivel más fino de filas x columnas.
 *
 * Módulo sin dependencias de UI5 (probado también en Node.js).
 */
sap.ui.define(["../engine/Aggregations"], function (Aggregations) {
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
	 * @param {object} oConfig Configuración del motor (rows, columns, values, filters)
	 * @returns {string} Valor para $apply
	 */
	function build(oConfig) {
		var aDims = [];
		(oConfig.rows || []).concat(oConfig.columns || []).map(dimensionName).forEach(function (sDim) {
			if (aDims.indexOf(sDim) < 0) {
				aDims.push(sDim);
			}
		});

		var aAggregates = [];
		var bCount = false;
		(oConfig.values || []).forEach(function (oValue, i) {
			var sAgg = String(oValue.aggregation || "sum").toLowerCase();
			var sAlias = Aggregations.aliasFor(i);
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
				default:
					throw new Error("La agregación '" + sAgg + "' no está soportada en modo OData V4 (no es re-agregable)");
			}
		});
		if (bCount) {
			aAggregates.push("$count as " + Aggregations.COUNT_ALIAS);
		}

		var sFilter = buildFilter(oConfig.filters);
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
