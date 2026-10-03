/*!
 * com.frank.pivot - Disposición de la hoja de Excel a partir del resultado del motor.
 *
 * Reproduce la tabla tal como se ve en pantalla (ver table/ColumnBuilder.js):
 *   - cabeceras multinivel con celdas combinadas (headerSpan),
 *   - columnas de dimensión a la izquierda, fijas junto con las cabeceras,
 *   - etiquetas de fila compactas (sin repetir) o repetidas según la configuración,
 *   - subtotales y totales en su posición; en la vista jerárquica, una sola columna
 *     con sangría y filas agrupadas (esquema de Excel).
 *
 * No depende de UI5 (se prueba en Node.js). El resultado lo escribe export/XlsxWriter.js.
 */
sap.ui.define(["../table/TextRules"], function (TextRules) {
	"use strict";

	var MAX_OUTLINE_LEVEL = 7; // límite de Excel
	/** Estilo del valor actual cuando difiere del anterior (como en pantalla, ver PivotTable.css). */
	var CHANGED_FONT = { color: TextRules.hexColor("Critical"), bold: true };
	/** Estilo del valor anterior exportado (exportPrevious). */
	var PREVIOUS_FONT = { color: "#556b82", strikethrough: true };

	/**
	 * Formato numérico de Excel equivalente a table/ValueFormatter.js.
	 * @param {object} oValue Especificación del valor ({aggregation, format, decimals, unit})
	 * @param {boolean} bAllIntegers Todos los valores de la columna son enteros
	 * @returns {string} Código de formato
	 */
	function numberFormat(oValue, bAllIntegers) {
		var sFormat = oValue.format || "Number";
		var iDecimals = typeof oValue.decimals === "number" && oValue.decimals >= 0 ? oValue.decimals : -1;
		var bCount = oValue.aggregation === "count" || oValue.aggregation === "countdistinct";

		function fraction(iDigits) {
			return iDigits > 0 ? "." + new Array(iDigits + 1).join("0") : "";
		}

		if (sFormat === "Integer" || (bCount && sFormat === "Number")) {
			return "#,##0";
		}
		if (sFormat === "Percent") {
			return "0" + fraction(iDecimals >= 0 ? iDecimals : 1) + "%";
		}
		var sNumber = "#,##0" + fraction(iDecimals >= 0 ? iDecimals : (bAllIntegers ? 0 : 2));
		if (sFormat === "Currency" && oValue.unit) {
			return sNumber + " \"" + String(oValue.unit).replace(/"/g, "") + "\"";
		}
		return sNumber;
	}

	function isNumber(v) {
		return typeof v === "number" && isFinite(v);
	}

	/**
	 * @param {object} oResult Resultado de PivotEngine.compute
	 * @param {object[]} aValueSpecs Especificaciones de valores (formato)
	 * @param {object} [mOptions]
	 * @param {boolean} [mOptions.hierarchical] Vista jerárquica (usa oResult.tree)
	 * @param {object[]} [mOptions.textRules] Reglas de estilo de texto (PivotTable#textRules)
	 * @param {boolean} [mOptions.exportPrevious] Añadir tras cada columna con previousField otra con el valor anterior
	 * @param {string} [mOptions.previousLabel="{0} (prev.)"] Cabecera de esas columnas ({0} = cabecera del valor)
	 * @returns {object} Disposición:
	 *   rows: {cells: object[], outlineLevel: int}[] — celda: {value, kind: "header"|"label"|"number", total, indent, format,
	 *     font: {color, bold, italic, strikethrough}}
	 *   merges: {row, col, rowSpan, colSpan}[] (base 0)
	 *   widths: int[] (caracteres), freezeRows, freezeColumns, outline: boolean
	 */
	function create(oResult, aValueSpecs, mOptions) {
		var bTree = !!(mOptions && mOptions.hierarchical && oResult.tree);
		var aRowDims = oResult.rowDimensions || [];
		var aColDims = oResult.columnDimensions || [];
		var H = Math.max(oResult.headerLevels || 0, 1);
		var aSpecs = aValueSpecs || [];
		var oTextRules = mOptions && mOptions.textRules ? TextRules.createResolver(oResult, mOptions.textRules, aSpecs) : null;
		var aLeaves = withPreviousColumns(oResult.columns || [], aSpecs, H, mOptions);

		// ---- columnas de dimensión (igual que ColumnBuilder.dimensionColumn)
		var aDimColumns = bTree ?
			[{ header: aRowDims.map(function (d) { return d.label; }).join(" / "), property: "label", showColumnDims: true }] :
			aRowDims.map(function (oDim, i) {
				return { header: oDim.label, property: "d" + i, showColumnDims: i === aRowDims.length - 1 };
			});
		var D = aDimColumns.length;

		// ---- filas de datos (planas o árbol recorrido en profundidad, todo expandido)
		var aDataRows = [];
		if (bTree) {
			(function walk(aNodes) {
				(aNodes || []).forEach(function (oNode) {
					aDataRows.push(oNode);
					walk(oNode.nodes);
				});
			})(oResult.tree);
		} else {
			aDataRows = oResult.rows || [];
		}

		var aFormats = aLeaves.map(function (oLeaf) {
			var bAllIntegers = aDataRows.every(function (oRow) {
				var v = oRow[oLeaf.id];
				return !isNumber(v) || Math.round(v) === v;
			});
			return numberFormat(aSpecs[oLeaf.valueIndex] || {}, bAllIntegers);
		});

		var aRows = [];
		var aMerges = [];

		// ---- cabeceras
		function leafLabels(oLeaf) {
			var oValue = aSpecs[oLeaf.valueIndex] || {};
			return oLeaf.labels && oLeaf.labels.length ? oLeaf.labels : [oValue.label || ""];
		}

		for (var l = 0; l < H; l++) {
			var aCells = aDimColumns.map(function (oDimCol) {
				var sText = l < H - 1 ? (oDimCol.showColumnDims && aColDims[l] ? aColDims[l].label : "") : oDimCol.header;
				return { value: sText || "", kind: "header", dimension: true };
			});
			aLeaves.forEach(function (oLeaf) {
				// Con un solo nivel de etiqueta en varias filas de cabecera, la etiqueta va abajo
				var aLabels = leafLabels(oLeaf);
				var sText = aLabels.length === H ? aLabels[l] : (l === H - 1 ? aLabels[aLabels.length - 1] : "");
				aCells.push({ value: sText || "", kind: "header" });
			});
			aRows.push({ cells: aCells, outlineLevel: 0 });
		}

		// Celdas combinadas: grupos horizontales (spans) y, para subtotales/totales,
		// hacia abajo mientras los niveles inferiores no tengan etiqueta.
		var aCovered = aRows.map(function () {
			return [];
		});
		for (var lv = 0; lv < H; lv++) {
			for (var j = 0; j < aLeaves.length; j++) {
				if (aCovered[lv][j]) {
					continue;
				}
				var iColSpan = (aLeaves[j].spans && aLeaves[j].spans[lv]) || 1;
				var iRowSpan = 1;
				if (aRows[lv].cells[D + j].value !== "") {
					while (lv + iRowSpan < H && isEmptyBlock(lv + iRowSpan, j, iColSpan)) {
						iRowSpan++;
					}
				}
				if (iColSpan > 1 || iRowSpan > 1) {
					aMerges.push({ row: lv, col: D + j, rowSpan: iRowSpan, colSpan: iColSpan });
					for (var r = lv; r < lv + iRowSpan; r++) {
						for (var c = j; c < j + iColSpan; c++) {
							aCovered[r][c] = true;
						}
					}
				}
			}
		}

		// Solo la celda superior izquierda de cada combinación conserva el texto
		aMerges.forEach(function (m) {
			for (var r = m.row; r < m.row + m.rowSpan; r++) {
				for (var c = m.col; c < m.col + m.colSpan; c++) {
					if (r !== m.row || c !== m.col) {
						aRows[r].cells[c].value = "";
					}
				}
			}
		});

		function isEmptyBlock(iLevel, iFrom, iCount) {
			for (var k = iFrom; k < iFrom + iCount; k++) {
				var oLeaf = aLeaves[k];
				if (!oLeaf || aCovered[iLevel][k] || aRows[iLevel].cells[D + k].value !== "") {
					return false;
				}
				// El bloque inferior debe coincidir con el grupo (no partir otro grupo)
				if (k === iFrom && ((oLeaf.spans && oLeaf.spans[iLevel]) || 1) > iCount) {
					return false;
				}
			}
			return true;
		}

		// ---- cuerpo
		aDataRows.forEach(function (oRow) {
			var bTotal = oRow.__type !== "data";
			var aCells = aDimColumns.map(function (oDimCol) {
				return {
					value: oRow[oDimCol.property] === undefined || oRow[oDimCol.property] === null ? "" : String(oRow[oDimCol.property]),
					kind: "label",
					total: bTotal,
					indent: bTree ? oRow.__level || 0 : 0
				};
			});
			if (oTextRules) {
				var oDimFont = TextRules.combine(oTextRules.rules, oTextRules.dimension(oRow.__rowKeys, oRow.__type));
				aCells.forEach(function (oCell) {
					setFont(oCell, oDimFont);
				});
			}
			aLeaves.forEach(function (oLeaf, iLeaf) {
				var v = oRow[oLeaf.id];
				var oCell = {
					value: isNumber(v) ? v : null,
					kind: "number",
					total: bTotal || oLeaf.type !== "data",
					format: aFormats[iLeaf]
				};
				if (oLeaf.previousOf) {
					setFont(oCell, PREVIOUS_FONT);
				} else {
					var bPrevious = !!(aSpecs[oLeaf.valueIndex] || {}).previousField;
					var vPrev = bPrevious ? oRow[oLeaf.id + "_prev"] : undefined;
					setFont(oCell, bPrevious && TextRules.isChanged(v, vPrev) ? CHANGED_FONT : null);
					if (oTextRules) {
						setFont(oCell, TextRules.combine(oTextRules.rules,
							oTextRules.value(oLeaf, oRow.__rowKeys, oRow.__type, v, vPrev)));
					}
				}
				aCells.push(oCell);
			});
			aRows.push({
				cells: aCells,
				outlineLevel: bTree && oRow.__type !== "total" ? Math.min(oRow.__level || 0, MAX_OUTLINE_LEVEL) : 0
			});
		});

		// ---- anchos aproximados (caracteres)
		var aWidths = [];
		aRows.forEach(function (oRow, iRow) {
			oRow.cells.forEach(function (oCell, iCol) {
				var bMerged = iRow < H && iCol >= D && aMerges.some(function (m) {
					return m.colSpan > 1 && m.row <= iRow && iRow < m.row + m.rowSpan && m.col <= iCol && iCol < m.col + m.colSpan;
				});
				var iLength = bMerged ? 0 : (oCell.kind === "number" && isNumber(oCell.value) ?
					Math.round(Math.abs(oCell.value)).toString().length * 4 / 3 + 4 : String(oCell.value).length + (oCell.indent || 0) * 2);
				aWidths[iCol] = Math.max(aWidths[iCol] || 0, iLength);
			});
		});
		aWidths = aWidths.map(function (w, iCol) {
			return Math.min(Math.max(Math.ceil(w) + 2, iCol < D ? 12 : 10), 60);
		});

		return {
			rows: aRows,
			merges: aMerges,
			widths: aWidths,
			headerRows: H,
			freezeRows: H,
			freezeColumns: aLeaves.length ? D : 0,
			outline: bTree
		};
	}

	/** Combina un estilo de texto en la celda (las propiedades posteriores prevalecen). */
	function setFont(oCell, oFont) {
		if (oFont) {
			oCell.font = Object.assign(oCell.font || {}, oFont);
		}
	}

	/**
	 * Con exportPrevious, inserta tras cada hoja con previousField una hoja "<id>_prev" con el valor anterior.
	 * Los grupos de cabecera que la contienen se ensanchan (spans) para incluirla.
	 * @param {object[]} aLeaves Columnas de valor del resultado
	 * @param {object[]} aSpecs Valores configurados
	 * @param {int} H Niveles de cabecera
	 * @param {object} [mOptions] Opciones de create
	 * @returns {object[]} Columnas a exportar
	 */
	function withPreviousColumns(aLeaves, aSpecs, H, mOptions) {
		var aHasPrevious = aLeaves.map(function (oLeaf) {
			return !!(mOptions && mOptions.exportPrevious && (aSpecs[oLeaf.valueIndex] || {}).previousField);
		});
		if (aHasPrevious.indexOf(true) < 0) {
			return aLeaves;
		}
		var sPattern = (mOptions && mOptions.previousLabel) || "{0} (prev.)";
		var aOut = [];
		aLeaves.forEach(function (oLeaf, i) {
			var oCopy = Object.assign({}, oLeaf, { spans: (oLeaf.spans || []).map(function (iSpan, iLevel) {
				// En los niveles superiores el grupo que empieza aquí abarca también las columnas de anterior
				// de sus hojas; en el último nivel cada una lleva su etiqueta. (Las hojas que no inician grupo
				// quedan cubiertas por la combinación de la primera, así que su span no se usa.)
				if (iLevel >= H - 1) {
					return iSpan;
				}
				var iExtra = 0;
				for (var k = i; k < i + (iSpan || 1) && k < aLeaves.length; k++) {
					iExtra += aHasPrevious[k] ? 1 : 0;
				}
				return (iSpan || 1) + iExtra;
			}) });
			aOut.push(oCopy);
			if (aHasPrevious[i]) {
				var aLabels = (oLeaf.labels && oLeaf.labels.length ? oLeaf.labels : [(aSpecs[oLeaf.valueIndex] || {}).label || ""]).slice();
				// Última etiqueta no vacía (en subtotales los niveles inferiores van vacíos)
				var sBase = aLabels.filter(Boolean).pop() || "";
				aLabels[aLabels.length - 1] = sPattern.replace("{0}", sBase);
				aOut.push(Object.assign({}, oLeaf, {
					id: oLeaf.id + "_prev",
					previousOf: oLeaf.id,
					labels: aLabels,
					spans: (oLeaf.spans || []).map(function () {
						return 1;
					})
				}));
			}
		});
		return aOut;
	}

	return {
		create: create,
		numberFormat: numberFormat
	};
});
