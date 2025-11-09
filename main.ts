import { 
	$init,
       	scream, 
	sayHello,
       	resourceExample,
       	helloworldExample,
        getScriptPropertiesExample,
       	spreadsheetExample,
	variantFunc00,
} from "./target/jco/GoogleAppsScript_in_rust_example.js";
import "./textencoderdecoder"

declare const global: any;

global.aaa = function() {
	$init.then(() => {
		let msg = scream("hello world");
		sayHello(msg);
	});
}

global.resource_example= function () {
	$init.then(() => {
		resourceExample();
	});
}

global.helloworldExample = function () {
	$init.then(() => {
		helloworldExample();
	});
}

global.get_script_properties_example = function () {
	$init.then(() => {
		getScriptPropertiesExample();
	});
}

global.spreadsheet_example = function () {
	$init.then(() => {
		spreadsheetExample();
	});
}

global.fff = function () {
	$init.then(() => {
		console.log(variantFunc00());
	});
}
