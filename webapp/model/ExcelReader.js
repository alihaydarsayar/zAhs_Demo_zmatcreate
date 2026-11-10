sap.ui.define([
    "sap/ui/thirdparty/jszip"
], (JSZipModule) => {
    "use strict";

    // UI5 çekirdeğiyle gelen JSZip (v2.x) kullanılır; harici kütüphane gerekmez.
    const JSZip = JSZipModule || window.JSZip;
    const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    function parseXml(sXml) {
        return new DOMParser().parseFromString(sXml, "application/xml");
    }

    function elements(oParent, sName) {
        return Array.from(oParent.getElementsByTagNameNS("*", sName));
    }

    function readText(oZip, sPath) {
        const oFile = oZip.file(sPath);
        return oFile ? oFile.asText() : null;
    }

    // "AB12" -> 27 (0 tabanlı sütun indeksi)
    function columnIndex(sRef) {
        const sLetters = sRef.replace(/[^A-Z]/gi, "").toUpperCase();
        let n = 0;
        for (let i = 0; i < sLetters.length; i++) {
            n = n * 26 + (sLetters.charCodeAt(i) - 64);
        }
        return n - 1;
    }

    function readSharedStrings(oZip) {
        const sXml = readText(oZip, "xl/sharedStrings.xml");
        if (!sXml) {
            return [];
        }
        return elements(parseXml(sXml), "si").map((oSi) =>
            elements(oSi, "t").map((oT) => oT.textContent).join(""));
    }

    // İlk çalışma sayfasının dosya yolunu bulur
    function firstSheetPath(oZip) {
        const oSheet = elements(parseXml(readText(oZip, "xl/workbook.xml")), "sheet")[0];
        const sRid = oSheet && oSheet.getAttributeNS(NS_REL, "id");
        const sRels = readText(oZip, "xl/_rels/workbook.xml.rels");
        if (sRid && sRels) {
            const oRel = elements(parseXml(sRels), "Relationship").find((o) => o.getAttribute("Id") === sRid);
            if (oRel) {
                const sTarget = oRel.getAttribute("Target");
                return sTarget.charAt(0) === "/" ? sTarget.slice(1) : "xl/" + sTarget;
            }
        }
        return "xl/worksheets/sheet1.xml";
    }

    function cellValue(oCell, aShared) {
        const sType = oCell.getAttribute("t");
        if (sType === "inlineStr") {
            return elements(oCell, "t").map((o) => o.textContent).join("");
        }
        const oV = elements(oCell, "v")[0];
        if (!oV) {
            return "";
        }
        return sType === "s" ? (aShared[parseInt(oV.textContent, 10)] || "") : oV.textContent;
    }

    return {
        /**
         * .xlsx dosyasının ilk sayfasını satır/sütun dizisi olarak döndürür.
         * @param {ArrayBuffer} oBuffer Dosya içeriği
         * @returns {string[][]} Satırlar (boş satırlar atlanır)
         */
        read(oBuffer) {
            const oZip = new JSZip(oBuffer);
            const sSheet = readText(oZip, firstSheetPath(oZip));
            if (!sSheet) {
                throw new Error("Çalışma sayfası bulunamadı");
            }
            const aShared = readSharedStrings(oZip);
            const aRows = [];

            elements(parseXml(sSheet), "row").forEach((oRow) => {
                const aRow = [];
                elements(oRow, "c").forEach((oCell, i) => {
                    const sRef = oCell.getAttribute("r");
                    aRow[sRef ? columnIndex(sRef) : i] = String(cellValue(oCell, aShared)).trim();
                });
                const aFull = Array.from(aRow, (v) => v || "");
                if (aFull.some((v) => v !== "")) {
                    aRows.push(aFull);
                }
            });
            return aRows;
        }
    };
});
