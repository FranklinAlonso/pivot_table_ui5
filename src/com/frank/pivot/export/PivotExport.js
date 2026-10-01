/*!
 * com.frank.pivot - Exportación del resultado pivote a Excel con sap.ui.export.
 */
sap.ui.define([
	"sap/ui/export/Spreadsheet",
	"sap/ui/export/library"
], function (Spreadsheet, exportLibrary) {
	"use strict";

	var EdmType = exportLibrary.EdmType;

	/**
	 * Construye la definición de columnas de la hoja.
	 * @param {object} oResult Resultado del motor
	 * @param {object[]} aValueSpecs Especificaciones de valores (formato)
	 * @returns {object[]} Columnas para sap.ui.export.Spreadsheet
	 */
	function createColumns(oResult, aValueSpecs) {
		var aColumns = oResult.rowDimensions.map(function (oDim, i) {
			return { label: oDim.label, property: "d" + i, type: EdmType.String, width: 20 };
		});
		oResult.columns.forEach(function (oLeaf) {
			var oValue = aValueSpecs[oLeaf.valueIndex] || {};
			var oColumn = {
				label: oLeaf.labels.filter(Boolean).join(" / ") || oValue.label,
				property: oLeaf.id,
				type: EdmType.Number,
				delimiter: true,
				width: 16
			};
			if (oValue.format === "Percent") {
				oColumn.type = EdmType.Percentage;
			} else if (oValue.format === "Currency" && oValue.unit) {
				oColumn.type = EdmType.Currency;
				oColumn.unit = oValue.unit;
			}
			if (oValue.decimals >= 0) {
				oColumn.scale = oValue.decimals;
			} else if (oValue.format === "Integer" || oValue.aggregation === "count" || oValue.aggregation === "countdistinct") {
				oColumn.scale = 0;
			}
			aColumns.push(oColumn);
		});
		return aColumns;
	}

	/**
	 * Filas para la hoja: en la vista compacta las etiquetas repetidas están vacías;
	 * en Excel se rellenan hacia abajo para poder filtrar.
	 * @param {object} oResult Resultado del motor
	 * @returns {object[]} Filas
	 */
	function createRows(oResult) {
		var iDims = oResult.rowDimensions.length;
		var aLast = [];
		return oResult.rows.map(function (oRow) {
			var oCopy = Object.assign({}, oRow);
			if (oRow.__type === "data") {
				for (var d = 0; d < iDims; d++) {
					oCopy["d" + d] = oRow["d" + d] || aLast[d] || "";
					aLast[d] = oCopy["d" + d];
				}
			}
			return oCopy;
		});
	}

	return {
		createColumns: createColumns,
		createRows: createRows,

		/**
		 * @param {object} oResult Resultado del motor
		 * @param {object[]} aValueSpecs Especificaciones de valores
		 * @param {string} [sTitle] Título (nombre del fichero)
		 * @returns {Promise} Se resuelve al generar el fichero
		 */
		exportResult: function (oResult, aValueSpecs, sTitle) {
			if (!oResult) {
				return Promise.resolve();
			}
			var oSheet = new Spreadsheet({
				workbook: { columns: createColumns(oResult, aValueSpecs), context: { sheetName: (sTitle || "Pivot").slice(0, 31) } },
				dataSource: createRows(oResult),
				fileName: (sTitle || "pivot") + ".xlsx"
			});
			return oSheet.build().finally(function () {
				oSheet.destroy();
			});
		}
	};
});
