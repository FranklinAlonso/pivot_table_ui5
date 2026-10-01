/*!
 * com.frank.pivot - Proveedor de datos en memoria (JSONModel / arrays).
 */
sap.ui.define(["./DataProvider"], function (DataProvider) {
	"use strict";

	/**
	 * @alias com.frank.pivot.provider.ClientDataProvider
	 */
	return DataProvider.extend("com.frank.pivot.provider.ClientDataProvider", {
		constructor: function (aRecords) {
			DataProvider.apply(this);
			this._aRecords = aRecords || [];
		},

		load: function () {
			return Promise.resolve({ records: this._aRecords, preAggregated: false, truncated: false });
		}
	});
});
