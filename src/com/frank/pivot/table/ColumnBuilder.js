/*!
 * com.frank.pivot - Convierte el resultado del motor en columnas de sap.ui.table.
 *
 * Las cabeceras multinivel se construyen con Column#multiLabels + Column#headerSpan,
 * y las dimensiones de fila se fijan a la izquierda (Table#fixedColumnCount).
 */
sap.ui.define([
	"sap/ui/table/Column",
	"sap/m/Label",
	"sap/m/Text",
	"sap/m/VBox",
	"sap/ui/core/CustomData",
	"./ValueFormatter",
	"./ColorRules",
	"./TextRules"
], function (Column, Label, Text, VBox, CustomData, ValueFormatter, ColorRules, TextRules) {
	"use strict";

	var MODEL = "__pivot";

	function typeData() {
		// Se escribe como atributo data-pivot-type para dar estilo a subtotales/totales
		// (las filas vacías del final de la tabla no tienen tipo: writeToDom exige un string)
		return new CustomData({
			key: "pivot-type",
			value: { path: MODEL + ">__type", formatter: function (sType) { return sType || "none"; } },
			writeToDom: true
		});
	}

	/**
	 * Color de la celda: data-pivot-color="c<n>[-<tono>]" (regla n) o "none".
	 * El tono es el mayor entre el de la fila (subtotal/grupo = 1, total = 2) y el de la columna.
	 * @param {function(any[]):int} fnResolve Regla según las claves de fila de la celda
	 * @param {int} iColumnLevel Tono de la columna (0 detalle, 1 subtotal, 2 total general)
	 * @returns {sap.ui.core.CustomData} Custom data enlazado a las claves y al tipo de fila
	 */
	function colorData(fnResolve, iColumnLevel) {
		return new CustomData({
			key: "pivot-color",
			value: {
				parts: [MODEL + ">__rowKeys", MODEL + ">__type", MODEL + ">__level"],
				formatter: function (aRowKeys, sRowType, iRowLevel) {
					if (!aRowKeys) {
						return "none";
					}
					return ColorRules.token(fnResolve(aRowKeys),
						Math.max(ColorRules.rowLevelOf(sRowType, iRowLevel), iColumnLevel));
				}
			},
			writeToDom: true
		});
	}

	/**
	 * Reglas de estilo de texto: data-pivot-text="t<n> t<m>" o "none".
	 * @param {string[]} aParts Rutas del modelo que recibe fnResolve
	 * @param {function(...any):int[]} fnResolve Índices de las reglas aplicables
	 * @returns {sap.ui.core.CustomData} Custom data enlazado
	 */
	function textData(aParts, fnResolve) {
		return new CustomData({
			key: "pivot-text",
			value: {
				parts: aParts.map(function (sPath) {
					return MODEL + ">" + sPath;
				}),
				formatter: function () {
					return TextRules.token(fnResolve.apply(null, arguments));
				}
			},
			writeToDom: true
		});
	}

	function setHeader(oColumn, aTexts, aSpans) {
		var aLabels;
		if (aTexts.length <= 1) {
			aLabels = [new Label({ text: aTexts[0] || "", wrapping: false })];
			oColumn.setLabel(aLabels[0]);
			return aLabels;
		}
		aLabels = aTexts.map(function (sText) {
			return new Label({ text: sText, wrapping: false, textAlign: "Center", width: "100%" });
		});
		aLabels.forEach(function (oLabel) {
			oColumn.addMultiLabel(oLabel);
		});
		if (aSpans) {
			oColumn.setHeaderSpan(aSpans);
		}
		return aLabels;
	}

	return {
		MODEL_NAME: MODEL,

		/**
		 * @param {object} oResult Resultado de PivotEngine.compute
		 * @param {object} mOptions
		 * @param {boolean} mOptions.hierarchical Si se usa TreeTable (una sola columna de jerarquía)
		 * @param {object[]} mOptions.values Especificaciones de valores (formato)
		 * @param {string} mOptions.dimensionWidth Ancho de las columnas de dimensión
		 * @param {string} mOptions.valueWidth Ancho de las columnas de valor
		 * @param {object|null} [mOptions.colors] Resolutor de ColorRules.createResolver
	 * @param {object|null} [mOptions.textRules] Resolutor de TextRules.createResolver
		 * @returns {{columns: sap.ui.table.Column[], columnInfo: object, fixedColumnCount: int}} Columnas
		 */
		build: function (oResult, mOptions) {
			var H = Math.max(oResult.headerLevels, 1);
			var aRowDims = oResult.rowDimensions;
			var aColDims = oResult.columnDimensions;
			var aColumns = [];
			var mColumnInfo = {};
			var oColors = mOptions.colors || null;
			var oTextRules = mOptions.textRules || null;

			function templateData(iColumnRule, iColumnLevel) {
				var aData = [typeData()];
				if (oColors) {
					aData.push(colorData(function (aRowKeys) {
						return iColumnRule >= 0 ? iColumnRule : oColors.row(aRowKeys);
					}, iColumnLevel || 0));
				}
				return aData;
			}

			// Cabecera de las columnas de dimensión: en los niveles superiores se muestran
			// los nombres de las dimensiones de columna, abajo el de la dimensión de fila.
			function dimensionHeader(sBottom, bShowColumnDims) {
				var aTexts = [];
				for (var l = 0; l < H - 1; l++) {
					aTexts.push(bShowColumnDims && aColDims[l] ? aColDims[l].label : "");
				}
				aTexts.push(sBottom);
				return aTexts;
			}

			function dimensionColumn(sHeader, sProperty, bShowColumnDims) {
				var aData = templateData(-1);
				if (oTextRules) {
					aData.push(textData(["__rowKeys", "__type"], oTextRules.dimension));
				}
				var oColumn = new Column({
					width: mOptions.dimensionWidth,
					autoResizable: true,
					template: new Text({ text: "{" + MODEL + ">" + sProperty + "}", wrapping: false, customData: aData })
				});
				setHeader(oColumn, dimensionHeader(sHeader, bShowColumnDims));
				return oColumn;
			}

			/*
			 * Celda de valor. Con previousField, si el valor cambió se muestra encima el anterior
			 * (pequeño y tachado) y el actual con data-pivot-changed="true" (color de aviso).
			 */
			function valueTemplate(oLeaf, oValue, aData) {
				var fnFormat = ValueFormatter.create(oValue);
				var bPrevious = !!oValue.previousField;
				var sPath = oLeaf.id;
				var sPrevPath = sPath + "_prev";
				if (oTextRules) {
					aData.push(textData(["__rowKeys", "__type", sPath, sPrevPath], function (aRowKeys, sRowType, vValue, vPrev) {
						return oTextRules.value(oLeaf, aRowKeys, sRowType, vValue, bPrevious ? vPrev : undefined);
					}));
				}
				if (!bPrevious) {
					return new Text({
						text: { path: MODEL + ">" + sPath, formatter: fnFormat },
						wrapping: false,
						textAlign: "End",
						customData: aData
					});
				}
				var oChangedParts = {
					parts: [MODEL + ">" + sPath, MODEL + ">" + sPrevPath],
					formatter: function (vValue, vPrev) {
						return TextRules.isChanged(vValue, vPrev);
					}
				};
				aData.push(new CustomData({
					key: "pivot-changed",
					value: {
						parts: oChangedParts.parts,
						formatter: function (vValue, vPrev) {
							return String(TextRules.isChanged(vValue, vPrev));
						}
					},
					writeToDom: true
				}));
				return new VBox({
					alignItems: "End",
					renderType: "Bare",
					items: [
						new Text({
							text: { path: MODEL + ">" + sPrevPath, formatter: fnFormat },
							visible: oChangedParts,
							wrapping: false,
							textAlign: "End"
						}).addStyleClass("pvPreviousValue"),
						new Text({
							text: { path: MODEL + ">" + sPath, formatter: fnFormat },
							wrapping: false,
							textAlign: "End",
							customData: aData
						})
					]
				}).addStyleClass("pvValueWithPrevious");
			}

			if (mOptions.hierarchical) {
				aColumns.push(dimensionColumn(aRowDims.map(function (d) {
					return d.label;
				}).join(" / "), "label", true));
			} else {
				aRowDims.forEach(function (oDim, i) {
					aColumns.push(dimensionColumn(oDim.label, "d" + i, i === aRowDims.length - 1));
				});
			}
			var iFixed = aColumns.length;

			oResult.columns.forEach(function (oLeaf) {
				var oValue = mOptions.values[oLeaf.valueIndex] || {};
				var iColumnRule = oColors ? oColors.column(oLeaf) : -1;
				var oColumn = new Column({
					width: mOptions.valueWidth,
					hAlign: "End",
					autoResizable: true,
					template: valueTemplate(oLeaf, oValue, templateData(iColumnRule, ColorRules.levelOf(oLeaf.type)))
				});
				var aLabels = setHeader(oColumn, oLeaf.labels.length ? oLeaf.labels : [oValue.label || ""], oLeaf.spans);
				if (oColors) {
					aLabels.forEach(function (oLabel, iLevel) {
						var iRule = oColors.columnHeader(oLeaf, iLevel);
						if (iRule >= 0) {
							oLabel.addCustomData(new CustomData({
								key: "pivot-color",
								value: ColorRules.token(iRule, ColorRules.levelOf(oLeaf.type)),
								writeToDom: true
							}));
						}
					});
				}
				mColumnInfo[oColumn.getId()] = oLeaf;
				aColumns.push(oColumn);
			});

			return { columns: aColumns, columnInfo: mColumnInfo, fixedColumnCount: iFixed };
		}
	};
});
