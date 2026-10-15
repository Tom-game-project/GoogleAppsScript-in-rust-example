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

declare const global: any;

global.doGet = function(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
    let r = rsDoGet(JSON.stringify(e)) as unknown as GasTextOutput;
    return r.rawTextOutput;
};

global.do_get_test00 = function() {
    let a = `
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
    let r = rsDoGet(a);
    Logger.log(r);
};

global.doPost = function(e: any) {
};

global.aaa = function() {
    let msg = scream("hello world");
    sayHello(msg);
};

global.resource_example = function() {
    resourceExample();
};

global.helloworldExample = function() {
    helloworldExample();
};

global.get_script_properties_example = function() {
    getScriptPropertiesExample();
};

global.spreadsheet_example = function() {
    spreadsheetExample();
};

global.fff = function() {
    console.log(variantFunc00());
};

global.http_request_test = function() {
    httpRequestTest();
};

global.utilities_example = function() {
    utilitiesExample();
};

global.html_service_example = function(): GoogleAppsScript.HTML.HtmlOutput {
    let out = htmlServiceExample() as unknown as GasHtmlOutput;
    return out.rawHtmlOutput;
};
