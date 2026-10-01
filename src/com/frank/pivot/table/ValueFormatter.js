/*!
 * com.frank.pivot - Formateadores de valores numéricos.
 */
sap.ui.define([
	"sap/ui/core/format/NumberFormat"
], function (NumberFormat) {
	"use strict";

	function decimalsOptions(iDecimals, iDefaultMax) {
		return iDecimals >= 0 ?
			{ minFractionDigits: iDecimals, maxFractionDigits: iDecimals } :
			{ minFractionDigits: 0, maxFractionDigits: iDefaultMax };
	}

	return {
		/**
		 * @param {object} oValue Especificación del valor ({aggregation, format, decimals, unit})
		 * @returns {function(number):string} Formateador
		 */
		create: function (oValue) {
			var sFormat = oValue.format || "Number";
			var iDecimals = typeof oValue.decimals === "number" ? oValue.decimals : -1;
			var bCount = oValue.aggregation === "count" || oValue.aggregation === "countdistinct";
			var oFormat;
			var fnFormat;

			if (sFormat === "Integer" || (bCount && sFormat === "Number")) {
				oFormat = NumberFormat.getIntegerInstance({ groupingEnabled: true });
			} else if (sFormat === "Percent") {
				oFormat = NumberFormat.getPercentInstance(decimalsOptions(iDecimals, 1));
			} else if (sFormat === "Currency" && oValue.unit) {
				oFormat = NumberFormat.getCurrencyInstance(Object.assign({ showMeasure: true },
					iDecimals >= 0 ? { decimals: iDecimals } : {}));
				fnFormat = function (n) {
					return oFormat.format(n, oValue.unit);
				};
			} else {
				oFormat = NumberFormat.getFloatInstance(Object.assign({ groupingEnabled: true },
					decimalsOptions(iDecimals, 2)));
			}
			fnFormat = fnFormat || function (n) {
				return oFormat.format(n);
			};

			return function (vValue) {
				if (vValue === null || vValue === undefined || (typeof vValue === "number" && isNaN(vValue))) {
					return "";
				}
				return fnFormat(vValue);
			};
		}
	};
});
