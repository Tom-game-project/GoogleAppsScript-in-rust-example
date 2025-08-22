import { scream, sayHello } from "./target/jco/playground_jco.js";

declare const global: any;

global.aaa = function() {
	let msg = scream("hello world");
	sayHello(msg);
	//console.log(message);
}

