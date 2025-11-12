import { 
	$init,
       	scream, 
	sayHello,
	handleHttpReq,
       	resourceExample,
       	helloworldExample,
        getScriptPropertiesExample,
       	spreadsheetExample,
	variantFunc00,
} from "./target/jco/GoogleAppsScript_in_rust_example.js";
import "./textencoderdecoder"

declare const global: any;

global.doGet = function(e :any) {
	Logger.log("hello world");
	let r = handleHttpReq(JSON.stringify(e));
	return ContentService.createTextOutput(r);
}

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
	`	
	let r = handleHttpReq(a);
	Logger.log(r);
}

global.doPost = function(e: any) {

}

global.aaa = function() {
	let msg = scream("hello world");
	sayHello(msg);
}

global.resource_example= function () {
	resourceExample();
}

global.helloworldExample = function () {
	helloworldExample();
}

global.get_script_properties_example = function () {
	getScriptPropertiesExample();
}

global.spreadsheet_example = function () {
	spreadsheetExample();
}

global.fff = function () {
	console.log(variantFunc00());
}
