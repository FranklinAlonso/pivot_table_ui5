/*!
 * com.frank.pivot - Generación de las partes XML (SpreadsheetML) de un .xlsx de una hoja.
 *
 * sap.ui.export.Spreadsheet solo admite una fila de cabecera y no combina celdas,
 * por eso la hoja pivote se escribe aquí. Devuelve {ruta: contenido XML}; el
 * empaquetado ZIP lo hace export/PivotExport.js. No depende de UI5 (se prueba en Node.js).
 */
sap.ui.define([], function () {
	"use strict";

	var FIRST_CUSTOM_FORMAT = 164;
	var BUILTIN_FORMATS = { "General": 0, "0": 1, "0.00": 2, "#,##0": 3, "#,##0.00": 4, "0%": 9, "0.00%": 10 };
	var XML_HEADER = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n";
	var NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
	var NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

	function escapeXml(v) {
		return String(v)
			// Caracteres no válidos en XML 1.0
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	/**
	 * @param {int} iCol Columna (base 0)
	 * @returns {string} Letras de la columna (A, B, ..., AA)
	 */
	function columnName(iCol) {
		var s = "";
		for (var n = iCol + 1; n > 0; n = Math.floor((n - 1) / 26)) {
			s = String.fromCharCode(65 + (n - 1) % 26) + s;
		}
		return s;
	}

	function cellRef(iRow, iCol) {
		return columnName(iCol) + (iRow + 1);
	}

	/**
	 * Nombre de hoja válido para Excel: sin []:*?/\ y como mucho 31 caracteres.
	 * @param {string} sName Nombre deseado
	 * @returns {string} Nombre válido
	 */
	function sheetName(sName) {
		var s = String(sName || "").replace(/[\[\]:*?\/\\]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31).trim();
		return s || "Pivot";
	}

	// ------------------------------------------------------------------ estilos

	function createStyles() {
		var aNumFmts = [];
		var mNumFmtIds = {};
		var aXfs = [];
		var mXfIds = {};
		// 0 = normal, 1 = negrita (como antes); el resto se añade según los estilos de texto usados
		var aFonts = [{}, { bold: true }];
		var mFontIds = { "": 0, "b": 1 };

		/**
		 * @param {object} oFont {bold, italic, strikethrough, color: "#rrggbb"}
		 * @returns {int} Índice en fonts
		 */
		function fontId(oFont) {
			var sColor = /^#[0-9a-f]{6}$/i.test(oFont.color || "") ? oFont.color.slice(1).toUpperCase() : "";
			var sKey = (oFont.bold ? "b" : "") + (oFont.italic ? "i" : "") + (oFont.strikethrough ? "s" : "") +
				(sColor ? "#" + sColor : "");
			if (!(sKey in mFontIds)) {
				mFontIds[sKey] = aFonts.length;
				aFonts.push({ bold: !!oFont.bold, italic: !!oFont.italic, strikethrough: !!oFont.strikethrough, color: sColor });
			}
			return mFontIds[sKey];
		}

		function fontXml(oFont) {
			return "<font>" + (oFont.bold ? "<b/>" : "") + (oFont.italic ? "<i/>" : "") +
				(oFont.strikethrough ? "<strike/>" : "") + "<sz val=\"11\"/>" +
				(oFont.color ? "<color rgb=\"FF" + oFont.color + "\"/>" : "") +
				"<name val=\"Calibri\"/><family val=\"2\"/></font>";
		}

		function numFmtId(sCode) {
			if (!sCode) {
				return 0;
			}
			if (sCode in BUILTIN_FORMATS) {
				return BUILTIN_FORMATS[sCode];
			}
			if (!(sCode in mNumFmtIds)) {
				mNumFmtIds[sCode] = FIRST_CUSTOM_FORMAT + aNumFmts.length;
				aNumFmts.push(sCode);
			}
			return mNumFmtIds[sCode];
		}

		/**
		 * @param {object} oStyle {format, bold, italic, strikethrough, color, border, align: "center"|"left", indent, wrap}
		 * @returns {int} Índice en cellXfs
		 */
		function xf(oStyle) {
			var oXf = {
				numFmtId: numFmtId(oStyle.format),
				fontId: fontId(oStyle),
				borderId: oStyle.border ? 1 : 0,
				align: oStyle.align || "",
				indent: Math.min(oStyle.indent || 0, 15),
				vertical: oStyle.vertical || ""
			};
			var sKey = [oXf.numFmtId, oXf.fontId, oXf.borderId, oXf.align, oXf.indent, oXf.vertical].join("|");
			if (!(sKey in mXfIds)) {
				mXfIds[sKey] = aXfs.length;
				aXfs.push(oXf);
			}
			return mXfIds[sKey];
		}

		xf({}); // 0 = estilo por defecto

		function toXml() {
			var aOut = [XML_HEADER, "<styleSheet xmlns=\"" + NS_MAIN + "\">"];
			if (aNumFmts.length) {
				aOut.push("<numFmts count=\"" + aNumFmts.length + "\">");
				aNumFmts.forEach(function (sCode, i) {
					aOut.push("<numFmt numFmtId=\"" + (FIRST_CUSTOM_FORMAT + i) + "\" formatCode=\"" + escapeXml(sCode) + "\"/>");
				});
				aOut.push("</numFmts>");
			}
			aOut.push(
				"<fonts count=\"" + aFonts.length + "\">" + aFonts.map(fontXml).join("") + "</fonts>",
				"<fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills>",
				"<borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border>",
				"<border><left style=\"thin\"><color auto=\"1\"/></left><right style=\"thin\"><color auto=\"1\"/></right>",
				"<top style=\"thin\"><color auto=\"1\"/></top><bottom style=\"thin\"><color auto=\"1\"/></bottom><diagonal/></border></borders>",
				"<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>",
				"<cellXfs count=\"" + aXfs.length + "\">"
			);
			aXfs.forEach(function (oXf) {
				var sAttrs = " numFmtId=\"" + oXf.numFmtId + "\" fontId=\"" + oXf.fontId + "\" fillId=\"0\" borderId=\"" +
					oXf.borderId + "\" xfId=\"0\"" +
					(oXf.numFmtId ? " applyNumberFormat=\"1\"" : "") +
					(oXf.fontId ? " applyFont=\"1\"" : "") +
					(oXf.borderId ? " applyBorder=\"1\"" : "");
				if (oXf.align || oXf.indent || oXf.vertical) {
					aOut.push("<xf" + sAttrs + " applyAlignment=\"1\"><alignment" +
						(oXf.align ? " horizontal=\"" + oXf.align + "\"" : (oXf.indent ? " horizontal=\"left\"" : "")) +
						(oXf.vertical ? " vertical=\"" + oXf.vertical + "\"" : "") +
						(oXf.indent ? " indent=\"" + oXf.indent + "\"" : "") + "/></xf>");
				} else {
					aOut.push("<xf" + sAttrs + "/>");
				}
			});
			aOut.push("</cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles>",
				"</styleSheet>");
			return aOut.join("");
		}

		return { xf: xf, toXml: toXml };
	}

	function cellStyle(oCell) {
		if (oCell.kind === "header") {
			return {
				bold: true,
				border: true,
				align: oCell.dimension ? "left" : "center",
				vertical: "center"
			};
		}
		// oCell.font: estilo de texto de las reglas (PivotLayout); prevalece sobre la negrita de totales
		if (oCell.kind === "number") {
			return Object.assign({ format: oCell.format, bold: oCell.total }, oCell.font);
		}
		return Object.assign({ bold: oCell.total, indent: oCell.indent }, oCell.font);
	}

	// ------------------------------------------------------------------ hoja

	function sheetXml(oLayout, oStyles) {
		var aRows = oLayout.rows || [];
		var iColumns = aRows.reduce(function (n, oRow) {
			return Math.max(n, oRow.cells.length);
		}, 0);
		var iMaxOutline = aRows.reduce(function (n, oRow) {
			return Math.max(n, oRow.outlineLevel || 0);
		}, 0);
		var aOut = [XML_HEADER, "<worksheet xmlns=\"" + NS_MAIN + "\" xmlns:r=\"" + NS_REL + "\">"];

		if (oLayout.outline) {
			// Filas de grupo encima de sus hijas, como en la TreeTable
			aOut.push("<sheetPr><outlinePr summaryBelow=\"0\"/></sheetPr>");
		}
		if (aRows.length && iColumns) {
			aOut.push("<dimension ref=\"A1:" + cellRef(aRows.length - 1, iColumns - 1) + "\"/>");
		}

		var iFreezeRows = oLayout.freezeRows || 0;
		var iFreezeCols = oLayout.freezeColumns || 0;
		aOut.push("<sheetViews><sheetView workbookViewId=\"0\"");
		if (iFreezeRows || iFreezeCols) {
			var sPane = iFreezeRows && iFreezeCols ? "bottomRight" : (iFreezeRows ? "bottomLeft" : "topRight");
			aOut.push(" tabSelected=\"1\"><pane" +
				(iFreezeCols ? " xSplit=\"" + iFreezeCols + "\"" : "") +
				(iFreezeRows ? " ySplit=\"" + iFreezeRows + "\"" : "") +
				" topLeftCell=\"" + cellRef(iFreezeRows, iFreezeCols) + "\" activePane=\"" + sPane + "\" state=\"frozen\"/>" +
				"<selection pane=\"" + sPane + "\"/></sheetView></sheetViews>");
		} else {
			aOut.push(" tabSelected=\"1\"/></sheetViews>");
		}
		aOut.push("<sheetFormatPr defaultRowHeight=\"15\"" + (iMaxOutline ? " outlineLevelRow=\"" + iMaxOutline + "\"" : "") + "/>");

		if (oLayout.widths && oLayout.widths.length) {
			aOut.push("<cols>");
			oLayout.widths.forEach(function (w, i) {
				aOut.push("<col min=\"" + (i + 1) + "\" max=\"" + (i + 1) + "\" width=\"" + w + "\" customWidth=\"1\"/>");
			});
			aOut.push("</cols>");
		}

		aOut.push("<sheetData>");
		aRows.forEach(function (oRow, iRow) {
			aOut.push("<row r=\"" + (iRow + 1) + "\"" + (oRow.outlineLevel ? " outlineLevel=\"" + oRow.outlineLevel + "\"" : "") + ">");
			oRow.cells.forEach(function (oCell, iCol) {
				if (!oCell) {
					return;
				}
				var iStyle = oStyles.xf(cellStyle(oCell));
				var sAttrs = " r=\"" + cellRef(iRow, iCol) + "\"" + (iStyle ? " s=\"" + iStyle + "\"" : "");
				var v = oCell.value;
				if (typeof v === "number" && isFinite(v)) {
					// 15 dígitos significativos, como Excel: evita arrastrar errores de coma flotante
					aOut.push("<c" + sAttrs + "><v>" + Number(v.toPrecision(15)) + "</v></c>");
				} else if (v !== null && v !== undefined && v !== "") {
					aOut.push("<c" + sAttrs + " t=\"inlineStr\"><is><t xml:space=\"preserve\">" + escapeXml(v) + "</t></is></c>");
				} else if (iStyle) {
					aOut.push("<c" + sAttrs + "/>");
				}
			});
			aOut.push("</row>");
		});
		aOut.push("</sheetData>");

		var aMerges = oLayout.merges || [];
		if (aMerges.length) {
			aOut.push("<mergeCells count=\"" + aMerges.length + "\">");
			aMerges.forEach(function (m) {
				aOut.push("<mergeCell ref=\"" + cellRef(m.row, m.col) + ":" +
					cellRef(m.row + m.rowSpan - 1, m.col + m.colSpan - 1) + "\"/>");
			});
			aOut.push("</mergeCells>");
		}
		aOut.push("<pageMargins left=\"0.7\" right=\"0.7\" top=\"0.75\" bottom=\"0.75\" header=\"0.3\" footer=\"0.3\"/>",
			"</worksheet>");
		return aOut.join("");
	}

	/**
	 * @param {object} oLayout Disposición de export/PivotLayout.create
	 * @param {string} [sSheetName] Nombre de la hoja
	 * @returns {Object<string, string>} Partes del paquete: {ruta: XML}
	 */
	function createParts(oLayout, sSheetName) {
		var oStyles = createStyles();
		var sSheet = sheetXml(oLayout, oStyles); // registra los estilos usados
		var iHeaderRows = oLayout.headerRows || 0;
		var sName = sheetName(sSheetName);
		var sDefinedNames = iHeaderRows ?
			"<definedNames><definedName name=\"_xlnm.Print_Titles\" localSheetId=\"0\">'" +
			escapeXml(sName.replace(/'/g, "''")) + "'!$1:$" + iHeaderRows + "</definedName></definedNames>" : "";

		return {
			"[Content_Types].xml": XML_HEADER +
				"<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
				"<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
				"<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
				"<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
				"<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" +
				"<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
				"</Types>",
			"_rels/.rels": XML_HEADER +
				"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
				"<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>" +
				"</Relationships>",
			"xl/workbook.xml": XML_HEADER +
				"<workbook xmlns=\"" + NS_MAIN + "\" xmlns:r=\"" + NS_REL + "\">" +
				"<bookViews><workbookView/></bookViews>" +
				"<sheets><sheet name=\"" + escapeXml(sName) + "\" sheetId=\"1\" r:id=\"rId1\"/></sheets>" +
				sDefinedNames +
				"</workbook>",
			"xl/_rels/workbook.xml.rels": XML_HEADER +
				"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
				"<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>" +
				"<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>" +
				"</Relationships>",
			"xl/worksheets/sheet1.xml": sSheet,
			"xl/styles.xml": oStyles.toXml()
		};
	}

	return {
		MIME_TYPE: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		createParts: createParts,
		columnName: columnName,
		sheetName: sheetName,
		escapeXml: escapeXml
	};
});
