/*!
 * com.frank.pivot - Exportación del resultado pivote a Excel (.xlsx).
 *
 * La hoja reproduce la disposición de la tabla en pantalla (cabeceras multinivel
 * combinadas, columnas de dimensión fijas, subtotales/totales y jerarquía).
 * Ver export/PivotLayout.js (disposición) y export/XlsxWriter.js (SpreadsheetML).
 */
sap.ui.define([
	"sap/ui/thirdparty/jszip",
	"sap/ui/core/util/File",
	"./PivotLayout",
	"./XlsxWriter"
], function (JSZip, File, PivotLayout, XlsxWriter) {
	"use strict";

	/**
	 * Nombre de fichero sin caracteres no permitidos en Windows/macOS.
	 * @param {string} sTitle Título
	 * @returns {string} Nombre sin extensión
	 */
	function fileName(sTitle) {
		return String(sTitle || "").replace(/[\\\/:*?"<>|\u0000-\u001F]/g, "_").trim() || "pivot";
	}

	/**
	 * Empaqueta las partes XML en un .xlsx.
	 * @param {Object<string, string>} mParts Partes de XlsxWriter.createParts
	 * @returns {ArrayBuffer} Contenido del fichero
	 */
	function zip(mParts) {
		var oZip = new JSZip();
		Object.keys(mParts).forEach(function (sPath) {
			oZip.file(sPath, mParts[sPath]);
		});
		return oZip.generate({ type: "arraybuffer", compression: "DEFLATE" });
	}

	return {
		/**
		 * @param {object} oResult Resultado del motor
		 * @param {object[]} aValueSpecs Especificaciones de valores
		 * @param {object} [mOptions]
		 * @param {boolean} [mOptions.hierarchical] Vista jerárquica
		 * @returns {object} Disposición de la hoja (ver PivotLayout.create)
		 */
		createLayout: function (oResult, aValueSpecs, mOptions) {
			return PivotLayout.create(oResult, aValueSpecs, mOptions);
		},

		/**
		 * @param {object} oResult Resultado del motor
		 * @param {object[]} aValueSpecs Especificaciones de valores
		 * @param {string} [sTitle] Título (nombre del fichero y de la hoja)
		 * @param {object} [mOptions]
		 * @param {boolean} [mOptions.hierarchical] Exportar la vista jerárquica (una columna con sangría y esquema)
		 * @returns {Promise} Se resuelve al generar el fichero
		 */
		exportResult: function (oResult, aValueSpecs, sTitle, mOptions) {
			if (!oResult) {
				return Promise.resolve();
			}
			return new Promise(function (fnResolve) {
				var oLayout = PivotLayout.create(oResult, aValueSpecs, mOptions);
				var oContent = zip(XlsxWriter.createParts(oLayout, sTitle || "Pivot"));
				File.save(oContent, fileName(sTitle), "xlsx", XlsxWriter.MIME_TYPE);
				fnResolve();
			});
		}
	};
});
