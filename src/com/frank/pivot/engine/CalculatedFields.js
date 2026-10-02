/*!
 * com.frank.pivot - Preparación de los campos calculados del motor pivote.
 *
 * Un campo calculado tiene una fórmula (ver Formula.js) sobre otros campos y un nivel:
 *   - "aggregate": se suman los operandos en cada celda/subtotal/total y luego se aplica
 *     la fórmula (Margen = Sum(Utilidad) / Sum(Ventas)). Sus valores usan siempre el
 *     acumulador "formula".
 *   - "record": la fórmula se aplica en cada registro antes de agrupar; después se comporta
 *     como un campo numérico más y admite cualquier agregación.
 *
 * prepare() resuelve las fórmulas una vez por cálculo: las parsea, valida referencias, ciclos
 * y la regla record -> aggregate, sustituye los aggregate anidados (el motor solo ve campos base
 * o record) y calcula el orden topológico de los record. Los errores no lanzan excepciones: se
 * devuelven en "issues" y los valores afectados quedan marcados como inválidos (celdas null).
 *
 * Módulo sin dependencias de UI5 (se ejecuta también en el Web Worker y en Node.js).
 */
sap.ui.define(["./Formula"], function (Formula) {
	"use strict";

	var AGGREGATE = "aggregate";
	var RECORD = "record";

	function toNumber(v) {
		if (v === null || v === undefined || v === "") {
			return null;
		}
		var n = typeof v === "number" ? v : Number(v);
		return isNaN(n) ? null : n;
	}

	/** Resultado numérico finito o null. */
	function finite(v) {
		return typeof v === "number" && isFinite(v) ? v : null;
	}

	function isPlainObject(v) {
		return v !== null && typeof v === "object" && !Array.isArray(v);
	}

	function levelOf(sLevel) {
		return String(sLevel || "").toLowerCase() === RECORD ? RECORD : AGGREGATE;
	}

	function unique(aList) {
		return aList.filter(function (v, i) {
			return aList.indexOf(v) === i;
		});
	}

	/** Copia del árbol sustituyendo cada referencia por fnRef(id) (si devuelve un nodo). */
	function substitute(oNode, fnRef) {
		if (oNode.t === "ref") {
			return fnRef(oNode.id) || { t: "ref", id: oNode.id };
		}
		var oCopy = Object.assign({}, oNode);
		if (oNode.a) {
			oCopy.a = substitute(oNode.a, fnRef);
		}
		if (oNode.b) {
			oCopy.b = substitute(oNode.b, fnRef);
		}
		if (oNode.args) {
			oCopy.args = oNode.args.map(function (oArg) {
				return substitute(oArg, fnRef);
			});
		}
		return oCopy;
	}

	function refIds(oTree) {
		return unique(Formula.referencias(oTree).map(function (oRef) {
			return oRef.id;
		}));
	}

	/**
	 * Prepara los campos calculados y los valores de una configuración.
	 *
	 * @param {object} oConfig Configuración del motor:
	 *   calculatedFields: {nombre: {formula, level: "aggregate"|"record", label}}
	 *   values: {field, aggregation}[], rows, columns, filters, preAggregated, knownFields
	 * @param {object[]} [aRecords] Registros (modo cliente): permiten detectar referencias a campos
	 *   inexistentes cuando no se indica knownFields
	 * @returns {{active: boolean, values: object[], recordFields: object[], calculatedNames: string[], issues: object[]}}
	 *   values: copias de los valores; los de fórmula llevan tree/operands y los no calculables invalid=true.
	 *   recordFields: campos record a derivar, en orden topológico ({name, tree}).
	 *   issues: {type: "error"|"warning", field, label, message}
	 */
	function prepare(oConfig, aRecords) {
		var mDefs = isPlainObject(oConfig.calculatedFields) ? oConfig.calculatedFields : {};
		var bPreAggregated = !!oConfig.preAggregated;
		var aValues = (oConfig.values || []).map(function (oValue) {
			var oVal = Object.assign({}, oValue);
			oVal.aggregation = String(oVal.aggregation || "sum").toLowerCase();
			return oVal;
		});
		var aNames = Object.keys(mDefs).filter(function (sName) {
			var oDef = mDefs[sName];
			return isPlainObject(oDef) && typeof oDef.formula === "string" && oDef.formula.trim() !== "";
		});
		var bFormulaValue = aValues.some(function (oValue) {
			return oValue.aggregation === "formula";
		});
		if (!aNames.length && !bFormulaValue) {
			// Sin campos calculados: los valores pasan sin cambios (mismo resultado que sin esta función)
			return { active: false, values: aValues, recordFields: [], calculatedNames: [], issues: [] };
		}

		var aIssues = [];
		var mInfo = {};

		function label(sName) {
			return mInfo[sName] ? mInfo[sName].label : sName;
		}
		function issue(sType, sField, sMessage) {
			aIssues.push({ type: sType, field: sField, label: label(sField), message: sMessage });
		}

		// 1. Parseo
		aNames.forEach(function (sName) {
			var oDef = mDefs[sName];
			var oInfo = mInfo[sName] = {
				name: sName,
				label: oDef.label || sName,
				level: levelOf(oDef.level),
				tree: null,
				deps: [],
				error: null
			};
			try {
				oInfo.tree = Formula.parse(oDef.formula);
			} catch (oError) {
				oInfo.error = "Fórmula inválida: " + oError.message +
					(typeof oError.pos === "number" ? " (posición " + (oError.pos + 1) + ")" : "");
				return;
			}
			var aByName = Formula.referencias(oInfo.tree).filter(function (oRef) {
				return oRef.id === undefined;
			});
			if (aByName.length) {
				oInfo.error = "Referencia por nombre [" + aByName[0].name + "] no admitida: use {campo}";
				oInfo.tree = null;
				return;
			}
			oInfo.deps = refIds(oInfo.tree);
		});

		// 2. Referencias a campos inexistentes
		var mKnown = null;
		if (Array.isArray(oConfig.knownFields)) {
			mKnown = {};
			oConfig.knownFields.forEach(function (sName) {
				mKnown[sName] = true;
			});
		}
		var bCheckRecords = !mKnown && !bPreAggregated && Array.isArray(aRecords) && aRecords.length > 0;
		var mExists = {};
		function exists(sName) {
			if (mInfo[sName] || !(mKnown || bCheckRecords)) {
				return true;
			}
			if (mKnown && sName.indexOf("/") > -1) {
				return true; // ruta de navegación OData: no se valida con los metadatos del EntitySet
			}
			if (!(sName in mExists)) {
				mExists[sName] = mKnown ? !!mKnown[sName] : aRecords.some(function (oRec) {
					return oRec && Object.prototype.hasOwnProperty.call(oRec, sName);
				});
			}
			return mExists[sName];
		}
		aNames.forEach(function (sName) {
			var oInfo = mInfo[sName];
			var aMissing = oInfo.error ? [] : oInfo.deps.filter(function (sDep) {
				return !exists(sDep);
			});
			if (aMissing.length) {
				oInfo.error = "Referencia a un campo inexistente: " + aMissing.map(function (s) {
					return "{" + s + "}";
				}).join(", ");
			}
		});

		// 3. Ciclos
		var mGraph = {};
		aNames.forEach(function (sName) {
			mGraph[sName] = mInfo[sName].deps.filter(function (sDep) {
				return !!mInfo[sDep];
			});
		});
		aNames.forEach(function (sName) {
			var aCycle = Formula.buscarCiclo(mGraph, sName);
			if (aCycle && !mInfo[sName].error) {
				mInfo[sName].error = "Referencia circular: " + aCycle.map(label).join(" → ");
			}
		});

		// 4. Un record no puede usar un aggregate (no tiene valor por registro)
		aNames.forEach(function (sName) {
			var oInfo = mInfo[sName];
			if (oInfo.level !== RECORD || oInfo.error) {
				return;
			}
			var aAggregates = mGraph[sName].filter(function (sDep) {
				return mInfo[sDep].level === AGGREGATE;
			});
			if (aAggregates.length) {
				oInfo.error = "Un campo calculado por registro no puede usar un campo calculado agregado (" +
					aAggregates.map(label).join(", ") + ")";
			}
		});

		// 5. Los campos que dependen de otro con errores tampoco se pueden calcular
		var bChanged = true;
		while (bChanged) {
			bChanged = false;
			aNames.forEach(function (sName) {
				var oInfo = mInfo[sName];
				if (oInfo.error) {
					return;
				}
				var sBroken = mGraph[sName].filter(function (sDep) {
					return !!mInfo[sDep].error;
				})[0];
				if (sBroken) {
					oInfo.error = "Depende de «" + label(sBroken) + "», que tiene errores";
					bChanged = true;
				}
			});
		}
		aNames.forEach(function (sName) {
			if (mInfo[sName].error) {
				issue("error", sName, mInfo[sName].error);
			}
		});

		// 6. Sustitución de los aggregate anidados: el árbol final solo referencia campos base o record
		var mExpanded = {};
		function expanded(sName) {
			if (!mExpanded[sName]) {
				mExpanded[sName] = substitute(mInfo[sName].tree, function (sId) {
					var oDep = mInfo[sId];
					return oDep && oDep.level === AGGREGATE ? expanded(sId) : null;
				});
			}
			return mExpanded[sName];
		}

		// 7. Valores
		var aNeededRecords = [];
		var mServerWarned = {};
		function needRecord(sName) {
			if (aNeededRecords.indexOf(sName) < 0) {
				aNeededRecords.push(sName);
			}
		}
		function serverUnsupported(sName) {
			if (!mServerWarned[sName]) {
				mServerWarned[sName] = true;
				issue("warning", sName, "Los campos calculados por registro no se admiten en modo servidor (OData V4): " +
					"las celdas quedan vacías");
			}
		}

		aValues.forEach(function (oValue) {
			var oInfo = mInfo[oValue.field];
			if (!oInfo) {
				if (oValue.aggregation === "formula") {
					issue("warning", oValue.field, "La agregación Formula solo se aplica a campos calculados agregados; se usa Sum");
					oValue.aggregation = "sum";
				}
				return;
			}
			if (oInfo.level === AGGREGATE) {
				if (oValue.aggregation !== "formula") {
					issue("warning", oValue.field, "Campo calculado agregado: la agregación '" + oValue.aggregation +
						"' se sustituye por Formula");
					oValue.aggregation = "formula";
				}
				if (oInfo.error) {
					oValue.invalid = true;
					return;
				}
				oValue.tree = expanded(oInfo.name);
				oValue.operands = refIds(oValue.tree);
				oValue.operands.forEach(function (sOp) {
					if (mInfo[sOp]) { // record
						if (bPreAggregated) {
							serverUnsupported(sOp);
							oValue.invalid = true;
						} else {
							needRecord(sOp);
						}
					}
				});
				if (oValue.invalid) {
					delete oValue.tree;
					delete oValue.operands;
				}
				return;
			}
			// record
			if (oValue.aggregation === "formula") {
				issue("warning", oValue.field, "Campo calculado por registro: la agregación Formula se sustituye por Sum");
				oValue.aggregation = "sum";
			}
			if (oInfo.error) {
				oValue.invalid = true;
			} else if (bPreAggregated) {
				serverUnsupported(oInfo.name);
				oValue.invalid = true;
			} else {
				needRecord(oInfo.name);
			}
		});

		// Campos record usados como dimensión o filtro (solo modo cliente)
		if (!bPreAggregated) {
			(oConfig.rows || []).concat(oConfig.columns || []).map(function (vDim) {
				return typeof vDim === "string" ? vDim : vDim && vDim.name;
			}).concat(Object.keys(oConfig.filters || {})).forEach(function (sName) {
				var oInfo = mInfo[sName];
				if (oInfo && oInfo.level === RECORD && !oInfo.error) {
					needRecord(sName);
				}
			});
		}

		// 8. Orden topológico de los record necesarios (y de los record que usan)
		var aRecordFields = [];
		var mVisited = {};
		(function visitAll(aList) {
			aList.forEach(function visit(sName) {
				if (mVisited[sName]) {
					return;
				}
				mVisited[sName] = true;
				mGraph[sName].forEach(visit);
				aRecordFields.push({ name: sName, tree: mInfo[sName].tree });
			});
		})(aNeededRecords);

		return {
			active: true,
			values: aValues,
			recordFields: aRecordFields,
			calculatedNames: aNames,
			issues: aIssues
		};
	}

	/**
	 * Función que devuelve una copia del registro con los campos record calculados.
	 * Nunca modifica el registro original (pertenece al proveedor de datos).
	 * @param {object[]} aRecordFields Campos en orden topológico ({name, tree})
	 * @returns {function(object):object} Derivador
	 */
	function createDeriver(aRecordFields) {
		return function (oRec) {
			var oCopy = Object.assign({}, oRec);
			function value(sId) {
				return toNumber(oCopy[sId]);
			}
			for (var i = 0; i < aRecordFields.length; i++) {
				oCopy[aRecordFields[i].name] = finite(Formula.evaluar(aRecordFields[i].tree, value));
			}
			return oCopy;
		};
	}

	return {
		AGGREGATE: AGGREGATE,
		RECORD: RECORD,
		prepare: prepare,
		createDeriver: createDeriver,
		finite: finite
	};
});
