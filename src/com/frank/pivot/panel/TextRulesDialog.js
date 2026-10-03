/*!
 * com.frank.pivot - Diálogo de reglas de estilo de texto: ámbito (fila, columna o celda),
 * condición y estilo (color, negrita, cursiva, tachado). Ver table/TextRules.js.
 */
sap.ui.define([
	"sap/ui/core/Lib",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Item",
	"sap/ui/core/HTML",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/ToggleButton",
	"sap/m/Table",
	"sap/m/Column",
	"sap/m/ColumnListItem",
	"sap/m/Select",
	"sap/m/Input",
	"sap/m/HBox",
	"sap/m/Text",
	"sap/m/OverflowToolbar",
	"sap/m/ToolbarSpacer",
	"sap/m/Title",
	"sap/m/MessageStrip",
	"sap/m/ColorPalettePopover",
	"../table/TextRules"
], function (
	Lib, JSONModel, Item, HTML, Dialog, Button, ToggleButton, Table, Column, ColumnListItem, Select, Input,
	HBox, Text, OverflowToolbar, ToolbarSpacer, Title, MessageStrip, ColorPalettePopover, TextRules
) {
	"use strict";

	/** Clave de "todos los valores" (regla de fila/columna sin value, o de celda sin valueField). */
	var ALL = "__all__";
	/** Clave del color personalizado (hex) en el selector de color. */
	var CUSTOM = "custom";
	var NUMBER_OPERATORS = ["eq", "ne", "lt", "le", "gt", "ge", "between"];

	function bundle() {
		return Lib.getResourceBundleFor("com.frank.pivot");
	}

	function valueKey(vValue) {
		return JSON.stringify(vValue);
	}

	function valueText(vValue) {
		return vValue instanceof Date ? vValue.toISOString().slice(0, 10) : String(vValue);
	}

	/** Color de ColorPalettePopover ("#rrggbb" o "rgb(r, g, b)") -> hex válido para TextRules, o null. */
	function toHexColor(sColor) {
		var m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(String(sColor || ""));
		if (m) {
			sColor = "#" + [m[1], m[2], m[3]].map(function (c) {
				return ("0" + Math.min(255, parseInt(c, 10)).toString(16)).slice(-2);
			}).join("");
		}
		return TextRules.sanitizeColor(sColor);
	}

	/** Número escrito por el usuario ("1.234,5" o "1234.5") o null. */
	function parseNumber(sText) {
		var s = String(sText === undefined || sText === null ? "" : sText).trim().replace(/\s/g, "");
		if (!s) {
			return null;
		}
		if (s.indexOf(",") >= 0) {
			s = s.replace(/\./g, "").replace(",", ".");
		}
		var n = Number(s);
		return isFinite(n) ? n : null;
	}

	/**
	 * Opciones del selector de valor de un campo de fila/columna: "todos" + valores distintos
	 * (+ el de la regla si ya no está en los datos, para no perderlo).
	 * @private
	 */
	function valueItems(sField, vCurrent, fnGetValues, sAllText) {
		var aValues = sField ? fnGetValues(sField) : [];
		var aItems = [{ key: ALL, text: sAllText }].concat(aValues.map(function (vValue) {
			return { key: valueKey(vValue), text: valueText(vValue) };
		}));
		if (vCurrent !== undefined && !aItems.some(function (o) { return o.key === valueKey(vCurrent); })) {
			aItems.push({ key: valueKey(vCurrent), text: valueText(vCurrent) });
		}
		return aItems;
	}

	/**
	 * Regla -> fila del modelo del diálogo.
	 * @param {object} oRule Regla normalizada (o nueva)
	 * @param {object} mContext {fields: {row, column, cell}, getValues, allText}
	 * @private
	 */
	function toModelRule(oRule, mContext) {
		var bCell = oRule.scope === "cell";
		var sField = bCell ? (oRule.valueField || ALL) : oRule.field;
		var bSemantic = !!oRule.color && TextRules.SEMANTIC_COLORS.indexOf(oRule.color) >= 0;
		return {
			scope: oRule.scope,
			field: sField,
			fieldItems: mContext.fields[oRule.scope] || [],
			valueKey: !bCell && "value" in oRule ? valueKey(oRule.value) : ALL,
			values: bCell ? [] : valueItems(sField, oRule.value, mContext.getValues, mContext.allText),
			operator: bCell ? oRule.operator : "gt",
			to: bCell && typeof oRule.to === "number" ? String(oRule.to) : "",
			to2: bCell && typeof oRule.to2 === "number" ? String(oRule.to2) : "",
			colorKey: !oRule.color ? "" : (bSemantic ? oRule.color : CUSTOM),
			customColor: oRule.color && !bSemantic ? oRule.color : "#b44f00",
			bold: oRule.bold === true,
			italic: oRule.italic === true,
			strikethrough: oRule.strikethrough === true
		};
	}

	/**
	 * Fila del modelo -> regla sin normalizar (las incompletas no pasan TextRules.normalize).
	 * Los estilos desactivados no se guardan (false se omite: "sin cambio").
	 * @private
	 */
	function fromModelRule(oRow) {
		var oRule = { scope: oRow.scope };
		if (oRow.scope === "cell") {
			oRule.operator = oRow.operator;
			if (oRow.field && oRow.field !== ALL) {
				oRule.valueField = oRow.field;
			}
			if (NUMBER_OPERATORS.indexOf(oRow.operator) >= 0) {
				oRule.to = parseNumber(oRow.to);
				if (oRow.operator === "between") {
					oRule.to2 = parseNumber(oRow.to2);
				}
			}
		} else {
			oRule.field = oRow.field;
			if (oRow.valueKey && oRow.valueKey !== ALL) {
				oRule.value = JSON.parse(oRow.valueKey);
			}
		}
		if (oRow.colorKey) {
			oRule.color = oRow.colorKey === CUSTOM ? oRow.customColor : oRow.colorKey;
		}
		["bold", "italic", "strikethrough"].forEach(function (sKey) {
			if (oRow[sKey]) {
				oRule[sKey] = true;
			}
		});
		return oRule;
	}

	/**
	 * Filas del modelo -> reglas válidas, e índices de las filas no válidas.
	 * @private
	 */
	function fromModelRules(aRows) {
		var aRules = [];
		var aInvalid = [];
		(aRows || []).forEach(function (oRow, i) {
			var aNormalized = TextRules.normalize([fromModelRule(oRow)]);
			if (aNormalized.length) {
				aRules.push(aNormalized[0]);
			} else {
				aInvalid.push(i);
			}
		});
		return { rules: aRules, invalid: aInvalid };
	}

	/** HTML de la vista previa de una fila (los colores ya están validados). */
	function previewHtml(oRow) {
		var aRules = TextRules.normalize([Object.assign(fromModelRule(oRow), { scope: "row", field: "x" })]);
		var oStyle = aRules.length ? TextRules.combine(aRules, [0]) : {};
		var aCss = [];
		if (oStyle.color) {
			aCss.push("color:" + oStyle.color);
		}
		if (oStyle.bold) {
			aCss.push("font-weight:bold");
		}
		if (oStyle.italic) {
			aCss.push("font-style:italic");
		}
		if (oStyle.strikethrough) {
			aCss.push("text-decoration:line-through");
		}
		return "<span class=\"pvTextRulePreview\" style=\"" + aCss.join(";") + "\">Abc 1.234</span>";
	}

	/**
	 * Abre el diálogo.
	 * @param {object} mOptions
	 * @param {sap.ui.core.Element} mOptions.owner Control al que se asocia el diálogo (dependiente)
	 * @param {{name: string, label: string}[]} mOptions.rowFields Dimensiones de fila
	 * @param {{name: string, label: string}[]} mOptions.columnFields Dimensiones de columna
	 * @param {{name: string, label: string}[]} mOptions.valueFields Campos de los valores
	 * @param {object[]} mOptions.rules Reglas actuales
	 * @param {function(string):any[]} mOptions.getValues Valores distintos de un campo
	 * @returns {Promise<object[]|null>} Reglas nuevas o null si se cancela
	 */
	function open(mOptions) {
		var oBundle = bundle();
		var sAllText = oBundle.getText("COLORS_ALL_VALUES");
		var aExisting = TextRules.normalize(mOptions.rules);

		// Campos por ámbito: los indicados + los que ya tengan reglas (para poder editarlas o borrarlas)
		function fieldList(aFields, sScope, sKey) {
			var aOut = (aFields || []).map(function (f) {
				return { name: f.name, label: f.label || f.name };
			});
			aExisting.forEach(function (oRule) {
				var sName = oRule[sKey];
				if (oRule.scope === sScope && sName && !aOut.some(function (f) { return f.name === sName; })) {
					aOut.push({ name: sName, label: sName });
				}
			});
			return aOut;
		}
		var mContext = {
			fields: {
				row: fieldList(mOptions.rowFields, "row", "field"),
				column: fieldList(mOptions.columnFields, "column", "field"),
				cell: [{ name: ALL, label: oBundle.getText("TEXTS_ANY_VALUE_FIELD") }]
					.concat(fieldList(mOptions.valueFields, "cell", "valueField"))
			},
			getValues: mOptions.getValues || function () {
				return [];
			},
			allText: sAllText
		};

		var oModel = new JSONModel({
			scopes: TextRules.SCOPES.map(function (s) {
				return { key: s, text: oBundle.getText("TEXTS_SCOPE_" + s.toUpperCase()) };
			}),
			operators: TextRules.OPERATORS.map(function (s) {
				return { key: s, text: oBundle.getText("TEXTS_OP_" + s.toUpperCase()) };
			}),
			colors: [{ key: "", text: oBundle.getText("TEXTS_COLOR_NONE") }].concat(TextRules.SEMANTIC_COLORS.map(function (s) {
				return { key: s, text: oBundle.getText("TEXTS_COLOR_" + s.toUpperCase()) };
			}), [{ key: CUSTOM, text: oBundle.getText("TEXTS_COLOR_CUSTOM") }]),
			rules: aExisting.map(function (oRule) {
				return toModelRule(oRule, mContext);
			}),
			invalid: ""
		});
		var fnResolve;
		var oDialog;

		function rulePath(oControl) {
			return oControl.getBindingContext("texts").getPath();
		}

		function refreshRow(sPath) {
			var oRow = oModel.getProperty(sPath);
			oModel.setProperty(sPath + "/preview", previewHtml(oRow));
		}

		function onScopeChange(oEvent) {
			var sPath = rulePath(oEvent.getSource());
			var sScope = oModel.getProperty(sPath + "/scope");
			var aFields = mContext.fields[sScope];
			var sField = sScope === "cell" ? ALL : (aFields[0] ? aFields[0].name : "");
			oModel.setProperty(sPath + "/fieldItems", aFields);
			oModel.setProperty(sPath + "/field", sField);
			oModel.setProperty(sPath + "/valueKey", ALL);
			oModel.setProperty(sPath + "/values", sScope === "cell" ? [] :
				valueItems(sField, undefined, mContext.getValues, sAllText));
		}

		function onFieldChange(oEvent) {
			var sPath = rulePath(oEvent.getSource());
			if (oModel.getProperty(sPath + "/scope") === "cell") {
				return;
			}
			var sField = oModel.getProperty(sPath + "/field");
			oModel.setProperty(sPath + "/valueKey", ALL);
			oModel.setProperty(sPath + "/values", valueItems(sField, undefined, mContext.getValues, sAllText));
		}

		function onStyleChange(oEvent) {
			refreshRow(rulePath(oEvent.getSource()));
		}

		function onPickColor(oEvent) {
			var oSource = oEvent.getSource();
			var sPath = rulePath(oSource);
			var oPopover = new ColorPalettePopover({
				colors: ["#aa0808", "#b44f00", "#256f3a", "#0064d9", "#131e29", "#6c32a9", "#c0399f", "#556b82"],
				showDefaultColor: false,
				showMoreColors: true,
				colorSelect: function (oSelect) {
					var sHex = toHexColor(oSelect.getParameter("value"));
					if (sHex && TextRules.SEMANTIC_COLORS.indexOf(sHex) < 0) {
						oModel.setProperty(sPath + "/customColor", sHex);
						oModel.setProperty(sPath + "/colorKey", CUSTOM);
						refreshRow(sPath);
					}
				},
				afterClose: function () {
					oPopover.destroy();
				}
			});
			oDialog.addDependent(oPopover);
			oPopover.openBy(oSource);
		}

		function onAdd() {
			var aRules = oModel.getProperty("/rules");
			var sScope = mContext.fields.row.length ? "row" : (mContext.fields.column.length ? "column" : "cell");
			var aFields = mContext.fields[sScope];
			aRules.push(toModelRule({
				scope: sScope,
				field: sScope === "cell" ? undefined : aFields[0].name,
				operator: "lt",
				to: 0,
				color: "Negative"
			}, mContext));
			oModel.setProperty("/rules", aRules);
			refreshRow("/rules/" + (aRules.length - 1));
		}

		function onDelete(oEvent) {
			var sPath = rulePath(oEvent.getParameter("listItem"));
			var aRules = oModel.getProperty("/rules");
			aRules.splice(parseInt(sPath.split("/").pop(), 10), 1);
			oModel.setProperty("/rules", aRules);
			oModel.setProperty("/invalid", "");
		}

		var oTable = new Table({
			mode: "Delete",
			noDataText: oBundle.getText("TEXTS_NO_RULES"),
			delete: onDelete,
			headerToolbar: new OverflowToolbar({
				content: [
					new Title({ text: oBundle.getText("TEXTS_RULES"), level: "H4" }),
					new ToolbarSpacer(),
					new Button({
						text: oBundle.getText("COLORS_ADD"),
						icon: "sap-icon://add",
						type: "Transparent",
						press: onAdd
					})
				]
			}),
			columns: [
				new Column({ header: new Text({ text: oBundle.getText("TEXTS_SCOPE") }), width: "8rem" }),
				new Column({ header: new Text({ text: oBundle.getText("COLORS_FIELD") }), width: "11rem" }),
				new Column({ header: new Text({ text: oBundle.getText("TEXTS_CONDITION") }), width: "21rem" }),
				new Column({ header: new Text({ text: oBundle.getText("TEXTS_STYLE") }), width: "22rem" }),
				new Column({ header: new Text({ text: oBundle.getText("TEXTS_PREVIEW") }), width: "6rem" })
			],
			items: {
				path: "texts>/rules",
				templateShareable: false,
				template: new ColumnListItem({
					highlight: "{= ${texts>invalid} ? 'Error' : 'None' }",
					cells: [
						new Select({
							width: "100%",
							selectedKey: "{texts>scope}",
							change: onScopeChange,
							items: {
								path: "texts>/scopes",
								templateShareable: false,
								template: new Item({ key: "{texts>key}", text: "{texts>text}" })
							}
						}),
						new Select({
							width: "100%",
							selectedKey: "{texts>field}",
							change: onFieldChange,
							items: {
								path: "texts>fieldItems",
								templateShareable: false,
								template: new Item({ key: "{texts>name}", text: "{texts>label}" })
							}
						}),
						new HBox({
							alignItems: "Center",
							items: [
								new Select({
									width: "20rem",
									visible: "{= ${texts>scope} !== 'cell' }",
									selectedKey: "{texts>valueKey}",
									items: {
										path: "texts>values",
										templateShareable: false,
										template: new Item({ key: "{texts>key}", text: "{texts>text}" })
									}
								}),
								new Select({
									width: "8rem",
									visible: "{= ${texts>scope} === 'cell' }",
									selectedKey: "{texts>operator}",
									items: {
										path: "texts>/operators",
										templateShareable: false,
										template: new Item({ key: "{texts>key}", text: "{texts>text}" })
									}
								}).addStyleClass("sapUiTinyMarginEnd"),
								new Input({
									width: "6rem",
									value: "{texts>to}",
									visible: "{= ${texts>scope} === 'cell' && ${texts>operator} !== 'empty' && ${texts>operator} !== 'changed' }"
								}).addStyleClass("sapUiTinyMarginEnd"),
								new Input({
									width: "6rem",
									value: "{texts>to2}",
									placeholder: oBundle.getText("TEXTS_AND"),
									visible: "{= ${texts>scope} === 'cell' && ${texts>operator} === 'between' }"
								})
							]
						}),
						new HBox({
							alignItems: "Center",
							items: [
								new Select({
									width: "12rem",
									selectedKey: "{texts>colorKey}",
									change: onStyleChange,
									items: {
										path: "texts>/colors",
										templateShareable: false,
										template: new Item({ key: "{texts>key}", text: "{texts>text}" })
									}
								}).addStyleClass("sapUiTinyMarginEnd"),
								new Button({
									icon: "sap-icon://palette",
									type: "Transparent",
									tooltip: oBundle.getText("TEXTS_COLOR_CUSTOM"),
									press: onPickColor
								}),
								new ToggleButton({
									icon: "sap-icon://bold-text",
									tooltip: oBundle.getText("TEXTS_BOLD"),
									pressed: "{texts>bold}",
									press: onStyleChange
								}),
								new ToggleButton({
									icon: "sap-icon://italic-text",
									tooltip: oBundle.getText("TEXTS_ITALIC"),
									pressed: "{texts>italic}",
									press: onStyleChange
								}),
								new ToggleButton({
									icon: "sap-icon://strikethrough",
									tooltip: oBundle.getText("TEXTS_STRIKETHROUGH"),
									pressed: "{texts>strikethrough}",
									press: onStyleChange
								})
							]
						}),
						// Contenido generado aquí con colores ya validados (TextRules.normalize)
						new HTML({ content: "{texts>preview}" })
					]
				})
			}
		});

		oDialog = new Dialog({
			title: oBundle.getText("TEXTS_TITLE"),
			contentWidth: "80rem",
			resizable: true,
			draggable: true,
			content: [
				new MessageStrip({
					text: oBundle.getText("TEXTS_HINT"),
					type: "Information",
					showIcon: true
				}).addStyleClass("sapUiSmallMargin"),
				new MessageStrip({
					text: "{texts>/invalid}",
					type: "Error",
					showIcon: true,
					visible: "{= !!${texts>/invalid} }"
				}).addStyleClass("sapUiSmallMarginBeginEnd"),
				oTable
			],
			buttons: [
				new Button({
					text: oBundle.getText("PANEL_OK"),
					type: "Emphasized",
					press: function () {
						var aRows = oModel.getProperty("/rules");
						var oParsed = fromModelRules(aRows);
						aRows.forEach(function (oRow, i) {
							oModel.setProperty("/rules/" + i + "/invalid", oParsed.invalid.indexOf(i) >= 0);
						});
						if (oParsed.invalid.length) {
							oModel.setProperty("/invalid", oBundle.getText("TEXTS_INVALID"));
							return;
						}
						fnResolve(oParsed.rules);
						oDialog.close();
					}
				}),
				new Button({
					text: oBundle.getText("PANEL_CANCEL"),
					press: function () {
						oDialog.close();
					}
				})
			],
			afterClose: function () {
				fnResolve(null); // sin efecto si ya se resolvió con "Aceptar"
				oDialog.destroy();
				oModel.destroy();
			}
		});
		oModel.getProperty("/rules").forEach(function (oRow, i) {
			refreshRow("/rules/" + i);
		});
		oDialog.setModel(oModel, "texts");
		oDialog.addStyleClass("pvTextRulesDialog");
		if (mOptions.owner) {
			mOptions.owner.addDependent(oDialog);
		}

		return new Promise(function (fnDone) {
			fnResolve = fnDone;
			oDialog.open();
		});
	}

	return {
		open: open,
		/** @private expuestos para pruebas */
		_toModelRule: toModelRule,
		_fromModelRules: fromModelRules,
		_parseNumber: parseNumber,
		_toHexColor: toHexColor,
		_previewHtml: previewHtml,
		ALL: ALL
	};
});
