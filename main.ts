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

global.doGet = function(e) {
	let r = handleHttpReq();
	Logger.log(`arg ${e.parameter}`);
	Logger.log(`text ${r}`);
	return ContentService.createTextOutput(r);
}

global.doPost = function(e) {

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
