import { 
	$init,
       	scream, 
	sayHello,
       	myFunc00,
       	myFunc01,
       	myFunc02,
       	myFunc03,
	variantFunc00,
} from "./target/jco/playground_jco.js";
import "./textencoderdecoder"

declare const global: any;

global.aaa = function() {
	$init.then(() => {
		let msg = scream("hello world");
		sayHello(msg);
	});
}

global.bbb = function () {
	$init.then(() => {
		myFunc00();
	});
}

global.ccc = function () {
	$init.then(() => {
		myFunc01();
	});
}

global.ddd = function () {
	$init.then(() => {
		myFunc02();
	});
}

global.eee = function () {
	$init.then(() => {
		myFunc03();
	});
}

global.fff = function () {
	$init.then(() => {
		console.log(variantFunc00());
	});
}
