/*global QUnit */
sap.ui.define([
	"com/frank/pivot/provider/ODataV4Provider"
], function (ODataV4Provider) {
	"use strict";

	function createFakeModel(aRows, mCapture) {
		return {
			bindList: function (sPath, oContext, aSorters, aFilters, mParameters) {
				mCapture.path = sPath;
				mCapture.parameters = mParameters;
				return {
					requestContexts: function (iStart, iLength) {
						mCapture.length = iLength;
						return Promise.resolve(aRows.slice(0, iLength).map(function (oRow) {
							return { getObject: function () { return oRow; } };
						}));
					},
					destroy: function () {
						mCapture.destroyed = true;
					}
				};
			}
		};
	}

	QUnit.module("ODataV4Provider");

	QUnit.test("Envía $apply y devuelve registros pre-agregados", function (assert) {
		var mCapture = {};
		var oProvider = new ODataV4Provider({
			model: createFakeModel([{ Region: "EMEA", pv0: 10 }, { Region: "APJ", pv0: 5 }], mCapture),
			path: "/Ventas",
			maxRecords: 2
		});
		return oProvider.load({ rows: ["Region"], values: [{ field: "Importe", aggregation: "sum" }] }).then(function (oLoad) {
			assert.strictEqual(mCapture.path, "/Ventas");
			assert.strictEqual(mCapture.parameters.$apply, "groupby((Region),aggregate(Importe with sum as pv0))");
			assert.strictEqual(mCapture.length, 2);
			assert.ok(mCapture.destroyed, "binding temporal destruido");
			assert.ok(oLoad.preAggregated);
			assert.ok(oLoad.truncated, "alcanzó maxRecords");
			assert.strictEqual(oLoad.records.length, 2);
		});
	});

	QUnit.test("Rechaza agregaciones no re-agregables", function (assert) {
		var oProvider = new ODataV4Provider({ model: createFakeModel([], {}), path: "/Ventas" });
		return oProvider.load({ rows: ["Region"], values: [{ field: "Cliente", aggregation: "countdistinct" }] })
			.then(function () {
				assert.ok(false, "debería fallar");
			}, function (oError) {
				assert.ok(/no está soportada/.test(oError.message));
			});
	});
});
