/*global QUnit */
sap.ui.define([
	"com/frank/pivot/variant/ODataV4Store",
	"com/frank/pivot/variant/LocalStorageStore"
], function (ODataV4Store, LocalStorageStore) {
	"use strict";

	var CONFIG = { rows: ["Region"], columns: ["Anio"] };

	/**
	 * Sustituto mínimo de sap.ui.model.odata.v4.ODataModel con las llamadas que usa el almacén.
	 * oModel.fail = { post, patch, delete } simula que el servicio rechaza la operación.
	 */
	function createModel(aRows) {
		var iNext = 0;
		var oModel = { fail: {}, batches: [], patches: [], deletes: [], posts: [] };

		function createContext(oData) {
			return {
				data: oData,
				transient: false,
				getObject: function () {
					return Object.assign({}, this.data);
				},
				setProperty: function (sPath, vValue, sGroupId) {
					oModel.patches.push({ key: this.data.ID, path: sPath, value: vValue, group: sGroupId });
					if (oModel.fail.patch) {
						return Promise.reject(new Error("403 Forbidden"));
					}
					this.data[sPath] = vValue;
					return Promise.resolve();
				},
				"delete": function (sGroupId) {
					if (this.transient) {
						var oError = new Error("canceled");
						oError.canceled = true;
						this.rejectCreated(oError);
						return Promise.resolve();
					}
					oModel.deletes.push({ key: this.data.ID, group: sGroupId });
					return oModel.fail["delete"] ? Promise.reject(new Error("403 Forbidden")) : Promise.resolve();
				},
				created: function () {
					return this.pCreated;
				},
				isTransient: function () {
					return this.transient;
				}
			};
		}

		oModel.bindList = function (sPath, oContext, aSorters, aFilters, mParameters) {
			var aContexts = aRows.map(createContext);
			var bLoaded = false;
			oModel.binding = { path: sPath, sorters: aSorters, filters: aFilters, parameters: mParameters };
			return {
				getContexts: function () {
					return bLoaded ? aContexts : [];
				},
				requestContexts: function () {
					bLoaded = true;
					return Promise.resolve(aContexts);
				},
				requestRefresh: function () {
					return Promise.resolve();
				},
				create: function (oData, bSkipRefresh) {
					var oNew = createContext(Object.assign({}, oData));
					oNew.transient = true;
					oNew.skipRefresh = bSkipRefresh;
					oNew.pCreated = new Promise(function (fnResolve, fnReject) {
						oNew.resolveCreated = fnResolve;
						oNew.rejectCreated = fnReject;
					});
					oModel.posts.push(oNew);
					return oNew;
				}
			};
		};

		oModel.submitBatch = function (sGroupId) {
			oModel.batches.push(sGroupId);
			oModel.posts.forEach(function (oContext) {
				if (oContext.transient && !oModel.fail.post) {
					oContext.transient = false;
					oContext.data.ID = "new-" + (++iNext);
					oContext.data.createdBy = "yo@empresa.com";
					oContext.resolveCreated();
				}
			});
			return Promise.resolve();
		};

		return oModel;
	}

	function createDefaultStore() {
		var mData = {};
		return new LocalStorageStore({
			storage: {
				getItem: function (sKey) {
					return mData[sKey] || null;
				},
				setItem: function (sKey, sValue) {
					mData[sKey] = sValue;
				}
			}
		});
	}

	var ROWS = [
		{ ID: "1", persistencyKey: "ventas", name: "Pública de Luis", isPublic: true, schemaVersion: 1,
			configuration: JSON.stringify(CONFIG), createdBy: "luis@empresa.com", isOwner: false },
		{ ID: "2", persistencyKey: "ventas", name: "Mía", isPublic: false, schemaVersion: 1,
			configuration: JSON.stringify({ rows: ["Pais"] }), createdBy: "yo@empresa.com", isOwner: true },
		{ ID: "3", persistencyKey: "ventas", name: "Dañada", configuration: "{no json" }
	];

	/** assert.rejects no existe en QUnit 2.3 */
	async function expectRejection(assert, pPromise, rMessage) {
		try {
			await pPromise;
			assert.ok(false, "se esperaba un rechazo");
		} catch (oError) {
			assert.ok(rMessage.test(oError && oError.message), "rechazada: " + (oError && oError.message));
		}
	}

	QUnit.module("ODataV4Store");

	QUnit.test("Carga las vistas de la tabla y la vista por defecto del usuario", async function (assert) {
		var oModel = createModel(ROWS);
		var oDefaults = createDefaultStore();
		await oDefaults.setDefault("ventas", "1");
		var oStore = new ODataV4Store({ model: oModel, entitySet: "/PivotViews", defaultStore: oDefaults });
		assert.strictEqual(oStore.supportsPublic, true);

		var oData = await oStore.load("ventas");
		assert.strictEqual(oModel.binding.path, "/PivotViews");
		assert.strictEqual(oModel.binding.filters[0].getPath(), "persistencyKey");
		assert.strictEqual(oModel.binding.filters[0].getValue1(), "ventas");
		assert.strictEqual(oModel.binding.sorters[0].getPath(), "name");
		assert.strictEqual(oModel.binding.parameters.$$updateGroupId, "pivotViews", "grupo propio, no $auto");
		assert.deepEqual(oData.variants.map(function (o) { return [o.key, o["public"], o.editable, o.author]; }), [
			["1", true, false, "luis@empresa.com"],
			["2", false, true, "yo@empresa.com"]
		], "la vista con configuración dañada se omite");
		assert.strictEqual(oData.defaultKey, "1");
	});

	QUnit.test("Crea y sobrescribe vistas", async function (assert) {
		var oModel = createModel(ROWS);
		var oStore = new ODataV4Store({ model: oModel, entitySet: "/PivotViews" });
		await oStore.load("ventas");

		var oSaved = await oStore.save("ventas", { name: "Nueva", "public": true, configuration: CONFIG });
		assert.strictEqual(oSaved.key, "new-1", "clave asignada por el servicio");
		assert.strictEqual(oSaved.author, "yo@empresa.com");
		assert.deepEqual(oModel.posts[0].data.configuration, JSON.stringify(CONFIG), "configuración como texto JSON");
		assert.strictEqual(oModel.posts[0].data.isPublic, true);
		assert.strictEqual(oModel.posts[0].skipRefresh, true);
		assert.deepEqual(oModel.batches, ["pivotViews"]);

		var oUpdated = await oStore.save("ventas", Object.assign({}, oSaved, { name: "Renombrada", configuration: { rows: [] } }));
		assert.strictEqual(oUpdated.name, "Renombrada");
		assert.deepEqual(oModel.patches.map(function (o) { return o.path; }), ["name", "isPublic", "schemaVersion", "configuration"]);
		assert.ok(oModel.patches.every(function (o) { return o.group === "pivotViews"; }));
		assert.strictEqual(oModel.posts.length, 1, "sobrescribir no crea otra entidad");
	});

	QUnit.test("Borra vistas y delega la vista por defecto", async function (assert) {
		var oModel = createModel(ROWS);
		var oDefaults = createDefaultStore();
		var oStore = new ODataV4Store({ model: oModel, entitySet: "/PivotViews", defaultStore: oDefaults });
		await oStore.load("ventas");
		await oStore.remove("ventas", "2");
		assert.deepEqual(oModel.deletes, [{ key: "2", group: "pivotViews" }]);
		await oStore.setDefault("ventas", "1");
		assert.strictEqual((await oDefaults.load("ventas")).defaultKey, "1");
		await expectRejection(assert, oStore.remove("ventas", "no-existe"), /Vista desconocida/);
	});

	QUnit.test("Si el servicio rechaza el cambio, la promesa se rechaza y no queda pendiente", async function (assert) {
		var oModel = createModel(ROWS);
		var oStore = new ODataV4Store({ model: oModel, entitySet: "/PivotViews" });
		await oStore.load("ventas");

		oModel.fail = { post: true };
		await expectRejection(assert, oStore.save("ventas", { name: "X", configuration: CONFIG }), /rechazó/);
		assert.strictEqual(oModel.posts[0].isTransient(), true);
		await expectRejection(assert, oModel.posts[0].created(), /canceled/, "la creación se descarta");

		oModel.fail = { patch: true };
		await expectRejection(assert, oStore.save("ventas", { key: "1", name: "Ajena", configuration: CONFIG }), /403/);

		oModel.fail = { "delete": true };
		await expectRejection(assert, oStore.remove("ventas", "1"), /403/);
	});
});
