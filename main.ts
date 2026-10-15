import {
    $init,
    scream,
    sayHello,
    rsDoGet,
    resourceExample,
    helloworldExample,
    getScriptPropertiesExample,
    spreadsheetExample,
    variantFunc00,
    httpRequestTest,
    utilitiesExample,
    htmlServiceExample,
} from "./target/jco/GoogleAppsScript_in_rust_example.js";
import "./textencoderdecoder";

import { GasTextOutput } from "./js/gas-content-service-text-output";
import { GasHtmlOutput } from "./js/gas-html-service-output";

interface GasGlobal {
    doGet: (e: GoogleAppsScript.Events.DoGet) => GoogleAppsScript.Content.TextOutput;
    do_get_test00: () => void;
    doPost: (e: GoogleAppsScript.Events.DoPost) => void;
    aaa: () => void;
    resource_example: () => void;
    helloworldExample: () => void;
    get_script_properties_example: () => void;
    spreadsheet_example: () => void;
    fff: () => void;
    http_request_test: () => void;
    utilities_example: () => void;
    html_service_example: () => GoogleAppsScript.HTML.HtmlOutput;
}

declare const global: GasGlobal;

global.doGet = function(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
    const r = rsDoGet(JSON.stringify(e)) as unknown as GasTextOutput;
    return r.rawTextOutput;
};

global.do_get_test00 = function(): void {
    const a = `
            {
               "parameter": {
                 "name": "tom",
                 "msg": "hello",
                 "age": "21"
               },
               "contextPath": "",
               "contentLength": -1,
               "parameters": {
                 "msg": [
                   "hello"
                 ],
                 "age": [
                   "21"
                 ],
                 "name": [
                   "tom"
                 ]
               },
               "queryString": "name=tom&age=21&msg=hello"
             }
    `;
    const r = rsDoGet(a);
    Logger.log(r);
};

global.doPost = function(_e: GoogleAppsScript.Events.DoPost): void {
};

global.aaa = function(): void {
    const msg = scream("hello world");
    sayHello(msg);
};

global.resource_example = function(): void {
    resourceExample();
};

global.helloworldExample = function(): void {
    helloworldExample();
};

global.get_script_properties_example = function(): void {
    getScriptPropertiesExample();
};

global.spreadsheet_example = function(): void {
    spreadsheetExample();
};

global.fff = function(): void {
    console.log(variantFunc00());
};

global.http_request_test = function(): void {
    httpRequestTest();
};

global.utilities_example = function(): void {
    utilitiesExample();
};

global.html_service_example = function(): GoogleAppsScript.HTML.HtmlOutput {
    const out = htmlServiceExample() as unknown as GasHtmlOutput;
    return out.rawHtmlOutput;
};
