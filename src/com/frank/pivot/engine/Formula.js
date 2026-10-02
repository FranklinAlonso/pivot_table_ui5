/*!
 * Fórmulas de indicadores calculados (ADMIN_ModeloDatosIndicador.formula).
 *
 * Módulo sin dependencias: se carga con require() en CAP, con sap.ui.define
 * en Fiori y con el sap.ui.define mínimo de PivotWorker.js en el Web Worker.
 * Esta es la versión de referencia (com.frank.pivot, engine/Formula.js); las
 * copias anteriores deben reemplazarse por ella:
 *   ALTAMIRA_CAP_EPM/srv/lib/formula.js
 *   EPM_ADMIN/webapp/util/Formula.js
 *
 * Sintaxis:
 *   - Referencias: {ID} (forma guardada) o [Nombre] (forma que ve el usuario).
 *     El ID admite cualquier carácter excepto "{" y "}".
 *   - Números con "." o "," decimal: 0.5 / 0,5
 *   - Operadores + - * / y paréntesis.
 *   - Funciones: SI(condición; si_verdadero; si_falso), MIN, MAX, ABS,
 *     REDONDEAR(valor; decimales). Los argumentos se separan con ";".
 *   - Comparaciones (> < >= <= = <>) solo como condición de SI.
 * Nunca se usa eval: el texto se convierte en un árbol y se evalúa nodo a nodo.
 * Un valor vacío o una división por cero dan null.
 */
(function (factory) {
    "use strict";
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        sap.ui.define([], factory);
    }
}(function () {
    "use strict";

    var FUNCIONES = {
        SI:        { min: 3, max: 3,  condicion: true, uso: "3 argumentos: SI(condición; si verdadero; si falso)" },
        MIN:       { min: 2, max: 10, uso: "al menos 2 argumentos separados por ;" },
        MAX:       { min: 2, max: 10, uso: "al menos 2 argumentos separados por ;" },
        ABS:       { min: 1, max: 1,  uso: "1 argumento" },
        REDONDEAR: { min: 2, max: 2,  uso: "2 argumentos: REDONDEAR(valor; decimales)" }
    };
    var COMPARADORES = [">=", "<=", "<>", ">", "<", "="];
    // Cualquier carácter excepto llaves (antes solo [\w-]+, que sigue siendo válido)
    var RE_GUARDADA = /\{([^{}]+)\}/g;
    var RE_ID = /^[^{}]+$/;
    var RE_TEXTO = /\[([^\[\]]+)\]/g;

    function FormulaError(sMensaje, iPos, iLen) {
        this.name = "FormulaError";
        this.message = sMensaje;
        this.pos = iPos || 0;
        this.len = Math.max(1, iLen || 1);
    }
    FormulaError.prototype = Object.create(Error.prototype);
    FormulaError.prototype.constructor = FormulaError;

    function tokenizar(s) {
        var aTokens = [], i = 0, m;
        while (i < s.length) {
            var ch = s[i], sResto = s.slice(i);
            if (/\s/.test(ch)) { i++; continue; }
            if ((m = /^\d+(?:[.,]\d+)?/.exec(sResto))) {
                aTokens.push({ t: "num", v: Number(m[0].replace(",", ".")), pos: i, len: m[0].length });
                i += m[0].length;
                continue;
            }
            if (ch === "{") {
                var iFinId = s.indexOf("}", i);
                if (iFinId < 0) throw new FormulaError("Falta cerrar la llave de la referencia", i, s.length - i);
                var sId = s.slice(i + 1, iFinId).trim();
                if (!RE_ID.test(sId)) throw new FormulaError("Referencia inválida", i, iFinId - i + 1);
                aTokens.push({ t: "ref", id: sId, pos: i, len: iFinId - i + 1 });
                i = iFinId + 1;
                continue;
            }
            if (ch === "[") {
                var iFin = s.indexOf("]", i), iOtro = s.indexOf("[", i + 1);
                if (iFin < 0 || (iOtro > -1 && iOtro < iFin)) {
                    throw new FormulaError("Falta cerrar el corchete del indicador", i, (iOtro > -1 ? iOtro : s.length) - i);
                }
                var sNombre = s.slice(i + 1, iFin).trim();
                if (!sNombre) throw new FormulaError("Los corchetes están vacíos: escriba el nombre de un indicador", i, 2);
                aTokens.push({ t: "ref", name: sNombre, pos: i, len: iFin - i + 1 });
                i = iFin + 1;
                continue;
            }
            if ((m = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ_]*/.exec(sResto))) {
                aTokens.push({ t: "id", name: m[0], pos: i, len: m[0].length });
                i += m[0].length;
                continue;
            }
            var sDos = s.substr(i, 2);
            if (sDos === ">=" || sDos === "<=" || sDos === "<>") {
                aTokens.push({ t: "op", v: sDos, pos: i, len: 2 });
                i += 2;
                continue;
            }
            if ("+-*/();<>=".indexOf(ch) > -1) {
                aTokens.push({ t: "op", v: ch, pos: i, len: 1 });
                i++;
                continue;
            }
            if (ch === ",") throw new FormulaError("Use ; para separar los argumentos de una función", i, 1);
            if (ch === "]") throw new FormulaError("Sobra un corchete de cierre", i, 1);
            throw new FormulaError("Carácter no permitido «" + ch + "»", i, 1);
        }
        return aTokens;
    }

    /**
     * Convierte el texto en un árbol. Lanza FormulaError con la posición del
     * problema. Los nodos de referencia llevan `id` ({ID}) o `name` ([Nombre]).
     */
    function parse(s) {
        s = s || "";
        var aTok = tokenizar(s), k = 0, iFinTexto = s.length;
        if (!aTok.length) throw new FormulaError("Escriba una fórmula", 0, 1);

        function esOp(v) { return aTok[k] && aTok[k].t === "op" && aTok[k].v === v; }
        function esperar(v, sMsg) {
            if (!esOp(v)) {
                var t = aTok[k];
                throw new FormulaError(sMsg, t ? t.pos : iFinTexto, t ? t.len : 1);
            }
            k++;
        }
        function comparacion(bPermitida) {
            var a = suma(), t = aTok[k];
            if (t && t.t === "op" && COMPARADORES.indexOf(t.v) > -1) {
                if (!bPermitida) throw new FormulaError("Las comparaciones (>, <, =…) solo pueden usarse como condición de SI", t.pos, t.len);
                k++;
                return { t: "cmp", op: t.v, a: a, b: suma() };
            }
            return a;
        }
        function suma() {
            var a = producto();
            while (esOp("+") || esOp("-")) { var op = aTok[k++].v; a = { t: "bin", op: op, a: a, b: producto() }; }
            return a;
        }
        function producto() {
            var a = unario();
            while (esOp("*") || esOp("/")) { var op = aTok[k++].v; a = { t: "bin", op: op, a: a, b: unario() }; }
            return a;
        }
        function unario() {
            if (esOp("-")) { k++; return { t: "neg", a: unario() }; }
            if (esOp("+")) { k++; return unario(); }
            return primario();
        }
        function primario() {
            var t = aTok[k];
            if (!t) throw new FormulaError("La fórmula está incompleta: falta un valor al final", iFinTexto, 1);
            if (t.t === "num") { k++; return { t: "num", v: t.v }; }
            if (t.t === "ref") { k++; return { t: "ref", id: t.id, name: t.name, pos: t.pos, len: t.len }; }
            if (t.t === "id") {
                var sFn = t.name.toUpperCase(), oFn = FUNCIONES[sFn];
                if (!oFn) {
                    var oErr = new FormulaError("«" + t.name + "» no es una función conocida. Los indicadores van entre corchetes, p. ej. [" + t.name + "]", t.pos, t.len);
                    oErr.identificador = t.name;
                    throw oErr;
                }
                k++;
                esperar("(", "Falta «(» después de " + sFn);
                var aArgs = [];
                if (!esOp(")")) {
                    do { aArgs.push(comparacion(oFn.condicion && aArgs.length === 0)); } while (esOp(";") && ++k);
                }
                esperar(")", "Falta cerrar el paréntesis de " + sFn);
                if (aArgs.length < oFn.min || aArgs.length > oFn.max) {
                    throw new FormulaError(sFn + " necesita " + oFn.uso, t.pos, t.len);
                }
                return { t: "fn", name: sFn, args: aArgs };
            }
            if (esOp("(")) {
                var oAbre = t;
                k++;
                var e = comparacion(false);
                if (!esOp(")")) throw new FormulaError("Falta cerrar este paréntesis", oAbre.pos, 1);
                k++;
                return e;
            }
            if (t.v === ")") throw new FormulaError("Sobra un paréntesis de cierre o falta un valor antes", t.pos, 1);
            throw new FormulaError("Falta un valor antes de «" + t.v + "»", t.pos, t.len);
        }

        var oArbol = comparacion(false);
        if (k < aTok.length) {
            var t = aTok[k];
            throw new FormulaError(
                t.t === "op" && t.v === ")" ? "Sobra un paréntesis de cierre" : "Falta un operador antes de «" + s.substr(t.pos, t.len) + "»",
                t.pos, t.len);
        }
        return oArbol;
    }

    /** Nodos de referencia del árbol, en el orden en que aparecen. */
    function referencias(oNodo, aOut) {
        aOut = aOut || [];
        if (!oNodo) return aOut;
        if (oNodo.t === "ref") aOut.push(oNodo);
        if (oNodo.a) referencias(oNodo.a, aOut);
        if (oNodo.b) referencias(oNodo.b, aOut);
        (oNodo.args || []).forEach(function (x) { referencias(x, aOut); });
        return aOut;
    }

    function tieneDivision(oNodo) {
        if (!oNodo) return false;
        if (oNodo.t === "bin" && oNodo.op === "/") return true;
        return tieneDivision(oNodo.a) || tieneDivision(oNodo.b) || (oNodo.args || []).some(tieneDivision);
    }

    /**
     * Evalúa el árbol. fnValor(id) devuelve el valor de un indicador (o null).
     * Las referencias por nombre deben haberse resuelto antes (nodo.id).
     */
    function evaluar(oNodo, fnValor) {
        var a, b;
        switch (oNodo.t) {
            case "num": return oNodo.v;
            case "ref": return fnValor(oNodo.id);
            case "neg": a = evaluar(oNodo.a, fnValor); return a === null || a === undefined ? null : -a;
            case "bin":
                a = evaluar(oNodo.a, fnValor);
                b = evaluar(oNodo.b, fnValor);
                if (a === null || a === undefined || b === null || b === undefined) return null;
                if (oNodo.op === "+") return a + b;
                if (oNodo.op === "-") return a - b;
                if (oNodo.op === "*") return a * b;
                return b === 0 ? null : a / b;
            case "cmp":
                a = evaluar(oNodo.a, fnValor);
                b = evaluar(oNodo.b, fnValor);
                if (a === null || a === undefined || b === null || b === undefined) return null;
                switch (oNodo.op) {
                    case ">": return a > b;
                    case "<": return a < b;
                    case ">=": return a >= b;
                    case "<=": return a <= b;
                    case "=": return a === b;
                    default: return a !== b;
                }
            case "fn":
                if (oNodo.name === "SI") {
                    var c = evaluar(oNodo.args[0], fnValor);
                    if (c === null || c === undefined) return null;
                    return evaluar(c ? oNodo.args[1] : oNodo.args[2], fnValor);
                }
                var aVal = oNodo.args.map(function (x) { return evaluar(x, fnValor); });
                if (oNodo.name === "ABS") return aVal[0] === null || aVal[0] === undefined ? null : Math.abs(aVal[0]);
                if (oNodo.name === "REDONDEAR") {
                    if (aVal[0] === null || aVal[0] === undefined || aVal[1] === null || aVal[1] === undefined) return null;
                    var f = Math.pow(10, Math.round(aVal[1]));
                    return Math.round(aVal[0] * f) / f;
                }
                var aNum = aVal.filter(function (x) { return x !== null && x !== undefined; });
                if (!aNum.length) return null;
                return oNodo.name === "MIN" ? Math.min.apply(null, aNum) : Math.max.apply(null, aNum);
            default:
                return null;
        }
    }

    /** IDs referenciados en una fórmula guardada ({ID}), sin repetir. */
    function idsReferenciados(sGuardada) {
        var aIds = [], m;
        RE_GUARDADA.lastIndex = 0;
        while ((m = RE_GUARDADA.exec(sGuardada || ""))) {
            var sId = m[1].trim();
            if (sId && aIds.indexOf(sId) < 0) aIds.push(sId);
        }
        return aIds;
    }

    /** {ID} → [Nombre]. fnNombre(id) devuelve el nombre o undefined. */
    function aTexto(sGuardada, fnNombre) {
        return (sGuardada || "").replace(RE_GUARDADA, function (sTodo, sId) {
            var sNombre = fnNombre(sId.trim());
            return sNombre ? "[" + sNombre + "]" : "[?]";
        });
    }

    /** [Nombre] → {ID}. fnId(nombre) devuelve el ID o undefined (se deja igual). */
    function aGuardada(sTexto, fnId) {
        return (sTexto || "").replace(RE_TEXTO, function (sTodo, sNombre) {
            var sId = fnId(sNombre.trim());
            return sId ? "{" + sId + "}" : sTodo;
        });
    }

    /**
     * Busca un ciclo que pase por sInicio en el grafo { id: [ids que usa] }.
     * Devuelve la ruta (p. ej. [A, B, A]) o null.
     */
    function buscarCiclo(mGrafo, sInicio) {
        var oVisto = {};
        function dfs(sId, aRuta) {
            var aSig = mGrafo[sId] || [];
            for (var i = 0; i < aSig.length; i++) {
                if (aSig[i] === sInicio) return aRuta.concat(sInicio);
                if (!oVisto[aSig[i]]) {
                    oVisto[aSig[i]] = true;
                    var r = dfs(aSig[i], aRuta.concat(aSig[i]));
                    if (r) return r;
                }
            }
            return null;
        }
        return dfs(sInicio, [sInicio]);
    }

    return {
        FUNCIONES: FUNCIONES,
        FormulaError: FormulaError,
        parse: parse,
        referencias: referencias,
        tieneDivision: tieneDivision,
        evaluar: evaluar,
        idsReferenciados: idsReferenciados,
        aTexto: aTexto,
        aGuardada: aGuardada,
        buscarCiclo: buscarCiclo
    };
}));
