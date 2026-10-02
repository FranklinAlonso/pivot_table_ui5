/*!
 * com.frank.pivot - Motor de cálculo pivote.
 *
 * Transforma una lista de registros planos en una matriz pivote:
 *   - dimensiones de fila (con subtotales y total general),
 *   - dimensiones de columna (cabeceras multinivel con "spans"),
 *   - valores agregados por celda.
 *
 * No depende de UI5: el resultado es JSON serializable, así que puede calcularse
 * en un Web Worker (ver PivotWorker.js) y probarse en Node.js.
 */
sap.ui.define(["./Aggregations", "./CalculatedFields"], function (Aggregations, CalculatedFields) {
	"use strict";

	var KEY_SEP = "\u0001";
	var CELL_SEP = "\u0002";
	var EMPTY_KEY = "\u0000";

	var DEFAULT_TEXTS = {
		total: "Total {0}",
		grandTotal: "Grand total",
		empty: "(empty)"
	};

	// ------------------------------------------------------------------ utilidades

	function keyOf(v) {
		if (v === null || v === undefined || v === "") {
			return EMPTY_KEY;
		}
		return v instanceof Date ? "D" + v.getTime() : typeof v + ":" + v;
	}

	function labelOf(v, oTexts) {
		if (v === null || v === undefined || v === "") {
			return oTexts.empty;
		}
		if (v instanceof Date) {
			return v.toISOString().slice(0, 10);
		}
		return String(v);
	}

	function formatText(sPattern, sArg) {
		return String(sPattern).replace("{0}", sArg);
	}

	function compareValues(a, b) {
		var bANull = a === null || a === undefined || a === "";
		var bBNull = b === null || b === undefined || b === "";
		if (bANull || bBNull) {
			return bANull === bBNull ? 0 : (bANull ? 1 : -1); // vacíos al final
		}
		if (typeof a === "number" && typeof b === "number") {
			return a - b;
		}
		if (a instanceof Date && b instanceof Date) {
			return a.getTime() - b.getTime();
		}
		return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
	}

	function normalizeDimension(vDim) {
		var oDim = typeof vDim === "string" ? { name: vDim } : Object.assign({}, vDim);
		oDim.label = oDim.label || oDim.name;
		oDim.sortOrder = oDim.sortOrder || "asc";
		return oDim;
	}

	function normalizeConfig(oConfig) {
		var oCfg = oConfig || {};
		var aValues = (oCfg.values || []).map(function (oValue) {
			var oVal = Object.assign({}, oValue);
			oVal.aggregation = String(oVal.aggregation || "sum").toLowerCase();
			oVal.label = oVal.label || oVal.field;
			return oVal;
		});
		return {
			rows: (oCfg.rows || []).map(normalizeDimension),
			columns: (oCfg.columns || []).map(normalizeDimension),
			values: aValues,
			filters: oCfg.filters || null,
			showSubtotals: oCfg.showSubtotals !== false,
			showGrandTotals: oCfg.showGrandTotals !== false,
			hierarchical: !!oCfg.hierarchical,
			repeatRowLabels: !!oCfg.repeatRowLabels,
			maxColumns: oCfg.maxColumns > 0 ? oCfg.maxColumns : 500,
			preAggregated: !!oCfg.preAggregated,
			calculatedFields: oCfg.calculatedFields || null,
			knownFields: Array.isArray(oCfg.knownFields) ? oCfg.knownFields : null,
			texts: Object.assign({}, DEFAULT_TEXTS, oCfg.texts)
		};
	}

	function createFilter(mFilters) {
		var aChecks = Object.keys(mFilters || {}).filter(function (sField) {
			return Array.isArray(mFilters[sField]) && mFilters[sField].length > 0;
		}).map(function (sField) {
			var oAllowed = new Set(mFilters[sField].map(keyOf));
			return function (oRec) {
				return oAllowed.has(keyOf(oRec[sField]));
			};
		});
		if (!aChecks.length) {
			return null;
		}
		return function (oRec) {
			return aChecks.every(function (fnCheck) {
				return fnCheck(oRec);
			});
		};
	}

	function createNode(oParent, vValue, oTexts) {
		var sKey = keyOf(vValue);
		return {
			key: oParent ? oParent.key + KEY_SEP + sKey : "",
			value: vValue,
			label: oParent ? labelOf(vValue, oTexts) : "",
			path: oParent ? oParent.path.concat([vValue]) : [],
			children: new Map()
		};
	}

	function sortedChildren(oNode, oDim) {
		var aChildren = Array.from(oNode.children.values());
		if (oDim.sortOrder === "none") {
			return aChildren;
		}
		var iDir = oDim.sortOrder === "desc" ? -1 : 1;
		return aChildren.sort(function (a, b) {
			return iDir * compareValues(a.value, b.value);
		});
	}

	// ------------------------------------------------------------------ cálculo

	/**
	 * Calcula la tabla pivote.
	 *
	 * @param {object[]} aRecords Registros planos
	 * @param {object} oConfig Configuración:
	 *   rows / columns: string[] | {name, label, sortOrder: "asc"|"desc"|"none"}[]
	 *   values: {field, aggregation: "sum"|"count"|"countdistinct"|"avg"|"min"|"max"|"formula", label}[]
	 *   calculatedFields: {campo: {formula: "{a} / {b}", level: "aggregate"|"record", label}} (texto:
	 *     se parsea aquí, también dentro del Web Worker)
	 *   knownFields: string[] campos existentes (opcional; para validar las referencias de las fórmulas)
	 *   filters: {campo: valoresPermitidos[]}
	 *   showSubtotals, showGrandTotals, hierarchical, repeatRowLabels: boolean
	 *   maxColumns: int, preAggregated: boolean, texts: {total, grandTotal, empty}
	 * @returns {object} Resultado serializable (ver README, sección "Resultado del motor")
	 */
	function compute(aRecords, oConfig) {
		var oCfg = normalizeConfig(oConfig);
		var oCalc = CalculatedFields.prepare(oCfg, aRecords);
		var aRowDims = oCfg.rows;
		var aColDims = oCfg.columns;
		var aValues = oCalc.values;
		var R = aRowDims.length;
		var C = aColDims.length;
		var V = aValues.length;
		var oTexts = oCfg.texts;

		var aAccumulators = aValues.map(function (oValue, i) {
			return Aggregations.create(oValue, i, oCfg.preAggregated);
		});

		// Qué niveles de prefijo hay que acumular (0 = total, R/C = detalle)
		var aNeedRow = [];
		for (var i = 0; i <= R; i++) {
			aNeedRow[i] = i === R ||
				(i === 0 ? oCfg.showGrandTotals : (oCfg.showSubtotals || oCfg.hierarchical));
		}
		var aNeedCol = [];
		for (var j = 0; j <= C; j++) {
			aNeedCol[j] = j === C || (j === 0 ? oCfg.showGrandTotals : oCfg.showSubtotals);
		}

		var oRowRoot = createNode(null, null, oTexts);
		var oColRoot = createNode(null, null, oTexts);
		var mCells = new Map();
		var fnFilter = oCfg.preAggregated ? null : createFilter(oCfg.filters);
		// Campos calculados por registro: se calculan sobre copias, nunca sobre los datos del proveedor
		var fnDerive = oCalc.recordFields.length ? CalculatedFields.createDeriver(oCalc.recordFields) : null;
		var iUsed = 0;
		var aRowKeys = new Array(R + 1);
		var aColKeys = new Array(C + 1);

		(aRecords || []).forEach(function (oRec) {
			if (!oRec) {
				return;
			}
			if (fnDerive) {
				oRec = fnDerive(oRec);
			}
			if (fnFilter && !fnFilter(oRec)) {
				return;
			}
			iUsed++;
			aRowKeys[0] = "";
			var oNode = oRowRoot;
			for (var r = 0; r < R; r++) {
				oNode = descend(oNode, oRec[aRowDims[r].name]);
				aRowKeys[r + 1] = oNode.key;
			}
			aColKeys[0] = "";
			oNode = oColRoot;
			for (var c = 0; c < C; c++) {
				oNode = descend(oNode, oRec[aColDims[c].name]);
				aColKeys[c + 1] = oNode.key;
			}
			for (var ri = 0; ri <= R; ri++) {
				if (!aNeedRow[ri]) {
					continue;
				}
				for (var ci = 0; ci <= C; ci++) {
					if (aNeedCol[ci]) {
						accumulate(aRowKeys[ri] + CELL_SEP + aColKeys[ci], oRec);
					}
				}
			}
		});

		function descend(oParent, vValue) {
			var sKey = keyOf(vValue);
			var oChild = oParent.children.get(sKey);
			if (!oChild) {
				oChild = createNode(oParent, vValue, oTexts);
				oParent.children.set(sKey, oChild);
			}
			return oChild;
		}

		function accumulate(sCellKey, oRec) {
			var aAcc = mCells.get(sCellKey);
			if (!aAcc) {
				aAcc = aAccumulators.map(function (oAgg) {
					return oAgg.init();
				});
				mCells.set(sCellKey, aAcc);
			}
			for (var v = 0; v < V; v++) {
				aAccumulators[v].add(aAcc[v], oRec);
			}
		}

		// ---- columnas ("slots" = combinación de claves de columna; hojas = slot x valor)
		var aSlots = [];
		var bShowValueLevel = V > 1 || C === 0;
		var H = C + (bShowValueLevel ? 1 : 0);

		function fill(aArr, iLength, vValue) {
			var aCopy = aArr.slice();
			while (aCopy.length < iLength) {
				aCopy.push(vValue);
			}
			return aCopy;
		}

		(function walkColumns(oNode, iDepth, aLabels, aGroupIds) {
			if (iDepth === C) {
				aSlots.push({ type: "data", key: oNode.key, path: oNode.path, labels: aLabels, groupIds: aGroupIds });
				return;
			}
			sortedChildren(oNode, aColDims[iDepth]).forEach(function (oChild) {
				walkColumns(oChild, iDepth + 1, aLabels.concat([oChild.label]), aGroupIds.concat([oChild.key]));
			});
			if (iDepth > 0 && oCfg.showSubtotals) {
				aSlots.push({
					type: "subtotal",
					key: oNode.key,
					path: oNode.path,
					labels: fill(aLabels.concat([formatText(oTexts.total, oNode.label)]), C, ""),
					groupIds: fill(aGroupIds, C, "S" + oNode.key)
				});
			}
		})(oColRoot, 0, [], []);

		if (C > 0 && oCfg.showGrandTotals) {
			aSlots.push({
				type: "total",
				key: "",
				path: [],
				labels: fill([oTexts.grandTotal], C, ""),
				groupIds: fill([], C, "G")
			});
		}

		var iTotalColumns = aSlots.length * V;
		var bTruncated = false;
		if (V > 0 && iTotalColumns > oCfg.maxColumns) {
			aSlots = aSlots.slice(0, Math.max(1, Math.floor(oCfg.maxColumns / V)));
			bTruncated = true;
		}

		var aColumns = [];
		aSlots.forEach(function (oSlot, iSlot) {
			aValues.forEach(function (oValue, iValue) {
				aColumns.push({
					id: "v" + aColumns.length,
					type: oSlot.type,
					valueIndex: iValue,
					cellKey: oSlot.key,
					columnKeys: oSlot.path,
					labels: bShowValueLevel ? oSlot.labels.concat([oValue.label]) : oSlot.labels.slice(),
					groupIds: bShowValueLevel ? oSlot.groupIds.concat([iSlot + "#" + iValue]) : oSlot.groupIds.slice(),
					spans: []
				});
			});
		});

		// headerSpan: la primera columna de cada grupo consecutivo lleva el ancho del grupo
		for (var iLevel = 0; iLevel < H; iLevel++) {
			var iStart = 0;
			for (var iCol = 1; iCol <= aColumns.length; iCol++) {
				if (iCol === aColumns.length || aColumns[iCol].groupIds[iLevel] !== aColumns[iStart].groupIds[iLevel]) {
					for (var k = iStart; k < iCol; k++) {
						aColumns[k].spans[iLevel] = k === iStart ? iCol - iStart : 1;
					}
					iStart = iCol;
				}
			}
		}

		function fillValues(oTarget, sRowKey) {
			aColumns.forEach(function (oCol) {
				var aAcc = mCells.get(sRowKey + CELL_SEP + oCol.cellKey);
				oTarget[oCol.id] = aAcc ? aAccumulators[oCol.valueIndex].result(aAcc[oCol.valueIndex]) : null;
			});
			return oTarget;
		}

		// ---- filas (vista plana)
		var aRows = [];
		var aPending = [];

		function flatRow(sType, iLevel, oNode, aLabels) {
			var oRow = { __type: sType, __level: iLevel, __rowKeys: oNode.path };
			for (var d = 0; d < R; d++) {
				oRow["d" + d] = aLabels[d] || "";
			}
			return fillValues(oRow, oNode.key);
		}

		(function walkRows(oNode, iDepth) {
			if (iDepth === R) {
				var aLabels = [];
				for (var d = 0; d < R; d++) {
					if (oCfg.repeatRowLabels) {
						aLabels[d] = labelOf(oNode.path[d], oTexts);
					} else {
						aLabels[d] = aPending[d] || "";
						aPending[d] = undefined;
					}
				}
				aRows.push(flatRow("data", Math.max(R - 1, 0), oNode, aLabels));
				return;
			}
			sortedChildren(oNode, aRowDims[iDepth]).forEach(function (oChild) {
				aPending[iDepth] = oChild.label;
				walkRows(oChild, iDepth + 1);
			});
			if (iDepth > 0 && oCfg.showSubtotals) {
				var aSubLabels = [];
				aSubLabels[iDepth - 1] = formatText(oTexts.total, oNode.label);
				aRows.push(flatRow("subtotal", iDepth - 1, oNode, aSubLabels));
			}
		})(oRowRoot, 0);

		if (R > 0 && oCfg.showGrandTotals) {
			aRows.push(flatRow("total", 0, oRowRoot, [oTexts.grandTotal]));
		}

		// ---- filas (vista jerárquica para TreeTable)
		var aTree = null;
		if (oCfg.hierarchical) {
			if (R === 0) {
				aTree = [fillValues({ label: "", __type: "data", __level: 0, __rowKeys: [] }, "")];
			} else {
				aTree = (function buildTree(oNode, iDepth) {
					return sortedChildren(oNode, aRowDims[iDepth]).map(function (oChild) {
						var bLeaf = iDepth === R - 1;
						var oTreeNode = fillValues({
							label: oChild.label,
							__type: bLeaf ? "data" : "group",
							__level: iDepth,
							__rowKeys: oChild.path
						}, oChild.key);
						if (!bLeaf) {
							oTreeNode.nodes = buildTree(oChild, iDepth + 1);
						}
						return oTreeNode;
					});
				})(oRowRoot, 0);
				if (oCfg.showGrandTotals) {
					aTree.push(fillValues({ label: oTexts.grandTotal, __type: "total", __level: 0, __rowKeys: [] }, ""));
				}
			}
		}

		var oResult = {
			rowDimensions: aRowDims.map(function (d) { return { name: d.name, label: d.label }; }),
			columnDimensions: aColDims.map(function (d) { return { name: d.name, label: d.label }; }),
			values: aValues.map(function (v) { return { field: v.field, aggregation: v.aggregation, label: v.label }; }),
			headerLevels: H,
			columns: aColumns.map(function (oCol) {
				delete oCol.groupIds;
				return oCol;
			}),
			rows: aRows,
			tree: aTree,
			recordCount: (aRecords || []).length,
			usedRecordCount: iUsed,
			totalColumns: iTotalColumns,
			truncated: bTruncated
		};
		if (oCalc.active) {
			// Avisos y errores de los campos calculados (el control los registra con sap/base/Log)
			oResult.issues = oCalc.issues;
		}
		return oResult;
	}

	return {
		compute: compute,
		/** @private expuesto para pruebas */
		_compareValues: compareValues
	};
});
